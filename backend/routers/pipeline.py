"""Commercial pipeline: Leads, Opportunities, Proposals, Orders + Funnel/KPIs."""
import asyncio
import base64
import hashlib
import os
import re
import math
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from fastapi.responses import FileResponse

from deps import db, get_current_user, require_roles, now_iso, new_id, logger
from models import Lead, Opportunity, Proposal, ProposalLine, Order, NewProposalFromOpportunity, compute_proposal_totals
from helpers import audit_log, notify_proposal_won, invoice_line_vab

router = APIRouter()
PROPOSAL_ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024
PROPOSAL_ATTACHMENT_DIR = os.environ.get("PROPOSAL_ATTACHMENT_DIR", "/app/uploads")
OPPORTUNITY_ATTACHMENT_DIR = os.environ.get("OPPORTUNITY_ATTACHMENT_DIR", PROPOSAL_ATTACHMENT_DIR)
ALLOW_PROPOSAL_ATTACHMENT_AFTER_ORDER = os.environ.get("ALLOW_PROPOSAL_ATTACHMENT_AFTER_ORDER", "true").lower() in {"1", "true", "yes"}
PROPOSAL_ACTIVE_STATUS_FLOW = ["em_elaboracao", "enviada", "em_negociacao", "ganha"]
PROPOSAL_TERMINAL_STATUSES = {"perdida", "expirada", "substituida"}
ORDER_BOARD_STATUS_FLOW = ["aberta", "em_planeamento"]


def _valid_proposal_attachment_signature(extension: str, header: bytes) -> bool:
    if extension == ".pdf":
        return header.startswith(b"%PDF-")
    # OOXML files (.docx/.pptx) are ZIP containers; legacy Office files use OLE.
    return header.startswith(b"PK\x03\x04") or header.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1")
ALLOWED_PROPOSAL_ATTACHMENT_TYPES = {
    ".pdf": {"application/pdf"},
    ".doc": {"application/msword"},
    ".docx": {"application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
    ".ppt": {"application/vnd.ms-powerpoint"},
    ".pptx": {"application/vnd.openxmlformats-officedocument.presentationml.presentation"},
}
OPPORTUNITY_ATTACHMENT_TYPES = {
    **ALLOWED_PROPOSAL_ATTACHMENT_TYPES,
    ".xls": {"application/vnd.ms-excel"},
    ".xlsx": {"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
}


def record_year(record: dict, fields: tuple[str, ...]) -> int | None:
    for field in fields:
        value = record.get(field)
        if value:
            try:
                return int(str(value)[:4])
            except (TypeError, ValueError):
                continue
    return None


LIST_PAGE_SIZE_MAX = 100


def _list_pagination(page: int, page_size: int, total: int) -> dict:
    pages = max(1, math.ceil(total / page_size))
    return {"page": page, "page_size": page_size, "total": total, "pages": pages}


def _search_regex(value: str) -> str:
    return re.escape(value.strip())


async def _related_search_ids(collection, field: str, search: str, projection: dict) -> list[str]:
    if not search:
        return []
    rows = await collection.find({field: {"$regex": _search_regex(search), "$options": "i"}}, projection).to_list(5000)
    return [row["id"] for row in rows if row.get("id")]


def _paged_response(items: list[dict], page: int, page_size: int, total: int) -> dict:
    return {"items": items, **_list_pagination(page, page_size, total)}


# ------------- Leads -------------
@router.get("/leads")
async def list_leads(page: Optional[int] = Query(None, ge=1), page_size: Optional[int] = Query(None, ge=1, le=LIST_PAGE_SIZE_MAX), search: str = "", status: str = "", sort_by: str = "created_at", sort_dir: str = "desc", user: dict = Depends(get_current_user)):
    if page is None and page_size is None and not search and not status and sort_by == "created_at" and sort_dir == "desc":
        return await db.leads.find({}, {"_id": 0}).to_list(1000)
    page = page or 1
    page_size = page_size or 25
    query = {}
    terms = []
    if search.strip():
        pattern = {"$regex": _search_regex(search), "$options": "i"}
        terms.extend([{field: pattern} for field in ("id", "description", "client_name_raw", "status")])
        terms.append({"client_id": {"$in": await _related_search_ids(db.clients, "name", search, {"_id": 0, "id": 1})}})
        query["$or"] = terms
    statuses = [item for item in status.split(",") if item]
    if statuses:
        query["status"] = {"$in": statuses}
    total = await db.leads.count_documents(query)
    sort_field = sort_by if sort_by in {"created_at", "updated_at", "description", "status", "estimated_value"} else "created_at"
    direction = -1 if sort_dir != "asc" else 1
    items = await db.leads.find(query, {"_id": 0}).sort(sort_field, direction).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    return _paged_response(items, page, page_size, total)


@router.post("/leads", response_model=Lead)
async def create_lead(payload: Lead, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    doc["id"] = new_id()
    doc["owner_id"] = payload.owner_id or user["id"]
    doc["created_at"] = now_iso()
    doc["updated_at"] = now_iso()
    await db.leads.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/leads/{lid}", response_model=Lead)
async def update_lead(lid: str, payload: dict, user: dict = Depends(get_current_user)):
    payload.pop("id", None)
    payload["updated_at"] = now_iso()
    if payload.get("status") == "descartada" and not payload.get("lost_reason"):
        raise HTTPException(400, "Motivo obrigatório ao descartar lead")
    before = await db.leads.find_one({"id": lid}, {"_id": 0})
    await db.leads.update_one({"id": lid}, {"$set": payload})
    doc = await db.leads.find_one({"id": lid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Lead não encontrada")
    if before and before.get("status") != doc.get("status"):
        await audit_log("status_change", "lead", lid,
                        {"status": before.get("status")},
                        {"status": doc.get("status")},
                        user, payload.get("lost_reason") or payload.get("status_change_reason", ""))
    return doc


@router.post("/leads/{lid}/convert", response_model=Opportunity)
async def convert_lead(lid: str, user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lid}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead não encontrada")
    if lead["status"] != "em_qualificacao":
        raise HTTPException(400, "A lead deve estar Em qualificação para avançar para oportunidade")
    client_id = lead.get("client_id")
    if not client_id:
        client_doc = {
            "id": new_id(),
            "name": lead.get("client_name_raw") or "Cliente sem nome",
            "nif": "PENDENTE-" + new_id()[:8],
            "address": "", "contact_email": "", "contact_phone": "", "contact_person": "",
            "segment": "Prospect", "active": True,
            "owner_id": user["id"], "created_at": now_iso(),
        }
        await db.clients.insert_one(client_doc)
        client_id = client_doc["id"]

    opp = {
        "id": new_id(), "lead_id": lid, "client_id": client_id,
        "description": lead["description"],
        "manufacturer_id": lead.get("manufacturer_id"),
        "product_ids": lead.get("product_ids", []),
        "estimated_value": lead.get("estimated_value", 0.0),
        "estimated_vab": 0.0, "probability": 50, "expected_close_date": None,
        "priority": "media", "competitor": "", "notes": "",
        "owner_id": user["id"], "status": "aberta", "lost_reason": "",
        "converted_proposal_id": None,
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.opportunities.insert_one(opp)
    await db.leads.update_one({"id": lid}, {"$set": {"status": "convertida", "converted_opportunity_id": opp["id"], "updated_at": now_iso()}})
    opp.pop("_id", None)
    return opp


# ------------- Opportunities -------------
@router.get("/opportunities")
async def list_opps(page: Optional[int] = Query(None, ge=1), page_size: Optional[int] = Query(None, ge=1, le=LIST_PAGE_SIZE_MAX), search: str = "", status: str = "", sort_by: str = "created_at", sort_dir: str = "desc", user: dict = Depends(get_current_user)):
    if page is None and page_size is None and not search and not status and sort_by == "created_at" and sort_dir == "desc":
        return await db.opportunities.find({}, {"_id": 0}).to_list(1000)
    page = page or 1
    page_size = page_size or 25
    query = {}
    if search.strip():
        pattern = {"$regex": _search_regex(search), "$options": "i"}
        query["$or"] = [{field: pattern} for field in ("id", "description", "status")] + [{"client_id": {"$in": await _related_search_ids(db.clients, "name", search, {"_id": 0, "id": 1})}}]
    statuses = [item for item in status.split(",") if item]
    if statuses:
        query["status"] = {"$in": statuses}
    total = await db.opportunities.count_documents(query)
    sort_field = sort_by if sort_by in {"created_at", "updated_at", "description", "status", "estimated_value"} else "created_at"
    direction = -1 if sort_dir != "asc" else 1
    items = await db.opportunities.find(query, {"_id": 0}).sort(sort_field, direction).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    return _paged_response(items, page, page_size, total)


@router.post("/opportunities", response_model=Opportunity)
async def create_opp(payload: Opportunity, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    doc["id"] = new_id()
    doc["owner_id"] = payload.owner_id or user["id"]
    doc["created_at"] = now_iso()
    doc["updated_at"] = now_iso()
    await db.opportunities.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/opportunities/{oid}", response_model=Opportunity)
async def update_opp(oid: str, payload: dict, user: dict = Depends(get_current_user)):
    payload.pop("id", None)
    description_change_reason = str(payload.pop("description_change_reason", "")).strip()
    before = await db.opportunities.find_one({"id": oid}, {"_id": 0})
    if not before:
        raise HTTPException(404, "Oportunidade não encontrada")
    description_changed = "description" in payload and str(payload["description"]).strip() != str(before.get("description", "")).strip()
    if description_changed:
        if user.get("role") not in {"admin", "comercial"}:
            raise HTTPException(403, "A alteração da descrição requer perfil admin ou comercial")
        if not description_change_reason:
            raise HTTPException(400, "Justificação obrigatória ao alterar a descrição")
    payload["updated_at"] = now_iso()
    if payload.get("status") == "perdida" and not payload.get("lost_reason"):
        raise HTTPException(400, "Motivo de perda obrigatório")
    await db.opportunities.update_one({"id": oid}, {"$set": payload})
    doc = await db.opportunities.find_one({"id": oid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Oportunidade não encontrada")
    if description_changed:
        await audit_log(
            "description_change", "opportunity", oid,
            {"description": before.get("description", "")},
            {"description": doc.get("description", "")},
            user, description_change_reason,
        )
    if not doc:
        raise HTTPException(404, "Oportunidade não encontrada")
    if before and before.get("status") != doc.get("status"):
        await audit_log("status_change", "opportunity", oid,
                        {"status": before.get("status"), "estimated_value": before.get("estimated_value")},
                        {"status": doc.get("status"), "estimated_value": doc.get("estimated_value")},
                        user, payload.get("lost_reason", ""))
    return doc


@router.post("/opportunities/{oid}/convert", response_model=Proposal)
async def convert_opp(oid: str, user: dict = Depends(get_current_user)):
    opp = await db.opportunities.find_one({"id": oid}, {"_id": 0})
    if not opp:
        raise HTTPException(404, "Oportunidade não encontrada")
    if opp["status"] != "em_analise":
        raise HTTPException(400, "A oportunidade deve estar Em análise para avançar para proposta")

    prop_number = f"PROP-{datetime.now().year}-{(await db.proposals.count_documents({})) + 1:04d}"
    proposal = {
        "id": new_id(), "number": prop_number, "version": 1,
        "opportunity_id": oid, "client_id": opp["client_id"],
        "description": opp.get("description", ""), "previous_proposal_id": None,
        "lines": [],
        "valid_until": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
        "notes": opp.get("description", ""), "sent_at": None, "sent_to": "", "status_change_reason": "", "next_follow_up_date": opp.get("next_follow_up_date"), "owner_id": user["id"], "status": "em_elaboracao",
        "lost_reason": "", "converted_order_id": None,
        "total_net": 0.0, "total_vat": 0.0, "total_gross": 0.0, "total_vab": 0.0,
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.proposals.insert_one(proposal)
    await db.opportunities.update_one({"id": oid}, {"$set": {"status": "convertida", "converted_proposal_id": proposal["id"], "updated_at": now_iso()}})
    proposal.pop("_id", None)
    return proposal


@router.post("/opportunities/{oid}/attachments", response_model=Opportunity)
async def upload_opportunity_attachment(oid: str, file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    opportunity = await db.opportunities.find_one({"id": oid}, {"_id": 0})
    if not opportunity:
        raise HTTPException(404, "Oportunidade não encontrada")
    if opportunity.get("status") == "convertida" or opportunity.get("converted_proposal_id"):
        raise HTTPException(400, "Oportunidade convertida: não é possível adicionar ficheiros")
    filename = os.path.basename(file.filename or "anexo")
    extension = os.path.splitext(filename)[1].lower()
    if extension not in OPPORTUNITY_ATTACHMENT_TYPES:
        raise HTTPException(400, "Tipo de ficheiro não permitido. Use PDF, Excel, Word ou PowerPoint")
    if file.content_type and file.content_type not in OPPORTUNITY_ATTACHMENT_TYPES[extension]:
        raise HTTPException(400, "O tipo do ficheiro não corresponde à extensão permitida")
    attachment_id = new_id()
    storage_key = os.path.join("opportunities", oid, f"{attachment_id}{extension}")
    storage_path = os.path.join(OPPORTUNITY_ATTACHMENT_DIR, storage_key)
    os.makedirs(os.path.dirname(storage_path), exist_ok=True)
    size, digest = 0, hashlib.sha256()
    try:
        file.file.seek(0)
        header = file.file.read(16)
        if not _valid_proposal_attachment_signature(extension, header):
            raise HTTPException(400, "O conteúdo do ficheiro não corresponde a um documento válido")
        file.file.seek(0)
        with open(storage_path, "wb") as output:
            while chunk := file.file.read(1024 * 1024):
                size += len(chunk)
                if size > PROPOSAL_ATTACHMENT_MAX_BYTES:
                    raise HTTPException(400, "Cada ficheiro não pode ultrapassar 50 MB")
                digest.update(chunk)
                output.write(chunk)
        if size == 0:
            raise HTTPException(400, "O ficheiro está vazio")
    except HTTPException:
        if os.path.exists(storage_path): os.remove(storage_path)
        raise
    except Exception:
        if os.path.exists(storage_path): os.remove(storage_path)
        raise HTTPException(500, "Não foi possível guardar o ficheiro")
    attachment = {"id": attachment_id, "filename": filename, "content_type": file.content_type or "application/octet-stream", "size": size, "sha256": digest.hexdigest(), "storage_key": storage_key, "uploaded_at": now_iso()}
    await db.opportunities.update_one({"id": oid}, {"$push": {"attachments": attachment}, "$set": {"updated_at": now_iso()}})
    await audit_log("attachment_upload", "opportunity", oid, {}, {"attachment": attachment}, user)
    return await db.opportunities.find_one({"id": oid}, {"_id": 0})


@router.get("/opportunities/{oid}/attachments/{aid}")
async def download_opportunity_attachment(oid: str, aid: str, user: dict = Depends(get_current_user)):
    opportunity = await db.opportunities.find_one({"id": oid}, {"_id": 0, "attachments": 1})
    attachment = next((item for item in (opportunity or {}).get("attachments", []) if item.get("id") == aid), None)
    if not attachment:
        raise HTTPException(404, "Ficheiro não encontrado")
    storage_path = os.path.realpath(os.path.join(OPPORTUNITY_ATTACHMENT_DIR, attachment.get("storage_key", "")))
    upload_root = os.path.realpath(OPPORTUNITY_ATTACHMENT_DIR)
    if not storage_path.startswith(upload_root + os.sep) or not os.path.isfile(storage_path):
        raise HTTPException(404, "O ficheiro associado não está disponível")
    return FileResponse(storage_path, media_type=attachment.get("content_type") or "application/octet-stream", filename=os.path.basename(attachment.get("filename") or "anexo"))


@router.delete("/opportunities/{oid}/attachments/{aid}", response_model=Opportunity)
async def delete_opportunity_attachment(oid: str, aid: str, user: dict = Depends(get_current_user)):
    opportunity = await db.opportunities.find_one({"id": oid}, {"_id": 0})
    if not opportunity:
        raise HTTPException(404, "Oportunidade não encontrada")
    if opportunity.get("status") == "convertida" or opportunity.get("converted_proposal_id"):
        raise HTTPException(400, "Oportunidade convertida: os ficheiros estão bloqueados")
    attachment = next((item for item in opportunity.get("attachments", []) if item.get("id") == aid), None)
    if not attachment:
        raise HTTPException(404, "Ficheiro não encontrado")
    storage_path = os.path.realpath(os.path.join(OPPORTUNITY_ATTACHMENT_DIR, attachment.get("storage_key", "")))
    upload_root = os.path.realpath(OPPORTUNITY_ATTACHMENT_DIR)
    if storage_path.startswith(upload_root + os.sep) and os.path.isfile(storage_path): os.remove(storage_path)
    await db.opportunities.update_one({"id": oid}, {"$pull": {"attachments": {"id": aid}}, "$set": {"updated_at": now_iso()}})
    await audit_log("attachment_delete", "opportunity", oid, {"attachment": attachment}, {}, user)
    return await db.opportunities.find_one({"id": oid}, {"_id": 0})


# ------------- Proposals -------------
@router.get("/proposals")
async def list_proposals(page: Optional[int] = Query(None, ge=1), page_size: Optional[int] = Query(None, ge=1, le=LIST_PAGE_SIZE_MAX), search: str = "", status: str = "", sort_by: str = "created_at", sort_dir: str = "desc", user: dict = Depends(get_current_user)):
    if page is None and page_size is None and not search and not status and sort_by == "created_at" and sort_dir == "desc":
        return await db.proposals.find({}, {"_id": 0}).to_list(1000)
    page = page or 1
    page_size = page_size or 25
    query = {}
    if search.strip():
        pattern = {"$regex": _search_regex(search), "$options": "i"}
        opportunity_ids = await _related_search_ids(db.opportunities, "description", search, {"_id": 0, "id": 1})
        client_ids = await _related_search_ids(db.clients, "name", search, {"_id": 0, "id": 1})
        query["$or"] = [{field: pattern} for field in ("id", "number", "description", "status")] + [{"opportunity_id": {"$in": opportunity_ids}}, {"client_id": {"$in": client_ids}}]
    statuses = [item for item in status.split(",") if item]
    if statuses:
        query["status"] = {"$in": statuses}
    total = await db.proposals.count_documents(query)
    sort_field = sort_by if sort_by in {"created_at", "updated_at", "number", "status", "total_net", "total_vab", "next_follow_up_date"} else "created_at"
    direction = -1 if sort_dir != "asc" else 1
    items = await db.proposals.find(query, {"_id": 0}).sort(sort_field, direction).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    return _paged_response(items, page, page_size, total)


@router.get("/proposals/{pid}", response_model=Proposal)
async def get_proposal(pid: str, user: dict = Depends(get_current_user)):
    doc = await db.proposals.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Proposta não encontrada")
    return doc


@router.patch("/proposals/{pid}", response_model=Proposal)
async def update_proposal(pid: str, payload: dict, user: dict = Depends(get_current_user)):
    current = await db.proposals.find_one({"id": pid}, {"_id": 0})
    if not current:
        raise HTTPException(404, "Proposta não encontrada")
    if current.get("status") == "substituida":
        raise HTTPException(400, "Proposta substituída: os dados não podem ser alterados")
    if current.get("converted_order_id") and ("lines" in payload or "status" in payload):
        raise HTTPException(400, "Proposta convertida em encomenda: itens e estado não podem ser alterados")

    payload.pop("id", None)
    target_status = payload.get("status")
    current_status = current.get("status")
    if target_status and target_status != current_status:
        if target_status == "substituida":
            raise HTTPException(400, "Para substituir, crie uma nova proposta a partir da acao Substituir")
        if target_status in PROPOSAL_TERMINAL_STATUSES:
            if target_status == "perdida" and not str(payload.get("lost_reason") or "").strip():
                raise HTTPException(400, "Motivo de perda obrigatorio")
            if target_status == "expirada" and not str(payload.get("status_change_reason") or "").strip():
                raise HTTPException(400, "Justificacao de expiracao obrigatoria")
        elif target_status in PROPOSAL_ACTIVE_STATUS_FLOW and current_status in PROPOSAL_ACTIVE_STATUS_FLOW:
            current_index = PROPOSAL_ACTIVE_STATUS_FLOW.index(current_status)
            target_index = PROPOSAL_ACTIVE_STATUS_FLOW.index(target_status)
            if target_index > current_index + 1:
                raise HTTPException(400, "A proposta deve avancar uma etapa de cada vez")
            if target_index < current_index and not str(payload.get("status_change_reason") or "").strip():
                raise HTTPException(400, "Indique a justificacao para retroceder a proposta")
            if target_status == "enviada":
                candidate_lines = payload.get("lines", current.get("lines", []))
                has_valid_line = any(
                    (line.get("product_id") or str(line.get("description") or "").strip())
                    and float(line.get("quantity") or 0) > 0
                    for line in candidate_lines
                )
                if not has_valid_line:
                    raise HTTPException(400, "Adicione pelo menos uma linha antes de enviar a proposta")
                if not current.get("attachment"):
                    raise HTTPException(400, "Anexe o ficheiro da proposta antes de enviar")
                if not str(payload.get("sent_at") or current.get("sent_at") or "").strip():
                    raise HTTPException(400, "Indique a data de envio")
                if not str(payload.get("sent_to") or current.get("sent_to") or "").strip():
                    raise HTTPException(400, "Indique para quem a proposta foi enviada")
                if not str(payload.get("next_follow_up_date") or current.get("next_follow_up_date") or "").strip():
                    raise HTTPException(400, "Indique a data prevista de fecho")
        else:
            raise HTTPException(400, "Transicao de estado invalida para a proposta")
    payload["updated_at"] = now_iso()
    if payload.get("status") == "ganha" and current.get("status") != "em_negociacao":
        raise HTTPException(400, "A proposta deve estar Em negociação para ser marcada como ganha")
    if payload.get("status") == "perdida" and not payload.get("lost_reason"):
        raise HTTPException(400, "Motivo de perda obrigatório")
    before = current
    if "lines" in payload:
        lines_models = [ProposalLine(**ln) for ln in payload["lines"]]
        net, vat, gross, vab = compute_proposal_totals(lines_models)
        payload["total_net"] = net
        payload["total_vat"] = vat
        payload["total_gross"] = gross
        payload["total_vab"] = vab
    await db.proposals.update_one({"id": pid}, {"$set": payload})
    doc = await db.proposals.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Proposta não encontrada")
    if before and (before.get("status") != doc.get("status") or before.get("total_net") != doc.get("total_net")):
        await audit_log("update", "proposal", pid,
                        {"status": before.get("status"), "total_net": before.get("total_net"), "total_vab": before.get("total_vab")},
                        {"status": doc.get("status"), "total_net": doc.get("total_net"), "total_vab": doc.get("total_vab")},
                        user, payload.get("lost_reason", ""))
    # Event hook: proposta transitou para ganha
    if before and before.get("status") != "ganha" and doc.get("status") == "ganha":
        try:
            c = await db.clients.find_one({"id": doc["client_id"]}, {"_id": 0})
            client_name = c["name"] if c else "—"
            asyncio.create_task(notify_proposal_won(doc, client_name))
        except Exception as e:
            logger.error(f"[hook] proposal_won falhou: {e}")
    return doc


@router.post("/proposals/{pid}/convert", response_model=Order)
async def convert_proposal(pid: str, user: dict = Depends(get_current_user)):
    proposal = await db.proposals.find_one({"id": pid}, {"_id": 0})
    if not proposal:
        raise HTTPException(404, "Proposta não encontrada")
    if proposal["status"] != "ganha":
        raise HTTPException(400, "Proposta deve estar Ganha para gerar encomenda")
    if proposal.get("converted_order_id"):
        raise HTTPException(400, "Proposta já convertida")

    order_number = f"ENC-{datetime.now().year}-{(await db.orders.count_documents({})) + 1:04d}"
    order = {
        "id": new_id(), "number": order_number, "po_number": "",
        "proposal_id": pid, "opportunity_id": proposal["opportunity_id"],
        "client_id": proposal["client_id"], "order_date": now_iso(),
        "total_net": proposal["total_net"], "total_vat": proposal["total_vat"],
        "total_gross": proposal["total_gross"], "total_vab": proposal["total_vab"],
        "commercial_terms": "", "owner_id": user["id"],
        "status": "aberta", "cancel_reason": "", "status_change_reason": "", "created_at": now_iso(),
    }
    await db.orders.insert_one(order)
    await db.proposals.update_one({"id": pid}, {"$set": {"converted_order_id": order["id"], "updated_at": now_iso()}})
    order.pop("_id", None)
    return order


@router.post("/proposals/{pid}/reopen", response_model=Proposal)
async def reopen_proposal(pid: str, user: dict = Depends(require_roles("admin"))):
    proposal = await db.proposals.find_one({"id": pid}, {"_id": 0})
    if not proposal:
        raise HTTPException(404, "Proposta não encontrada")
    order_id = proposal.get("converted_order_id")
    if not order_id:
        raise HTTPException(400, "Proposta ainda não foi convertida em encomenda")

    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order or order.get("status") != "cancelada":
        raise HTTPException(400, "Anule primeiro a encomenda associada")
    active_invoice = await db.invoices.find_one({"order_id": order_id, "status": {"$ne": "anulada"}}, {"_id": 0, "id": 1})
    active_payment = await db.payments.find_one({"order_id": order_id, "status": {"$ne": "anulado"}}, {"_id": 0, "id": 1})
    if active_invoice or active_payment:
        raise HTTPException(400, "Anule primeiro todas as faturas e recebimentos da encomenda")

    await db.proposals.update_one({"id": pid}, {"$set": {"status": "em_elaboracao", "converted_order_id": None, "updated_at": now_iso()}})
    await audit_log("reopen", "proposal", pid, {"status": proposal.get("status"), "converted_order_id": order_id}, {"status": "em_elaboracao", "converted_order_id": None}, user, "Reabertura após anulação da encomenda")
    proposal["status"] = "em_elaboracao"
    proposal["converted_order_id"] = None
    return proposal


@router.post("/opportunities/{oid}/proposals", response_model=Proposal)
async def create_new_proposal_from_opportunity(oid: str, payload: NewProposalFromOpportunity, user: dict = Depends(get_current_user)):
    """Create a new proposal revision without duplicating the opportunity."""
    opportunity = await db.opportunities.find_one({"id": oid}, {"_id": 0})
    if not opportunity:
        raise HTTPException(404, "Oportunidade nÃ£o encontrada")
    previous_id = opportunity.get("converted_proposal_id")
    previous = await db.proposals.find_one({"id": previous_id}, {"_id": 0}) if previous_id else None
    if previous and previous.get("converted_order_id"):
        raise HTTPException(400, "A proposta anterior jÃ¡ estÃ¡ associada a uma encomenda")

    next_version = int(previous.get("version") or 1) + 1 if previous else 1
    prop_number = f"PROP-{datetime.now().year}-{(await db.proposals.count_documents({})) + 1:04d}"
    proposal = {
        "id": new_id(), "number": prop_number, "version": next_version,
        "opportunity_id": oid, "client_id": opportunity["client_id"],
        "description": opportunity.get("description", ""), "previous_proposal_id": previous_id, "replacement_reason": "",
        "lines": [], "valid_until": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
        "notes": opportunity.get("description", ""), "sent_at": None, "sent_to": "", "status_change_reason": "", "next_follow_up_date": None, "owner_id": user["id"], "status": "em_elaboracao",
        "lost_reason": "", "converted_order_id": None, "total_net": 0.0, "total_vat": 0.0,
        "total_gross": 0.0, "total_vab": 0.0, "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.proposals.insert_one(proposal)
    if previous:
        await db.proposals.update_one({"id": previous["id"]}, {"$set": {"status": "substituida", "replacement_reason": payload.replacement_reason.strip(), "replacement_proposal_id": proposal["id"], "updated_at": now_iso()}})
        await audit_log("status_change", "proposal", previous["id"], {"status": previous.get("status")}, {"status": "substituida", "replacement_reason": payload.replacement_reason.strip(), "replacement_proposal_id": proposal["id"]}, user, "SubstituÃ­da por nova proposta")
    await db.opportunities.update_one({"id": oid}, {"$set": {"status": "convertida", "converted_proposal_id": proposal["id"], "updated_at": now_iso()}})
    await audit_log("create", "proposal", proposal["id"], {}, {"number": prop_number, "opportunity_id": oid, "previous_proposal_id": previous_id}, user, "Nova proposta criada a partir da oportunidade")
    proposal.pop("_id", None)
    return proposal


# ------------- Orders (basic CRUD, financial ops live in finance.py) -------------
@router.get("/orders")
async def list_orders(page: Optional[int] = Query(None, ge=1), page_size: Optional[int] = Query(None, ge=1, le=LIST_PAGE_SIZE_MAX), search: str = "", status: str = "", sort_by: str = "order_date", sort_dir: str = "desc", user: dict = Depends(get_current_user)):
    if page is None and page_size is None and not search and not status and sort_by == "order_date" and sort_dir == "desc":
        return await db.orders.find({}, {"_id": 0}).to_list(1000)
    page = page or 1
    page_size = page_size or 25
    query = {}
    if search.strip():
        pattern = {"$regex": _search_regex(search), "$options": "i"}
        client_ids = await _related_search_ids(db.clients, "name", search, {"_id": 0, "id": 1})
        query["$or"] = [{field: pattern} for field in ("id", "number", "po_number", "status")] + [{"client_id": {"$in": client_ids}}]
    statuses = [item for item in status.split(",") if item]
    if statuses:
        query["status"] = {"$in": statuses}
    total = await db.orders.count_documents(query)
    sort_field = sort_by if sort_by in {"order_date", "created_at", "number", "status", "total_net", "total_vab"} else "order_date"
    direction = -1 if sort_dir != "asc" else 1
    items = await db.orders.find(query, {"_id": 0}).sort(sort_field, direction).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    return _paged_response(items, page, page_size, total)


@router.patch("/orders/{oid}", response_model=Order)
async def update_order(oid: str, payload: dict, user: dict = Depends(get_current_user)):
    current = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not current:
        raise HTTPException(404, "Encomenda nao encontrada")
    if current.get("status") == "cancelada":
        raise HTTPException(400, "Encomenda anulada: não pode ser alterada")
    payload.pop("id", None)
    target_status = payload.get("status")
    current_status = current.get("status")
    if target_status and target_status != current_status and target_status in ORDER_BOARD_STATUS_FLOW and current_status in ORDER_BOARD_STATUS_FLOW:
        if target_status == "aberta" and current_status == "em_planeamento" and not str(payload.get("status_change_reason") or "").strip():
            raise HTTPException(400, "Indique a justificacao para retroceder a encomenda")
    if payload.get("status") == "cancelada" and not payload.get("cancel_reason"):
        raise HTTPException(400, "Motivo de cancelamento obrigatório")
    if payload.get("status") == "cancelada":
        if user.get("role") != "admin":
            raise HTTPException(403, "A anulação da encomenda requer um admin")
        active_invoice = await db.invoices.find_one({"order_id": oid, "status": {"$ne": "anulada"}}, {"_id": 0, "id": 1})
        active_payment = await db.payments.find_one({"order_id": oid, "status": {"$ne": "anulado"}}, {"_id": 0, "id": 1})
        if active_invoice or active_payment:
            raise HTTPException(400, "Anule primeiro todas as faturas e recebimentos da encomenda")
    await db.orders.update_one({"id": oid}, {"$set": payload})
    doc = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Encomenda não encontrada")
    if payload.get("status") == "cancelada":
        await audit_log("cancel", "order", oid, {"status": current.get("status")}, {"status": "cancelada"}, user, payload.get("cancel_reason", ""))
    elif target_status and target_status != current_status:
        await audit_log("status_change", "order", oid, {"status": current_status}, {"status": target_status}, user, payload.get("status_change_reason", ""))
    return doc


@router.post("/proposals/{pid}/attachment", response_model=Proposal)
async def upload_proposal_attachment(pid: str, file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    proposal = await db.proposals.find_one({"id": pid}, {"_id": 0})
    if not proposal:
        raise HTTPException(404, "Proposta não encontrada")
    if proposal.get("status") == "substituida":
        raise HTTPException(400, "Proposta substituída: o anexo não pode ser alterado")
    if proposal.get("converted_order_id") and not ALLOW_PROPOSAL_ATTACHMENT_AFTER_ORDER:
        raise HTTPException(400, "Proposta convertida em encomenda: o anexo não pode ser alterado")
    filename = os.path.basename(file.filename or "anexo")
    extension = os.path.splitext(filename)[1].lower()
    if extension not in ALLOWED_PROPOSAL_ATTACHMENT_TYPES:
        raise HTTPException(400, "Tipo de ficheiro não permitido. Use PDF, Word ou PowerPoint")
    if file.content_type and file.content_type not in ALLOWED_PROPOSAL_ATTACHMENT_TYPES[extension]:
        raise HTTPException(400, "O tipo do ficheiro não corresponde à extensão permitida")
    os.makedirs(PROPOSAL_ATTACHMENT_DIR, exist_ok=True)
    storage_key = os.path.join("proposals", pid, f"{new_id()}{extension}")
    storage_path = os.path.join(PROPOSAL_ATTACHMENT_DIR, storage_key)
    os.makedirs(os.path.dirname(storage_path), exist_ok=True)
    file_size = 0
    digest = hashlib.sha256()
    try:
        file.file.seek(0)
        header = file.file.read(16)
        if not _valid_proposal_attachment_signature(extension, header):
            raise HTTPException(400, "O conteúdo do ficheiro não corresponde a um documento válido")
        file.file.seek(0)
        with open(storage_path, "wb") as output:
            while chunk := file.file.read(1024 * 1024):
                file_size += len(chunk)
                if file_size > PROPOSAL_ATTACHMENT_MAX_BYTES:
                    raise HTTPException(400, "O ficheiro não pode ultrapassar 50 MB")
                digest.update(chunk)
                output.write(chunk)
        if file_size == 0:
            raise HTTPException(400, "O ficheiro está vazio")
    except HTTPException:
        if os.path.exists(storage_path):
            os.remove(storage_path)
        raise
    except Exception:
        if os.path.exists(storage_path):
            os.remove(storage_path)
        raise HTTPException(500, "Não foi possível guardar o ficheiro")
    attachment = {
        "filename": filename,
        "content_type": file.content_type or "application/octet-stream",
        "size": file_size,
        "sha256": digest.hexdigest(),
        "storage_key": storage_key,
        "uploaded_at": now_iso(),
    }
    old_storage_key = (proposal.get("attachment") or {}).get("storage_key")
    await db.proposals.update_one(
        {"id": pid},
        {"$set": {"attachment": attachment, "updated_at": now_iso()}, "$unset": {"_attachment_content": ""}},
    )
    if old_storage_key:
        old_path = os.path.realpath(os.path.join(PROPOSAL_ATTACHMENT_DIR, old_storage_key))
        upload_root = os.path.realpath(PROPOSAL_ATTACHMENT_DIR)
        if old_path.startswith(upload_root + os.sep) and os.path.exists(old_path):
            os.remove(old_path)
    await audit_log("attachment_upload", "proposal", pid, {"attachment": proposal.get("attachment")}, {"attachment": attachment}, user)
    doc = await db.proposals.find_one({"id": pid}, {"_id": 0, "_attachment_content": 0})
    return doc


@router.get("/proposals/{pid}/attachment")
async def download_proposal_attachment(pid: str, user: dict = Depends(get_current_user)):
    proposal = await db.proposals.find_one({"id": pid}, {"_id": 0})
    if not proposal or not proposal.get("attachment"):
        raise HTTPException(404, "A proposta não tem ficheiro associado")
    filename = os.path.basename(proposal["attachment"].get("filename") or "anexo")
    storage_key = proposal["attachment"].get("storage_key")
    if storage_key:
        storage_path = os.path.realpath(os.path.join(PROPOSAL_ATTACHMENT_DIR, storage_key))
        upload_root = os.path.realpath(PROPOSAL_ATTACHMENT_DIR)
        if not storage_path.startswith(upload_root + os.sep) or not os.path.isfile(storage_path):
            raise HTTPException(404, "O ficheiro associado não está disponível")
        return FileResponse(storage_path, media_type=proposal["attachment"].get("content_type") or "application/octet-stream", filename=filename)
    if not proposal.get("_attachment_content"):
        raise HTTPException(404, "O ficheiro associado não está disponível")
    try:
        content = base64.b64decode(proposal["_attachment_content"])
    except (ValueError, TypeError):
        raise HTTPException(500, "O ficheiro associado está inválido")
    return Response(content=content, media_type=proposal["attachment"].get("content_type") or "application/octet-stream", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.delete("/proposals/{pid}/attachment", response_model=Proposal)
async def delete_proposal_attachment(pid: str, user: dict = Depends(get_current_user)):
    proposal = await db.proposals.find_one({"id": pid}, {"_id": 0})
    if not proposal:
        raise HTTPException(404, "Proposta não encontrada")
    if proposal.get("status") == "substituida":
        raise HTTPException(400, "Proposta substituída: o anexo não pode ser alterado")
    if proposal.get("converted_order_id") and not ALLOW_PROPOSAL_ATTACHMENT_AFTER_ORDER:
        raise HTTPException(400, "Proposta convertida em encomenda: o anexo não pode ser alterado")
    storage_key = (proposal.get("attachment") or {}).get("storage_key")
    if storage_key:
        storage_path = os.path.realpath(os.path.join(PROPOSAL_ATTACHMENT_DIR, storage_key))
        upload_root = os.path.realpath(PROPOSAL_ATTACHMENT_DIR)
        if storage_path.startswith(upload_root + os.sep) and os.path.isfile(storage_path):
            os.remove(storage_path)
    await db.proposals.update_one({"id": pid}, {"$unset": {"attachment": "", "_attachment_content": ""}, "$set": {"updated_at": now_iso()}})
    await audit_log("attachment_delete", "proposal", pid, {"attachment": proposal.get("attachment")}, {}, user)
    doc = await db.proposals.find_one({"id": pid}, {"_id": 0})
    return doc


# ------------- Trabalho comercial: O meu dia + Kanban -------------
WORKDAY_PROPOSAL_STATUSES = {"em_elaboracao", "enviada", "em_negociacao"}
WORKDAY_OPPORTUNITY_STATUSES = {"aberta", "em_analise"}
WORKDAY_ORDER_STATUSES = {"aberta", "em_planeamento", "em_faturacao", "parcialmente_faturada"}


def _work_scope(user: dict, owner_id: Optional[str]) -> dict:
    """Comerciais veem apenas a sua carteira; admins/CEO podem filtrar a equipa."""
    if user.get("role") in {"admin", "ceo"} and owner_id:
        return {"owner_id": owner_id}
    if user.get("role") in {"admin", "ceo"}:
        return {}
    return {"owner_id": user["id"]}


def _work_date(value: object) -> str:
    return str(value or "")[:10]


@router.get("/workday")
async def workday(owner_id: Optional[str] = Query(None), user: dict = Depends(get_current_user)):
    """Fila diária de trabalho, construída a partir dos prazos comerciais existentes."""
    today = datetime.now(timezone.utc).date()
    today_key = today.isoformat()
    next_week_key = (today + timedelta(days=7)).isoformat()
    scope = _work_scope(user, owner_id)

    proposal_query = {**scope, "status": {"$in": list(WORKDAY_PROPOSAL_STATUSES)}, "next_follow_up_date": {"$exists": True, "$ne": None}}
    opportunity_query = {**scope, "status": {"$in": list(WORKDAY_OPPORTUNITY_STATUSES)}, "expected_close_date": {"$exists": True, "$ne": None}}
    proposals, opportunities = await asyncio.gather(
        db.proposals.find(proposal_query, {"_id": 0}).to_list(500),
        db.opportunities.find(opportunity_query, {"_id": 0}).to_list(500),
    )
    client_ids = {item.get("client_id") for item in proposals + opportunities if item.get("client_id")}
    owner_ids = {item.get("owner_id") for item in proposals + opportunities if item.get("owner_id")}
    clients, owners = await asyncio.gather(
        db.clients.find({"id": {"$in": list(client_ids)}}, {"_id": 0, "id": 1, "name": 1}).to_list(len(client_ids) or 1),
        db.users.find({"id": {"$in": list(owner_ids)}}, {"_id": 0, "id": 1, "name": 1}).to_list(len(owner_ids) or 1),
    )
    client_names = {item["id"]: item.get("name", "-") for item in clients}
    owner_names = {item["id"]: item.get("name", "-") for item in owners}

    items = []
    for proposal in proposals:
        due_date = _work_date(proposal.get("next_follow_up_date"))
        if not due_date:
            continue
        items.append({
            "id": proposal["id"], "kind": "proposal", "kind_label": "Proposta",
            "title": proposal.get("number") or "Proposta", "description": proposal.get("description") or "",
            "client": client_names.get(proposal.get("client_id"), "-"), "owner": owner_names.get(proposal.get("owner_id"), "-"),
            "status": proposal.get("status"), "due_date": due_date, "href": f"/propostas/{proposal['id']}",
            "value": proposal.get("total_net", 0),
        })
    for opportunity in opportunities:
        due_date = _work_date(opportunity.get("expected_close_date"))
        if not due_date:
            continue
        items.append({
            "id": opportunity["id"], "kind": "opportunity", "kind_label": "Negociação",
            "title": opportunity.get("description") or "Oportunidade", "description": "",
            "client": client_names.get(opportunity.get("client_id"), "-"), "owner": owner_names.get(opportunity.get("owner_id"), "-"),
            "status": opportunity.get("status"), "due_date": due_date, "href": f"/oportunidades/{opportunity['id']}",
            "value": opportunity.get("estimated_value", 0),
        })

    overdue = sorted((item for item in items if item["due_date"] < today_key), key=lambda item: item["due_date"])
    due_today = sorted((item for item in items if item["due_date"] == today_key), key=lambda item: item["kind"])
    upcoming = sorted((item for item in items if today_key < item["due_date"] <= next_week_key), key=lambda item: item["due_date"])
    return {
        "date": today_key,
        "scope": "team" if not scope else "owner",
        "summary": {"overdue": len(overdue), "today": len(due_today), "upcoming": len(upcoming)},
        "sections": [
            {"key": "overdue", "label": "Em atraso", "items": overdue},
            {"key": "today", "label": "Para hoje", "items": due_today},
            {"key": "upcoming", "label": "Próximos 7 dias", "items": upcoming},
        ],
    }


@router.get("/workboard")
async def workboard(owner_id: Optional[str] = Query(None), user: dict = Depends(get_current_user)):
    """Vista operacional do funil. É apenas de leitura nesta primeira versão."""
    scope = _work_scope(user, owner_id)
    # O quadro mostra todos os momentos relevantes de cada entidade. Estados
    # "convertida" não aparecem porque são representados pelo registo criado
    # na etapa seguinte, evitando duplicação visual.
    leads_query = {**scope, "status": {"$in": ["nova", "em_qualificacao"]}}
    opportunities_query = {**scope, "status": {"$in": ["aberta", "em_analise"]}}
    proposals_query = {
        **scope,
        "$or": [
            {"status": {"$in": ["em_elaboracao", "enviada", "em_negociacao"]}},
            {"status": "ganha", "$or": [{"converted_order_id": None}, {"converted_order_id": {"$exists": False}}]},
        ],
    }
    # Após a primeira fatura, a encomenda sai do quadro comercial e passa
    # para acompanhamento de gestão/financeiro.
    orders_query = {**scope, "status": {"$in": ["aberta", "em_planeamento"]}}
    leads, opportunities, proposals, orders = await asyncio.gather(
        db.leads.find(leads_query, {"_id": 0}).sort("updated_at", -1).to_list(100),
        db.opportunities.find(opportunities_query, {"_id": 0}).sort("updated_at", -1).to_list(100),
        db.proposals.find(proposals_query, {"_id": 0}).sort("next_follow_up_date", 1).to_list(100),
        db.orders.find(orders_query, {"_id": 0}).sort("created_at", -1).to_list(100),
    )
    all_records = leads + opportunities + proposals + orders
    client_ids = {item.get("client_id") for item in all_records if item.get("client_id")}
    clients = await db.clients.find({"id": {"$in": list(client_ids)}}, {"_id": 0, "id": 1, "name": 1}).to_list(len(client_ids) or 1)
    client_names = {item["id"]: item.get("name", "-") for item in clients}

    def card(item: dict, kind: str, href: str, title: str, due_date: object = None) -> dict:
        has_valid_proposal_line = any(
            (line.get("product_id") or str(line.get("description") or "").strip())
            and float(line.get("quantity") or 0) > 0
            for line in item.get("lines", [])
        ) if kind == "proposal" else False
        return {
            "id": item["id"], "kind": kind, "title": title, "description": item.get("description") or "",
            "client": client_names.get(item.get("client_id"), item.get("client_name_raw") or "-"),
            "status": item.get("status"), "value": item.get("total_net", item.get("estimated_value", 0)),
            "due_date": _work_date(due_date), "href": href,
            "opportunity_id": item.get("opportunity_id"), "has_attachment": bool(item.get("attachment")),
            "has_valid_lines": has_valid_proposal_line,
        }

    columns = [
        {"key": "leads", "label": "Leads", "items": [card(item, "lead", f"/leads/{item['id']}", item.get("description") or item.get("id", "Lead")) for item in leads]},
        {"key": "opportunities", "label": "Oportunidades", "items": [card(item, "opportunity", f"/oportunidades/{item['id']}", item.get("description") or "Oportunidade", item.get("expected_close_date")) for item in opportunities]},
        {"key": "proposals", "label": "Propostas", "items": [card(item, "proposal", f"/propostas/{item['id']}", item.get("number") or "Proposta", item.get("next_follow_up_date")) for item in proposals]},
        {"key": "orders", "label": "Encomendas", "items": [card(item, "order", f"/encomendas/{item['id']}", item.get("number") or "Encomenda") for item in orders]},
    ]
    for column in columns:
        column["count"] = len(column["items"])
        column["value"] = round(sum(float(item.get("value") or 0) for item in column["items"]), 2)
    return {"columns": columns}


# ------------- Dashboard: KPIs + Funnel -------------
FUNNEL_EXCLUDED_STATUSES = {
    "leads": {"descartada"},
    "opportunities": {"perdida"},
    "proposals": {"perdida", "expirada", "substituida"},
    "orders": {"cancelada", "anulada"},
}


@router.get("/dashboard/kpis")
async def kpis(year: int = Query(datetime.now().year, ge=2000, le=2100), user: dict = Depends(get_current_user)):
    leads = [item for item in await db.leads.find({}, {"_id": 0}).to_list(5000) if record_year(item, ("created_at",)) == year]
    opps = [item for item in await db.opportunities.find({}, {"_id": 0}).to_list(5000) if record_year(item, ("created_at",)) == year]
    props = [item for item in await db.proposals.find({}, {"_id": 0}).to_list(5000) if record_year(item, ("updated_at", "created_at")) == year]
    active_orders = await db.orders.find(
        {"status": {"$nin": ["cancelada", "anulada"]}},
        {"_id": 0},
    ).to_list(5000)
    active_order_ids = {item.get("id") for item in active_orders}
    orders = [item for item in active_orders if record_year(item, ("order_date", "created_at")) == year]
    invoices = await db.invoices.find(
        {"issued_at": {"$regex": f"^{year}-"}, "status": {"$ne": "anulada"}, "order_id": {"$in": list(active_order_ids)}},
        {"_id": 0},
    ).to_list(5000)

    leads_open = [ln for ln in leads if ln["status"] in ("nova", "em_qualificacao")]
    opps_open = [o for o in opps if o["status"] in ("aberta", "em_analise")]
    props_sent = [p for p in props if p["status"] in ("enviada", "em_negociacao")]
    props_won = [p for p in props if p["status"] == "ganha"]
    props_lost = [p for p in props if p["status"] == "perdida"]

    total_props_closed = len(props_won) + len(props_lost)
    conv_rate = round((len(props_won) / total_props_closed) * 100, 1) if total_props_closed else 0.0

    won_value = sum(p.get("total_net", 0) for p in props_won)
    props_sent_value = sum(p.get("total_net", 0) for p in props_sent)
    won_vab = sum(p.get("total_vab", 0) for p in props_won)
    billed_net = sum(float(invoice.get("total_net") or 0) for invoice in invoices)
    billed_gross = sum(float(invoice.get("total_gross") or invoice.get("total_net") or 0) for invoice in invoices)
    billed_vab = 0.0
    billed_vab_by_month = {}
    billing_items_by_month = {}
    orders_by_id = {order.get("id"): order for order in active_orders}
    clients_by_id = {client.get("id"): client.get("name", "") for client in await db.clients.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(2000)}
    for invoice in invoices:
        order = orders_by_id.get(invoice.get("order_id"), {})
        invoice_lines = invoice.get("lines") or []
        if invoice_lines:
            billed_amount = sum(float(line.get("amount") or 0) for line in invoice_lines)
        else:
            billed_amount = float(invoice.get("total_net") or 0)
        # A fatura pode ocorrer num ano diferente da encomenda. O VAB é
        # alocado proporcionalmente ao valor sem IVA efetivamente faturado.
        invoice_vab = sum(invoice_line_vab(line, order) for line in invoice_lines) if invoice_lines else invoice_line_vab({"amount": billed_amount}, order)
        billed_vab += invoice_vab
        invoice_month = str(invoice.get("issued_at", ""))[:7]
        billed_vab_by_month[invoice_month] = billed_vab_by_month.get(invoice_month, 0.0) + invoice_vab
        month_items = billing_items_by_month.setdefault(invoice_month, [])
        source_lines = invoice_lines or [{"amount": invoice.get("total_net") or 0, "description": "Fatura"}]
        for line in source_lines:
            line_amount = float(line.get("amount") or 0)
            line_vab = invoice_line_vab(line, order, line_amount)
            month_items.append({
                "invoice": invoice.get("number", ""),
                "order": order.get("number", ""),
                "client": clients_by_id.get(invoice.get("client_id") or order.get("client_id"), ""),
                "item": line.get("description") or "Fatura",
                "amount": round(line_amount, 2),
                "vab": round(line_vab, 2),
            })
    weighted_pipeline = sum(o.get("estimated_value", 0) * (o.get("probability", 0) / 100) for o in opps_open)
    billing_monthly = []
    for month in range(1, 13):
        prefix = f"{year}-{month:02d}"
        month_invoices = [invoice for invoice in invoices if str(invoice.get("issued_at", "")).startswith(prefix)]
        billing_monthly.append({
            "month": prefix,
            "total_net": round(sum(float(invoice.get("total_net") or 0) for invoice in month_invoices), 2),
            "total_gross": round(sum(float(invoice.get("total_gross") or invoice.get("total_net") or 0) for invoice in month_invoices), 2),
            "billed_vab": round(billed_vab_by_month.get(prefix, 0.0), 2),
            "items": billing_items_by_month.get(prefix, []),
            "count": len(month_invoices),
        })

    return {
        "leads_open": len(leads_open),
        "leads_open_value": sum(ln.get("estimated_value", 0) for ln in leads_open),
        "opps_open": len(opps_open),
        "opps_weighted_value": round(weighted_pipeline, 2),
        "props_sent": len(props_sent),
        "props_sent_value": round(props_sent_value, 2),
        "props_won": len(props_won),
        "props_lost": len(props_lost),
        "conversion_rate": conv_rate,
        "won_value": round(won_value, 2),
        "won_vab": round(won_vab, 2),
        "orders_count": len(orders),
        "orders_value": round(sum(o.get("total_net", 0) for o in orders), 2),
        "orders_vab": round(sum(o.get("total_vab", 0) for o in orders), 2),
        "billed_net": round(billed_net, 2),
        "billed_gross": round(billed_gross, 2),
        "billed_vab": round(billed_vab, 2),
        "billed_invoice_count": len(invoices),
        "year": year,
        "billing_monthly": billing_monthly,
    }


@router.get("/dashboard/funnel")
async def funnel(
    manufacturer_id: Optional[str] = Query(None),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    user: dict = Depends(get_current_user),
):
    leads = await db.leads.find({}, {"_id": 0}).to_list(5000)
    opps = await db.opportunities.find({}, {"_id": 0}).to_list(5000)
    props = await db.proposals.find({}, {"_id": 0}).to_list(5000)
    orders = await db.orders.find({}, {"_id": 0}).to_list(5000)

    # O funil representa apenas o pipeline comercial ativo; os registos
    # encerrados sem conversão/anulados não entram nas contagens nem nos totais.
    leads = [item for item in leads if item.get("status") not in FUNNEL_EXCLUDED_STATUSES["leads"]]
    opps = [item for item in opps if item.get("status") not in FUNNEL_EXCLUDED_STATUSES["opportunities"]]
    props = [item for item in props if item.get("status") not in FUNNEL_EXCLUDED_STATUSES["proposals"]]
    orders = [item for item in orders if item.get("status") not in FUNNEL_EXCLUDED_STATUSES["orders"]]

    available_years = sorted({
        value
        for records, fields in (
            (leads, ("created_at",)),
            (opps, ("created_at",)),
            (props, ("updated_at", "created_at")),
            (orders, ("order_date", "created_at")),
        )
        for item in records
        for value in [record_year(item, fields)]
        if value is not None
    })

    if year is not None:
        leads = [item for item in leads if record_year(item, ("created_at",)) == year]
        opps = [item for item in opps if record_year(item, ("created_at",)) == year]
        props = [item for item in props if record_year(item, ("updated_at", "created_at")) == year]
        orders = [item for item in orders if record_year(item, ("order_date", "created_at")) == year]

    if manufacturer_id:
        products = {p["id"]: p for p in await db.products.find({}, {"_id": 0}).to_list(5000)}

        def lead_matches(item):
            if item.get("manufacturer_id") == manufacturer_id:
                return True
            for pid in item.get("product_ids", []) or []:
                if products.get(pid, {}).get("manufacturer_id") == manufacturer_id:
                    return True
            return False

        leads = [ln for ln in leads if lead_matches(ln)]
        opps = [o for o in opps if lead_matches(o)]

        def prop_matches(p):
            for ln in p.get("lines", []) or []:
                pid = ln.get("product_id")
                if pid and products.get(pid, {}).get("manufacturer_id") == manufacturer_id:
                    return True
            return False

        matching_prop_ids = {p["id"] for p in props if prop_matches(p)}
        props = [p for p in props if p["id"] in matching_prop_ids]
        orders = [o for o in orders if o.get("proposal_id") in matching_prop_ids]

    clients = {item["id"]: item.get("name", "") for item in await db.clients.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(5000)}
    opportunity_descriptions = {item.get("id"): item.get("description", "") for item in opps}
    proposal_by_id = {item.get("id"): item for item in props}
    stage_items = {
        "leads": [{"id": item.get("id"), "title": item.get("id", "-"), "client": clients.get(item.get("client_id")) or item.get("client_name_raw") or "-", "description": item.get("description", ""), "value": item.get("estimated_value", 0), "vab": 0, "status": item.get("status"), "date": item.get("created_at")} for item in leads],
        "opportunities": [{"id": item.get("id"), "title": item.get("id", "-"), "client": clients.get(item.get("client_id"), "-"), "description": item.get("description", ""), "value": item.get("estimated_value", 0), "vab": item.get("estimated_vab", 0), "status": item.get("status"), "date": item.get("created_at")} for item in opps],
        "proposals": [{"id": item.get("id"), "title": item.get("number", "-"), "client": clients.get(item.get("client_id"), "-"), "description": item.get("description") or opportunity_descriptions.get(item.get("opportunity_id"), ""), "value": item.get("total_net", 0), "vab": item.get("total_vab", 0), "status": item.get("status"), "date": item.get("created_at"), "follow_up_date": item.get("next_follow_up_date")} for item in props],
        "orders": [{"id": item.get("id"), "title": item.get("number", "-"), "client": clients.get(item.get("client_id"), "-"), "description": (proposal_by_id.get(item.get("proposal_id"), {}).get("description") or opportunity_descriptions.get(proposal_by_id.get(item.get("proposal_id"), {}).get("opportunity_id"), "")), "value": item.get("total_net", 0), "vab": item.get("total_vab", 0), "status": item.get("status"), "date": item.get("order_date") or item.get("created_at")} for item in orders],
    }

    stages = [
        {"key": "leads", "label": "Leads", "count": len(leads),
         "value": sum(ln.get("estimated_value", 0) for ln in leads), "vab": 0.0, "items": stage_items["leads"]},
        {"key": "opportunities", "label": "Oportunidades", "count": len(opps),
         "value": sum(o.get("estimated_value", 0) for o in opps),
         "vab": sum(o.get("estimated_vab", 0) for o in opps), "items": stage_items["opportunities"]},
        {"key": "proposals", "label": "Propostas", "count": len(props),
         "value": sum(p.get("total_net", 0) for p in props),
         "vab": sum(p.get("total_vab", 0) for p in props), "items": stage_items["proposals"]},
        {"key": "orders", "label": "Encomendas", "count": len(orders),
         "value": sum(o.get("total_net", 0) for o in orders),
         "vab": sum(o.get("total_vab", 0) for o in orders), "items": stage_items["orders"]},
    ]
    for i, s in enumerate(stages):
        if i == 0:
            s["conversion_pct"] = 100.0
        else:
            prev = stages[i - 1]["count"]
            s["conversion_pct"] = round((s["count"] / prev) * 100, 1) if prev else 0.0
    return {"stages": stages, "available_years": available_years}
