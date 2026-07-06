"""Auth + Users endpoints."""
from typing import List
from fastapi import APIRouter, Depends, HTTPException

from deps import db, hash_password, verify_password, create_access_token, get_current_user, require_roles, now_iso, new_id
from models import UserCreate, UserOut, LoginIn

router = APIRouter()


@router.post("/auth/register", response_model=UserOut)
async def register(payload: UserCreate):
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email já registado")
    user = {
        "id": new_id(),
        "email": email,
        "name": payload.name,
        "role": payload.role,
        "password_hash": hash_password(payload.password),
        "active": True,
        "created_at": now_iso(),
    }
    await db.users.insert_one(user)
    user.pop("password_hash", None)
    user.pop("_id", None)
    return user


@router.post("/auth/login")
async def login(payload: LoginIn):
    email = payload.email.lower()
    u = await db.users.find_one({"email": email})
    if not u or not verify_password(payload.password, u["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    if not u.get("active", True):
        raise HTTPException(status_code=403, detail="Utilizador inativo")
    token = create_access_token(u["id"], u["email"], u["role"])
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": u["id"], "email": u["email"], "name": u["name"], "role": u["role"]},
    }


@router.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return user


@router.post("/auth/logout")
async def logout(user: dict = Depends(get_current_user)):
    return {"ok": True}


@router.get("/users", response_model=List[UserOut])
async def list_users(user: dict = Depends(get_current_user)):
    docs = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
    return docs


@router.post("/users", response_model=UserOut)
async def create_user(payload: UserCreate, user: dict = Depends(require_roles("admin"))):
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email já registado")
    doc = {
        "id": new_id(),
        "email": email,
        "name": payload.name,
        "role": payload.role,
        "password_hash": hash_password(payload.password),
        "active": True,
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    doc.pop("password_hash", None)
    doc.pop("_id", None)
    return doc


@router.patch("/users/{uid}", response_model=UserOut)
async def update_user(uid: str, payload: dict, user: dict = Depends(require_roles("admin"))):
    payload.pop("id", None)
    if uid == user["id"]:
        if "active" in payload and payload["active"] is False:
            raise HTTPException(400, "Não pode inativar o próprio utilizador")
        if "role" in payload and payload["role"] != user["role"]:
            raise HTTPException(400, "Não pode alterar o próprio cargo")
    if "password" in payload and payload["password"]:
        payload["password_hash"] = hash_password(payload.pop("password"))
    else:
        payload.pop("password", None)
    await db.users.update_one({"id": uid}, {"$set": payload})
    doc = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    if not doc:
        raise HTTPException(404, "Utilizador não encontrado")
    return doc
