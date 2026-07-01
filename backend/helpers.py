"""Business/data helpers shared across routers."""
import asyncio
import csv
import io
import resend
from datetime import datetime, timezone
from fastapi import HTTPException
from fastapi.responses import Response

from deps import db, now_iso, new_id, TOLERANCE, SENDER_EMAIL, logger


# ------------- Audit -------------
async def audit_log(action: str, entity: str, entity_id: str, before, after, user: dict, reason: str = ""):
    doc = {
        "id": new_id(),
        "at": now_iso(),
        "user_id": user.get("id", "system"),
        "user_name": user.get("name", "system"),
        "action": action,
        "entity": entity,
        "entity_id": entity_id,
        "before": before,
        "after": after,
        "reason": reason,
    }
    await db.audit_log.insert_one(doc)


# ------------- Orders (used by finance + technical) -------------
async def get_order_or_404(oid: str) -> dict:
    o = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Encomenda não encontrada")
    return o


async def recalc_order_status(oid: str):
    """Recalcula estado da encomenda com base em plano/faturas/recebimentos."""
    order = await get_order_or_404(oid)
    if order["status"] == "cancelada":
        return
    plan = await db.plan_lines.find({"order_id": oid, "status": {"$ne": "cancelada"}}, {"_id": 0}).to_list(1000)
    invoices = await db.invoices.find({"order_id": oid, "status": {"$ne": "anulada"}}, {"_id": 0}).to_list(1000)
    payments = await db.payments.find({"order_id": oid}, {"_id": 0}).to_list(1000)

    plan_value = sum(p["value"] for p in plan)
    plan_vab = sum(p["vab"] for p in plan)
    invoiced_value = sum(i["total_net"] for i in invoices)
    invoiced_vab = sum(i["total_vab"] for i in invoices)
    received = sum(pay["amount"] for pay in payments)

    order_value = order["total_net"]
    order_vab = order["total_vab"]

    def eq(a, b):
        return abs(a - b) <= TOLERANCE

    new_status = order["status"]
    if invoiced_value <= TOLERANCE:
        new_status = "em_planeamento" if plan else "aberta"
    elif invoiced_value + TOLERANCE < order_value:
        new_status = "parcialmente_faturada"
    else:
        new_status = "faturada"

    if new_status == "faturada" and received + TOLERANCE >= invoiced_value:
        new_status = "recebida"

    if (
        new_status == "recebida"
        and eq(order_value, plan_value)
        and eq(order_value, invoiced_value)
        and eq(order_value, received)
        and eq(order_vab, plan_vab)
        and eq(order_vab, invoiced_vab)
    ):
        new_status = "fulfilled"

    if new_status != order["status"]:
        await db.orders.update_one({"id": oid}, {"$set": {"status": new_status}})


# ------------- Alerts (pure function, callable by scheduler) -------------
async def compute_alerts() -> list:
    now = datetime.now(timezone.utc)
    out = []

    props = await db.proposals.find({"status": "ganha", "converted_order_id": None}, {"_id": 0}).to_list(1000)
    for p in props:
        out.append({"level": "info", "type": "proposta_sem_encomenda",
                    "message": f"Proposta {p['number']} ganha sem encomenda criada", "ref_id": p["id"]})

    orders = await db.orders.find({"status": {"$in": ["aberta", "em_planeamento"]}}, {"_id": 0}).to_list(1000)
    for o in orders:
        cnt = await db.plan_lines.count_documents({"order_id": o["id"]})
        if cnt == 0:
            out.append({"level": "warning", "type": "encomenda_sem_plano",
                        "message": f"Encomenda {o['number']} sem plano de faturação", "ref_id": o["id"]})

    for o in await db.orders.find({"status": {"$nin": ["cancelada", "fulfilled"]}}, {"_id": 0}).to_list(1000):
        plan = await db.plan_lines.find({"order_id": o["id"], "status": {"$ne": "cancelada"}}, {"_id": 0}).to_list(1000)
        pv = sum(p["value"] for p in plan)
        if plan and abs(pv - o["total_net"]) > 0.5:
            out.append({"level": "warning", "type": "desvio_plano",
                        "message": f"Encomenda {o['number']}: plano {pv:.2f}€ ≠ encomenda {o['total_net']:.2f}€",
                        "ref_id": o["id"]})

    for pl in await db.plan_lines.find({"status": {"$in": ["planeada", "parcialmente_faturada"]}}, {"_id": 0}).to_list(2000):
        exp = pl.get("expected_date")
        if not exp:
            continue
        try:
            d = datetime.fromisoformat(exp.replace("Z", "+00:00")) if "T" in exp else datetime.fromisoformat(exp + "T00:00:00+00:00")
            if d < now:
                out.append({"level": "danger", "type": "plano_atraso",
                            "message": f"Linha de plano vencida ({d.date()}): {pl['description'] or pl['type']}",
                            "ref_id": pl["order_id"]})
        except Exception:
            pass

    for inv in await db.invoices.find({"status": {"$in": ["emitida", "parcialmente_recebida"]}}, {"_id": 0}).to_list(2000):
        try:
            d = datetime.fromisoformat(inv["issued_at"].replace("Z", "+00:00"))
            if (now - d).days > 30:
                out.append({"level": "danger", "type": "fatura_atraso",
                            "message": f"Fatura {inv['number']} em atraso ({(now - d).days}d)", "ref_id": inv["id"]})
        except Exception:
            pass
    return out[:50]


# ------------- Analytics helpers -------------
def month_key(iso: str) -> str:
    try:
        return iso[:7]
    except Exception:
        return "—"


# ------------- CSV export -------------
def csv_response(rows: list, fields: list, filename: str) -> Response:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=fields, extrasaction="ignore")
    w.writeheader()
    for r in rows:
        w.writerow(r)
    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ------------- Email (Resend) -------------
def _send_resend_sync(recipient: str, subject: str, html: str) -> dict:
    params = {"from": SENDER_EMAIL, "to": [recipient], "subject": subject, "html": html}
    return resend.Emails.send(params)


async def send_email_async(recipient: str, subject: str, html: str) -> dict:
    """Non-blocking Resend email send."""
    return await asyncio.to_thread(_send_resend_sync, recipient, subject, html)


def build_alerts_digest_html(items: list) -> str:
    level_colors = {"info": "#002FA7", "warning": "#B45309", "danger": "#B91C1C"}
    rows_html = "".join(
        f'<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:{level_colors.get(a["level"],"#111")};font-family:monospace;font-size:11px;text-transform:uppercase">{a["level"]}</td>'
        f'<td style="padding:8px 12px;border-bottom:1px solid #eee">{a["message"]}</td></tr>'
        for a in items
    )
    return f"""
    <div style="font-family:system-ui,sans-serif;max-width:640px;margin:0 auto">
      <div style="background:#002FA7;color:#fff;padding:24px">
        <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;opacity:0.7">WhyMob CRM</div>
        <h1 style="margin:8px 0 0;font-weight:900;font-size:28px">Digest de Alertas</h1>
      </div>
      <div style="padding:24px;border:1px solid #eee;border-top:none">
        <p style="color:#444;font-size:14px">{len(items)} alertas ativos em {now_iso()[:10]}.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:12px">
          <thead><tr><th style="text-align:left;padding:8px 12px;background:#f6f6f6;font-size:11px;text-transform:uppercase;letter-spacing:0.1em">Nível</th><th style="text-align:left;padding:8px 12px;background:#f6f6f6;font-size:11px;text-transform:uppercase;letter-spacing:0.1em">Alerta</th></tr></thead>
          <tbody>{rows_html}</tbody>
        </table>
        <p style="color:#888;font-size:12px;margin-top:24px">Aceda ao dashboard para detalhes.</p>
      </div>
    </div>
    """
