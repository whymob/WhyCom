"""Authenticated, read-only suggestions with shared cache and rolling quotas."""
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError
from starlette.concurrency import run_in_threadpool

from client_enrichment import DiscoveryError, discover, lookup_nif, organize_local, valid_nif, website_origin
from deps import db, get_current_user

router = APIRouter()


class EnrichmentRequest(BaseModel):
    email: str = Field(default="", max_length=254)
    website: str = Field(default="", max_length=500)
    nif: str = Field(default="", max_length=32)


async def reserve_quota(key, limits):
    """Atomic MongoDB reservation, shared across backend replicas and restarts."""
    now = datetime.now(timezone.utc)
    collection = db.client_enrichment_quotas
    try:
        await collection.update_one({"_id": key}, {"$setOnInsert": {"events": []}}, upsert=True)
    except DuplicateKeyError:
        pass  # Another replica initialized the same quota concurrently.
    checks = []
    for seconds, count in limits:
        checks.append({"$lt": [{"$size": {"$filter": {"input": "$events", "as": "event", "cond": {"$gte": ["$$event", now - timedelta(seconds=seconds)]}}}}, count]})
    cutoff = now - timedelta(seconds=max(seconds for seconds, _ in limits))
    result = await collection.update_one(
        {"_id": key, "$expr": {"$and": checks}},
        [{"$set": {"expires_at": now + timedelta(seconds=max(seconds for seconds, _ in limits)), "events": {"$concatArrays": [{"$filter": {"input": "$events", "as": "event", "cond": {"$gte": ["$$event", cutoff]}}}, [now]]}}}],
    )
    return result.modified_count == 1


async def cached(key):
    row = await db.client_enrichment_cache.find_one({"_id": key, "expires_at": {"$gt": datetime.now(timezone.utc)}})
    return row.get("result") if row else None


async def save_cache(key, result):
    await db.client_enrichment_cache.update_one({"_id": key}, {"$set": {"result": result, "expires_at": datetime.now(timezone.utc) + timedelta(hours=24)}}, upsert=True)


@router.post("/clients/enrich")
async def enrich_client(payload: EnrichmentRequest, user: dict = Depends(get_current_user)):
    if not await reserve_quota("user:" + user["id"], [(60, 10)]):
        raise HTTPException(429, "Aguarde um minuto antes de fazer novas pesquisas.")
    nif = valid_nif(payload.nif)
    if payload.nif.strip() and not nif:
        raise HTTPException(422, "O NIF indicado não é válido.")
    result = {"suggestions": {}, "warnings": [], "ai_used": False}
    if payload.email.strip() or payload.website.strip():
        try:
            origin = website_origin(payload.email.strip(), payload.website)
            found = await cached("website:" + origin)
            if found is None:
                if not await reserve_quota("website:" + origin.removeprefix("https://").removeprefix("www."), [(60, 1)]):
                    raise DiscoveryError("Este domínio foi consultado recentemente. Aguarde um minuto.")
                found = await run_in_threadpool(discover, origin)
                ai_used = False
                try:
                    ai_used = await run_in_threadpool(organize_local, found["pages"], found["suggestions"])
                except Exception:
                    found["warnings"].append("O modelo local não está disponível; foram mantidos os dados extraídos do site.")
                found = {"suggestions": found["suggestions"], "warnings": found["warnings"], "ai_used": ai_used}
                await save_cache("website:" + origin, found)
            result = {**found, "warnings": list(found["warnings"]), "suggestions": dict(found["suggestions"])}
        except DiscoveryError as exc:
            result["warnings"].append(str(exc))
    # NIF.pt fills missing data only. Never associate a different discovered NIF
    # with a NIF explicitly supplied by the user.
    discovered_nif = result["suggestions"].get("nif", {}).get("value")
    if nif and discovered_nif and nif != discovered_nif:
        result["suggestions"] = {}
        result["warnings"].append("O NIF encontrado no site difere do indicado. Os dados do site foram descartados.")
    nif = nif or discovered_nif
    missing = any(field not in result["suggestions"] for field in ("name", "nif", "address", "contact_phone"))
    if nif and missing:
        try:
            fields = await cached("nif:" + nif)
            if fields is None:
                if not os.environ.get("NIF_PT_API_KEY", "").strip():
                    raise DiscoveryError("Configure NIF_PT_API_KEY no backend para ativar o complemento NIF.pt.")
                if not await reserve_quota("nif_pt", [(60, 1), (3600, 10), (86400, 100), (2592000, 1000)]):
                    raise DiscoveryError("Foi atingido um limite gratuito do NIF.pt. Tente mais tarde.")
                fields = await run_in_threadpool(lookup_nif, nif)
                await save_cache("nif:" + nif, fields)
            for field, item in fields.items():
                result["suggestions"].setdefault(field, item)
        except DiscoveryError as exc:
            result["warnings"].append(str(exc))
        except ValueError:
            result["warnings"].append("O NIF.pt devolveu uma resposta inválida.")
    elif not nif:
        result["warnings"].append("Se souber o NIF, indique-o para poder consultar o NIF.pt.")
    if not payload.email.strip() and not payload.website.strip() and not nif:
        raise HTTPException(422, "Introduza um email profissional, website ou NIF.")
    return result
