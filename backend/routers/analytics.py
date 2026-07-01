"""Analytics: by-commercial, by-client, by-manufacturer, forecasts, VAB, executive."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends

from deps import db, get_current_user
from helpers import month_key

router = APIRouter()


@router.get("/analytics/by-commercial")
async def by_commercial(user: dict = Depends(get_current_user)):
    users = {u["id"]: u for u in await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)}
    leads = await db.leads.find({}, {"_id": 0}).to_list(5000)
    opps = await db.opportunities.find({}, {"_id": 0}).to_list(5000)
    props = await db.proposals.find({}, {"_id": 0}).to_list(5000)
    orders = await db.orders.find({}, {"_id": 0}).to_list(5000)
    rows = {}

    def row(uid):
        u = users.get(uid, {"name": uid, "email": ""})
        return rows.setdefault(uid, {
            "user_id": uid, "name": u.get("name") or uid, "role": u.get("role") or "",
            "leads": 0, "opps": 0, "props": 0, "won": 0, "lost": 0,
            "won_value": 0.0, "won_vab": 0.0, "orders_value": 0.0, "orders_vab": 0.0,
        })

    for ln in leads:
        row(ln["owner_id"])["leads"] += 1
    for o in opps:
        row(o["owner_id"])["opps"] += 1
    for p in props:
        r = row(p["owner_id"])
        r["props"] += 1
        if p["status"] == "ganha":
            r["won"] += 1
            r["won_value"] += p.get("total_net", 0)
            r["won_vab"] += p.get("total_vab", 0)
        elif p["status"] == "perdida":
            r["lost"] += 1
    for o in orders:
        r = row(o["owner_id"])
        r["orders_value"] += o.get("total_net", 0)
        r["orders_vab"] += o.get("total_vab", 0)
    for r in rows.values():
        closed = r["won"] + r["lost"]
        r["conversion_rate"] = round((r["won"] / closed) * 100, 1) if closed else 0.0
        for k in ("won_value", "won_vab", "orders_value", "orders_vab"):
            r[k] = round(r[k], 2)
    return {"rows": sorted(rows.values(), key=lambda r: -r["won_value"])}


@router.get("/analytics/by-client")
async def by_client(user: dict = Depends(get_current_user)):
    clients = {c["id"]: c for c in await db.clients.find({}, {"_id": 0}).to_list(2000)}
    props = await db.proposals.find({}, {"_id": 0}).to_list(5000)
    orders = await db.orders.find({}, {"_id": 0}).to_list(5000)
    rows = {}

    def row(cid):
        c = clients.get(cid, {"name": cid})
        return rows.setdefault(cid, {
            "client_id": cid, "name": c.get("name") or cid, "segment": c.get("segment") or "",
            "props": 0, "won": 0, "won_value": 0.0, "won_vab": 0.0,
            "orders": 0, "orders_value": 0.0, "orders_vab": 0.0,
        })

    for p in props:
        r = row(p["client_id"])
        r["props"] += 1
        if p["status"] == "ganha":
            r["won"] += 1
            r["won_value"] += p.get("total_net", 0)
            r["won_vab"] += p.get("total_vab", 0)
    for o in orders:
        r = row(o["client_id"])
        r["orders"] += 1
        r["orders_value"] += o.get("total_net", 0)
        r["orders_vab"] += o.get("total_vab", 0)
    for r in rows.values():
        for k in ("won_value", "won_vab", "orders_value", "orders_vab"):
            r[k] = round(r[k], 2)
    return {"rows": sorted(rows.values(), key=lambda r: -r["orders_value"])}


@router.get("/analytics/by-manufacturer")
async def by_manufacturer(user: dict = Depends(get_current_user)):
    manufs = {m["id"]: m for m in await db.manufacturers.find({}, {"_id": 0}).to_list(1000)}
    products = {p["id"]: p for p in await db.products.find({}, {"_id": 0}).to_list(2000)}
    opps = await db.opportunities.find({}, {"_id": 0}).to_list(5000)
    props = await db.proposals.find({}, {"_id": 0}).to_list(5000)
    rows = {}

    def row(mid):
        m = manufs.get(mid, {"name": "(sem fabricante)"})
        return rows.setdefault(mid or "none", {
            "manufacturer_id": mid, "name": m.get("name") or "(sem fabricante)",
            "opps": 0, "opps_value": 0.0, "props": 0, "won": 0, "won_value": 0.0, "won_vab": 0.0,
        })

    for o in opps:
        r = row(o.get("manufacturer_id"))
        r["opps"] += 1
        r["opps_value"] += o.get("estimated_value", 0)
    for p in props:
        seen = set()
        for ln in p.get("lines", []):
            pid = ln.get("product_id")
            mid = products.get(pid, {}).get("manufacturer_id") if pid else None
            key = mid or "none"
            if key in seen:
                continue
            seen.add(key)
            r = row(mid)
            r["props"] += 1
            if p["status"] == "ganha":
                r["won"] += 1
                r["won_value"] += p.get("total_net", 0)
                r["won_vab"] += p.get("total_vab", 0)
    for r in rows.values():
        for k in ("opps_value", "won_value", "won_vab"):
            r[k] = round(r[k], 2)
    return {"rows": sorted(rows.values(), key=lambda r: -r["won_value"])}


async def _forecast_invoicing():
    plan_lines = await db.plan_lines.find({"status": {"$in": ["planeada", "parcialmente_faturada"]}}, {"_id": 0}).to_list(5000)
    buckets = {}
    for pl in plan_lines:
        exp = pl.get("expected_date")
        if not exp:
            continue
        k = month_key(exp)
        b = buckets.setdefault(k, {"month": k, "planned_value": 0.0, "planned_vab": 0.0, "remaining_value": 0.0, "count": 0})
        b["planned_value"] += pl["value"]
        b["planned_vab"] += pl["vab"]
        b["remaining_value"] += (pl["value"] - pl.get("invoiced_amount", 0))
        b["count"] += 1
    rows = sorted(buckets.values(), key=lambda r: r["month"])
    for r in rows:
        for k in ("planned_value", "planned_vab", "remaining_value"):
            r[k] = round(r[k], 2)
    return rows


@router.get("/analytics/forecast/invoicing")
async def forecast_invoicing(months: int = 6, user: dict = Depends(get_current_user)):
    return {"months": await _forecast_invoicing()}


async def _forecast_receiving():
    invoices = await db.invoices.find({"status": {"$in": ["emitida", "parcialmente_recebida"]}}, {"_id": 0}).to_list(5000)
    now = datetime.now(timezone.utc)
    buckets = {"em_atraso": 0.0, "0_30": 0.0, "31_60": 0.0, "61_90": 0.0, "gt_90": 0.0}
    total_open = 0.0
    for inv in invoices:
        open_amt = inv["total_net"] - inv.get("received_amount", 0)
        if open_amt <= 0.01:
            continue
        total_open += open_amt
        try:
            d = datetime.fromisoformat(inv["issued_at"].replace("Z", "+00:00"))
            days = (now - d).days
        except Exception:
            days = 0
        if days > 30 and open_amt > 0:
            buckets["em_atraso"] += open_amt
        elif days <= 30:
            buckets["0_30"] += open_amt
        elif days <= 60:
            buckets["31_60"] += open_amt
        elif days <= 90:
            buckets["61_90"] += open_amt
        else:
            buckets["gt_90"] += open_amt
    return {
        "total_open": round(total_open, 2),
        "buckets": {k: round(v, 2) for k, v in buckets.items()},
        "count": len(invoices),
    }


@router.get("/analytics/forecast/receiving")
async def forecast_receiving(user: dict = Depends(get_current_user)):
    return await _forecast_receiving()


async def _vab_analysis():
    opps = await db.opportunities.find({"status": {"$in": ["aberta", "em_analise"]}}, {"_id": 0}).to_list(5000)
    props_won = await db.proposals.find({"status": "ganha"}, {"_id": 0}).to_list(5000)
    plan_lines = await db.plan_lines.find({"status": {"$ne": "cancelada"}}, {"_id": 0}).to_list(5000)
    invoices = await db.invoices.find({"status": {"$ne": "anulada"}}, {"_id": 0}).to_list(5000)
    by_m = {}
    for p in props_won:
        k = month_key(p.get("updated_at") or p.get("created_at", ""))
        b = by_m.setdefault(k, {"month": k, "value": 0.0, "vab": 0.0})
        b["value"] += p.get("total_net", 0)
        b["vab"] += p.get("total_vab", 0)
    monthly = sorted(by_m.values(), key=lambda r: r["month"])
    for m in monthly:
        m["margin_pct"] = round((m["vab"] / m["value"] * 100) if m["value"] else 0, 1)
        m["value"] = round(m["value"], 2)
        m["vab"] = round(m["vab"], 2)
    return {
        "pipeline_vab": round(sum(o.get("estimated_vab", 0) for o in opps), 2),
        "won_vab": round(sum(p.get("total_vab", 0) for p in props_won), 2),
        "planned_vab": round(sum(pl["vab"] for pl in plan_lines), 2),
        "invoiced_vab": round(sum(i["total_vab"] for i in invoices), 2),
        "monthly": monthly,
    }


@router.get("/analytics/vab")
async def vab_analysis(user: dict = Depends(get_current_user)):
    return await _vab_analysis()


async def _kpis_summary():
    leads = await db.leads.find({}, {"_id": 0}).to_list(5000)
    opps = await db.opportunities.find({}, {"_id": 0}).to_list(5000)
    props = await db.proposals.find({}, {"_id": 0}).to_list(5000)
    orders = await db.orders.find({}, {"_id": 0}).to_list(5000)
    won = [p for p in props if p["status"] == "ganha"]
    return {
        "leads": len(leads),
        "opps": len(opps),
        "props": len(props),
        "orders": len(orders),
        "won_value": round(sum(p.get("total_net", 0) for p in won), 2),
        "won_vab": round(sum(p.get("total_vab", 0) for p in won), 2),
        "orders_value": round(sum(o.get("total_net", 0) for o in orders), 2),
        "fulfilled": len([o for o in orders if o["status"] == "fulfilled"]),
    }


@router.get("/analytics/executive")
async def executive(user: dict = Depends(get_current_user)):
    kpis = await _kpis_summary()
    fi = await _forecast_invoicing()
    fr = await _forecast_receiving()
    vab = await _vab_analysis()
    return {"kpis": kpis, "forecast_invoicing": fi, "forecast_receiving": fr, "vab": vab}
