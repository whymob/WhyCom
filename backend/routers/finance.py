"""Finance: Billing Plans, Invoices, Payments, Alerts."""
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException

from deps import db, get_current_user, require_roles, now_iso, new_id, TOLERANCE
from helpers import audit_log, get_order_or_404, recalc_order_status, compute_alerts

router = APIRouter()


# ------------- Billing Plan -------------
@router.get("/orders/{oid}/plan")
async def get_plan(oid: str, user: dict = Depends(get_current_user)):
    await get_order_or_404(oid)
    lines = await db.plan_lines.find({"order_id": oid}, {"_id": 0}).sort("expected_date", 1).to_list(1000)
    return {"order_id": oid, "lines": lines}


@router.put("/orders/{oid}/plan")
async def replace_plan(oid: str, payload: dict, user: dict = Depends(get_current_user)):
    order = await get_order_or_404(oid)
    if order.get("status") == "cancelada":
        raise HTTPException(400, "Encomenda anulada: o plano não pode ser alterado")
    active_invoice = await db.invoices.find_one({"order_id": oid, "status": {"$ne": "anulada"}}, {"_id": 0, "number": 1})
    change_reason = str(payload.get("change_reason") or "").strip()
    if active_invoice and user.get("role") != "admin":
        raise HTTPException(403, "A alteração de um plano com faturação ativa requer um administrador")
    if active_invoice and not change_reason:
        raise HTTPException(400, "Indique o motivo da alteração do plano")
    lines_in = payload.get("lines", [])
    existing = await db.plan_lines.find({"order_id": oid}, {"_id": 0}).to_list(1000)
    used_ids = {
        ln["id"] for ln in existing
        if float(ln.get("invoiced_amount") or 0) >= float(ln.get("value") or 0) - TOLERANCE
        and float(ln.get("invoiced_amount") or 0) > TOLERANCE
    }
    existing_by_id = {ln["id"]: ln for ln in existing}
    existing_ids = {ln["id"] for ln in existing}
    existing_active_total = sum(float(ln.get("value") or 0) for ln in existing if ln.get("status") != "cancelada")
    requested_total = sum(float(ln.get("value") or 0) for ln in lines_in if ln.get("status") != "cancelada")
    if requested_total > float(order.get("total_net") or 0) + TOLERANCE:
        raise HTTPException(400, "O plano de faturação excede o valor da encomenda")
    has_new_line = any(ln.get("id") not in existing_ids for ln in lines_in)
    if has_new_line and existing_active_total + TOLERANCE >= float(order.get("total_net") or 0):
        raise HTTPException(400, "Esta encomenda nao tem valor disponivel para uma nova linha de faturacao")
    new_lines = []
    for ln in lines_in:
        line_id = ln.get("id")
        if line_id and line_id in used_ids:
            continue
        current = existing_by_id.get(line_id)
        if current and float(current.get("invoiced_amount") or 0) > TOLERANCE:
            if any(ln.get(field) != current.get(field) for field in ("source_item_key", "type", "description", "expected_date")):
                raise HTTPException(400, "Os dados de uma linha parcialmente faturada não podem ser alterados")
            invoiced_amount = float(current.get("invoiced_amount") or 0)
            requested_value = float(ln.get("value") or 0)
            if requested_value + TOLERANCE < invoiced_amount:
                raise HTTPException(400, "O valor da linha não pode ficar abaixo do valor já faturado")
            new_lines.append({
                **current,
                "value": round(requested_value, 2),
                "status": "faturada" if abs(requested_value - invoiced_amount) <= TOLERANCE else "parcialmente_faturada",
            })
            continue
        new_lines.append({
            "id": new_id(),
            "order_id": oid,
            "source_item_key": ln.get("source_item_key"),
            "type": ln.get("type", "projeto"),
            "description": ln.get("description", ""),
            "expected_date": ln.get("expected_date"),
            "value": float(ln.get("value") or 0),
            "invoiced_amount": 0.0,
            "status": "planeada",
            "created_at": now_iso(),
        })
    await db.plan_lines.delete_many({"order_id": oid, "id": {"$nin": list(used_ids)}})
    if new_lines:
        await db.plan_lines.insert_many(new_lines)
    if active_invoice:
        await audit_log(
            "update",
            "billing_plan",
            oid,
            {"active_invoice": active_invoice.get("number")},
            {"line_count": len(new_lines) + len(used_ids)},
            user,
            change_reason,
        )
    all_lines = await db.plan_lines.find({"order_id": oid}, {"_id": 0}).sort("expected_date", 1).to_list(1000)
    await recalc_order_status(oid)
    return {"order_id": oid, "lines": all_lines}


@router.get("/orders/{oid}/reconcile")
async def reconcile(oid: str, user: dict = Depends(get_current_user)):
    order = await get_order_or_404(oid)
    plan = await db.plan_lines.find({"order_id": oid, "status": {"$ne": "cancelada"}}, {"_id": 0}).to_list(1000)
    invoices = await db.invoices.find({"order_id": oid, "status": {"$ne": "anulada"}}, {"_id": 0}).to_list(1000)
    payments = await db.payments.find({"order_id": oid, "status": {"$ne": "anulado"}}, {"_id": 0}).to_list(1000)
    plan_val = round(sum(p["value"] for p in plan), 2)
    inv_net = round(sum(i["total_net"] for i in invoices), 2)
    inv_gross = round(sum(i.get("total_gross", i["total_net"]) for i in invoices), 2)
    received = round(sum(p["amount"] for p in payments), 2)  # gross
    return {
        "order": {"value": order["total_net"], "vab": order["total_vab"], "status": order["status"]},
        "plan": {"value": plan_val, "count": len(plan)},
        "invoiced": {"value": inv_net, "gross": inv_gross, "count": len(invoices)},
        "received": {"value": received, "count": len(payments)},
        "deltas": {
            "plan_vs_order": round(plan_val - order["total_net"], 2),
            "invoiced_vs_plan": round(inv_net - plan_val, 2),
            "received_vs_invoiced": round(received - inv_gross, 2),
        },
    }


# ------------- Invoices -------------
@router.get("/invoices")
async def list_invoices(order_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"order_id": order_id} if order_id else {}
    invoices = await db.invoices.find(q, {"_id": 0}).sort("issued_at", -1).to_list(2000)
    invoice_ids = [invoice["id"] for invoice in invoices]
    payments = await db.payments.find({"invoice_id": {"$in": invoice_ids}, "status": {"$ne": "anulado"}}, {"_id": 0, "invoice_id": 1, "amount": 1}).to_list(5000) if invoice_ids else []
    received_by_invoice = {}
    for payment in payments:
        received_by_invoice[payment["invoice_id"]] = received_by_invoice.get(payment["invoice_id"], 0) + float(payment.get("amount") or 0)

    for invoice in invoices:
        received_amount = round(received_by_invoice.get(invoice["id"], 0), 2)
        invoice["received_amount"] = received_amount
        if invoice.get("status") != "anulada":
            gross = float(invoice.get("total_gross", invoice.get("total_net", 0)) or 0)
            invoice["status"] = "recebida" if abs(received_amount - gross) <= TOLERANCE else ("parcialmente_recebida" if received_amount > TOLERANCE else "emitida")
    return invoices


@router.post("/invoices")
async def create_invoice(payload: dict, user: dict = Depends(get_current_user)):
    order_id = payload["order_id"]
    order = await get_order_or_404(order_id)
    if order.get("status") == "cancelada":
        raise HTTPException(400, "Encomenda anulada: não é possível emitir faturas")
    lines_in = payload.get("lines", [])
    if not lines_in:
        raise HTTPException(400, "Fatura deve ter pelo menos 1 linha")

    plan_lines_map = {ln["id"]: ln for ln in await db.plan_lines.find({"order_id": order_id}, {"_id": 0}).to_list(1000)}
    total_net = 0.0
    inv_lines = []
    for ln in lines_in:
        pl = plan_lines_map.get(ln["plan_line_id"])
        if not pl:
            raise HTTPException(400, f"Linha de plano {ln['plan_line_id']} não encontrada")
        remaining = pl["value"] - pl.get("invoiced_amount", 0)
        amt = float(ln["amount"])
        if amt <= 0:
            raise HTTPException(400, "Valor da linha deve ser > 0")
        if amt > remaining + TOLERANCE:
            raise HTTPException(400, f"Excede saldo por faturar da linha (restante {remaining:.2f}€)")
        order_net = float(order.get("total_net") or 0)
        order_vab = float(order.get("total_vab") or 0)
        inv_lines.append({
            "plan_line_id": pl["id"],
            "amount": round(amt, 2),
            "description": ln.get("description") or pl["description"],
            "vab_amount": round(order_vab * amt / order_net, 2) if order_net else 0.0,
        })
        total_net += amt

    vat_pct = float(payload.get("vat_pct") or 23)
    invoice = {
        "id": new_id(),
        "number": payload.get("number") or f"FT-{datetime.now().year}-{(await db.invoices.count_documents({})) + 1:04d}",
        "external_invoice_number": (payload.get("external_invoice_number") or "").strip(),
        "order_id": order_id,
        "client_id": order["client_id"],
        "issued_at": payload.get("issued_at") or now_iso(),
        "vat_pct": vat_pct,
        "lines": inv_lines,
        "total_net": round(total_net, 2),
        "total_vat": round(total_net * (vat_pct / 100), 2),
        "received_amount": 0.0,
        "status": "emitida",
        "cancel_reason": "",
        "notes": payload.get("notes") or "",
        "created_at": now_iso(),
    }
    invoice["total_gross"] = round(invoice["total_net"] + invoice["total_vat"], 2)
    await db.invoices.insert_one(invoice)

    for il in inv_lines:
        pl = plan_lines_map[il["plan_line_id"]]
        new_amt = pl.get("invoiced_amount", 0) + il["amount"]
        status = "faturada" if abs(new_amt - pl["value"]) <= TOLERANCE else "parcialmente_faturada"
        await db.plan_lines.update_one({"id": pl["id"]}, {"$set": {"invoiced_amount": round(new_amt, 2), "status": status}})

    await recalc_order_status(order_id)
    invoice.pop("_id", None)
    return invoice


@router.patch("/invoices/{iid}/vab")
async def correct_invoice_vab(iid: str, payload: dict, user: dict = Depends(require_roles("admin"))):
    """Correct line VAB with an admin-only, auditable reason."""
    reason = str((payload or {}).get("reason") or "").strip()
    if not reason:
        raise HTTPException(400, "Motivo da correção do VAB obrigatório")
    invoice = await db.invoices.find_one({"id": iid}, {"_id": 0})
    if not invoice:
        raise HTTPException(404, "Fatura não encontrada")
    if invoice.get("status") == "anulada":
        raise HTTPException(400, "Fatura anulada: o VAB não pode ser corrigido")
    lines = invoice.get("lines") or []
    corrections = (payload or {}).get("lines") or []
    if not lines or not corrections:
        raise HTTPException(400, "A fatura não possui linhas de VAB corrigíveis")
    by_plan_line = {str(item.get("plan_line_id")): item for item in corrections if item.get("plan_line_id")}
    by_index = {int(item["index"]): item for item in corrections if str(item.get("index", "")).isdigit()}
    before_lines = [{**line} for line in lines]
    updated_lines = []
    changed = False
    for index, line in enumerate(lines):
        correction = by_plan_line.get(str(line.get("plan_line_id"))) or by_index.get(index)
        if not correction:
            updated_lines.append(line)
            continue
        try:
            vab_amount = float(correction.get("vab_amount"))
        except (TypeError, ValueError):
            raise HTTPException(400, "Valor de VAB inválido")
        if vab_amount != vab_amount or abs(vab_amount) == float("inf"):
            raise HTTPException(400, "Valor de VAB inválido")
        next_line = {**line, "vab_amount": round(vab_amount, 2)}
        updated_lines.append(next_line)
        changed = changed or next_line.get("vab_amount") != line.get("vab_amount")
    if not changed:
        raise HTTPException(400, "Nenhuma linha foi alterada")
    await db.invoices.update_one({"id": iid}, {"$set": {"lines": updated_lines}})
    await audit_log("vab_correction", "invoice", iid, {"lines": before_lines}, {"lines": updated_lines}, user, reason)
    return await db.invoices.find_one({"id": iid}, {"_id": 0})


@router.patch("/invoices/{iid}/external-reference")
async def update_external_invoice_number(iid: str, payload: dict, user: dict = Depends(require_roles("admin"))):
    invoice = await db.invoices.find_one({"id": iid}, {"_id": 0})
    if not invoice:
        raise HTTPException(404, "Fatura não encontrada")
    external_number = str((payload or {}).get("external_invoice_number") or "").strip()
    before = invoice.get("external_invoice_number", "")
    await db.invoices.update_one(
        {"id": iid},
        {"$set": {"external_invoice_number": external_number}},
    )
    updated = await db.invoices.find_one({"id": iid}, {"_id": 0})
    await audit_log(
        "update",
        "invoice",
        iid,
        {"external_invoice_number": before},
        {"external_invoice_number": external_number},
        user,
    )
    return updated


@router.post("/invoices/{iid}/cancel")
async def cancel_invoice(iid: str, payload: dict, user: dict = Depends(require_roles("admin"))):
    reason = (payload or {}).get("reason", "").strip()
    if not reason:
        raise HTTPException(400, "Motivo de anulação obrigatório")
    inv = await db.invoices.find_one({"id": iid}, {"_id": 0})
    order = await get_order_or_404(inv["order_id"]) if inv else None
    if order and order.get("status") == "cancelada":
        raise HTTPException(400, "Encomenda anulada: a fatura nao pode ser alterada")
    if not inv:
        raise HTTPException(404, "Fatura não encontrada")
    if inv["status"] == "anulada":
        raise HTTPException(400, "Fatura ja anulada")
    active_payment = await db.payments.find_one({"invoice_id": iid, "status": {"$ne": "anulado"}}, {"_id": 0, "id": 1})
    if active_payment:
        raise HTTPException(400, "Anule primeiro os recebimentos associados a esta fatura")
        raise HTTPException(400, "Já anulada")
    for il in inv["lines"]:
        pl = await db.plan_lines.find_one({"id": il["plan_line_id"]})
        if pl:
            new_amt = max(0, pl.get("invoiced_amount", 0) - il["amount"])
            status = "planeada" if new_amt <= TOLERANCE else "parcialmente_faturada"
            await db.plan_lines.update_one({"id": pl["id"]}, {"$set": {"invoiced_amount": round(new_amt, 2), "status": status}})
    await db.invoices.update_one({"id": iid}, {"$set": {"status": "anulada", "cancel_reason": reason}})
    await audit_log("cancel", "invoice", iid, {"status": inv.get("status")}, {"status": "anulada"}, user, reason)
    await recalc_order_status(inv["order_id"])
    return {"ok": True}


# ------------- Payments -------------
@router.get("/payments")
async def list_payments(order_id: Optional[str] = None, invoice_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {}
    if order_id:
        q["order_id"] = order_id
    if invoice_id:
        q["invoice_id"] = invoice_id
    return await db.payments.find(q, {"_id": 0}).sort("paid_at", -1).to_list(2000)


@router.post("/payments")
async def create_payment(payload: dict, user: dict = Depends(get_current_user)):
    invoice_id = payload["invoice_id"]
    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Fatura não encontrada")
    order = await get_order_or_404(inv["order_id"])
    if order.get("status") == "cancelada":
        raise HTTPException(400, "Encomenda anulada: não é possível registar recebimentos")
    if inv["status"] == "anulada":
        raise HTTPException(400, "Fatura anulada")
    amount = float(payload["amount"])
    if amount <= 0:
        raise HTTPException(400, "Valor deve ser > 0")
    # Recebimento em valor BRUTO (com IVA) — valida contra total_gross
    inv_gross = inv.get("total_gross", inv["total_net"])
    payments = await db.payments.find({"invoice_id": invoice_id, "status": {"$ne": "anulado"}}, {"_id": 0, "amount": 1}).to_list(5000)
    received_amount = round(sum(float(payment.get("amount") or 0) for payment in payments), 2)
    open_balance = inv_gross - received_amount
    if amount > open_balance + TOLERANCE:
        raise HTTPException(400, f"Valor excede saldo em aberto ({open_balance:.2f}€ c/ IVA)")

    method = payload.get("method", "transferencia")
    if method not in ("transferencia", "cartao", "mbway", "cheque", "numerario", "outro"):
        raise HTTPException(400, "Método de pagamento inválido")

    pay = {
        "id": new_id(),
        "invoice_id": invoice_id,
        "order_id": inv["order_id"],
        "client_id": inv["client_id"],
        "amount": round(amount, 2),
        "method": method,
        "reference": payload.get("reference", ""),
        "paid_at": payload.get("paid_at") or now_iso(),
        "created_at": now_iso(),
    }
    await db.payments.insert_one(pay)
    new_received = received_amount + amount
    inv_status = "recebida" if abs(new_received - inv_gross) <= TOLERANCE else "parcialmente_recebida"
    await db.invoices.update_one({"id": invoice_id}, {"$set": {"received_amount": round(new_received, 2), "status": inv_status}})
    await recalc_order_status(inv["order_id"])
    pay.pop("_id", None)
    return pay


@router.post("/payments/{pid}/cancel")
async def cancel_payment(pid: str, payload: dict, user: dict = Depends(require_roles("admin"))):
    reason = (payload or {}).get("reason", "").strip()
    if not reason:
        raise HTTPException(400, "Motivo de anulação obrigatório")
    payment = await db.payments.find_one({"id": pid}, {"_id": 0})
    order = await get_order_or_404(payment["order_id"]) if payment else None
    if order and order.get("status") == "cancelada":
        raise HTTPException(400, "Encomenda anulada: o recebimento nao pode ser alterado")
    if not payment:
        raise HTTPException(404, "Recebimento não encontrado")
    if payment.get("status") == "anulado":
        raise HTTPException(400, "Recebimento já anulado")

    await db.payments.update_one({"id": pid}, {"$set": {"status": "anulado", "cancel_reason": reason}})
    invoice = await db.invoices.find_one({"id": payment["invoice_id"]}, {"_id": 0})
    if invoice and invoice.get("status") != "anulada":
        active_payments = await db.payments.find({"invoice_id": payment["invoice_id"], "status": {"$ne": "anulado"}}, {"_id": 0, "amount": 1}).to_list(5000)
        received_amount = round(sum(float(item.get("amount") or 0) for item in active_payments), 2)
        gross = float(invoice.get("total_gross", invoice.get("total_net", 0)) or 0)
        invoice_status = "recebida" if abs(received_amount - gross) <= TOLERANCE else ("parcialmente_recebida" if received_amount > TOLERANCE else "emitida")
        await db.invoices.update_one({"id": payment["invoice_id"]}, {"$set": {"received_amount": received_amount, "status": invoice_status}})
    await audit_log("cancel", "payment", pid, {"status": payment.get("status", "ativo"), "amount": payment.get("amount")}, {"status": "anulado"}, user, reason)
    await recalc_order_status(payment["order_id"])
    return {"ok": True}


# ------------- Alerts -------------
@router.get("/dashboard/alerts")
async def alerts(user: dict = Depends(get_current_user)):
    return {"alerts": await compute_alerts()}
