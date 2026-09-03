"""Global search across the main commercial records."""
import asyncio
import re

from fastapi import APIRouter, Depends, Query

from deps import db, get_current_user


router = APIRouter()


def _pattern(query: str) -> dict:
    return {"$regex": re.escape(query), "$options": "i"}


def _subtitle(parts: list[str]) -> str:
    return " · ".join(part for part in parts if part)


@router.get("/search")
async def global_search(
    q: str = Query(..., min_length=2, max_length=100),
    limit: int = Query(5, ge=1, le=10),
    user: dict = Depends(get_current_user),
):
    """Return a small, normalized result set for the global command palette."""
    query = q.strip()
    if len(query) < 2:
        return {"results": []}

    pattern = _pattern(query)
    matched_clients = await db.clients.find(
        {"$or": [{"name": pattern}, {"nif": pattern}, {"contact_person": pattern}]},
        {"_id": 0, "id": 1, "name": 1, "nif": 1, "segment": 1},
    ).limit(limit).to_list(limit)
    matched_client_ids = [row["id"] for row in matched_clients]
    client_filter = {"client_id": {"$in": matched_client_ids}} if matched_client_ids else None

    def document_filter(fields: tuple[str, ...]) -> dict:
        terms = [{field: pattern} for field in fields]
        if client_filter:
            terms.append(client_filter)
        return {"$or": terms}

    leads_task = db.leads.find(document_filter(("id", "description", "client_name_raw", "status")), {"_id": 0}).sort("updated_at", -1).limit(limit).to_list(limit)
    opportunities_task = db.opportunities.find(document_filter(("id", "description", "status")), {"_id": 0}).sort("updated_at", -1).limit(limit).to_list(limit)
    proposals_task = db.proposals.find(document_filter(("id", "number", "description", "status")), {"_id": 0}).sort("updated_at", -1).limit(limit).to_list(limit)
    orders_task = db.orders.find(document_filter(("id", "number", "po_number", "status")), {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    projects_task = db.projects.find({"$or": [{"id": pattern}, {"name": pattern}, {"status": pattern}]}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    products_task = db.products.find({"$or": [{"id": pattern}, {"name": pattern}, {"category": pattern}]}, {"_id": 0}).limit(limit).to_list(limit)
    leads, opportunities, proposals, orders, projects, products = await asyncio.gather(
        leads_task, opportunities_task, proposals_task, orders_task, projects_task, products_task
    )

    referenced_client_ids = {
        row.get("client_id")
        for rows in (leads, opportunities, proposals, orders, projects)
        for row in rows
        if row.get("client_id")
    }
    client_map = {row["id"]: row["name"] for row in matched_clients}
    missing_client_ids = list(referenced_client_ids - set(client_map))
    if missing_client_ids:
        rows = await db.clients.find({"id": {"$in": missing_client_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(len(missing_client_ids))
        client_map.update({row["id"]: row["name"] for row in rows})

    results = []
    results.extend({"id": row["id"], "type": "lead", "title": row.get("description") or row["id"], "subtitle": _subtitle([row.get("client_name_raw") or client_map.get(row.get("client_id"), ""), row.get("status", "")]), "url": f"/leads/{row['id']}"} for row in leads)
    results.extend({"id": row["id"], "type": "opportunity", "title": row.get("description") or row["id"], "subtitle": _subtitle([client_map.get(row.get("client_id"), ""), row.get("status", "")]), "url": f"/oportunidades/{row['id']}"} for row in opportunities)
    results.extend({"id": row["id"], "type": "proposal", "title": row.get("number") or row.get("description") or row["id"], "subtitle": _subtitle([row.get("description", ""), client_map.get(row.get("client_id"), ""), row.get("status", "")]), "url": f"/propostas/{row['id']}"} for row in proposals)
    results.extend({"id": row["id"], "type": "order", "title": row.get("number") or row["id"], "subtitle": _subtitle([client_map.get(row.get("client_id"), ""), row.get("status", "")]), "url": f"/encomendas/{row['id']}"} for row in orders)
    results.extend({"id": row["id"], "type": "project", "title": row.get("name") or row["id"], "subtitle": row.get("status", ""), "url": f"/projetos/{row['id']}"} for row in projects)
    results.extend({"id": row["id"], "type": "client", "title": row["name"], "subtitle": _subtitle([row.get("nif", ""), row.get("segment", "")]), "url": "/clientes"} for row in matched_clients)
    results.extend({"id": row["id"], "type": "product", "title": row["name"], "subtitle": row.get("category", ""), "url": "/produtos"} for row in products)
    return {"results": results}
