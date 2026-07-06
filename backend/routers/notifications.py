"""Email notifications via Resend."""
import os
from fastapi import APIRouter, Depends, HTTPException

from deps import require_roles, logger
from models import TestEmailRequest, AlertsDigestRequest
from helpers import send_email_async, compute_alerts, build_alerts_digest_html

router = APIRouter()


@router.post("/notifications/test-email")
async def send_test_email(req: TestEmailRequest, user: dict = Depends(require_roles("admin", "ceo"))):
    if not os.environ.get("RESEND_API_KEY"):
        raise HTTPException(500, "RESEND_API_KEY não configurado")
    html = req.html_content or (
        '<div style="font-family:system-ui,sans-serif;padding:24px">'
        '<h2 style="color:#002FA7;margin:0 0 12px">WhyMob CRM</h2>'
        '<p>Este é um email de teste enviado a partir da plataforma.</p>'
        f'<p style="color:#888;font-size:12px">Enviado por {user.get("email")}</p>'
        "</div>"
    )
    try:
        email = await send_email_async(req.recipient_email, req.subject, html)
        return {"status": "success", "email_id": email.get("id"), "to": req.recipient_email}
    except Exception as e:
        logger.error(f"Falha a enviar email de teste: {e}")
        raise HTTPException(502, "Não foi possível enviar o email. Contacte o administrador.")


@router.post("/notifications/send-alerts-digest")
async def send_alerts_digest(req: AlertsDigestRequest | None = None, user: dict = Depends(require_roles("admin", "ceo"))):
    if not os.environ.get("RESEND_API_KEY"):
        raise HTTPException(500, "RESEND_API_KEY não configurado")
    to = (req.to if req else None) or user.get("email") or os.environ.get("ADMIN_EMAIL")
    if not to:
        raise HTTPException(400, "Destinatário em falta")
    items = await compute_alerts()
    if not items:
        return {"sent": False, "reason": "Sem alertas a enviar"}
    subject = f"[WhyMob] {len(items)} alertas ativos"
    html = build_alerts_digest_html(items)
    try:
        email = await send_email_async(to, subject, html)
        return {"sent": True, "to": to, "count": len(items), "email_id": email.get("id")}
    except Exception as e:
        logger.error(f"Falha a enviar digest de alertas: {e}")
        raise HTTPException(502, "Não foi possível enviar o email. Contacte o administrador.")
