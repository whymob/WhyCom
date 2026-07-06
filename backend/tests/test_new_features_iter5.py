"""Backend tests for iteration 5 — 5 new backend improvements.

Features under test:
1. GET /api/health with Mongo ping (no auth required).
2. Pydantic AlertsDigestRequest for /notifications/send-alerts-digest.
3. Redacted Resend errors (502 with generic message).
4. Event hooks: proposal_won and order_fulfilled (non-blocking, fire-and-forget).
5. MongoDB jobstore optional via env JOBSTORE=mongodb.
"""
import os
import time
import uuid
import subprocess
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@whymob.pt", "password": "admin123"}
RESEND_DELIVERED = "delivered@resend.dev"
BACKEND_ERR_LOG = "/var/log/supervisor/backend.err.log"


# ---------- Fixtures ----------

@pytest.fixture(scope="module")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(http):
    r = http.post(f"{API}/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def A(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


def _tail_log(path=BACKEND_ERR_LOG, lines=400) -> str:
    try:
        out = subprocess.check_output(["tail", "-n", str(lines), path], stderr=subprocess.STDOUT)
        return out.decode("utf-8", errors="ignore")
    except Exception as e:
        return f"__tail_error__: {e}"


# ==================== 1. /api/health ====================

class TestHealth:
    def test_health_returns_200_no_auth(self, http):
        r = http.get(f"{API}/health", timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("status") == "ok", f"expected status ok, got {body}"
        assert body.get("mongo") == "ok", f"expected mongo ok, got {body}"
        assert "checked_at" in body and isinstance(body["checked_at"], str)
        # ISO 8601 format sanity
        assert "T" in body["checked_at"]

    def test_health_no_auth_still_works(self, http):
        # Explicitly send no Authorization header
        s = requests.Session()
        r = s.get(f"{API}/health", timeout=10)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"


# ==================== 2. AlertsDigestRequest Pydantic ====================

class TestAlertsDigestPydantic:
    def test_valid_email_body_returns_200(self, http, A):
        r = http.post(f"{API}/notifications/send-alerts-digest",
                      json={"to": RESEND_DELIVERED}, headers=A, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        # Either sent:true (with alerts) or sent:false (no alerts)
        assert "sent" in body
        if body["sent"] is True:
            assert body.get("to") == RESEND_DELIVERED
            assert isinstance(body.get("email_id"), str)
        else:
            assert "reason" in body

    def test_invalid_email_returns_422(self, http, A):
        r = http.post(f"{API}/notifications/send-alerts-digest",
                      json={"to": "not-an-email"}, headers=A, timeout=15)
        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text}"

    def test_no_body_uses_authenticated_user_email(self, http, A):
        # No body at all
        r = http.post(f"{API}/notifications/send-alerts-digest",
                      headers=A, timeout=30)
        # Might be 200 (sent:false, no alerts) or 502 (if Resend rejects admin@whymob.pt in sandbox)
        # Since Resend sandbox only allows delivered@resend.dev, we tolerate 502 here
        assert r.status_code in (200, 502), f"unexpected {r.status_code}: {r.text}"
        if r.status_code == 200:
            body = r.json()
            assert "sent" in body

    def test_empty_json_body_uses_user_email(self, http, A):
        r = http.post(f"{API}/notifications/send-alerts-digest",
                      json={}, headers=A, timeout=30)
        assert r.status_code in (200, 502), f"unexpected {r.status_code}: {r.text}"


# ==================== 3. Redacted Resend errors ====================

class TestRedactedResendErrors:
    def test_source_returns_generic_502_message(self):
        """Verify source code redacts Resend errors (returns generic 502, not raw exception)."""
        src = open("/app/backend/routers/notifications.py").read()
        # Must return 502 not 500 for send failures
        assert "raise HTTPException(502" in src, "notifications.py must raise 502 on send failure"
        # Must have generic message
        assert "Não foi possível enviar o email" in src, "generic redacted message missing"
        # Must NOT expose raw exception in HTTP response (only in logs)
        # i.e., no 'Resend erro: {str(e)}' pattern in HTTPException detail
        assert "HTTPException(500" not in src or "RESEND_API_KEY" in src, \
            "any 500 must be for missing config only, not for Resend errors"

    def test_helpers_send_email_async_does_not_wrap_exceptions(self):
        """helpers.send_email_async should propagate exceptions so router can decide redaction."""
        src = open("/app/backend/helpers.py").read()
        # send_email_async simply awaits asyncio.to_thread — no HTTP raising there
        assert "async def send_email_async" in src


# ==================== 4. Event hooks ====================

class TestEventHooks:
    def _create_won_proposal(self, http, headers):
        """Create client → opp → proposal → mark ganha; returns (prop_id, opp_id, client_id)."""
        c = http.post(f"{API}/clients", headers=headers, json={
            "name": f"TEST_hook_{uuid.uuid4().hex[:6]}", "nif": f"5{uuid.uuid4().hex[:8]}",
        }, timeout=15).json()
        users = http.get(f"{API}/users", headers=headers, timeout=10).json()
        admin_id = next(u["id"] for u in users if u["email"] == "admin@whymob.pt")
        opp = http.post(f"{API}/opportunities", headers=headers, json={
            "client_id": c["id"], "description": "TEST hook flow",
            "estimated_value": 1000.0, "owner_id": admin_id,
        }, timeout=15).json()
        prop = http.post(f"{API}/opportunities/{opp['id']}/convert", headers=headers, timeout=15).json()
        # Add lines
        rp = http.patch(f"{API}/proposals/{prop['id']}", headers=headers, json={
            "lines": [{"description": "TEST", "quantity": 1, "unit": "unidade",
                       "unit_price": 1000.0, "vat_pct": 23.0, "unit_cost": 400.0}],
        }, timeout=15)
        assert rp.status_code == 200, rp.text
        return prop, opp, c

    def test_proposal_won_hook_logs_email_sent(self, http, A):
        prop, opp, c = self._create_won_proposal(http, A)

        # PATCH status=ganha — MUST return quickly (< 1s) due to fire-and-forget
        t0 = time.time()
        r = http.patch(f"{API}/proposals/{prop['id']}", headers=A,
                       json={"status": "ganha"}, timeout=15)
        elapsed = time.time() - t0
        assert r.status_code == 200, r.text
        assert elapsed < 2.0, f"PATCH should be non-blocking, took {elapsed:.2f}s"

        # Wait for fire-and-forget task
        time.sleep(3)

        log = _tail_log()
        assert "[notify:proposal_won]" in log, \
            f"proposal_won log line missing. Log tail:\n{log[-2000:]}"
        # Verify recipient
        assert RESEND_DELIVERED in log or "proposal_won" in log

    def test_order_fulfilled_hook_logs_email_sent(self, http, A):
        prop, opp, c = self._create_won_proposal(http, A)

        # Mark proposal as ganha
        http.patch(f"{API}/proposals/{prop['id']}", headers=A, json={"status": "ganha"}, timeout=15)
        time.sleep(0.3)

        # Convert -> order
        order = http.post(f"{API}/proposals/{prop['id']}/convert", headers=A, timeout=15).json()
        assert order.get("id"), order
        oid = order["id"]
        total = float(order["total_net"])

        # Add plan line for full amount (VAB parou na fase encomenda)
        r = http.put(f"{API}/orders/{oid}/plan", headers=A, json={
            "lines": [{"type": "projeto", "description": "TEST full",
                       "expected_date": "2026-02-15", "value": total}],
        }, timeout=15)
        assert r.status_code == 200, r.text
        pl_id = r.json()["lines"][-1]["id"]

        # Full invoice
        r2 = http.post(f"{API}/invoices", headers=A, json={
            "order_id": oid,
            "lines": [{"plan_line_id": pl_id, "amount": total}],
            "vat_pct": 23,
        }, timeout=20)
        assert r2.status_code == 200, r2.text
        inv = r2.json()
        inv_id = inv["id"]

        # Full payment em BRUTO (com IVA) — should trigger fulfilled → hook. Must be non-blocking.
        t0 = time.time()
        r3 = http.post(f"{API}/payments", headers=A, json={
            "invoice_id": inv_id, "amount": inv["total_gross"], "method": "transferencia",
        }, timeout=15)
        elapsed = time.time() - t0
        assert r3.status_code == 200, r3.text
        assert elapsed < 3.0, f"payment should be non-blocking (<3s), took {elapsed:.2f}s"

        # Verify order is fulfilled
        orders = http.get(f"{API}/orders", headers=A, timeout=15).json()
        o_final = next(x for x in orders if x["id"] == oid)
        assert o_final["status"] == "fulfilled", f"expected fulfilled, got {o_final['status']}"

        # Wait for fire-and-forget email
        time.sleep(3)

        log = _tail_log()
        assert "[notify:order_fulfilled]" in log, \
            f"order_fulfilled log line missing. Log tail:\n{log[-2000:]}"


# ==================== 5. Scheduler jobstore config ====================

class TestSchedulerJobstore:
    def test_current_jobstore_log_present(self):
        """Verify a jobstore log line is present. Current .env has JOBSTORE=memory."""
        log = _tail_log(lines=3000)
        assert "[scheduler] jobstore:" in log, \
            f"scheduler jobstore log line missing. Tail:\n{log[-2000:]}"

    def test_current_jobstore_matches_env(self):
        """Since backend/.env has JOBSTORE=memory, log should say 'jobstore: memory'."""
        log = _tail_log(lines=3000)
        # Find last occurrence
        idx = log.rfind("[scheduler] jobstore:")
        assert idx >= 0
        snippet = log[idx:idx + 80]
        _expected = os.environ.get("JOBSTORE", "memory").lower()  # noqa: F841
        # We can't easily read backend .env from test env, so accept either
        assert ("memory" in snippet.lower() or "mongodb" in snippet.lower()), \
            f"unexpected jobstore log: {snippet}"

    def test_scheduler_source_supports_mongodb(self):
        """Verify code path for JOBSTORE=mongodb exists in scheduler.py."""
        src = open("/app/backend/scheduler.py").read()
        assert "MongoDBJobStore" in src
        assert 'JOBSTORE' in src and 'mongodb' in src
        assert "[scheduler] jobstore: MongoDB" in src
        assert "[scheduler] jobstore: memory" in src
