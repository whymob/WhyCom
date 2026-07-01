"""Technical module: Projects, Allocations, Time Entries, /me/*."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException

from deps import db, get_current_user, now_iso, new_id
from helpers import get_order_or_404

router = APIRouter()


@router.get("/projects")
async def list_projects(user: dict = Depends(get_current_user)):
    return await db.projects.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)


@router.post("/projects")
async def create_project(payload: dict, user: dict = Depends(get_current_user)):
    if not payload.get("order_id"):
        raise HTTPException(400, "order_id obrigatório")
    order = await get_order_or_404(payload["order_id"])
    doc = {
        "id": new_id(),
        "order_id": order["id"],
        "client_id": order["client_id"],
        "name": payload.get("name") or f"Projeto {order['number']}",
        "hours_forecast": float(payload.get("hours_forecast") or 0),
        "hourly_billable": float(payload.get("hourly_billable") or 0),
        "status": "aberto",
        "created_at": now_iso(),
    }
    await db.projects.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def _get_project(pid: str) -> dict:
    p = await db.projects.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Projeto não encontrado")
    return p


@router.get("/projects/{pid}")
async def get_project(pid: str, user: dict = Depends(get_current_user)):
    return await _get_project(pid)


@router.patch("/projects/{pid}")
async def update_project(pid: str, payload: dict, user: dict = Depends(get_current_user)):
    payload.pop("id", None)
    await db.projects.update_one({"id": pid}, {"$set": payload})
    return await db.projects.find_one({"id": pid}, {"_id": 0})


@router.get("/projects/{pid}/allocations")
async def list_allocations(pid: str, user: dict = Depends(get_current_user)):
    return await db.allocations.find({"project_id": pid}, {"_id": 0}).to_list(500)


@router.post("/projects/{pid}/allocations")
async def add_allocation(pid: str, payload: dict, user: dict = Depends(get_current_user)):
    await _get_project(pid)
    u = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0, "password_hash": 0})
    if not u:
        raise HTTPException(404, "Utilizador não encontrado")
    doc = {
        "id": new_id(),
        "project_id": pid,
        "user_id": payload["user_id"],
        "user_name": u["name"],
        "hourly_cost": float(payload.get("hourly_cost") or 0),
        "hours_forecast": float(payload.get("hours_forecast") or 0),
        "created_at": now_iso(),
    }
    await db.allocations.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.delete("/projects/{pid}/allocations/{aid}")
async def remove_allocation(pid: str, aid: str, user: dict = Depends(get_current_user)):
    entries = await db.time_entries.count_documents({"allocation_id": aid})
    if entries > 0:
        raise HTTPException(400, "Alocação tem registos de horas — não pode ser removida")
    await db.allocations.delete_one({"id": aid, "project_id": pid})
    return {"ok": True}


@router.get("/projects/{pid}/time-entries")
async def list_time_entries(pid: str, user: dict = Depends(get_current_user)):
    return await db.time_entries.find({"project_id": pid}, {"_id": 0}).sort("date", -1).to_list(2000)


@router.post("/projects/{pid}/time-entries")
async def add_time_entry(pid: str, payload: dict, user: dict = Depends(get_current_user)):
    await _get_project(pid)
    alloc = await db.allocations.find_one({"id": payload["allocation_id"], "project_id": pid}, {"_id": 0})
    if not alloc:
        raise HTTPException(400, "Alocação inválida para este projeto")
    hours = float(payload["hours"])
    if hours <= 0:
        raise HTTPException(400, "Horas deve ser > 0")
    doc = {
        "id": new_id(),
        "project_id": pid,
        "allocation_id": alloc["id"],
        "user_id": alloc["user_id"],
        "user_name": alloc["user_name"],
        "date": payload.get("date") or now_iso()[:10],
        "hours": hours,
        "hourly_cost": alloc["hourly_cost"],
        "cost": round(hours * alloc["hourly_cost"], 2),
        "billable": bool(payload.get("billable", True)),
        "description": payload.get("description", ""),
        "created_at": now_iso(),
    }
    await db.time_entries.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/projects/{pid}/summary")
async def project_summary(pid: str, user: dict = Depends(get_current_user)):
    p = await _get_project(pid)
    order = await get_order_or_404(p["order_id"])
    allocs = await db.allocations.find({"project_id": pid}, {"_id": 0}).to_list(500)
    entries = await db.time_entries.find({"project_id": pid}, {"_id": 0}).to_list(5000)

    hours_forecast = sum(a["hours_forecast"] for a in allocs)
    hours_actual = sum(e["hours"] for e in entries)
    hours_billable = sum(e["hours"] for e in entries if e["billable"])
    cost_forecast = sum(a["hours_forecast"] * a["hourly_cost"] for a in allocs)
    cost_actual = sum(e["cost"] for e in entries)

    order_value = order["total_net"]
    order_vab = order["total_vab"]
    vab_real = round(order_value - cost_actual, 2)
    vab_delta = round(vab_real - order_vab, 2)
    revenue_billable = round(hours_billable * p.get("hourly_billable", 0), 2)

    consumo_lines = await db.plan_lines.find({"order_id": p["order_id"], "type": "consumo_horas"}, {"_id": 0}).to_list(500)
    consumo_planeado = sum(ln["value"] for ln in consumo_lines)
    consumo_faturado = sum(ln.get("invoiced_amount", 0) for ln in consumo_lines)

    by_dev = {}
    for e in entries:
        b = by_dev.setdefault(e["user_id"], {"user_id": e["user_id"], "user_name": e["user_name"], "hours": 0.0, "cost": 0.0, "billable_hours": 0.0})
        b["hours"] += e["hours"]
        b["cost"] += e["cost"]
        if e["billable"]:
            b["billable_hours"] += e["hours"]
    for b in by_dev.values():
        b["hours"] = round(b["hours"], 2)
        b["cost"] = round(b["cost"], 2)
        b["billable_hours"] = round(b["billable_hours"], 2)

    return {
        "project": p,
        "order": {"number": order["number"], "value": order_value, "vab_planeado": order_vab},
        "hours": {
            "forecast": round(hours_forecast, 2),
            "actual": round(hours_actual, 2),
            "billable": round(hours_billable, 2),
            "delta": round(hours_actual - hours_forecast, 2),
        },
        "cost": {
            "forecast": round(cost_forecast, 2),
            "actual": round(cost_actual, 2),
            "delta": round(cost_actual - cost_forecast, 2),
        },
        "vab": {"planeado": order_vab, "real": vab_real, "delta": vab_delta},
        "billable": {
            "revenue_projected": revenue_billable,
            "consumo_planeado": round(consumo_planeado, 2),
            "consumo_faturado": round(consumo_faturado, 2),
            "consumo_por_faturar": round(consumo_planeado - consumo_faturado, 2),
        },
        "by_developer": sorted(by_dev.values(), key=lambda r: -r["hours"]),
    }


# ------------- /me: self-service -------------
@router.get("/me/time-entries")
async def my_time_entries(user: dict = Depends(get_current_user)):
    entries = await db.time_entries.find({"user_id": user["id"]}, {"_id": 0}).sort("date", -1).to_list(2000)
    projects = {p["id"]: p for p in await db.projects.find({}, {"_id": 0}).to_list(1000)}
    total_hours = round(sum(e["hours"] for e in entries), 2)
    total_billable = round(sum(e["hours"] for e in entries if e["billable"]), 2)
    for e in entries:
        e["project_name"] = projects.get(e["project_id"], {}).get("name", "—")
    return {"entries": entries, "total_hours": total_hours, "total_billable": total_billable}


@router.get("/me/allocations")
async def my_allocations(user: dict = Depends(get_current_user)):
    allocs = await db.allocations.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    projects = {p["id"]: p for p in await db.projects.find({}, {"_id": 0}).to_list(1000)}
    for a in allocs:
        p = projects.get(a["project_id"], {})
        a["project_name"] = p.get("name", "—")
    return {"allocations": allocs}
