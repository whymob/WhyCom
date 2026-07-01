from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import logging
import asyncio
import bcrypt
import jwt
import resend
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Query
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict

# Configure Resend SDK
resend.api_key = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL") or os.environ.get("RESEND_FROM") or "onboarding@resend.dev"


# ------------- setup -------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="WhyMob CRM API")
api = APIRouter(prefix="/api")

JWT_ALG = "HS256"
JWT_SECRET = os.environ['JWT_SECRET']

ROLES = ("admin", "ceo", "diretor_tecnico", "comercial", "developer")

logger = logging.getLogger("whymob")
logging.basicConfig(level=logging.INFO)


# ------------- helpers -------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Não autenticado")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sessão expirada")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Utilizador não encontrado")
    return user


def require_roles(*roles):
    async def dep(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") not in roles and user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Sem permissão")
        return user
    return dep


# ------------- Models -------------
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Literal["admin", "ceo", "diretor_tecnico", "comercial", "developer"] = "comercial"


class UserOut(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: str
    active: bool = True
    created_at: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class Client(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    name: str
    nif: str
    address: Optional[str] = ""
    contact_email: Optional[str] = ""
    contact_phone: Optional[str] = ""
    contact_person: Optional[str] = ""
    segment: Optional[str] = ""
    active: bool = True
    owner_id: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


class Manufacturer(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    partnership_type: Optional[str] = ""
    active: bool = True
    created_at: str = Field(default_factory=now_iso)


class Product(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    manufacturer_id: Optional[str] = None
    category: Literal["setup", "recorrente", "projeto", "horas", "licenciamento", "suporte"] = "projeto"
    unit: Literal["unidade", "mes", "hora", "dia", "projeto"] = "unidade"
    base_price: float = 0.0
    base_cost: float = 0.0
    active: bool = True
    created_at: str = Field(default_factory=now_iso)


class Lead(BaseModel):
    id: str = Field(default_factory=new_id)
    client_id: Optional[str] = None
    client_name_raw: Optional[str] = ""   # for prospect clients not yet in system
    description: str
    manufacturer_id: Optional[str] = None
    product_ids: List[str] = []
    estimated_value: float = 0.0
    owner_id: str
    status: Literal["nova", "em_qualificacao", "convertida", "descartada"] = "nova"
    lost_reason: Optional[str] = ""
    converted_opportunity_id: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class Opportunity(BaseModel):
    id: str = Field(default_factory=new_id)
    lead_id: Optional[str] = None
    client_id: str
    description: str
    manufacturer_id: Optional[str] = None
    product_ids: List[str] = []
    estimated_value: float = 0.0
    estimated_vab: float = 0.0
    probability: int = 50  # 0..100
    expected_close_date: Optional[str] = None
    priority: Literal["baixa", "media", "alta"] = "media"
    competitor: Optional[str] = ""
    notes: Optional[str] = ""
    owner_id: str
    status: Literal["aberta", "em_analise", "convertida", "perdida"] = "aberta"
    lost_reason: Optional[str] = ""
    converted_proposal_id: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class ProposalLine(BaseModel):
    product_id: Optional[str] = None
    description: str
    quantity: float = 1
    unit: str = "unidade"
    unit_price: float = 0.0
    discount_pct: float = 0.0
    vat_pct: float = 23.0
    unit_cost: float = 0.0

    @property
    def net(self) -> float:
        return round(self.quantity * self.unit_price * (1 - self.discount_pct / 100), 2)

    @property
    def vat(self) -> float:
        return round(self.net * self.vat_pct / 100, 2)

    @property
    def gross(self) -> float:
        return round(self.net + self.vat, 2)

    @property
    def vab(self) -> float:
        return round(self.net - (self.unit_cost * self.quantity), 2)


class Proposal(BaseModel):
    id: str = Field(default_factory=new_id)
    number: str = ""
    version: int = 1
    opportunity_id: str
    client_id: str
    lines: List[ProposalLine] = []
    valid_until: Optional[str] = None
    notes: Optional[str] = ""
    owner_id: str
    status: Literal["em_elaboracao", "enviada", "em_negociacao", "ganha", "perdida", "expirada"] = "em_elaboracao"
    lost_reason: Optional[str] = ""
    converted_order_id: Optional[str] = None
    total_net: float = 0.0
    total_vat: float = 0.0
    total_gross: float = 0.0
    total_vab: float = 0.0
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


def compute_proposal_totals(lines: List[ProposalLine]):
    net = sum(l.net for l in lines)
    vat = sum(l.vat for l in lines)
    gross = sum(l.gross for l in lines)
    vab = sum(l.vab for l in lines)
    return round(net, 2), round(vat, 2), round(gross, 2), round(vab, 2)


class Order(BaseModel):
    id: str = Field(default_factory=new_id)
    number: str = ""
    po_number: Optional[str] = ""
    proposal_id: str
    opportunity_id: str
    client_id: str
    order_date: str = Field(default_factory=now_iso)
    total_net: float = 0.0
    total_vat: float = 0.0
    total_gross: float = 0.0
    total_vab: float = 0.0
    commercial_terms: Optional[str] = ""
    owner_id: str
    status: Literal["aberta", "em_planeamento", "em_faturacao", "parcialmente_faturada", "faturada", "recebida", "fulfilled", "cancelada"] = "aberta"
    cancel_reason: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)


# ------------- Auth endpoints -------------
@api.post("/auth/register", response_model=UserOut)
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


@api.post("/auth/login")
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


@api.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return user


@api.post("/auth/logout")
async def logout(user: dict = Depends(get_current_user)):
    return {"ok": True}


# ------------- Users -------------
@api.get("/users", response_model=List[UserOut])
async def list_users(user: dict = Depends(get_current_user)):
    docs = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
    return docs


@api.post("/users", response_model=UserOut)
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


@api.patch("/users/{uid}", response_model=UserOut)
async def update_user(uid: str, payload: dict, user: dict = Depends(require_roles("admin"))):
    payload.pop("id", None)
    # Prevent admin from disabling themselves or downgrading own role
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


# ------------- Master Data: Clients -------------
@api.get("/clients", response_model=List[Client])
async def list_clients(user: dict = Depends(get_current_user)):
    docs = await db.clients.find({}, {"_id": 0}).to_list(1000)
    return docs


@api.post("/clients", response_model=Client)
async def create_client(payload: Client, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    doc["id"] = new_id()
    doc["created_at"] = now_iso()
    doc["owner_id"] = user["id"]
    await db.clients.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.patch("/clients/{cid}", response_model=Client)
async def update_client(cid: str, payload: dict, user: dict = Depends(get_current_user)):
    payload.pop("id", None)
    await db.clients.update_one({"id": cid}, {"$set": payload})
    doc = await db.clients.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Cliente não encontrado")
    return doc


@api.delete("/clients/{cid}")
async def delete_client(cid: str, user: dict = Depends(require_roles("admin", "ceo"))):
    await db.clients.delete_one({"id": cid})
    return {"ok": True}


# ------------- Manufacturers -------------
@api.get("/manufacturers", response_model=List[Manufacturer])
async def list_manufacturers(user: dict = Depends(get_current_user)):
    return await db.manufacturers.find({}, {"_id": 0}).to_list(1000)


@api.post("/manufacturers", response_model=Manufacturer)
async def create_manufacturer(payload: Manufacturer, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    doc["id"] = new_id()
    doc["created_at"] = now_iso()
    await db.manufacturers.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.patch("/manufacturers/{mid}", response_model=Manufacturer)
async def update_manufacturer(mid: str, payload: dict, user: dict = Depends(get_current_user)):
    payload.pop("id", None)
    await db.manufacturers.update_one({"id": mid}, {"$set": payload})
    doc = await db.manufacturers.find_one({"id": mid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Fabricante não encontrado")
    return doc


@api.delete("/manufacturers/{mid}")
async def delete_manufacturer(mid: str, user: dict = Depends(require_roles("admin", "ceo"))):
    await db.manufacturers.delete_one({"id": mid})
    return {"ok": True}


# ------------- Products -------------
@api.get("/products", response_model=List[Product])
async def list_products(user: dict = Depends(get_current_user)):
    return await db.products.find({}, {"_id": 0}).to_list(1000)


@api.post("/products", response_model=Product)
async def create_product(payload: Product, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    doc["id"] = new_id()
    doc["created_at"] = now_iso()
    await db.products.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.patch("/products/{pid}", response_model=Product)
async def update_product(pid: str, payload: dict, user: dict = Depends(get_current_user)):
    payload.pop("id", None)
    await db.products.update_one({"id": pid}, {"$set": payload})
    doc = await db.products.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Produto não encontrado")
    return doc


@api.delete("/products/{pid}")
async def delete_product(pid: str, user: dict = Depends(require_roles("admin", "ceo"))):
    await db.products.delete_one({"id": pid})
    return {"ok": True}


# ------------- Leads -------------
@api.get("/leads", response_model=List[Lead])
async def list_leads(user: dict = Depends(get_current_user)):
    return await db.leads.find({}, {"_id": 0}).to_list(1000)


@api.post("/leads", response_model=Lead)
async def create_lead(payload: Lead, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    doc["id"] = new_id()
    doc["owner_id"] = payload.owner_id or user["id"]
    doc["created_at"] = now_iso()
    doc["updated_at"] = now_iso()
    await db.leads.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.patch("/leads/{lid}", response_model=Lead)
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
        await _audit("status_change", "lead", lid, {"status": before.get("status")}, {"status": doc.get("status")}, user, payload.get("lost_reason", ""))
    return doc


@api.post("/leads/{lid}/convert", response_model=Opportunity)
async def convert_lead(lid: str, user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"id": lid}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead não encontrada")
    if lead["status"] in ("convertida", "descartada"):
        raise HTTPException(400, "Lead não pode ser convertida")
    client_id = lead.get("client_id")
    if not client_id:
        # create prospect client if missing
        client_doc = {
            "id": new_id(),
            "name": lead.get("client_name_raw") or "Cliente sem nome",
            "nif": "PENDENTE-" + new_id()[:8],
            "address": "",
            "contact_email": "",
            "contact_phone": "",
            "contact_person": "",
            "segment": "Prospect",
            "active": True,
            "owner_id": user["id"],
            "created_at": now_iso(),
        }
        await db.clients.insert_one(client_doc)
        client_id = client_doc["id"]

    opp = {
        "id": new_id(),
        "lead_id": lid,
        "client_id": client_id,
        "description": lead["description"],
        "manufacturer_id": lead.get("manufacturer_id"),
        "product_ids": lead.get("product_ids", []),
        "estimated_value": lead.get("estimated_value", 0.0),
        "estimated_vab": 0.0,
        "probability": 50,
        "expected_close_date": None,
        "priority": "media",
        "competitor": "",
        "notes": "",
        "owner_id": user["id"],
        "status": "aberta",
        "lost_reason": "",
        "converted_proposal_id": None,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.opportunities.insert_one(opp)
    await db.leads.update_one({"id": lid}, {"$set": {"status": "convertida", "converted_opportunity_id": opp["id"], "updated_at": now_iso()}})
    opp.pop("_id", None)
    return opp


# ------------- Opportunities -------------
@api.get("/opportunities", response_model=List[Opportunity])
async def list_opps(user: dict = Depends(get_current_user)):
    return await db.opportunities.find({}, {"_id": 0}).to_list(1000)


@api.post("/opportunities", response_model=Opportunity)
async def create_opp(payload: Opportunity, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    doc["id"] = new_id()
    doc["owner_id"] = payload.owner_id or user["id"]
    doc["created_at"] = now_iso()
    doc["updated_at"] = now_iso()
    await db.opportunities.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.patch("/opportunities/{oid}", response_model=Opportunity)
async def update_opp(oid: str, payload: dict, user: dict = Depends(get_current_user)):
    payload.pop("id", None)
    payload["updated_at"] = now_iso()
    if payload.get("status") == "perdida" and not payload.get("lost_reason"):
        raise HTTPException(400, "Motivo de perda obrigatório")
    before = await db.opportunities.find_one({"id": oid}, {"_id": 0})
    await db.opportunities.update_one({"id": oid}, {"$set": payload})
    doc = await db.opportunities.find_one({"id": oid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Oportunidade não encontrada")
    if before and before.get("status") != doc.get("status"):
        await _audit("status_change", "opportunity", oid, {"status": before.get("status"), "estimated_value": before.get("estimated_value")}, {"status": doc.get("status"), "estimated_value": doc.get("estimated_value")}, user, payload.get("lost_reason", ""))
    return doc


@api.post("/opportunities/{oid}/convert", response_model=Proposal)
async def convert_opp(oid: str, user: dict = Depends(get_current_user)):
    opp = await db.opportunities.find_one({"id": oid}, {"_id": 0})
    if not opp:
        raise HTTPException(404, "Oportunidade não encontrada")
    if opp["status"] not in ("aberta", "em_analise"):
        raise HTTPException(400, "Oportunidade deve estar aberta ou em análise")

    prop_number = f"PROP-{datetime.now().year}-{(await db.proposals.count_documents({})) + 1:04d}"
    proposal = {
        "id": new_id(),
        "number": prop_number,
        "version": 1,
        "opportunity_id": oid,
        "client_id": opp["client_id"],
        "lines": [],
        "valid_until": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
        "notes": "",
        "owner_id": user["id"],
        "status": "em_elaboracao",
        "lost_reason": "",
        "converted_order_id": None,
        "total_net": 0.0,
        "total_vat": 0.0,
        "total_gross": 0.0,
        "total_vab": 0.0,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.proposals.insert_one(proposal)
    await db.opportunities.update_one({"id": oid}, {"$set": {"status": "convertida", "converted_proposal_id": proposal["id"], "updated_at": now_iso()}})
    proposal.pop("_id", None)
    return proposal


# ------------- Proposals -------------
@api.get("/proposals", response_model=List[Proposal])
async def list_proposals(user: dict = Depends(get_current_user)):
    return await db.proposals.find({}, {"_id": 0}).to_list(1000)


@api.get("/proposals/{pid}", response_model=Proposal)
async def get_proposal(pid: str, user: dict = Depends(get_current_user)):
    doc = await db.proposals.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Proposta não encontrada")
    return doc


@api.patch("/proposals/{pid}", response_model=Proposal)
async def update_proposal(pid: str, payload: dict, user: dict = Depends(get_current_user)):
    payload.pop("id", None)
    payload["updated_at"] = now_iso()
    if payload.get("status") == "perdida" and not payload.get("lost_reason"):
        raise HTTPException(400, "Motivo de perda obrigatório")
    before = await db.proposals.find_one({"id": pid}, {"_id": 0})
    # recompute totals if lines present
    if "lines" in payload:
        lines_models = [ProposalLine(**l) for l in payload["lines"]]
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
        await _audit("update", "proposal", pid, {"status": before.get("status"), "total_net": before.get("total_net"), "total_vab": before.get("total_vab")}, {"status": doc.get("status"), "total_net": doc.get("total_net"), "total_vab": doc.get("total_vab")}, user, payload.get("lost_reason", ""))
    return doc


@api.post("/proposals/{pid}/convert", response_model=Order)
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
        "id": new_id(),
        "number": order_number,
        "po_number": "",
        "proposal_id": pid,
        "opportunity_id": proposal["opportunity_id"],
        "client_id": proposal["client_id"],
        "order_date": now_iso(),
        "total_net": proposal["total_net"],
        "total_vat": proposal["total_vat"],
        "total_gross": proposal["total_gross"],
        "total_vab": proposal["total_vab"],
        "commercial_terms": "",
        "owner_id": user["id"],
        "status": "aberta",
        "cancel_reason": "",
        "created_at": now_iso(),
    }
    await db.orders.insert_one(order)
    await db.proposals.update_one({"id": pid}, {"$set": {"converted_order_id": order["id"], "updated_at": now_iso()}})
    order.pop("_id", None)
    return order


# ------------- Orders -------------
@api.get("/orders", response_model=List[Order])
async def list_orders(user: dict = Depends(get_current_user)):
    return await db.orders.find({}, {"_id": 0}).to_list(1000)


@api.patch("/orders/{oid}", response_model=Order)
async def update_order(oid: str, payload: dict, user: dict = Depends(get_current_user)):
    payload.pop("id", None)
    if payload.get("status") == "cancelada" and not payload.get("cancel_reason"):
        raise HTTPException(400, "Motivo de cancelamento obrigatório")
    await db.orders.update_one({"id": oid}, {"$set": payload})
    doc = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Encomenda não encontrada")
    return doc


# ------------- Dashboard / Funnel -------------
@api.get("/dashboard/kpis")
async def kpis(user: dict = Depends(get_current_user)):
    leads = await db.leads.find({}, {"_id": 0}).to_list(5000)
    opps = await db.opportunities.find({}, {"_id": 0}).to_list(5000)
    props = await db.proposals.find({}, {"_id": 0}).to_list(5000)
    orders = await db.orders.find({}, {"_id": 0}).to_list(5000)

    leads_open = [l for l in leads if l["status"] in ("nova", "em_qualificacao")]
    opps_open = [o for o in opps if o["status"] in ("aberta", "em_analise")]
    props_sent = [p for p in props if p["status"] in ("enviada", "em_negociacao")]
    props_won = [p for p in props if p["status"] == "ganha"]
    props_lost = [p for p in props if p["status"] == "perdida"]

    total_props_closed = len(props_won) + len(props_lost)
    conv_rate = round((len(props_won) / total_props_closed) * 100, 1) if total_props_closed else 0.0

    won_value = sum(p.get("total_net", 0) for p in props_won)
    won_vab = sum(p.get("total_vab", 0) for p in props_won)
    weighted_pipeline = sum(o.get("estimated_value", 0) * (o.get("probability", 0) / 100) for o in opps_open)

    return {
        "leads_open": len(leads_open),
        "leads_open_value": sum(l.get("estimated_value", 0) for l in leads_open),
        "opps_open": len(opps_open),
        "opps_weighted_value": round(weighted_pipeline, 2),
        "props_sent": len(props_sent),
        "props_won": len(props_won),
        "props_lost": len(props_lost),
        "conversion_rate": conv_rate,
        "won_value": round(won_value, 2),
        "won_vab": round(won_vab, 2),
        "orders_count": len(orders),
        "orders_value": round(sum(o.get("total_net", 0) for o in orders), 2),
        "orders_vab": round(sum(o.get("total_vab", 0) for o in orders), 2),
    }


@api.get("/dashboard/funnel")
async def funnel(manufacturer_id: Optional[str] = Query(None), user: dict = Depends(get_current_user)):
    leads = await db.leads.find({}, {"_id": 0}).to_list(5000)
    opps = await db.opportunities.find({}, {"_id": 0}).to_list(5000)
    props = await db.proposals.find({}, {"_id": 0}).to_list(5000)
    orders = await db.orders.find({}, {"_id": 0}).to_list(5000)

    if manufacturer_id:
        products = {p["id"]: p for p in await db.products.find({}, {"_id": 0}).to_list(5000)}
        # Leads: filtered by manufacturer_id field OR via product_ids
        def lead_matches(l):
            if l.get("manufacturer_id") == manufacturer_id:
                return True
            for pid in l.get("product_ids", []) or []:
                if products.get(pid, {}).get("manufacturer_id") == manufacturer_id:
                    return True
            return False
        leads = [l for l in leads if lead_matches(l)]
        # Opps: same logic
        opps = [o for o in opps if lead_matches(o)]
        # Proposals: any line with a product from this manufacturer
        def prop_matches(p):
            for ln in p.get("lines", []) or []:
                pid = ln.get("product_id")
                if pid and products.get(pid, {}).get("manufacturer_id") == manufacturer_id:
                    return True
            return False
        matching_prop_ids = {p["id"] for p in props if prop_matches(p)}
        props = [p for p in props if p["id"] in matching_prop_ids]
        orders = [o for o in orders if o.get("proposal_id") in matching_prop_ids]

    stages = [
        {
            "key": "leads",
            "label": "Leads",
            "count": len(leads),
            "value": sum(l.get("estimated_value", 0) for l in leads),
            "vab": 0.0,
        },
        {
            "key": "opportunities",
            "label": "Oportunidades",
            "count": len(opps),
            "value": sum(o.get("estimated_value", 0) for o in opps),
            "vab": sum(o.get("estimated_vab", 0) for o in opps),
        },
        {
            "key": "proposals",
            "label": "Propostas",
            "count": len(props),
            "value": sum(p.get("total_net", 0) for p in props),
            "vab": sum(p.get("total_vab", 0) for p in props),
        },
        {
            "key": "orders",
            "label": "Encomendas",
            "count": len(orders),
            "value": sum(o.get("total_net", 0) for o in orders),
            "vab": sum(o.get("total_vab", 0) for o in orders),
        },
    ]
    for i, s in enumerate(stages):
        if i == 0:
            s["conversion_pct"] = 100.0
        else:
            prev = stages[i - 1]["count"]
            s["conversion_pct"] = round((s["count"] / prev) * 100, 1) if prev else 0.0
    return {"stages": stages}


# ------------- Billing Plan / Invoices / Payments -------------
class PlanLineIn(BaseModel):
    type: Literal["setup", "mensalidade", "trimestralidade", "anuidade", "avos", "consumo_horas", "projeto", "outros"] = "projeto"
    description: str = ""
    expected_date: Optional[str] = None
    value: float = 0.0
    vab: float = 0.0


TOLERANCE = 0.01  # 1 cêntimo


async def _get_order(oid: str) -> dict:
    o = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Encomenda não encontrada")
    return o


async def _recalc_order_status(oid: str):
    """Recalcula estado da encomenda com base em plano/faturas/recebimentos."""
    order = await _get_order(oid)
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

    def eq(a, b): return abs(a - b) <= TOLERANCE

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


@api.get("/orders/{oid}/plan")
async def get_plan(oid: str, user: dict = Depends(get_current_user)):
    await _get_order(oid)
    lines = await db.plan_lines.find({"order_id": oid}, {"_id": 0}).sort("expected_date", 1).to_list(1000)
    return {"order_id": oid, "lines": lines}


@api.put("/orders/{oid}/plan")
async def replace_plan(oid: str, payload: dict, user: dict = Depends(get_current_user)):
    await _get_order(oid)
    lines_in = payload.get("lines", [])
    # remove and reinsert; only for lines with no invoicing done
    existing = await db.plan_lines.find({"order_id": oid}, {"_id": 0}).to_list(1000)
    used_ids = {l["id"] for l in existing if l.get("invoiced_amount", 0) > 0}
    # keep used lines
    keep = [l for l in existing if l["id"] in used_ids]
    new_lines = []
    for l in lines_in:
        line_id = l.get("id")
        if line_id and line_id in used_ids:
            # already kept
            continue
        new_lines.append({
            "id": new_id(),
            "order_id": oid,
            "type": l.get("type", "projeto"),
            "description": l.get("description", ""),
            "expected_date": l.get("expected_date"),
            "value": float(l.get("value") or 0),
            "vab": float(l.get("vab") or 0),
            "invoiced_amount": 0.0,
            "status": "planeada",
            "created_at": now_iso(),
        })
    await db.plan_lines.delete_many({"order_id": oid, "id": {"$nin": list(used_ids)}})
    if new_lines:
        await db.plan_lines.insert_many(new_lines)
    all_lines = await db.plan_lines.find({"order_id": oid}, {"_id": 0}).sort("expected_date", 1).to_list(1000)
    await _recalc_order_status(oid)
    return {"order_id": oid, "lines": all_lines}


@api.get("/orders/{oid}/reconcile")
async def reconcile(oid: str, user: dict = Depends(get_current_user)):
    order = await _get_order(oid)
    plan = await db.plan_lines.find({"order_id": oid, "status": {"$ne": "cancelada"}}, {"_id": 0}).to_list(1000)
    invoices = await db.invoices.find({"order_id": oid, "status": {"$ne": "anulada"}}, {"_id": 0}).to_list(1000)
    payments = await db.payments.find({"order_id": oid}, {"_id": 0}).to_list(1000)
    plan_val = round(sum(p["value"] for p in plan), 2)
    plan_vab = round(sum(p["vab"] for p in plan), 2)
    inv_val = round(sum(i["total_net"] for i in invoices), 2)
    inv_vab = round(sum(i["total_vab"] for i in invoices), 2)
    received = round(sum(p["amount"] for p in payments), 2)
    return {
        "order": {"value": order["total_net"], "vab": order["total_vab"], "status": order["status"]},
        "plan": {"value": plan_val, "vab": plan_vab, "count": len(plan)},
        "invoiced": {"value": inv_val, "vab": inv_vab, "count": len(invoices)},
        "received": {"value": received, "count": len(payments)},
        "deltas": {
            "plan_vs_order": round(plan_val - order["total_net"], 2),
            "invoiced_vs_plan": round(inv_val - plan_val, 2),
            "received_vs_invoiced": round(received - inv_val, 2),
            "vab_plan_vs_order": round(plan_vab - order["total_vab"], 2),
            "vab_invoiced_vs_order": round(inv_vab - order["total_vab"], 2),
        },
    }


# ------------- Invoices -------------
class InvoiceLineIn(BaseModel):
    plan_line_id: str
    amount: float
    vab: float = 0.0
    description: str = ""


@api.get("/invoices")
async def list_invoices(order_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"order_id": order_id} if order_id else {}
    return await db.invoices.find(q, {"_id": 0}).sort("issued_at", -1).to_list(2000)


@api.post("/invoices")
async def create_invoice(payload: dict, user: dict = Depends(get_current_user)):
    order_id = payload["order_id"]
    order = await _get_order(order_id)
    lines_in = payload.get("lines", [])
    if not lines_in:
        raise HTTPException(400, "Fatura deve ter pelo menos 1 linha")

    plan_lines_map = {l["id"]: l for l in await db.plan_lines.find({"order_id": order_id}, {"_id": 0}).to_list(1000)}
    total_net = 0.0
    total_vab = 0.0
    inv_lines = []
    for l in lines_in:
        pl = plan_lines_map.get(l["plan_line_id"])
        if not pl:
            raise HTTPException(400, f"Linha de plano {l['plan_line_id']} não encontrada")
        remaining = pl["value"] - pl.get("invoiced_amount", 0)
        amt = float(l["amount"])
        if amt <= 0:
            raise HTTPException(400, "Valor da linha deve ser > 0")
        if amt > remaining + TOLERANCE:
            raise HTTPException(400, f"Excede saldo por faturar da linha (restante {remaining:.2f}€)")
        inv_lines.append({
            "plan_line_id": pl["id"],
            "amount": round(amt, 2),
            "vab": round(float(l.get("vab") or 0), 2),
            "description": l.get("description") or pl["description"],
        })
        total_net += amt
        total_vab += float(l.get("vab") or 0)

    invoice = {
        "id": new_id(),
        "number": payload.get("number") or f"FT-{datetime.now().year}-{(await db.invoices.count_documents({})) + 1:04d}",
        "order_id": order_id,
        "client_id": order["client_id"],
        "issued_at": payload.get("issued_at") or now_iso(),
        "vat_pct": float(payload.get("vat_pct") or 23),
        "lines": inv_lines,
        "total_net": round(total_net, 2),
        "total_vab": round(total_vab, 2),
        "total_vat": round(total_net * (float(payload.get("vat_pct") or 23) / 100), 2),
        "received_amount": 0.0,
        "status": "emitida",
        "cancel_reason": "",
        "notes": payload.get("notes") or "",
        "created_at": now_iso(),
    }
    invoice["total_gross"] = round(invoice["total_net"] + invoice["total_vat"], 2)
    await db.invoices.insert_one(invoice)

    # update plan_lines invoiced_amount / status
    for il in inv_lines:
        pl = plan_lines_map[il["plan_line_id"]]
        new_amt = pl.get("invoiced_amount", 0) + il["amount"]
        status = "faturada" if abs(new_amt - pl["value"]) <= TOLERANCE else "parcialmente_faturada"
        await db.plan_lines.update_one({"id": pl["id"]}, {"$set": {"invoiced_amount": round(new_amt, 2), "status": status}})

    await _recalc_order_status(order_id)
    invoice.pop("_id", None)
    return invoice


@api.post("/invoices/{iid}/cancel")
async def cancel_invoice(iid: str, payload: dict, user: dict = Depends(require_roles("admin", "ceo"))):
    reason = (payload or {}).get("reason", "").strip()
    if not reason:
        raise HTTPException(400, "Motivo de anulação obrigatório")
    inv = await db.invoices.find_one({"id": iid}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Fatura não encontrada")
    if inv["status"] == "anulada":
        raise HTTPException(400, "Já anulada")
    # reverse invoiced_amount
    for il in inv["lines"]:
        pl = await db.plan_lines.find_one({"id": il["plan_line_id"]})
        if pl:
            new_amt = max(0, pl.get("invoiced_amount", 0) - il["amount"])
            status = "planeada" if new_amt <= TOLERANCE else "parcialmente_faturada"
            await db.plan_lines.update_one({"id": pl["id"]}, {"$set": {"invoiced_amount": round(new_amt, 2), "status": status}})
    await db.invoices.update_one({"id": iid}, {"$set": {"status": "anulada", "cancel_reason": reason}})
    await _recalc_order_status(inv["order_id"])
    return {"ok": True}


# ------------- Payments -------------
@api.get("/payments")
async def list_payments(order_id: Optional[str] = None, invoice_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {}
    if order_id: q["order_id"] = order_id
    if invoice_id: q["invoice_id"] = invoice_id
    return await db.payments.find(q, {"_id": 0}).sort("paid_at", -1).to_list(2000)


@api.post("/payments")
async def create_payment(payload: dict, user: dict = Depends(get_current_user)):
    invoice_id = payload["invoice_id"]
    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Fatura não encontrada")
    if inv["status"] == "anulada":
        raise HTTPException(400, "Fatura anulada")
    amount = float(payload["amount"])
    if amount <= 0:
        raise HTTPException(400, "Valor deve ser > 0")
    open_balance = inv["total_net"] - inv.get("received_amount", 0)
    if amount > open_balance + TOLERANCE:
        raise HTTPException(400, f"Valor excede saldo em aberto ({open_balance:.2f}€)")

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
    new_received = inv.get("received_amount", 0) + amount
    inv_status = "recebida" if abs(new_received - inv["total_net"]) <= TOLERANCE else "parcialmente_recebida"
    await db.invoices.update_one({"id": invoice_id}, {"$set": {"received_amount": round(new_received, 2), "status": inv_status}})
    await _recalc_order_status(inv["order_id"])
    pay.pop("_id", None)
    return pay


# ------------- Alerts -------------
@api.get("/dashboard/alerts")
async def alerts(user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    out = []
    # Propostas ganhas sem encomenda
    props = await db.proposals.find({"status": "ganha", "converted_order_id": None}, {"_id": 0}).to_list(1000)
    for p in props:
        out.append({"level": "info", "type": "proposta_sem_encomenda", "message": f"Proposta {p['number']} ganha sem encomenda criada", "ref_id": p["id"]})

    # Encomendas sem plano
    orders = await db.orders.find({"status": {"$in": ["aberta", "em_planeamento"]}}, {"_id": 0}).to_list(1000)
    for o in orders:
        cnt = await db.plan_lines.count_documents({"order_id": o["id"]})
        if cnt == 0:
            out.append({"level": "warning", "type": "encomenda_sem_plano", "message": f"Encomenda {o['number']} sem plano de faturação", "ref_id": o["id"]})

    # Plano vs encomenda desvios
    for o in await db.orders.find({"status": {"$nin": ["cancelada", "fulfilled"]}}, {"_id": 0}).to_list(1000):
        plan = await db.plan_lines.find({"order_id": o["id"], "status": {"$ne": "cancelada"}}, {"_id": 0}).to_list(1000)
        pv = sum(p["value"] for p in plan)
        if plan and abs(pv - o["total_net"]) > 0.5:
            out.append({"level": "warning", "type": "desvio_plano", "message": f"Encomenda {o['number']}: plano {pv:.2f}€ ≠ encomenda {o['total_net']:.2f}€", "ref_id": o["id"]})

    # Linhas de plano vencidas sem fatura
    for pl in await db.plan_lines.find({"status": {"$in": ["planeada", "parcialmente_faturada"]}}, {"_id": 0}).to_list(2000):
        exp = pl.get("expected_date")
        if not exp: continue
        try:
            d = datetime.fromisoformat(exp.replace("Z", "+00:00")) if "T" in exp else datetime.fromisoformat(exp + "T00:00:00+00:00")
            if d < now:
                out.append({"level": "danger", "type": "plano_atraso", "message": f"Linha de plano vencida ({d.date()}): {pl['description'] or pl['type']}", "ref_id": pl["order_id"]})
        except Exception:
            pass

    # Faturas em atraso (>30 dias emitida sem recebimento total)
    for inv in await db.invoices.find({"status": {"$in": ["emitida", "parcialmente_recebida"]}}, {"_id": 0}).to_list(2000):
        try:
            d = datetime.fromisoformat(inv["issued_at"].replace("Z", "+00:00"))
            if (now - d).days > 30:
                out.append({"level": "danger", "type": "fatura_atraso", "message": f"Fatura {inv['number']} em atraso ({(now - d).days}d)", "ref_id": inv["id"]})
        except Exception:
            pass
    return {"alerts": out[:50]}


# ------------- Analytics / Advanced Reporting -------------
def _month_key(iso: str) -> str:
    try:
        return iso[:7]  # YYYY-MM
    except Exception:
        return "—"


@api.get("/analytics/by-commercial")
async def by_commercial(user: dict = Depends(get_current_user)):
    users = {u["id"]: u for u in await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)}
    leads = await db.leads.find({}, {"_id": 0}).to_list(5000)
    opps = await db.opportunities.find({}, {"_id": 0}).to_list(5000)
    props = await db.proposals.find({}, {"_id": 0}).to_list(5000)
    orders = await db.orders.find({}, {"_id": 0}).to_list(5000)
    rows = {}
    def row(uid):
        u = users.get(uid, {"name": uid, "email": ""})
        return rows.setdefault(uid, {"user_id": uid, "name": u.get("name") or uid, "role": u.get("role") or "", "leads": 0, "opps": 0, "props": 0, "won": 0, "lost": 0, "won_value": 0.0, "won_vab": 0.0, "orders_value": 0.0, "orders_vab": 0.0})
    for l in leads: row(l["owner_id"])["leads"] += 1
    for o in opps: row(o["owner_id"])["opps"] += 1
    for p in props:
        r = row(p["owner_id"])
        r["props"] += 1
        if p["status"] == "ganha":
            r["won"] += 1; r["won_value"] += p.get("total_net", 0); r["won_vab"] += p.get("total_vab", 0)
        elif p["status"] == "perdida":
            r["lost"] += 1
    for o in orders:
        r = row(o["owner_id"])
        r["orders_value"] += o.get("total_net", 0)
        r["orders_vab"] += o.get("total_vab", 0)
    for r in rows.values():
        closed = r["won"] + r["lost"]
        r["conversion_rate"] = round((r["won"] / closed) * 100, 1) if closed else 0.0
        for k in ("won_value", "won_vab", "orders_value", "orders_vab"):
            r[k] = round(r[k], 2)
    return {"rows": sorted(rows.values(), key=lambda r: -r["won_value"])}


@api.get("/analytics/by-client")
async def by_client(user: dict = Depends(get_current_user)):
    clients = {c["id"]: c for c in await db.clients.find({}, {"_id": 0}).to_list(2000)}
    props = await db.proposals.find({}, {"_id": 0}).to_list(5000)
    orders = await db.orders.find({}, {"_id": 0}).to_list(5000)
    rows = {}
    def row(cid):
        c = clients.get(cid, {"name": cid})
        return rows.setdefault(cid, {"client_id": cid, "name": c.get("name") or cid, "segment": c.get("segment") or "", "props": 0, "won": 0, "won_value": 0.0, "won_vab": 0.0, "orders": 0, "orders_value": 0.0, "orders_vab": 0.0})
    for p in props:
        r = row(p["client_id"])
        r["props"] += 1
        if p["status"] == "ganha":
            r["won"] += 1
            r["won_value"] += p.get("total_net", 0)
            r["won_vab"] += p.get("total_vab", 0)
    for o in orders:
        r = row(o["client_id"])
        r["orders"] += 1
        r["orders_value"] += o.get("total_net", 0)
        r["orders_vab"] += o.get("total_vab", 0)
    for r in rows.values():
        for k in ("won_value", "won_vab", "orders_value", "orders_vab"):
            r[k] = round(r[k], 2)
    return {"rows": sorted(rows.values(), key=lambda r: -r["orders_value"])}


@api.get("/analytics/by-manufacturer")
async def by_manufacturer(user: dict = Depends(get_current_user)):
    manufs = {m["id"]: m for m in await db.manufacturers.find({}, {"_id": 0}).to_list(1000)}
    products = {p["id"]: p for p in await db.products.find({}, {"_id": 0}).to_list(2000)}
    opps = await db.opportunities.find({}, {"_id": 0}).to_list(5000)
    props = await db.proposals.find({}, {"_id": 0}).to_list(5000)
    rows = {}
    def row(mid):
        m = manufs.get(mid, {"name": "(sem fabricante)"})
        return rows.setdefault(mid or "none", {"manufacturer_id": mid, "name": m.get("name") or "(sem fabricante)", "opps": 0, "opps_value": 0.0, "props": 0, "won": 0, "won_value": 0.0, "won_vab": 0.0})
    # opportunities directly ref
    for o in opps:
        r = row(o.get("manufacturer_id"))
        r["opps"] += 1; r["opps_value"] += o.get("estimated_value", 0)
    # proposals: aggregate via product manufacturer_id from lines
    for p in props:
        seen = set()
        for l in p.get("lines", []):
            pid = l.get("product_id")
            mid = products.get(pid, {}).get("manufacturer_id") if pid else None
            key = mid or "none"
            if key in seen: continue
            seen.add(key)
            r = row(mid)
            r["props"] += 1
            if p["status"] == "ganha":
                r["won"] += 1
                r["won_value"] += p.get("total_net", 0)
                r["won_vab"] += p.get("total_vab", 0)
    for r in rows.values():
        for k in ("opps_value", "won_value", "won_vab"): r[k] = round(r[k], 2)
    return {"rows": sorted(rows.values(), key=lambda r: -r["won_value"])}


@api.get("/analytics/forecast/invoicing")
async def forecast_invoicing(months: int = 6, user: dict = Depends(get_current_user)):
    plan_lines = await db.plan_lines.find({"status": {"$in": ["planeada", "parcialmente_faturada"]}}, {"_id": 0}).to_list(5000)
    buckets = {}
    for pl in plan_lines:
        exp = pl.get("expected_date")
        if not exp: continue
        k = _month_key(exp)
        b = buckets.setdefault(k, {"month": k, "planned_value": 0.0, "planned_vab": 0.0, "remaining_value": 0.0, "count": 0})
        b["planned_value"] += pl["value"]
        b["planned_vab"] += pl["vab"]
        b["remaining_value"] += (pl["value"] - pl.get("invoiced_amount", 0))
        b["count"] += 1
    rows = sorted(buckets.values(), key=lambda r: r["month"])
    for r in rows:
        for k in ("planned_value", "planned_vab", "remaining_value"): r[k] = round(r[k], 2)
    return {"months": rows}


@api.get("/analytics/forecast/receiving")
async def forecast_receiving(user: dict = Depends(get_current_user)):
    invoices = await db.invoices.find({"status": {"$in": ["emitida", "parcialmente_recebida"]}}, {"_id": 0}).to_list(5000)
    now = datetime.now(timezone.utc)
    buckets = {"em_atraso": 0.0, "0_30": 0.0, "31_60": 0.0, "61_90": 0.0, "gt_90": 0.0}
    total_open = 0.0
    for inv in invoices:
        open_amt = inv["total_net"] - inv.get("received_amount", 0)
        if open_amt <= 0.01: continue
        total_open += open_amt
        try:
            d = datetime.fromisoformat(inv["issued_at"].replace("Z", "+00:00"))
            days = (now - d).days
        except Exception:
            days = 0
        if days > 30 and open_amt > 0:
            buckets["em_atraso"] += open_amt
        elif days <= 30: buckets["0_30"] += open_amt
        elif days <= 60: buckets["31_60"] += open_amt
        elif days <= 90: buckets["61_90"] += open_amt
        else: buckets["gt_90"] += open_amt
    return {
        "total_open": round(total_open, 2),
        "buckets": {k: round(v, 2) for k, v in buckets.items()},
        "count": len(invoices),
    }


@api.get("/analytics/vab")
async def vab_analysis(user: dict = Depends(get_current_user)):
    opps = await db.opportunities.find({"status": {"$in": ["aberta", "em_analise"]}}, {"_id": 0}).to_list(5000)
    props_won = await db.proposals.find({"status": "ganha"}, {"_id": 0}).to_list(5000)
    plan_lines = await db.plan_lines.find({"status": {"$ne": "cancelada"}}, {"_id": 0}).to_list(5000)
    invoices = await db.invoices.find({"status": {"$ne": "anulada"}}, {"_id": 0}).to_list(5000)
    # VAB margin by month (won proposals)
    by_month = {}
    for p in props_won:
        k = _month_key(p.get("updated_at") or p.get("created_at", ""))
        b = by_month.setdefault(k, {"month": k, "value": 0.0, "vab": 0.0})
        b["value"] += p.get("total_net", 0); b["vab"] += p.get("total_vab", 0)
    monthly = sorted(by_month.values(), key=lambda r: r["month"])
    for m in monthly:
        m["margin_pct"] = round((m["vab"] / m["value"] * 100) if m["value"] else 0, 1)
        m["value"] = round(m["value"], 2); m["vab"] = round(m["vab"], 2)
    return {
        "pipeline_vab": round(sum(o.get("estimated_vab", 0) for o in opps), 2),
        "won_vab": round(sum(p.get("total_vab", 0) for p in props_won), 2),
        "planned_vab": round(sum(pl["vab"] for pl in plan_lines), 2),
        "invoiced_vab": round(sum(i["total_vab"] for i in invoices), 2),
        "monthly": monthly,
    }


@api.get("/analytics/executive")
async def executive(user: dict = Depends(get_current_user)):
    kpis = await kpis_summary()
    fi = await forecast_invoicing(months=6, user=user)
    fr = await forecast_receiving(user=user)
    vab = await vab_analysis(user=user)
    return {"kpis": kpis, "forecast_invoicing": fi["months"], "forecast_receiving": fr, "vab": vab}


async def kpis_summary():
    leads = await db.leads.find({}, {"_id": 0}).to_list(5000)
    opps = await db.opportunities.find({}, {"_id": 0}).to_list(5000)
    props = await db.proposals.find({}, {"_id": 0}).to_list(5000)
    orders = await db.orders.find({}, {"_id": 0}).to_list(5000)
    won = [p for p in props if p["status"] == "ganha"]
    return {
        "leads": len(leads),
        "opps": len(opps),
        "props": len(props),
        "orders": len(orders),
        "won_value": round(sum(p.get("total_net", 0) for p in won), 2),
        "won_vab": round(sum(p.get("total_vab", 0) for p in won), 2),
        "orders_value": round(sum(o.get("total_net", 0) for o in orders), 2),
        "fulfilled": len([o for o in orders if o["status"] == "fulfilled"]),
    }


# ------------- Technical / Projects Module -------------
@api.get("/projects")
async def list_projects(user: dict = Depends(get_current_user)):
    return await db.projects.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)


@api.post("/projects")
async def create_project(payload: dict, user: dict = Depends(get_current_user)):
    if not payload.get("order_id"):
        raise HTTPException(400, "order_id obrigatório")
    order = await _get_order(payload["order_id"])
    doc = {
        "id": new_id(),
        "order_id": order["id"],
        "client_id": order["client_id"],
        "name": payload.get("name") or f"Projeto {order['number']}",
        "hours_forecast": float(payload.get("hours_forecast") or 0),
        "hourly_billable": float(payload.get("hourly_billable") or 0),
        "status": "aberto",
        "created_at": now_iso(),
    }
    await db.projects.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/projects/{pid}")
async def get_project(pid: str, user: dict = Depends(get_current_user)):
    p = await db.projects.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Projeto não encontrado")
    return p


@api.patch("/projects/{pid}")
async def update_project(pid: str, payload: dict, user: dict = Depends(get_current_user)):
    payload.pop("id", None)
    await db.projects.update_one({"id": pid}, {"$set": payload})
    return await db.projects.find_one({"id": pid}, {"_id": 0})


@api.get("/projects/{pid}/allocations")
async def list_allocations(pid: str, user: dict = Depends(get_current_user)):
    return await db.allocations.find({"project_id": pid}, {"_id": 0}).to_list(500)


@api.post("/projects/{pid}/allocations")
async def add_allocation(pid: str, payload: dict, user: dict = Depends(get_current_user)):
    await get_project(pid, user)
    u = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0, "password_hash": 0})
    if not u:
        raise HTTPException(404, "Utilizador não encontrado")
    doc = {
        "id": new_id(),
        "project_id": pid,
        "user_id": payload["user_id"],
        "user_name": u["name"],
        "hourly_cost": float(payload.get("hourly_cost") or 0),
        "hours_forecast": float(payload.get("hours_forecast") or 0),
        "created_at": now_iso(),
    }
    await db.allocations.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/projects/{pid}/allocations/{aid}")
async def remove_allocation(pid: str, aid: str, user: dict = Depends(get_current_user)):
    entries = await db.time_entries.count_documents({"allocation_id": aid})
    if entries > 0:
        raise HTTPException(400, "Alocação tem registos de horas — não pode ser removida")
    await db.allocations.delete_one({"id": aid, "project_id": pid})
    return {"ok": True}


@api.get("/projects/{pid}/time-entries")
async def list_time_entries(pid: str, user: dict = Depends(get_current_user)):
    return await db.time_entries.find({"project_id": pid}, {"_id": 0}).sort("date", -1).to_list(2000)


@api.post("/projects/{pid}/time-entries")
async def add_time_entry(pid: str, payload: dict, user: dict = Depends(get_current_user)):
    await get_project(pid, user)
    alloc = await db.allocations.find_one({"id": payload["allocation_id"], "project_id": pid}, {"_id": 0})
    if not alloc:
        raise HTTPException(400, "Alocação inválida para este projeto")
    hours = float(payload["hours"])
    if hours <= 0:
        raise HTTPException(400, "Horas deve ser > 0")
    doc = {
        "id": new_id(),
        "project_id": pid,
        "allocation_id": alloc["id"],
        "user_id": alloc["user_id"],
        "user_name": alloc["user_name"],
        "date": payload.get("date") or now_iso()[:10],
        "hours": hours,
        "hourly_cost": alloc["hourly_cost"],
        "cost": round(hours * alloc["hourly_cost"], 2),
        "billable": bool(payload.get("billable", True)),
        "description": payload.get("description", ""),
        "created_at": now_iso(),
    }
    await db.time_entries.insert_one(doc)
    return doc


@api.get("/projects/{pid}/summary")
async def project_summary(pid: str, user: dict = Depends(get_current_user)):
    p = await get_project(pid, user)
    order = await _get_order(p["order_id"])
    allocs = await db.allocations.find({"project_id": pid}, {"_id": 0}).to_list(500)
    entries = await db.time_entries.find({"project_id": pid}, {"_id": 0}).to_list(5000)

    hours_forecast = sum(a["hours_forecast"] for a in allocs)
    hours_actual = sum(e["hours"] for e in entries)
    hours_billable = sum(e["hours"] for e in entries if e["billable"])
    cost_forecast = sum(a["hours_forecast"] * a["hourly_cost"] for a in allocs)
    cost_actual = sum(e["cost"] for e in entries)

    order_value = order["total_net"]
    order_vab = order["total_vab"]
    vab_real = round(order_value - cost_actual, 2)
    vab_delta = round(vab_real - order_vab, 2)
    revenue_billable = round(hours_billable * p.get("hourly_billable", 0), 2)

    # linhas de plano de tipo consumo_horas para este pedido
    consumo_lines = await db.plan_lines.find({"order_id": p["order_id"], "type": "consumo_horas"}, {"_id": 0}).to_list(500)
    consumo_planeado = sum(l["value"] for l in consumo_lines)
    consumo_faturado = sum(l.get("invoiced_amount", 0) for l in consumo_lines)

    by_dev = {}
    for e in entries:
        b = by_dev.setdefault(e["user_id"], {"user_id": e["user_id"], "user_name": e["user_name"], "hours": 0.0, "cost": 0.0, "billable_hours": 0.0})
        b["hours"] += e["hours"]
        b["cost"] += e["cost"]
        if e["billable"]: b["billable_hours"] += e["hours"]
    for b in by_dev.values():
        b["hours"] = round(b["hours"], 2); b["cost"] = round(b["cost"], 2); b["billable_hours"] = round(b["billable_hours"], 2)

    return {
        "project": p,
        "order": {"number": order["number"], "value": order_value, "vab_planeado": order_vab},
        "hours": {
            "forecast": round(hours_forecast, 2),
            "actual": round(hours_actual, 2),
            "billable": round(hours_billable, 2),
            "delta": round(hours_actual - hours_forecast, 2),
        },
        "cost": {
            "forecast": round(cost_forecast, 2),
            "actual": round(cost_actual, 2),
            "delta": round(cost_actual - cost_forecast, 2),
        },
        "vab": {
            "planeado": order_vab,
            "real": vab_real,
            "delta": vab_delta,
        },
        "billable": {
            "revenue_projected": revenue_billable,
            "consumo_planeado": round(consumo_planeado, 2),
            "consumo_faturado": round(consumo_faturado, 2),
            "consumo_por_faturar": round(consumo_planeado - consumo_faturado, 2),
        },
        "by_developer": sorted(by_dev.values(), key=lambda r: -r["hours"]),
    }


# ------------- Audit / Exports / Timesheet -------------
from fastapi.responses import Response
import csv
import io


async def _audit(action: str, entity: str, entity_id: str, before, after, user: dict, reason: str = ""):
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


@api.get("/audit")
async def list_audit(entity: Optional[str] = None, entity_id: Optional[str] = None, limit: int = 100, user: dict = Depends(get_current_user)):
    q = {}
    if entity: q["entity"] = entity
    if entity_id: q["entity_id"] = entity_id
    docs = await db.audit_log.find(q, {"_id": 0}).sort("at", -1).to_list(min(limit, 500))
    return {"rows": docs}


def _csv_response(rows: list, fields: list, filename: str) -> Response:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=fields, extrasaction="ignore")
    w.writeheader()
    for r in rows: w.writerow(r)
    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@api.get("/exports/invoices.csv")
async def export_invoices(user: dict = Depends(get_current_user)):
    invoices = await db.invoices.find({}, {"_id": 0}).sort("issued_at", -1).to_list(5000)
    clients = {c["id"]: c["name"] for c in await db.clients.find({}, {"_id": 0}).to_list(2000)}
    orders = {o["id"]: o["number"] for o in await db.orders.find({}, {"_id": 0}).to_list(2000)}
    rows = [{
        "numero": i["number"], "data": i["issued_at"][:10],
        "cliente": clients.get(i["client_id"], ""), "encomenda": orders.get(i["order_id"], ""),
        "total_sem_iva": i["total_net"], "iva": i["total_vat"], "total_com_iva": i["total_gross"],
        "vab": i["total_vab"], "recebido": i.get("received_amount", 0),
        "estado": i["status"],
    } for i in invoices]
    return _csv_response(rows, ["numero", "data", "cliente", "encomenda", "total_sem_iva", "iva", "total_com_iva", "vab", "recebido", "estado"], "faturas.csv")


@api.get("/exports/timesheet.csv")
async def export_timesheet(project_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"project_id": project_id} if project_id else {}
    entries = await db.time_entries.find(q, {"_id": 0}).sort("date", -1).to_list(10000)
    projects = {p["id"]: p["name"] for p in await db.projects.find({}, {"_id": 0}).to_list(1000)}
    rows = [{
        "data": e["date"], "projeto": projects.get(e["project_id"], ""),
        "developer": e["user_name"], "horas": e["hours"], "custo": e["cost"],
        "faturavel": "sim" if e["billable"] else "nao",
        "descricao": e.get("description", ""),
    } for e in entries]
    return _csv_response(rows, ["data", "projeto", "developer", "horas", "custo", "faturavel", "descricao"], "timesheet.csv")


@api.get("/exports/reporting-commercial.csv")
async def export_reporting_commercial(user: dict = Depends(get_current_user)):
    data = await by_commercial(user)
    return _csv_response(data["rows"], ["name", "role", "leads", "opps", "props", "won", "lost", "conversion_rate", "won_value", "won_vab", "orders_value", "orders_vab"], "reporting-comerciais.csv")


# Timesheet self-service (developers ver o seu próprio + registar rapidamente)
@api.get("/me/time-entries")
async def my_time_entries(user: dict = Depends(get_current_user)):
    entries = await db.time_entries.find({"user_id": user["id"]}, {"_id": 0}).sort("date", -1).to_list(2000)
    projects = {p["id"]: p for p in await db.projects.find({}, {"_id": 0}).to_list(1000)}
    total_hours = round(sum(e["hours"] for e in entries), 2)
    total_billable = round(sum(e["hours"] for e in entries if e["billable"]), 2)
    for e in entries: e["project_name"] = projects.get(e["project_id"], {}).get("name", "—")
    return {"entries": entries, "total_hours": total_hours, "total_billable": total_billable}


@api.get("/me/allocations")
async def my_allocations(user: dict = Depends(get_current_user)):
    allocs = await db.allocations.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    projects = {p["id"]: p for p in await db.projects.find({}, {"_id": 0}).to_list(1000)}
    for a in allocs:
        p = projects.get(a["project_id"], {})
        a["project_name"] = p.get("name", "—")
    return {"allocations": allocs}


# ------------- Notifications (Resend) -------------


class TestEmailRequest(BaseModel):
    recipient_email: EmailStr
    subject: Optional[str] = "WhyMob CRM — Teste de email"
    html_content: Optional[str] = None


def _send_resend_email(recipient: str, subject: str, html: str) -> dict:
    """Sync helper that calls Resend SDK. Called via asyncio.to_thread."""
    params = {
        "from": SENDER_EMAIL,
        "to": [recipient],
        "subject": subject,
        "html": html,
    }
    return resend.Emails.send(params)


@api.post("/notifications/test-email")
async def send_test_email(req: TestEmailRequest, user: dict = Depends(require_roles("admin", "ceo"))):
    if not os.environ.get("RESEND_API_KEY"):
        raise HTTPException(500, "RESEND_API_KEY não configurado")
    html = req.html_content or (
        '<div style="font-family:system-ui,sans-serif;padding:24px">'
        '<h2 style="color:#002FA7;margin:0 0 12px">WhyMob CRM</h2>'
        '<p>Este é um email de teste enviado a partir da plataforma.</p>'
        f'<p style="color:#888;font-size:12px">Enviado por {user.get("email")}</p>'
        '</div>'
    )
    try:
        email = await asyncio.to_thread(_send_resend_email, req.recipient_email, req.subject, html)
        return {"status": "success", "email_id": email.get("id"), "to": req.recipient_email}
    except Exception as e:
        logger.error(f"Falha a enviar email: {e}")
        raise HTTPException(500, f"Falha a enviar email: {str(e)}")


@api.post("/notifications/send-alerts-digest")
async def send_alerts_digest(payload: dict = None, user: dict = Depends(require_roles("admin", "ceo"))):
    if not os.environ.get("RESEND_API_KEY"):
        raise HTTPException(500, "RESEND_API_KEY não configurado")
    to = (payload or {}).get("to") or user.get("email") or os.environ.get("ADMIN_EMAIL")
    if not to:
        raise HTTPException(400, "Destinatário em falta")
    data = await alerts(user=user)
    items = data["alerts"]
    if not items:
        return {"sent": False, "reason": "Sem alertas a enviar"}

    level_colors = {"info": "#002FA7", "warning": "#B45309", "danger": "#B91C1C"}
    rows_html = "".join(
        f'<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:{level_colors.get(a["level"],"#111")};font-family:monospace;font-size:11px;text-transform:uppercase">{a["level"]}</td>'
        f'<td style="padding:8px 12px;border-bottom:1px solid #eee">{a["message"]}</td></tr>'
        for a in items
    )
    html = f"""
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
    subject = f"[WhyMob] {len(items)} alertas ativos"
    try:
        email = await asyncio.to_thread(_send_resend_email, to, subject, html)
        return {"sent": True, "to": to, "count": len(items), "email_id": email.get("id")}
    except Exception as e:
        logger.error(f"Resend erro: {e}")
        raise HTTPException(500, f"Resend erro: {str(e)}")


# ------------- Seed placeholder -------------
async def seed_startup():
    await db.users.create_index("email", unique=True)
    await db.clients.create_index("id", unique=True)

    seeds = [
        ("admin@whymob.pt", "admin123", "Admin WhyMob", "admin"),
        ("comercial@whymob.pt", "comercial123", "João Silva", "comercial"),
        ("diretor@whymob.pt", "diretor123", "Maria Costa", "diretor_tecnico"),
        ("ceo@whymob.pt", "ceo123", "Pedro Almeida", "ceo"),
    ]
    for email, pw, name, role in seeds:
        existing = await db.users.find_one({"email": email})
        if not existing:
            await db.users.insert_one({
                "id": new_id(),
                "email": email, "name": name, "role": role,
                "password_hash": hash_password(pw),
                "active": True, "created_at": now_iso(),
            })
        elif not verify_password(pw, existing["password_hash"]):
            await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(pw)}})

    # Sample master data + funnel demo if empty
    if await db.clients.count_documents({}) == 0:
        clients_seed = [
            {"name": "Banco Atlântico", "nif": "509123456", "segment": "Enterprise", "contact_person": "Ana Ribeiro", "contact_email": "ana@atlantico.pt"},
            {"name": "Retalho Norte SA", "nif": "512987654", "segment": "PME", "contact_person": "Miguel Santos", "contact_email": "miguel@rn.pt"},
            {"name": "Câmara de Lisboa", "nif": "500051070", "segment": "Público", "contact_person": "Rui Marques", "contact_email": "rui@cml.pt"},
            {"name": "TechStart Lda", "nif": "515223344", "segment": "PME", "contact_person": "Sofia Lopes", "contact_email": "sofia@techstart.pt"},
        ]
        for c in clients_seed:
            c.update({"id": new_id(), "address": "Lisboa, Portugal", "contact_phone": "+351 210 000 000", "active": True, "created_at": now_iso()})
            await db.clients.insert_one(c)

    if await db.manufacturers.count_documents({}) == 0:
        for name, ptype in [("Microsoft", "Revenda"), ("Cisco", "Revenda"), ("Fortinet", "Implementação"), ("Red Hat", "Suporte")]:
            await db.manufacturers.insert_one({
                "id": new_id(), "name": name, "partnership_type": ptype,
                "active": True, "created_at": now_iso(),
            })

    if await db.products.count_documents({}) == 0:
        products_seed = [
            ("Microsoft 365 E3", "licenciamento", "mes", 36.0, 22.0),
            ("Consultoria Cloud", "horas", "hora", 95.0, 55.0),
            ("Firewall Fortigate 100F", "projeto", "unidade", 3500.0, 2400.0),
            ("Suporte Anual Premium", "recorrente", "mes", 850.0, 400.0),
            ("Setup Migração M365", "setup", "projeto", 4500.0, 2500.0),
        ]
        for name, cat, unit, price, cost in products_seed:
            await db.products.insert_one({
                "id": new_id(), "name": name, "manufacturer_id": None,
                "category": cat, "unit": unit, "base_price": price, "base_cost": cost,
                "active": True, "created_at": now_iso(),
            })

    if await db.leads.count_documents({}) == 0:
        clients = await db.clients.find({}, {"_id": 0}).to_list(20)
        comercial = await db.users.find_one({"email": "comercial@whymob.pt"})
        cid = clients[0]["id"] if clients else None
        cid2 = clients[1]["id"] if len(clients) > 1 else None
        cid3 = clients[2]["id"] if len(clients) > 2 else None
        base_leads = [
            {"client_id": cid, "description": "Renovação licenciamento M365 para 250 utilizadores", "estimated_value": 45000, "status": "em_qualificacao"},
            {"client_id": cid2, "description": "Substituição de firewalls e revisão de rede", "estimated_value": 28000, "status": "nova"},
            {"client_id": cid3, "description": "Consultoria em migração para cloud híbrida", "estimated_value": 120000, "status": "em_qualificacao"},
        ]
        for l in base_leads:
            l.update({
                "id": new_id(), "manufacturer_id": None, "product_ids": [],
                "owner_id": comercial["id"] if comercial else "system",
                "client_name_raw": "", "lost_reason": "", "converted_opportunity_id": None,
                "created_at": now_iso(), "updated_at": now_iso(),
            })
            await db.leads.insert_one(l)


@app.on_event("startup")
async def on_startup():
    try:
        await seed_startup()
        logger.info("Seed OK")
    except Exception as e:
        logger.exception("Seed error: %s", e)


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


@api.get("/")
async def root():
    return {"service": "WhyMob CRM", "ok": True}


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
