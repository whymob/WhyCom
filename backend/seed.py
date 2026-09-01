"""Database seed on startup."""
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
