"""Database seed on startup."""
import os
from datetime import datetime, timedelta, timezone

from deps import db, now_iso, new_id, hash_password, verify_password


async def seed_startup():
    await db.users.create_index("email", unique=True)
    await db.clients.create_index("id", unique=True)

    # Índices das listagens e das relações mais consultadas. A criação é
    # idempotente e ocorre também em instalações existentes.
    for collection, fields in {
        db.leads: [("id", True), ("status", False), ("created_at", False), ("client_id", False), ("owner_id", False)],
        db.opportunities: [("id", True), ("status", False), ("created_at", False), ("client_id", False), ("owner_id", False)],
        db.proposals: [("id", True), ("number", True), ("status", False), ("created_at", False), ("updated_at", False), ("client_id", False), ("opportunity_id", False)],
        db.orders: [("id", True), ("number", True), ("status", False), ("order_date", False), ("created_at", False), ("client_id", False), ("proposal_id", False)],
    }.items():
        for field, unique in fields:
            await collection.create_index(field, unique=unique)

    # Fila diária e quadro comercial: primeiro a carteira/estado e depois o
    # prazo, que são os campos usados simultaneamente nas novas consultas.
    await db.opportunities.create_index([("owner_id", 1), ("status", 1), ("expected_close_date", 1)])
    await db.proposals.create_index([("owner_id", 1), ("status", 1), ("next_follow_up_date", 1)])
    await db.proposals.create_index([("status", 1), ("next_follow_up_date", 1)])
    await db.orders.create_index([("owner_id", 1), ("status", 1), ("created_at", -1)])

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
                "email": email,
                "name": name,
                "role": role,
                "password_hash": hash_password(pw),
                "active": True,
                "created_at": now_iso(),
            })
        elif not verify_password(pw, existing["password_hash"]):
            await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(pw)}})

    if await db.clients.count_documents({}) == 0:
        clients_seed = [
            {"name": "Banco Atlântico", "nif": "509123456", "segment": "Enterprise", "contact_person": "Ana Ribeiro", "contact_email": "ana@atlantico.pt"},
            {"name": "Retalho Norte SA", "nif": "512987654", "segment": "PME", "contact_person": "Miguel Santos", "contact_email": "miguel@rn.pt"},
            {"name": "Câmara de Lisboa", "nif": "500051070", "segment": "Público", "contact_person": "Rui Marques", "contact_email": "rui@cml.pt"},
            {"name": "TechStart Lda", "nif": "515223344", "segment": "PME", "contact_person": "Sofia Lopes", "contact_email": "sofia@techstart.pt"},
        ]
        for client in clients_seed:
            client.update({
                "id": new_id(),
                "address": "Lisboa, Portugal",
                "contact_phone": "+351 210 000 000",
                "active": True,
                "created_at": now_iso(),
            })
            await db.clients.insert_one(client)

    if await db.manufacturers.count_documents({}) == 0:
        for name, partnership_type in [
            ("Microsoft", "Revenda"),
            ("Cisco", "Revenda"),
            ("Fortinet", "Implementação"),
            ("Red Hat", "Suporte"),
        ]:
            await db.manufacturers.insert_one({
                "id": new_id(),
                "name": name,
                "partnership_type": partnership_type,
                "active": True,
                "created_at": now_iso(),
            })

    if await db.products.count_documents({}) == 0:
        products_seed = [
            ("Microsoft 365 E3", "licenciamento", "mes", 36.0, 22.0),
            ("Consultoria Cloud", "horas", "hora", 95.0, 55.0),
            ("Firewall Fortigate 100F", "projeto", "unidade", 3500.0, 2400.0),
            ("Suporte Anual Premium", "recorrente", "mes", 850.0, 400.0),
            ("Setup Migração M365", "setup", "projeto", 4500.0, 2500.0),
        ]
        for name, category, unit, price, cost in products_seed:
            await db.products.insert_one({
                "id": new_id(),
                "name": name,
                "manufacturer_id": None,
                "category": category,
                "unit": unit,
                "base_price": price,
                "base_cost": cost,
                "active": True,
                "created_at": now_iso(),
            })

    demo_mode = any(os.environ.get(name, "false").lower() in {"1", "true", "yes"} for name in ("WORKSPACE_DEMO_DATA", "FUNNEL_DEMO_DATA"))
    if await db.leads.count_documents({}) == 0 and not demo_mode:
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
        for lead in base_leads:
            lead.update({
                "id": new_id(),
                "manufacturer_id": None,
                "product_ids": [],
                "owner_id": comercial["id"] if comercial else "system",
                "client_name_raw": "",
                "lost_reason": "",
                "converted_opportunity_id": None,
                "created_at": now_iso(),
                "updated_at": now_iso(),
            })
            await db.leads.insert_one(lead)

    if os.environ.get("WORKSPACE_DEMO_DATA", "false").lower() in {"1", "true", "yes"}:
        await seed_workspace_demo()
        await seed_funnel_cohorts_demo()
        await tune_2024_funnel_demo()
    elif os.environ.get("FUNNEL_DEMO_DATA", "false").lower() in {"1", "true", "yes"}:
        await seed_funnel_cohorts_demo()
        await tune_2024_funnel_demo()


async def seed_workspace_demo():
    """Dados ricos, mas exclusivamente para validar o ambiente workspace."""
    marker = "commercial-workflow-v1"
    if await db.workspace_demo_seed.find_one({"id": marker}):
        return

    clients = await db.clients.find({}, {"_id": 0, "id": 1}).to_list(20)
    commercial = await db.users.find_one({"email": "comercial@whymob.pt"}, {"_id": 0, "id": 1})
    if not clients or not commercial:
        return
    client_ids = [client["id"] for client in clients]
    owner_id = commercial["id"]
    now = datetime.now(timezone.utc)
    created_at = now_iso()

    async def add_lead(index: int, description: str, status: str, value: float):
        await db.leads.insert_one({
            "id": new_id(), "client_id": client_ids[index % len(client_ids)], "client_name_raw": "",
            "description": description, "manufacturer_id": None, "product_ids": [], "estimated_value": value,
            "owner_id": owner_id, "status": status, "lost_reason": "", "converted_opportunity_id": None,
            "created_at": created_at, "updated_at": created_at, "workspace_demo": True,
        })

    for index, description, status, value in [
        (0, "Avaliação de segurança e continuidade de negócio", "nova", 18000),
        (1, "Renovação de licenças Microsoft 365", "em_qualificacao", 54000),
        (2, "Projeto de modernização de infraestrutura", "em_qualificacao", 96000),
        (3, "Serviços de suporte para equipa remota", "nova", 22000),
        (4, "Auditoria de rede e recomendações", "nova", 12500),
        (5, "Expansão de capacidade cloud", "em_qualificacao", 67000),
    ]:
        await add_lead(index, description, status, value)

    opportunity_specs = [
        ("Migração para cloud híbrida", "aberta", 85000, 34000, -2),
        ("Renovação de firewall e segurança", "em_analise", 42000, 15500, 0),
        ("Serviço gerido de backups", "aberta", 26000, 9800, 3),
        ("Licenciamento e suporte Microsoft", "em_analise", 74000, 29000, 7),
        ("Projeto de integração documental", "aberta", 58000, 22000, 12),
    ]
    for index, (description, status, value, vab, close_in_days) in enumerate(opportunity_specs):
        await db.opportunities.insert_one({
            "id": new_id(), "lead_id": None, "client_id": client_ids[index % len(client_ids)], "description": description,
            "manufacturer_id": None, "product_ids": [], "estimated_value": value, "estimated_vab": vab,
            "probability": 50, "expected_close_date": (now + timedelta(days=close_in_days)).date().isoformat(),
            "next_follow_up_date": (now + timedelta(days=close_in_days)).date().isoformat(), "next_follow_up_type": "follow_up", "follow_up_history": [],
            "priority": "media", "competitor": "", "notes": "Registo criado para validação do quadro comercial.",
            "owner_id": owner_id, "status": status, "lost_reason": "", "converted_proposal_id": None,
            "created_at": created_at, "updated_at": created_at, "workspace_demo": True,
        })

    async def add_proposal(index: int, description: str, status: str, value: float, vab: float, follow_in_days: int | None, converted_order_id=None):
        proposal = {
            "id": new_id(), "number": f"DEMO-PROP-{now.year}-{index:03d}", "version": 1,
            "opportunity_id": "", "client_id": client_ids[index % len(client_ids)], "description": description,
            "previous_proposal_id": None, "replacement_reason": "", "replacement_proposal_id": None,
            "lines": [{"description": description, "quantity": 1, "unit": "projeto", "unit_price": value, "discount_pct": 0, "vat_pct": 23, "unit_cost": value - vab}],
            "valid_until": (now + timedelta(days=30)).date().isoformat(), "notes": "Dados de demonstração.",
            "expected_close_date": (now + timedelta(days=follow_in_days)).date().isoformat() if follow_in_days is not None else None,
            "next_follow_up_date": (now + timedelta(days=follow_in_days)).date().isoformat() if follow_in_days is not None else None,
            "next_follow_up_type": "follow_up", "follow_up_history": [],
            "owner_id": owner_id, "status": status, "lost_reason": "", "converted_order_id": converted_order_id,
            "total_net": value, "total_vat": round(value * 0.23, 2), "total_gross": round(value * 1.23, 2), "total_vab": vab, "probability": 100,
            "created_at": created_at, "updated_at": created_at, "workspace_demo": True,
        }
        await db.proposals.insert_one(proposal)
        return proposal

    for index, description, status, value, vab, follow_days in [
        (1, "Serviço de suporte avançado", "em_elaboracao", 14500, 6100, -4),
        (2, "Modernização de rede", "enviada", 38000, 14700, 0),
        (3, "Licenciamento anual e serviços", "em_negociacao", 62500, 23900, 2),
        (4, "Plano de continuidade de negócio", "enviada", 29500, 11200, 6),
        (5, "Implementação de segurança", "em_negociacao", 47000, 17800, 11),
    ]:
        await add_proposal(index, description, status, value, vab, follow_days)

    for index, description, value, vab in [
        (6, "Projeto aprovado de colaboração", 51000, 20200),
        (7, "Serviços geridos aprovados", 36500, 14200),
    ]:
        await add_proposal(index, description, "ganha", value, vab, None)

    for index, description, value, vab in [
        (8, "Renovação anual contratada", 72000, 28100),
        (9, "Projeto de infraestrutura contratado", 89000, 34400),
        (10, "Serviços cloud contratados", 41500, 15900),
    ]:
        order_id = new_id()
        proposal = await add_proposal(index, description, "ganha", value, vab, None, order_id)
        await db.orders.insert_one({
            "id": order_id, "number": f"DEMO-ENC-{now.year}-{index:03d}", "po_number": "", "proposal_id": proposal["id"],
            "opportunity_id": "", "client_id": proposal["client_id"], "order_date": created_at,
            "total_net": value, "total_vat": round(value * 0.23, 2), "total_gross": round(value * 1.23, 2), "total_vab": vab,
            "commercial_terms": "Dados de demonstração.", "owner_id": owner_id, "status": "aberta",
            "cancel_reason": "", "created_at": created_at, "workspace_demo": True,
        })

    await db.workspace_demo_seed.insert_one({"id": marker, "created_at": created_at})


async def seed_funnel_cohorts_demo():
    """Seed linked funnel cohorts in the isolated local workspace database."""
    marker = "funnel-cohorts-v1"
    if await db.workspace_demo_seed.find_one({"id": marker}):
        return

    clients = await db.clients.find({}, {"_id": 0, "id": 1}).to_list(100)
    manufacturers = await db.manufacturers.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(100)
    commercial = await db.users.find_one({"email": "comercial@whymob.pt"}, {"_id": 0, "id": 1})
    if not clients or not manufacturers or not commercial:
        return

    owner_id = commercial["id"]
    manufacturer_ids = [item["id"] for item in manufacturers]
    product_ids = []
    for index, manufacturer in enumerate(manufacturers):
        product_id = new_id()
        product_ids.append(product_id)
        await db.products.insert_one({
            "id": product_id,
            "name": f"Demo Funnel Product {index + 1}",
            "manufacturer_id": manufacturer["id"],
            "category": "projeto",
            "unit": "projeto",
            "base_price": 10000 + index * 1000,
            "base_cost": 7000 + index * 500,
            "active": True,
            "created_at": now_iso(),
            "workspace_demo": True,
        })

    for year in sorted({2024, 2025, datetime.now(timezone.utc).year}):
        opportunity_limit = 4 if year == 2024 else 6
        proposal_limit = 2 if year == 2024 else 4
        order_limit = 1 if year == 2024 else 2
        for index in range(8):
            client_id = clients[(index + year) % len(clients)]["id"]
            manufacturer_index = index % len(manufacturer_ids)
            manufacturer_id = manufacturer_ids[manufacturer_index]
            product_id = product_ids[manufacturer_index]
            base_value = 24000 + index * 7500 + (year - 2024) * 2500
            base_vab = round(base_value * 0.28, 2)
            lead_id = new_id()
            lead_date = datetime(year, index + 1, 5, 12, tzinfo=timezone.utc)
            lead_created = lead_date.isoformat()
            opp_id = new_id() if index < opportunity_limit else None
            await db.leads.insert_one({
                "id": lead_id,
                "client_id": client_id,
                "client_name_raw": "",
                "description": f"Demo funnel {year} - scenario {index + 1:02d}",
                "manufacturer_id": manufacturer_id,
                "product_ids": [product_id],
                "estimated_value": base_value,
                "owner_id": owner_id,
                "status": "convertida" if opp_id else ("em_qualificacao" if index == 6 else "nova"),
                "lost_reason": "",
                "converted_opportunity_id": opp_id,
                "converted_at": (lead_date + timedelta(days=3)).isoformat() if opp_id else None,
                "created_at": lead_created,
                "updated_at": lead_created,
                "workspace_demo": True,
            })
            if not opp_id:
                continue

            opp_date = lead_date + timedelta(days=3)
            proposal_id = new_id() if index < proposal_limit else None
            opportunity = {
                "id": opp_id,
                "lead_id": lead_id,
                "client_id": client_id,
                "description": f"Demo funnel opportunity {year} - scenario {index + 1:02d}",
                "manufacturer_id": manufacturer_id,
                "product_ids": [product_id],
                "estimated_value": base_value,
                "estimated_vab": base_vab,
                "probability": min(90, 40 + index * 8),
                "expected_close_date": (opp_date + timedelta(days=45)).date().isoformat(),
                "next_follow_up_date": (opp_date + timedelta(days=10)).date().isoformat(),
                "next_follow_up_type": "follow_up",
                "follow_up_history": [],
                "priority": "media",
                "competitor": "",
                "notes": "Local funnel demo data.",
                "owner_id": owner_id,
                "status": "convertida" if proposal_id else ("em_analise" if index == 4 else "aberta"),
                "lost_reason": "",
                "converted_proposal_id": proposal_id,
                "created_at": opp_date.isoformat(),
                "updated_at": opp_date.isoformat(),
                "workspace_demo": True,
            }
            await db.opportunities.insert_one(opportunity)
            if not proposal_id:
                continue

            proposal_date = opp_date + timedelta(days=8)
            proposal_status = "perdida" if year == 2024 and index == 1 else ("ganha" if index < order_limit else ("enviada" if index == 2 else "em_negociacao"))
            order_id = new_id() if index < order_limit else None
            proposal_value = round(base_value * 0.94, 2)
            proposal_vab = round(proposal_value * 0.27, 2)
            proposal = {
                "id": proposal_id,
                "number": f"DEMO-FUNNEL-{year}-{index + 1:02d}",
                "version": 1,
                "opportunity_id": opp_id,
                "client_id": client_id,
                "description": opportunity["description"],
                "previous_proposal_id": None,
                "replacement_reason": "",
                "replacement_proposal_id": None,
                "lines": [{
                    "product_id": product_id,
                    "description": f"Demo funnel product {index + 1:02d}",
                    "quantity": 1,
                    "unit": "projeto",
                    "unit_price": proposal_value,
                    "discount_pct": 0,
                    "vat_pct": 23,
                    "unit_cost": round(proposal_value - proposal_vab, 2),
                }],
                "valid_until": (proposal_date + timedelta(days=30)).date().isoformat(),
                "notes": "Local funnel demo data.",
                "sent_at": proposal_date.isoformat() if proposal_status != "em_elaboracao" else None,
                "sent_to": "",
                "status_change_reason": "",
                "expected_close_date": (proposal_date + timedelta(days=30)).date().isoformat(),
                "next_follow_up_date": (proposal_date + timedelta(days=7)).date().isoformat(),
                "next_follow_up_type": "follow_up",
                "follow_up_history": [],
                "attachment": None,
                "owner_id": owner_id,
                "status": proposal_status,
                "lost_reason": "Demo: cliente selecionou outra proposta." if proposal_status == "perdida" else "",
                "converted_order_id": order_id,
                "total_net": proposal_value,
                "total_vat": round(proposal_value * 0.23, 2),
                "total_gross": round(proposal_value * 1.23, 2),
                "total_vab": proposal_vab,
                "probability": 100 if proposal_status == "ganha" else 60,
                "created_at": proposal_date.isoformat(),
                "updated_at": proposal_date.isoformat(),
                "workspace_demo": True,
            }
            await db.proposals.insert_one(proposal)
            if order_id:
                order_date = proposal_date + timedelta(days=14)
                await db.orders.insert_one({
                    "id": order_id,
                    "number": f"DEMO-FUNNEL-ORDER-{year}-{index + 1:02d}",
                    "po_number": "",
                    "proposal_id": proposal_id,
                    "opportunity_id": opp_id,
                    "client_id": client_id,
                    "order_date": order_date.isoformat(),
                    "total_net": proposal_value,
                    "total_vat": round(proposal_value * 0.23, 2),
                    "total_gross": round(proposal_value * 1.23, 2),
                    "total_vab": proposal_vab,
                    "commercial_terms": "Local funnel demo data.",
                    "owner_id": owner_id,
                    "status": "aberta",
                    "cancel_reason": "",
                    "status_change_reason": "",
                    "created_at": order_date.isoformat(),
                    "workspace_demo": True,
                })

    await db.workspace_demo_seed.insert_one({"id": marker, "created_at": now_iso()})


async def tune_2024_funnel_demo():
    """Make the seeded 2024 cohort intentionally harder than later years."""
    year_opportunities = await db.opportunities.find({
        "workspace_demo": True,
        "description": {"$regex": "^Demo funnel opportunity 2024 - scenario "},
    }, {"_id": 0, "id": 1, "lead_id": 1, "description": 1}) .to_list(100)
    if not year_opportunities:
        return

    remove_opportunities = [item for item in year_opportunities if item["description"].endswith(("05", "06"))]
    remove_opportunity_ids = [item["id"] for item in remove_opportunities]
    if remove_opportunity_ids:
        child_proposals = await db.proposals.find({"workspace_demo": True, "opportunity_id": {"$in": remove_opportunity_ids}}, {"_id": 0, "id": 1}).to_list(100)
        child_proposal_ids = [item["id"] for item in child_proposals]
        if child_proposal_ids:
            await db.orders.delete_many({"workspace_demo": True, "proposal_id": {"$in": child_proposal_ids}})
            await db.proposals.delete_many({"workspace_demo": True, "id": {"$in": child_proposal_ids}})
        await db.leads.update_many(
            {"workspace_demo": True, "converted_opportunity_id": {"$in": remove_opportunity_ids}},
            {"$set": {"status": "em_qualificacao", "converted_opportunity_id": None}, "$unset": {"converted_at": ""}},
        )
        await db.opportunities.delete_many({"workspace_demo": True, "id": {"$in": remove_opportunity_ids}})

    proposal_opportunity_ids = [item["id"] for item in year_opportunities if item["description"].endswith(("03", "04"))]
    if proposal_opportunity_ids:
        proposals_to_remove = await db.proposals.find({"workspace_demo": True, "opportunity_id": {"$in": proposal_opportunity_ids}}, {"_id": 0, "id": 1}).to_list(100)
        proposal_ids = [item["id"] for item in proposals_to_remove]
        if proposal_ids:
            await db.orders.delete_many({"workspace_demo": True, "proposal_id": {"$in": proposal_ids}})
            await db.proposals.delete_many({"workspace_demo": True, "id": {"$in": proposal_ids}})
        for opportunity in year_opportunities:
            if opportunity["id"] in proposal_opportunity_ids:
                status = "em_analise" if opportunity["description"].endswith("03") else "aberta"
                await db.opportunities.update_one(
                    {"workspace_demo": True, "id": opportunity["id"]},
                    {"$set": {"status": status, "converted_proposal_id": None}},
                )

    scenario_two = await db.opportunities.find_one({
        "workspace_demo": True,
        "description": "Demo funnel opportunity 2024 - scenario 02",
    }, {"_id": 0, "id": 1})
    if scenario_two:
        proposal = await db.proposals.find_one({"workspace_demo": True, "opportunity_id": scenario_two["id"]}, {"_id": 0, "id": 1})
        if proposal:
            await db.orders.delete_many({"workspace_demo": True, "proposal_id": proposal["id"]})
            await db.proposals.update_one(
                {"workspace_demo": True, "id": proposal["id"]},
                {"$set": {"status": "perdida", "lost_reason": "Demo: cliente selecionou outra proposta.", "converted_order_id": None}},
            )
