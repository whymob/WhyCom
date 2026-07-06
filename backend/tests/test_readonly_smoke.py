import os

import pytest
import requests


BASE_URL = (
    os.environ.get("WHYCOM_BACKEND_URL")
    or os.environ.get("REACT_APP_BACKEND_URL")
    or "http://localhost:8000"
).rstrip("/")
API = f"{BASE_URL}/api"
EMAIL = os.environ.get("WHYCOM_SMOKE_EMAIL", "admin@whymob.pt")
PASSWORD = os.environ.get("WHYCOM_SMOKE_PASSWORD", "admin123")

READ_ONLY_ENDPOINTS = [
    "/auth/me",
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


@pytest.fixture(scope="module")
def http():
    return requests.Session()


@pytest.fixture(scope="module")
def auth_headers(http):
    response = http.post(
        f"{API}/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=15,
    )
    assert response.status_code == 200, response.text
    token = response.json().get("access_token")
    assert token, "login succeeded but access_token is missing"
    return {"Authorization": f"Bearer {token}"}


def test_health_readonly_no_auth(http):
    response = http.get(f"{API}/health", timeout=15)
    assert response.status_code == 200, response.text
    body = response.json()
    assert isinstance(body, dict)
    assert body.get("status") in {"ok", "degraded"}


@pytest.mark.parametrize("path", READ_ONLY_ENDPOINTS)
def test_readonly_endpoints_return_200(http, auth_headers, path):
    response = http.get(f"{API}{path}", headers=auth_headers, timeout=20)
    assert response.status_code == 200, f"{path} -> {response.status_code} {response.text[:200]}"
    assert isinstance(response.json(), (list, dict))
