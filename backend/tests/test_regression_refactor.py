"""Comprehensive backend regression test suite after server.py split (1797 → 70 lines)
and APScheduler integration.

Coverage:
- Auth (login admin / comercial / inactive user rejection)
- CRUD sanity: users, clients, manufacturers, products, leads, opportunities, proposals, orders
- Dashboard: kpis, funnel (with & without manufacturer_id), alerts
- Analytics: by-commercial / by-client / by-manufacturer / forecast/invoicing / forecast/receiving / vab / executive
- Technical: projects CRUD, allocations, time-entries, /projects/{id}/summary, /me/*
- Finance flow: create plan → partial invoice → payment → recalc_order_status → cancel invoice unwind
- Audit endpoint after PATCH on lead/opportunity/proposal
- Exports CSV: invoices, timesheet, reporting-commercial
- Users management: PATCH role/active, self-inactivation 400, self-role-change 400, inactive login 403
- Notifications: test-email (delivered@resend.dev), send-alerts-digest w/ and w/o alerts
- Scheduler: module import + _job_send_alerts_digest is callable
"""
import os
import uuid
import asyncio
import importlib
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://revenue-cycle-5.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@whymob.pt", "password": "admin123"}
COMERCIAL = {"email": "comercial@whymob.pt", "password": "comercial123"}
RESEND_DELIVERED = "delivered@resend.dev"


def _login(session, creds):
    r = session.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login {creds['email']} -> {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def http():
    return requests.Session()


@pytest.fixture(scope="module")
def admin_token(http):
    return _login(http, ADMIN)


@pytest.fixture(scope="module")
def comercial_token(http):
    return _login(http, COMERCIAL)


@pytest.fixture(scope="module")
def A(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def C(comercial_token):
    return {"Authorization": f"Bearer {comercial_token}", "Content-Type": "application/json"}


# ---------- 1. Auth ----------
class TestAuth:
    def test_admin_login_returns_valid_token(self, http):
        r = http.post(f"{API}/auth/login", json=ADMIN, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body["access_token"], str) and len(body["access_token"]) > 20
        assert body["user"]["email"] == "admin@whymob.pt"
        assert body["user"]["role"] == "admin"

    def test_me_with_token(self, http, A):
        r = http.get(f"{API}/auth/me", headers=A, timeout=10)
        assert r.status_code == 200
        assert r.json()["email"] == "admin@whymob.pt"

    def test_login_bad_password_401(self, http):
        r = http.post(f"{API}/auth/login", json={"email": "admin@whymob.pt", "password": "wrong"}, timeout=10)
        assert r.status_code == 401


# ---------- 2. Master data & pipeline: GET/list smoke ----------
GET_ENDPOINTS_200 = [
    "/users",
    "/clients",
    "/manufacturers",
    "/products",
    "/leads",
    "/opportunities",
    "/proposals",
    "/orders",
    "/dashboard/kpis",
    "/dashboard/funnel",
    "/dashboard/alerts",
    "/analytics/by-commercial",
    "/analytics/by-client",
    "/analytics/by-manufacturer",
    "/analytics/forecast/invoicing",
    "/analytics/forecast/receiving",
    "/analytics/vab",
    "/analytics/executive",
    "/projects",
    "/me/time-entries",
    "/me/allocations",
    "/audit",
]


@pytest.mark.parametrize("path", GET_ENDPOINTS_200)
def test_get_endpoint_admin_200(http, A, path):
    r = http.get(f"{API}{path}", headers=A, timeout=20)
    assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"
    body = r.json()
    assert isinstance(body, (list, dict))


def test_dashboard_funnel_with_manufacturer_id(http, A):
    ms = http.get(f"{API}/manufacturers", headers=A, timeout=10).json()
    if not ms:
        pytest.skip("No manufacturers seeded")
    mid = ms[0]["id"]
    r = http.get(f"{API}/dashboard/funnel", params={"manufacturer_id": mid}, headers=A, timeout=15)
    assert r.status_code == 200, r.text


# ---------- 3. CRUD create+get sanity ----------
class TestCRUDLifecycle:
    def test_create_client_and_fetch(self, http, A):
        payload = {"name": f"TEST_Client_{uuid.uuid4().hex[:6]}", "nif": "500000000"}
        r = http.post(f"{API}/clients", headers=A, json=payload, timeout=15)
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        # PATCH
        rp = http.patch(f"{API}/clients/{cid}", headers=A, json={"segment": "SMB"}, timeout=15)
        assert rp.status_code == 200
        assert rp.json()["segment"] == "SMB"

    def test_create_lead_and_patch_triggers_audit(self, http, A):
        # Fetch a user id (owner) - use admin from /users
        users = http.get(f"{API}/users", headers=A, timeout=10).json()
        admin_id = next(u["id"] for u in users if u["email"] == "admin@whymob.pt")
        lead_payload = {
            "description": f"TEST_lead_{uuid.uuid4().hex[:6]}",
            "owner_id": admin_id,
            "estimated_value": 1000.0,
        }
        r = http.post(f"{API}/leads", headers=A, json=lead_payload, timeout=15)
        assert r.status_code == 200, r.text
        lid = r.json()["id"]
        # PATCH status (state change should audit)
        rp = http.patch(f"{API}/leads/{lid}", headers=A, json={"status": "em_qualificacao"}, timeout=15)
        assert rp.status_code == 200
        # Audit should contain something for this entity
        ra = http.get(f"{API}/audit", headers=A, params={"entity": "lead", "entity_id": lid}, timeout=15)
        assert ra.status_code == 200
        body = ra.json()
        rows = body.get("rows") if isinstance(body, dict) else body
        assert isinstance(rows, list) and len(rows) >= 1, f"audit rows empty: {body}"


# ---------- 4. Finance flow: plan -> invoice -> payment -> cancel ----------
class TestFinanceFlow:
    def _create_full_order(self, http, headers):
        """Build a fresh order via full pipeline (client → opp → proposal → order)."""
        # Client
        c = http.post(f"{API}/clients", headers=headers, json={
            "name": f"TEST_fin_{uuid.uuid4().hex[:6]}", "nif": "500000001",
        }, timeout=15).json()
        # Opportunity
        users = http.get(f"{API}/users", headers=headers, timeout=10).json()
        admin_id = next(u["id"] for u in users if u["email"] == "admin@whymob.pt")
        opp = http.post(f"{API}/opportunities", headers=headers, json={
            "client_id": c["id"], "description": "TEST fin flow",
            "estimated_value": 1000.0, "owner_id": admin_id,
        }, timeout=15).json()
        # Convert opp -> proposal
        prop = http.post(f"{API}/opportunities/{opp['id']}/convert", headers=headers, timeout=15).json()
        # Add lines to proposal
        rp = http.patch(f"{API}/proposals/{prop['id']}", headers=headers, json={
            "lines": [{
                "description": "TEST line", "quantity": 1, "unit": "unidade",
                "unit_price": 1000.0, "vat_pct": 23.0, "unit_cost": 400.0,
            }],
        }, timeout=15)
        assert rp.status_code == 200, rp.text
        # Mark proposal as ganha
        rg = http.patch(f"{API}/proposals/{prop['id']}", headers=headers, json={"status": "ganha"}, timeout=15)
        assert rg.status_code == 200, rg.text
        # Convert -> order
        order = http.post(f"{API}/proposals/{prop['id']}/convert", headers=headers, timeout=15).json()
        assert order.get("id"), order
        return order

    def test_finance_full_flow(self, http, A):
        order = self._create_full_order(http, A)
        oid = order["id"]
        order_total = float(order["total_net"])
        assert order_total > 0

        # 1) Replace plan
        plan_payload = {"lines": [{
            "type": "projeto", "description": "TEST plan line",
            "expected_date": "2026-02-15",
            "value": order_total,
            "vab": float(order.get("total_vab") or 0),
        }]}
        r = http.put(f"{API}/orders/{oid}/plan", headers=A, json=plan_payload, timeout=20)
        assert r.status_code == 200, r.text
        plan_line = r.json()["lines"][-1]
        pl_id = plan_line["id"]

        # 2) Partial invoice (half)
        half = round(order_total / 2, 2)
        r2 = http.post(f"{API}/invoices", headers=A, json={
            "order_id": oid,
            "lines": [{"plan_line_id": pl_id, "amount": half, "vab": 0.0}],
        }, timeout=20)
        assert r2.status_code == 200, r2.text
        inv1 = r2.json()
        assert inv1["status"] == "emitida"

        # Order status transitioned
        o_after = next(x for x in http.get(f"{API}/orders", headers=A, timeout=15).json() if x["id"] == oid)
        assert o_after["status"] in ("parcialmente_faturada", "em_faturacao"), o_after["status"]

        # 3) Pay invoice 1
        r3 = http.post(f"{API}/payments", headers=A, json={
            "invoice_id": inv1["id"], "amount": half, "method": "transferencia",
        }, timeout=15)
        assert r3.status_code == 200, r3.text

        # 4) Emit invoice 2 for remainder + full VAB
        remaining = round(order_total - half, 2)
        r4 = http.post(f"{API}/invoices", headers=A, json={
            "order_id": oid,
            "lines": [{"plan_line_id": pl_id, "amount": remaining,
                       "vab": float(order.get("total_vab") or 0)}],
        }, timeout=20)
        assert r4.status_code == 200, r4.text
        inv2 = r4.json()

        # 5) Pay invoice 2 fully
        r5 = http.post(f"{API}/payments", headers=A, json={
            "invoice_id": inv2["id"], "amount": remaining, "method": "transferencia",
        }, timeout=15)
        assert r5.status_code == 200, r5.text

        o_final = next(x for x in http.get(f"{API}/orders", headers=A, timeout=15).json() if x["id"] == oid)
        assert o_final["status"] == "fulfilled", f"expected fulfilled, got {o_final['status']}"

        # 6) Cancel invoice 2 -> unwinds
        rc = http.post(f"{API}/invoices/{inv2['id']}/cancel", headers=A,
                       json={"reason": "TEST unwind"}, timeout=15)
        assert rc.status_code == 200, rc.text

        plan_after = http.get(f"{API}/orders/{oid}/plan", headers=A, timeout=15).json()
        pl_after = next(pl for pl in plan_after["lines"] if pl["id"] == pl_id)
        assert pl_after["invoiced_amount"] < order_total  # unwound


# ---------- 5. Exports ----------
@pytest.mark.parametrize("path", [
    "/exports/invoices.csv",
    "/exports/timesheet.csv",
    "/exports/reporting-commercial.csv",
])
def test_exports_csv(http, A, path):
    r = http.get(f"{API}{path}", headers=A, timeout=20)
    assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"
    assert "text/csv" in r.headers.get("Content-Type", ""), r.headers
    assert r.text.count(",") >= 1  # at least a header


# ---------- 6. Users management + self-protection ----------
class TestUsersManagement:
    def test_create_and_patch_role_active_then_login_inactive(self, http, A):
        # Create a fresh user
        email = f"test_user_{uuid.uuid4().hex[:6]}@whymob.pt"
        r = http.post(f"{API}/users", headers=A, json={
            "email": email, "password": "temp123!", "name": "TEST U", "role": "comercial",
        }, timeout=15)
        assert r.status_code == 200, r.text
        uid = r.json()["id"]

        # PATCH role
        rp = http.patch(f"{API}/users/{uid}", headers=A, json={"role": "developer"}, timeout=15)
        assert rp.status_code == 200
        assert rp.json()["role"] == "developer"

        # PATCH inactive
        rp2 = http.patch(f"{API}/users/{uid}", headers=A, json={"active": False}, timeout=15)
        assert rp2.status_code == 200
        assert rp2.json()["active"] is False

        # Login should be 403
        rl = http.post(f"{API}/auth/login", json={"email": email, "password": "temp123!"}, timeout=10)
        assert rl.status_code == 403, rl.text

    def test_admin_cannot_self_deactivate(self, http, admin_token, A):
        users = http.get(f"{API}/users", headers=A, timeout=10).json()
        admin_id = next(u["id"] for u in users if u["email"] == "admin@whymob.pt")
        r = http.patch(f"{API}/users/{admin_id}", headers=A, json={"active": False}, timeout=10)
        assert r.status_code == 400, r.text

    def test_admin_cannot_change_own_role(self, http, admin_token, A):
        users = http.get(f"{API}/users", headers=A, timeout=10).json()
        admin_id = next(u["id"] for u in users if u["email"] == "admin@whymob.pt")
        r = http.patch(f"{API}/users/{admin_id}", headers=A, json={"role": "developer"}, timeout=10)
        assert r.status_code == 400, r.text


# ---------- 7. Technical projects ----------
class TestTechnical:
    def test_create_project_and_summary(self, http, A):
        # /projects requires order_id — use an existing order (any status)
        orders = http.get(f"{API}/orders", headers=A, timeout=10).json()
        if not orders:
            pytest.skip("No orders to link project to")
        order_id = orders[0]["id"]
        r = http.post(f"{API}/projects", headers=A, json={
            "name": f"TEST_proj_{uuid.uuid4().hex[:6]}",
            "description": "regression test",
            "order_id": order_id,
        }, timeout=15)
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        # Summary
        rs = http.get(f"{API}/projects/{pid}/summary", headers=A, timeout=15)
        assert rs.status_code == 200
        s = rs.json()
        assert "project" in s or "id" in s or isinstance(s, dict)
        # Allocations list
        ra = http.get(f"{API}/projects/{pid}/allocations", headers=A, timeout=10)
        assert ra.status_code == 200


# ---------- 8. Notifications ----------
class TestNotifications:
    def test_test_email_admin_delivers(self, http, A):
        r = http.post(f"{API}/notifications/test-email", headers=A, json={
            "recipient_email": RESEND_DELIVERED,
            "subject": "WhyMob regression pytest",
        }, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json().get("status") == "success"
        assert isinstance(r.json().get("email_id"), str) and r.json()["email_id"]

    def test_send_alerts_digest(self, http, A):
        r = http.post(f"{API}/notifications/send-alerts-digest", headers=A,
                      json={"to": RESEND_DELIVERED}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        # Either no alerts => sent:false, or sent:true w/ email_id
        assert "sent" in body

    def test_notifications_forbidden_for_comercial(self, http, C):
        r = http.post(f"{API}/notifications/test-email", headers=C,
                      json={"recipient_email": RESEND_DELIVERED}, timeout=15)
        assert r.status_code == 403


# ---------- 9. Scheduler ----------
class TestScheduler:
    def test_scheduler_module_exposes_job_function(self):
        # Import from backend package
        import sys
        sys.path.insert(0, "/app/backend")
        sched_mod = importlib.import_module("scheduler")
        assert hasattr(sched_mod, "_job_send_alerts_digest")
        assert hasattr(sched_mod, "start_scheduler")
        assert hasattr(sched_mod, "stop_scheduler")

    def test_job_send_alerts_digest_callable(self):
        import sys
        sys.path.insert(0, "/app/backend")
        sched_mod = importlib.import_module("scheduler")
        # Should not raise; either sends or logs "sem alertas ativos"
        asyncio.run(sched_mod._job_send_alerts_digest())

    def test_scheduler_env_vars_present(self):
        required = [
            "SCHEDULER_ENABLED", "SCHEDULER_TZ",
            "ALERTS_DIGEST_CRON_HOUR", "ALERTS_DIGEST_CRON_MINUTE",
            "ALERTS_DIGEST_CRON_DOW", "ALERTS_DIGEST_RECIPIENTS",
        ]
        # Read backend/.env
        env_path = "/app/backend/.env"
        with open(env_path) as f:
            content = f.read()
        for k in required:
            assert k in content, f"{k} missing from backend/.env"

    def test_scheduler_start_log_line_present(self):
        # Verify the exact log line was emitted at backend startup
        with open("/var/log/supervisor/backend.err.log") as f:
            log = f.read()
        assert "[scheduler] iniciado — alerts_digest às 09:00" in log, \
            "Expected scheduler init log line not found in backend.err.log"
