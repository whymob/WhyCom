import os
import sys
from typing import Iterable

import requests


BASE_URL = os.environ.get("WHYCOM_BACKEND_URL", "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"
EMAIL = os.environ.get("WHYCOM_SMOKE_EMAIL", "admin@whymob.pt")
PASSWORD = os.environ.get("WHYCOM_SMOKE_PASSWORD", "admin123")

READ_ONLY_ENDPOINTS: Iterable[str] = (
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
)


def fail(message: str) -> None:
    print(f"[FAIL] {message}")
    raise SystemExit(1)


def ok(message: str) -> None:
    print(f"[OK] {message}")


def main() -> None:
    session = requests.Session()

    try:
        health = session.get(f"{API}/health", timeout=15)
    except Exception as exc:
        fail(f"health request error: {exc}")

    if health.status_code != 200:
        fail(f"/health -> {health.status_code} {health.text[:200]}")

    ok(f"/health -> 200 {health.json()}")

    login = session.post(
        f"{API}/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=15,
    )
    if login.status_code != 200:
        fail(f"/auth/login -> {login.status_code} {login.text[:200]}")

    body = login.json()
    token = body.get("access_token")
    if not token:
        fail("login succeeded but access_token missing")

    session.headers.update({"Authorization": f"Bearer {token}"})
    ok(f"/auth/login -> 200 ({EMAIL})")

    for path in READ_ONLY_ENDPOINTS:
        response = session.get(f"{API}{path}", timeout=20)
        if response.status_code != 200:
            fail(f"{path} -> {response.status_code} {response.text[:200]}")
        ok(f"{path} -> 200")

    print("[DONE] Read-only smoke check completed successfully.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
