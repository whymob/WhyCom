"""Backend tests for WhyMob CRM — Notifications (Resend) + regression sanity.

Endpoints under test:
- POST /api/notifications/test-email
- POST /api/notifications/send-alerts-digest

Regression:
- POST /api/auth/login
- GET  /api/leads, /api/opportunities, /api/orders
- GET  /api/dashboard/alerts, /api/dashboard/executive
"""
import os
import uuid
import pytest
import requests
from datetime import datetime, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://revenue-cycle-5.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@whymob.pt", "password": "admin123"}
COMERCIAL = {"email": "comercial@whymob.pt", "password": "comercial123"}
RESEND_DELIVERED = "delivered@resend.dev"


# ---------- Fixtures ----------

@pytest.fixture(scope="module")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(http, creds):
    r = http.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in login response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def admin_token(http):
    return _login(http, ADMIN)


@pytest.fixture(scope="module")
def comercial_token(http):
    return _login(http, COMERCIAL)


# ---------- Auth sanity ----------

def test_login_admin_returns_token(http):
    r = http.post(f"{API}/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200
    body = r.json()
    tok = body.get("access_token") or body.get("token")
    assert isinstance(tok, str) and len(tok) > 20


# ---------- Notifications: test-email ----------

def test_test_email_no_auth_returns_401_or_403(http):
    r = http.post(f"{API}/notifications/test-email",
                  json={"recipient_email": RESEND_DELIVERED}, timeout=15)
    assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}: {r.text}"


def test_test_email_forbidden_for_comercial(http, comercial_token):
    r = http.post(
        f"{API}/notifications/test-email",
        json={"recipient_email": RESEND_DELIVERED},
        headers={"Authorization": f"Bearer {comercial_token}"},
        timeout=15,
    )
    assert r.status_code == 403, f"expected 403 for role 'comercial', got {r.status_code}: {r.text}"


def test_test_email_invalid_payload_returns_422(http, admin_token):
    r = http.post(
        f"{API}/notifications/test-email",
        json={"recipient_email": "not-an-email"},
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=15,
    )
    assert r.status_code == 422, f"expected 422 on invalid email, got {r.status_code}: {r.text}"


def test_test_email_admin_success(http, admin_token):
    r = http.post(
        f"{API}/notifications/test-email",
        json={"recipient_email": RESEND_DELIVERED,
              "subject": "WhyMob CRM — pytest smoke"},
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=30,
    )
    assert r.status_code == 200, f"send failed: {r.status_code} {r.text}"
    body = r.json()
    assert body.get("status") == "success"
    assert body.get("to") == RESEND_DELIVERED
    email_id = body.get("email_id")
    assert isinstance(email_id, str) and len(email_id) > 0, f"missing email_id: {body}"


# ---------- Notifications: send-alerts-digest ----------

def test_alerts_digest_no_alerts_returns_sent_false(http, admin_token):
    """When there are no active alerts, endpoint returns sent:false."""
    # Snapshot current alerts
    r0 = http.get(f"{API}/dashboard/alerts",
                  headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r0.status_code == 200
    current = r0.json().get("alerts", [])

    r = http.post(
        f"{API}/notifications/send-alerts-digest",
        json={"to": RESEND_DELIVERED},
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=30,
    )
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    body = r.json()
    if not current:
        # No alerts — must be sent:false with reason
        assert body.get("sent") is False, f"expected sent:false, got {body}"
        assert "Sem alertas" in (body.get("reason") or "")
    else:
        # There are alerts already — should send successfully
        assert body.get("sent") is True, f"alerts exist ({len(current)}) but not sent: {body}"
        assert isinstance(body.get("email_id"), str) and body["email_id"]
        assert body.get("count") == len(current)


def test_alerts_digest_with_forced_alert(http, admin_token):
    """Force an alert by inserting a 'ganha' proposal directly in Mongo, then verify digest sends."""
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient

    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "whymob_db")

    forced_id = f"TEST_prop_{uuid.uuid4().hex[:8]}"
    forced_number = f"TEST-PROP-{uuid.uuid4().hex[:6].upper()}"
    doc = {
        "id": forced_id,
        "number": forced_number,
        "status": "ganha",
        "converted_order_id": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "_test_marker": "resend_digest_pytest",
    }

    async def _seed():
        client = AsyncIOMotorClient(mongo_url)
        db = client[db_name]
        await db.proposals.insert_one(doc)
        client.close()

    async def _cleanup():
        client = AsyncIOMotorClient(mongo_url)
        db = client[db_name]
        await db.proposals.delete_one({"id": forced_id})
        client.close()

    asyncio.run(_seed())
    try:
        # Confirm alert is visible
        ra = http.get(f"{API}/dashboard/alerts",
                      headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert ra.status_code == 200
        alerts = ra.json().get("alerts", [])
        assert any(a.get("ref_id") == forced_id for a in alerts), \
            f"forced alert not found in /dashboard/alerts: {alerts}"

        r = http.post(
            f"{API}/notifications/send-alerts-digest",
            json={"to": RESEND_DELIVERED},
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        body = r.json()
        assert body.get("sent") is True, f"expected sent:true, got {body}"
        assert body.get("to") == RESEND_DELIVERED
        assert isinstance(body.get("count"), int) and body["count"] >= 1
        assert isinstance(body.get("email_id"), str) and body["email_id"]
    finally:
        asyncio.run(_cleanup())


def test_alerts_digest_forbidden_for_comercial(http, comercial_token):
    r = http.post(
        f"{API}/notifications/send-alerts-digest",
        json={"to": RESEND_DELIVERED},
        headers={"Authorization": f"Bearer {comercial_token}"},
        timeout=15,
    )
    assert r.status_code == 403


# ---------- Regression sanity ----------

@pytest.mark.parametrize("path", [
    "/leads",
    "/opportunities",
    "/orders",
    "/dashboard/alerts",
    "/analytics/executive",
])
def test_regression_endpoints_admin(http, admin_token, path):
    r = http.get(f"{API}{path}",
                 headers={"Authorization": f"Bearer {admin_token}"}, timeout=20)
    assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"
    # basic shape assertion
    body = r.json()
    assert isinstance(body, (list, dict))
