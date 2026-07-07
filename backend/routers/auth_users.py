"""Auth + Users endpoints."""

from typing import List

from fastapi import APIRouter, Depends, HTTPException

from deps import (
    create_access_token,
    db,
    get_current_user,
    hash_password,
    new_id,
    now_iso,
    require_roles,
    verify_password,
)
from models import LoginIn, UserCreate, UserOut, UserUpdate

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
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    if not user.get("active", True):
        raise HTTPException(status_code=403, detail="Utilizador inativo")

    token = create_access_token(user["id"], user["email"], user["role"])
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
        },
    }


@router.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return user


@router.post("/auth/logout")
async def logout(user: dict = Depends(get_current_user)):
    return {"ok": True}


@router.get("/users", response_model=List[UserOut])
async def list_users(user: dict = Depends(get_current_user)):
    return await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)


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
async def update_user(uid: str, payload: UserUpdate, user: dict = Depends(require_roles("admin"))):
    updates = payload.model_dump(exclude_unset=True)

    if "email" in updates:
        updates["email"] = updates["email"].lower()
        existing = await db.users.find_one({"email": updates["email"]}, {"_id": 0, "id": 1})
        if existing and existing["id"] != uid:
            raise HTTPException(status_code=400, detail="Email já registado")

    if uid == user["id"]:
        if updates.get("active") is False:
            raise HTTPException(status_code=400, detail="Não pode inativar o próprio utilizador")
        if "role" in updates and updates["role"] != user["role"]:
            raise HTTPException(status_code=400, detail="Não pode alterar o próprio cargo")

    if updates.get("password"):
        updates["password_hash"] = hash_password(updates.pop("password"))
    else:
        updates.pop("password", None)

    if updates:
        await db.users.update_one({"id": uid}, {"$set": updates})

    doc = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
    return doc
