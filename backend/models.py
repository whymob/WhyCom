"""Pydantic models for WhyMob CRM."""
from typing import List, Optional, Literal
from pydantic import BaseModel, Field, EmailStr, ConfigDict

from deps import new_id, now_iso


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
    client_name_raw: Optional[str] = ""
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
    probability: int = 50
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


class PlanLineIn(BaseModel):
    type: Literal["setup", "mensalidade", "trimestralidade", "anuidade", "avos", "consumo_horas", "projeto", "outros"] = "projeto"
    description: str = ""
    expected_date: Optional[str] = None
    value: float = 0.0
    vab: float = 0.0


class InvoiceLineIn(BaseModel):
    plan_line_id: str
    amount: float
    vab: float = 0.0
    description: str = ""


class TestEmailRequest(BaseModel):
    recipient_email: EmailStr
    subject: Optional[str] = "WhyMob CRM — Teste de email"
    html_content: Optional[str] = None


class AlertsDigestRequest(BaseModel):
    to: Optional[EmailStr] = None


def compute_proposal_totals(lines: List[ProposalLine]):
    net = sum(ln.net for ln in lines)
    vat = sum(ln.vat for ln in lines)
    gross = sum(ln.gross for ln in lines)
    vab = sum(ln.vab for ln in lines)
    return round(net, 2), round(vat, 2), round(gross, 2), round(vab, 2)
