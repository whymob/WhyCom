"""Business/data helpers shared across routers."""
import asyncio
import csv
import io
import os
from datetime import datetime, timezone

import resend
from fastapi import HTTPException
from fastapi.responses import Response

from deps import db, now_iso, new_id, TOLERANCE, SENDER_EMAIL, logger


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


async def get_order_or_404(oid: str) -> dict:
    order = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Encomenda não encontrada")
    return order


async def recalc_order_status(oid: str):
    """Recalcula estado da encomenda com base em plano/faturas/recebimentos.

    Regras:
    - Plano, Faturação e Encomenda são comparados em valor **NET** (sem IVA).
    - Recebimento é comparado em valor **BRUTO** (com IVA) contra o total_gross das faturas.
    - VAB é apenas relevante até à fase da Encomenda — não entra na equação Fulfilled.
    """
    order = await get_order_or_404(oid)
    if order["status"] == "cancelada":
        return

    plan = await db.plan_lines.find({"order_id": oid, "status": {"$ne": "cancelada"}}, {"_id": 0}).to_list(1000)
    invoices = await db.invoices.find({"order_id": oid, "status": {"$ne": "anulada"}}, {"_id": 0}).to_list(1000)
    payments = await db.payments.find({"order_id": oid, "status": {"$ne": "anulado"}}, {"_id": 0}).to_list(1000)

    plan_value = sum(p["value"] for p in plan)  # net
    invoiced_net = sum(i["total_net"] for i in invoices)
    invoiced_gross = sum(i.get("total_gross", i["total_net"]) for i in invoices)
    received = sum(pay["amount"] for pay in payments)  # gross

    order_value = order["total_net"]

    def eq(a, b):
        return abs(a - b) <= TOLERANCE

    new_status = order["status"]
    if invoiced_net <= TOLERANCE:
        new_status = "em_planeamento" if plan else "aberta"
    elif invoiced_net + TOLERANCE < order_value:
        new_status = "parcialmente_faturada"
    else:
        new_status = "faturada"

    # Fatura totalmente recebida quando o recebido (bruto) iguala o bruto faturado
    if new_status == "faturada" and received + TOLERANCE >= invoiced_gross:
        new_status = "recebida"

    if (
        new_status == "recebida"
        and eq(order_value, plan_value)
        and eq(order_value, invoiced_net)
        and eq(received, invoiced_gross)
    ):
        new_status = "fulfilled"

    if new_status != order["status"]:
        await db.orders.update_one({"id": oid}, {"$set": {"status": new_status}})
        if new_status == "fulfilled":
            try:
                client = await db.clients.find_one({"id": order["client_id"]}, {"_id": 0})
                client_name = client["name"] if client else "—"
                order_after = {**order, "status": new_status}
                asyncio.create_task(notify_order_fulfilled(order_after, client_name))
            except Exception as exc:
                logger.error(f"[hook] order_fulfilled falhou: {exc}")


async def compute_alerts() -> list:
    now = datetime.now(timezone.utc)
    out = []

    proposals = await db.proposals.find({"status": "ganha", "converted_order_id": None}, {"_id": 0}).to_list(1000)
    for proposal in proposals:
        out.append({
            "level": "info",
            "type": "proposta_sem_encomenda",
            "message": f"Proposta {proposal['number']} ganha sem encomenda criada",
            "ref_id": proposal["id"],
        })

    orders = await db.orders.find({"status": {"$in": ["aberta", "em_planeamento"]}}, {"_id": 0}).to_list(1000)
    for order in orders:
        cnt = await db.plan_lines.count_documents({"order_id": order["id"]})
        if cnt == 0:
            out.append({
                "level": "warning",
                "type": "encomenda_sem_plano",
                "message": f"Encomenda {order['number']} sem plano de faturação",
                "ref_id": order["id"],
            })

    active_orders = await db.orders.find({"status": {"$nin": ["cancelada", "fulfilled"]}}, {"_id": 0}).to_list(1000)
    for order in active_orders:
        plan = await db.plan_lines.find({"order_id": order["id"], "status": {"$ne": "cancelada"}}, {"_id": 0}).to_list(1000)
        plan_value = sum(item["value"] for item in plan)
        if plan and abs(plan_value - order["total_net"]) > 0.5:
            out.append({
                "level": "warning",
                "type": "desvio_plano",
                "message": f"Encomenda {order['number']}: plano {plan_value:.2f}€ != encomenda {order['total_net']:.2f}€",
                "ref_id": order["id"],
            })

    overdue_plan_lines = await db.plan_lines.find({"status": {"$in": ["planeada", "parcialmente_faturada"]}}, {"_id": 0}).to_list(2000)
    for plan_line in overdue_plan_lines:
        expected = plan_line.get("expected_date")
        if not expected:
            continue
        try:
            due_date = (
                datetime.fromisoformat(expected.replace("Z", "+00:00"))
                if "T" in expected
                else datetime.fromisoformat(expected + "T00:00:00+00:00")
            )
            if due_date < now:
                out.append({
                    "level": "danger",
                    "type": "plano_atraso",
                    "message": f"Linha de plano vencida ({due_date.date()}): {plan_line['description'] or plan_line['type']}",
                    "ref_id": plan_line["order_id"],
                })
        except Exception:
            pass

    open_invoices = await db.invoices.find({"status": {"$in": ["emitida", "parcialmente_recebida"]}}, {"_id": 0}).to_list(2000)
    for invoice in open_invoices:
        try:
            issued_at = datetime.fromisoformat(invoice["issued_at"].replace("Z", "+00:00"))
            if (now - issued_at).days > 30:
                out.append({
                    "level": "danger",
                    "type": "fatura_atraso",
                    "message": f"Fatura {invoice['number']} em atraso ({(now - issued_at).days}d)",
                    "ref_id": invoice["id"],
                })
        except Exception:
            pass
    return out[:50]


def month_key(iso: str) -> str:
    try:
        return iso[:7]
    except Exception:
        return "—"


def csv_response(rows: list, fields: list, filename: str) -> Response:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _send_resend_sync(recipient: str, subject: str, html: str) -> dict:
    params = {"from": SENDER_EMAIL, "to": [recipient], "subject": subject, "html": html}
    return resend.Emails.send(params)


async def send_email_async(recipient: str, subject: str, html: str) -> dict:
    """Non-blocking Resend email send."""
    return await asyncio.to_thread(_send_resend_sync, recipient, subject, html)


def build_alerts_digest_html(items: list) -> str:
    level_colors = {"info": "#002FA7", "warning": "#B45309", "danger": "#B91C1C"}
    rows_html = "".join(
        f'<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:{level_colors.get(item["level"],"#111")};font-family:monospace;font-size:11px;text-transform:uppercase">{item["level"]}</td>'
        f'<td style="padding:8px 12px;border-bottom:1px solid #eee">{item["message"]}</td></tr>'
        for item in items
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


async def _notify(subject: str, html: str, kind: str):
    """Envia email não-bloqueante para os destinatários de eventos (best-effort).

    Recipients: NOTIFY_EVENT_RECIPIENTS (csv). Falha em silêncio (só log).
    """
    recipients_raw = os.environ.get("NOTIFY_EVENT_RECIPIENTS", "") or os.environ.get("ADMIN_EMAIL", "")
    recipients = [recipient.strip() for recipient in recipients_raw.split(",") if recipient.strip()]
    if not recipients or not os.environ.get("RESEND_API_KEY"):
        return
    for recipient in recipients:
        try:
            email = await send_email_async(recipient, subject, html)
            logger.info(f"[notify:{kind}] enviado para {recipient} (id={email.get('id')})")
        except Exception as exc:
            logger.error(f"[notify:{kind}] falhou para {recipient}: {exc}")


def _wrapper_html(title: str, body_html: str, accent: str = "#002FA7") -> str:
    return f"""
    <div style="font-family:system-ui,sans-serif;max-width:640px;margin:0 auto">
      <div style="background:{accent};color:#fff;padding:24px">
        <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;opacity:0.7">WhyMob CRM</div>
        <h1 style="margin:8px 0 0;font-weight:900;font-size:28px">{title}</h1>
      </div>
      <div style="padding:24px;border:1px solid #eee;border-top:none">
        {body_html}
      </div>
    </div>
    """


async def notify_proposal_won(proposal: dict, client_name: str):
    subject = f"[WhyMob] Proposta {proposal['number']} ganha — {client_name}"
    body = f"""
      <p style="color:#444;font-size:14px">Uma nova proposta acaba de ser marcada como <b>Ganha</b>.</p>
      <table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:13px">
        <tr><td style="padding:8px 12px;background:#f6f6f6;width:40%">Número</td><td style="padding:8px 12px;font-family:monospace">{proposal['number']}</td></tr>
        <tr><td style="padding:8px 12px;background:#f6f6f6">Cliente</td><td style="padding:8px 12px">{client_name}</td></tr>
        <tr><td style="padding:8px 12px;background:#f6f6f6">Valor s/ IVA</td><td style="padding:8px 12px;font-family:monospace">{proposal.get('total_net', 0):,.2f} €</td></tr>
        <tr><td style="padding:8px 12px;background:#f6f6f6">VAB</td><td style="padding:8px 12px;font-family:monospace">{proposal.get('total_vab', 0):,.2f} €</td></tr>
      </table>
      <p style="color:#888;font-size:12px;margin-top:20px">Próximo passo: converter em encomenda no CRM.</p>
    """
    await _notify(subject, _wrapper_html("Proposta Ganha", body, accent="#00A859"), "proposal_won")


async def notify_order_fulfilled(order: dict, client_name: str):
    subject = f"[WhyMob] Encomenda {order['number']} Fulfilled — {client_name}"
    body = f"""
      <p style="color:#444;font-size:14px">A encomenda foi <b>reconciliada por completo</b> e transitou para <b>Fulfilled</b>.</p>
      <table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:13px">
        <tr><td style="padding:8px 12px;background:#f6f6f6;width:40%">Número</td><td style="padding:8px 12px;font-family:monospace">{order['number']}</td></tr>
        <tr><td style="padding:8px 12px;background:#f6f6f6">Cliente</td><td style="padding:8px 12px">{client_name}</td></tr>
        <tr><td style="padding:8px 12px;background:#f6f6f6">Valor s/ IVA</td><td style="padding:8px 12px;font-family:monospace">{order.get('total_net', 0):,.2f} €</td></tr>
        <tr><td style="padding:8px 12px;background:#f6f6f6">VAB</td><td style="padding:8px 12px;font-family:monospace">{order.get('total_vab', 0):,.2f} €</td></tr>
      </table>
      <p style="color:#888;font-size:12px;margin-top:20px">Valor = Planeado = Faturado = Recebido. Ciclo comercial concluído.</p>
    """
    await _notify(subject, _wrapper_html("Encomenda Fulfilled", body, accent="#00A859"), "order_fulfilled")
