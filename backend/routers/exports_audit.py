"""Audit log + CSV Exports."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException

from deps import db, get_current_user
from helpers import csv_response
from routers.analytics import by_commercial

router = APIRouter()


@router.get("/audit")
async def list_audit(entity: Optional[str] = None, entity_id: Optional[str] = None,
                     limit: int = 100, user: dict = Depends(get_current_user)):
    q = {}
    if entity:
        q["entity"] = entity
    if entity_id:
        q["entity_id"] = entity_id
    docs = await db.audit_log.find(q, {"_id": 0}).sort("at", -1).to_list(min(limit, 500))
    return {"rows": docs}


@router.get("/exports/invoices.csv")
async def export_invoices(user: dict = Depends(get_current_user)):
    invoices = await db.invoices.find({}, {"_id": 0}).sort("issued_at", -1).to_list(5000)
    clients = {c["id"]: c["name"] for c in await db.clients.find({}, {"_id": 0}).to_list(2000)}
    orders = {o["id"]: o["number"] for o in await db.orders.find({}, {"_id": 0}).to_list(2000)}
    rows = [{
        "numero": i["number"], "data": i["issued_at"][:10],
        "cliente": clients.get(i["client_id"], ""), "encomenda": orders.get(i["order_id"], ""),
        "total_sem_iva": i["total_net"], "iva": i["total_vat"], "total_com_iva": i["total_gross"],
        "recebido": i.get("received_amount", 0),
        "estado": i["status"],
    } for i in invoices]
    return csv_response(rows, ["numero", "data", "cliente", "encomenda", "total_sem_iva", "iva", "total_com_iva", "recebido", "estado"], "faturas.csv")


@router.get("/exports/timesheet.csv")
async def export_timesheet(project_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"project_id": project_id} if project_id else {}
    entries = await db.time_entries.find(q, {"_id": 0}).sort("date", -1).to_list(10000)
    projects = {p["id"]: p["name"] for p in await db.projects.find({}, {"_id": 0}).to_list(1000)}
    rows = [{
        "data": e["date"], "projeto": projects.get(e["project_id"], ""),
        "developer": e["user_name"], "horas": e["hours"], "custo": e["cost"],
        "faturavel": "sim" if e["billable"] else "nao",
        "descricao": e.get("description", ""),
    } for e in entries]
    return csv_response(rows, ["data", "projeto", "developer", "horas", "custo", "faturavel", "descricao"], "timesheet.csv")


@router.get("/exports/reporting-commercial.csv")
async def export_reporting_commercial(user: dict = Depends(get_current_user)):
    data = await by_commercial(user)
    return csv_response(
        data["rows"],
        ["name", "role", "leads", "opps", "props", "won", "lost", "conversion_rate", "won_value", "won_vab", "orders_value", "orders_vab"],
        "reporting-comerciais.csv",
    )


@router.get("/exports/billing-orders.csv")
async def export_billing_orders(month: str, user: dict = Depends(get_current_user)):
    """Ordem de faturação: lista faturas emitidas no mês indicado (formato YYYY-MM).

    Uma linha por linha de fatura (mais granular que a export global).
    """
    if not month or len(month) != 7 or month[4] != "-":
        raise HTTPException(400, "Parâmetro 'month' deve ter o formato YYYY-MM")
    invoices = await db.invoices.find(
        {"issued_at": {"$regex": f"^{month}"}, "status": {"$ne": "anulada"}},
        {"_id": 0},
    ).sort("issued_at", 1).to_list(5000)
    clients = {c["id"]: c["name"] for c in await db.clients.find({}, {"_id": 0}).to_list(2000)}
    orders = {o["id"]: o for o in await db.orders.find({}, {"_id": 0}).to_list(2000)}
    plan_lines = {pl["id"]: pl for pl in await db.plan_lines.find({}, {"_id": 0}).to_list(5000)}

    rows = []
    for inv in invoices:
        order = orders.get(inv["order_id"], {})
        for il in inv.get("lines", []):
            pl = plan_lines.get(il.get("plan_line_id"), {})
            rows.append({
                "fatura": inv["number"],
                "data_emissao": inv["issued_at"][:10],
                "cliente": clients.get(inv["client_id"], ""),
                "encomenda": order.get("number", ""),
                "linha_descricao": il.get("description") or pl.get("description") or "",
                "linha_tipo": pl.get("type", ""),
                "valor_sem_iva": il.get("amount", 0),
                "iva_pct": inv.get("vat_pct", 0),
                "iva": round(il.get("amount", 0) * inv.get("vat_pct", 0) / 100, 2),
                "valor_com_iva": round(il.get("amount", 0) * (1 + inv.get("vat_pct", 0) / 100), 2),
                "estado_fatura": inv["status"],
                "recebido": inv.get("received_amount", 0),
            })
        if not inv.get("lines"):
            rows.append({
                "fatura": inv["number"],
                "data_emissao": inv["issued_at"][:10],
                "cliente": clients.get(inv["client_id"], ""),
                "encomenda": order.get("number", ""),
                "linha_descricao": "", "linha_tipo": "",
                "valor_sem_iva": inv["total_net"], "iva_pct": inv.get("vat_pct", 0),
                "iva": inv["total_vat"], "valor_com_iva": inv["total_gross"],
                "estado_fatura": inv["status"], "recebido": inv.get("received_amount", 0),
            })
    return csv_response(
        rows,
        ["fatura", "data_emissao", "cliente", "encomenda", "linha_descricao", "linha_tipo",
         "valor_sem_iva", "iva_pct", "iva", "valor_com_iva", "estado_fatura", "recebido"],
        f"ordem-faturacao-{month}.csv",
    )
