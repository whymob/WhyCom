"""Master Data: Clients, Manufacturers, Products."""
from typing import List
from fastapi import APIRouter, Depends, HTTPException

from deps import db, get_current_user, require_roles, now_iso, new_id
from models import Client, Manufacturer, Product

router = APIRouter()


# ------------- Clients -------------
@router.get("/clients", response_model=List[Client])
async def list_clients(user: dict = Depends(get_current_user)):
    return await db.clients.find({}, {"_id": 0}).to_list(1000)


@router.post("/clients", response_model=Client)
async def create_client(payload: Client, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    doc["id"] = new_id()
    doc["owner_id"] = payload.owner_id or user["id"]
    doc["created_at"] = now_iso()
    await db.clients.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/clients/{cid}", response_model=Client)
async def update_client(cid: str, payload: dict, user: dict = Depends(get_current_user)):
    payload.pop("id", None)
    await db.clients.update_one({"id": cid}, {"$set": payload})
    doc = await db.clients.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Cliente não encontrado")
    return doc


@router.delete("/clients/{cid}")
async def delete_client(cid: str, user: dict = Depends(require_roles("admin", "ceo"))):
    await db.clients.delete_one({"id": cid})
    return {"ok": True}


# ------------- Manufacturers -------------
@router.get("/manufacturers", response_model=List[Manufacturer])
async def list_manufacturers(user: dict = Depends(get_current_user)):
    return await db.manufacturers.find({}, {"_id": 0}).to_list(1000)


@router.post("/manufacturers", response_model=Manufacturer)
async def create_manufacturer(payload: Manufacturer, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    doc["id"] = new_id()
    doc["created_at"] = now_iso()
    await db.manufacturers.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/manufacturers/{mid}", response_model=Manufacturer)
async def update_manufacturer(mid: str, payload: dict, user: dict = Depends(get_current_user)):
    payload.pop("id", None)
    await db.manufacturers.update_one({"id": mid}, {"$set": payload})
    doc = await db.manufacturers.find_one({"id": mid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Fabricante não encontrado")
    return doc


@router.delete("/manufacturers/{mid}")
async def delete_manufacturer(mid: str, user: dict = Depends(require_roles("admin", "ceo"))):
    await db.manufacturers.delete_one({"id": mid})
    return {"ok": True}


# ------------- Products -------------
@router.get("/products", response_model=List[Product])
async def list_products(user: dict = Depends(get_current_user)):
    return await db.products.find({}, {"_id": 0}).to_list(1000)


@router.post("/products", response_model=Product)
async def create_product(payload: Product, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    doc["id"] = new_id()
    doc["created_at"] = now_iso()
    await db.products.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/products/{pid}", response_model=Product)
async def update_product(pid: str, payload: dict, user: dict = Depends(get_current_user)):
    payload.pop("id", None)
    await db.products.update_one({"id": pid}, {"$set": payload})
    doc = await db.products.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Produto não encontrado")
    return doc


@router.delete("/products/{pid}")
async def delete_product(pid: str, user: dict = Depends(require_roles("admin", "ceo"))):
    await db.products.delete_one({"id": pid})
    return {"ok": True}
