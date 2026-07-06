"""Backend tests for iteration 6 — VAB refactor.

New business rules:
1. VAB is only tracked up to Order phase (opportunity/proposal/order).
   Plan/Invoice/Payment no longer track VAB per line nor totals.
2. Payments are recorded in GROSS value (with VAT) — compared to invoice.total_gross.
3. Fulfilled reconciliation: order_net == plan_net == invoice_net AND received_gross == invoice_gross.
   VAB is NOT in the Fulfilled equation.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@whymob.pt", "password": "admin123"}


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
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def A(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


def _create_full_order(http, headers, unit_price=1000.0, unit_cost=400.0, vat_pct=23.0):
    """Build a fresh order via full pipeline (client → opp → proposal → order).
    Returns the order dict."""
    c = http.post(f"{API}/clients", headers=headers, json={
        "name": f"TEST_iter6_{uuid.uuid4().hex[:6]}",
        "nif": f"5{uuid.uuid4().hex[:8]}",
    }, timeout=15).json()
    users = http.get(f"{API}/users", headers=headers, timeout=10).json()
    admin_id = next(u["id"] for u in users if u["email"] == "admin@whymob.pt")
    opp = http.post(f"{API}/opportunities", headers=headers, json={
        "client_id": c["id"], "description": "TEST iter6",
        "estimated_value": unit_price, "owner_id": admin_id,
    }, timeout=15).json()
    prop = http.post(f"{API}/opportunities/{opp['id']}/convert", headers=headers, timeout=15).json()
    rp = http.patch(f"{API}/proposals/{prop['id']}", headers=headers, json={
        "lines": [{
            "description": "TEST line", "quantity": 1, "unit": "unidade",
            "unit_price": unit_price, "vat_pct": vat_pct, "unit_cost": unit_cost,
        }],
    }, timeout=15)
    assert rp.status_code == 200, rp.text
    rg = http.patch(f"{API}/proposals/{prop['id']}", headers=headers, json={"status": "ganha"}, timeout=15)
    assert rg.status_code == 200, rg.text
    order = http.post(f"{API}/proposals/{prop['id']}/convert", headers=headers, timeout=15).json()
    return order


# ==================== 1. VAB removed from Invoices ====================

class TestInvoiceNoVAB:
    def test_create_invoice_without_vab_field_returns_200(self, http, A):
        order = _create_full_order(http, A)
        oid = order["id"]
        total = float(order["total_net"])
        # Create plan without vab
        r = http.put(f"{API}/orders/{oid}/plan", headers=A, json={
            "lines": [{"type": "projeto", "description": "TEST plan",
                       "expected_date": "2026-02-15", "value": total}],
        }, timeout=15)
        assert r.status_code == 200, r.text
        pl_id = r.json()["lines"][-1]["id"]

        # Create invoice — no vab field on lines nor totals
        r2 = http.post(f"{API}/invoices", headers=A, json={
            "order_id": oid,
            "lines": [{"plan_line_id": pl_id, "amount": total}],
            "vat_pct": 23,
        }, timeout=20)
        assert r2.status_code == 200, r2.text
        inv = r2.json()
        # Must have total_net, total_vat, total_gross
        assert "total_net" in inv
        assert "total_vat" in inv
        assert "total_gross" in inv
        # Must NOT have total_vab field
        assert "total_vab" not in inv, f"invoice should not have total_vab, got {inv}"
        # Lines should not have vab either
        for ln in inv["lines"]:
            assert "vab" not in ln, f"invoice line should not have vab: {ln}"

        # Sanity: gross = net + vat
        assert abs(inv["total_gross"] - (inv["total_net"] + inv["total_vat"])) < 0.01


# ==================== 2. VAB removed from Plan ====================

class TestPlanNoVAB:
    def test_replace_plan_without_vab_field_returns_200(self, http, A):
        order = _create_full_order(http, A)
        oid = order["id"]
        total = float(order["total_net"])

        r = http.put(f"{API}/orders/{oid}/plan", headers=A, json={
            "lines": [{"type": "projeto", "description": "TEST plan no vab",
                       "expected_date": "2026-03-15", "value": total}],
        }, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "lines" in body
        assert len(body["lines"]) >= 1
        for ln in body["lines"]:
            assert "vab" not in ln, f"plan line should not have vab field: {ln}"
            # Must have value, invoiced_amount, status
            assert "value" in ln
            assert "invoiced_amount" in ln
            assert "status" in ln


# ==================== 3. Payment semantics — GROSS ====================

class TestPaymentGross:
    def _build_and_invoice(self, http, A):
        """Create order + plan + full invoice, return invoice dict."""
        order = _create_full_order(http, A)
        oid = order["id"]
        total = float(order["total_net"])
        r = http.put(f"{API}/orders/{oid}/plan", headers=A, json={
            "lines": [{"type": "projeto", "description": "TEST",
                       "expected_date": "2026-02-15", "value": total}],
        }, timeout=15)
        assert r.status_code == 200
        pl_id = r.json()["lines"][-1]["id"]
        r2 = http.post(f"{API}/invoices", headers=A, json={
            "order_id": oid,
            "lines": [{"plan_line_id": pl_id, "amount": total}],
            "vat_pct": 23,
        }, timeout=20)
        assert r2.status_code == 200
        return oid, r2.json()

    def test_payment_amount_equals_net_returns_partial(self, http, A):
        oid, inv = self._build_and_invoice(http, A)
        # amount = total_net < total_gross → parcialmente_recebida
        r = http.post(f"{API}/payments", headers=A, json={
            "invoice_id": inv["id"],
            "amount": inv["total_net"],
            "method": "transferencia",
        }, timeout=15)
        assert r.status_code == 200, r.text
        # Re-fetch invoice via list
        invs = http.get(f"{API}/invoices", headers=A, timeout=15).json()
        inv_after = next(i for i in invs if i["id"] == inv["id"])
        assert inv_after["status"] == "parcialmente_recebida", \
            f"expected parcialmente_recebida, got {inv_after['status']}"

    def test_payment_amount_equals_gross_marks_received(self, http, A):
        oid, inv = self._build_and_invoice(http, A)
        r = http.post(f"{API}/payments", headers=A, json={
            "invoice_id": inv["id"],
            "amount": inv["total_gross"],
            "method": "transferencia",
        }, timeout=15)
        assert r.status_code == 200, r.text
        invs = http.get(f"{API}/invoices", headers=A, timeout=15).json()
        inv_after = next(i for i in invs if i["id"] == inv["id"])
        assert inv_after["status"] == "recebida", \
            f"expected recebida, got {inv_after['status']}"

    def test_payment_amount_gt_gross_returns_400_with_gross_message(self, http, A):
        oid, inv = self._build_and_invoice(http, A)
        over_amount = inv["total_gross"] + 1.0
        r = http.post(f"{API}/payments", headers=A, json={
            "invoice_id": inv["id"],
            "amount": over_amount,
            "method": "transferencia",
        }, timeout=15)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
        # Error message must mention IVA / saldo em aberto
        detail = r.json().get("detail", "").lower()
        assert ("iva" in detail) or ("saldo" in detail), \
            f"expected message about saldo em aberto c/IVA, got: {detail}"


# ==================== 4. Reconcile shape ====================

class TestReconcileShape:
    def test_reconcile_response_shape(self, http, A):
        order = _create_full_order(http, A)
        oid = order["id"]
        total = float(order["total_net"])
        # Add plan
        http.put(f"{API}/orders/{oid}/plan", headers=A, json={
            "lines": [{"type": "projeto", "description": "TEST",
                       "expected_date": "2026-02-15", "value": total}],
        }, timeout=15)

        r = http.get(f"{API}/orders/{oid}/reconcile", headers=A, timeout=15)
        assert r.status_code == 200, r.text
        rec = r.json()

        # order still has vab
        assert "order" in rec
        assert "vab" in rec["order"], f"order block should keep vab: {rec['order']}"

        # plan must NOT have vab
        assert "plan" in rec
        assert "vab" not in rec["plan"], f"plan should NOT have vab: {rec['plan']}"

        # invoiced must NOT have vab, and MUST have gross
        assert "invoiced" in rec
        assert "vab" not in rec["invoiced"], f"invoiced should NOT have vab: {rec['invoiced']}"
        assert "gross" in rec["invoiced"], f"invoiced should have gross: {rec['invoiced']}"

        # deltas must NOT have vab_plan_vs_order nor vab_invoiced_vs_order
        assert "deltas" in rec
        deltas = rec["deltas"]
        assert "vab_plan_vs_order" not in deltas
        assert "vab_invoiced_vs_order" not in deltas
        # But should have plan_vs_order, invoiced_vs_plan, received_vs_invoiced
        assert "plan_vs_order" in deltas
        assert "invoiced_vs_plan" in deltas
        assert "received_vs_invoiced" in deltas


# ==================== 5. Fulfilled flow ====================

class TestFulfilledFlow:
    def test_fulfilled_transitions_on_gross_payment(self, http, A):
        """order net=1000, IVA 23% → plan 1000 → invoice full → payment 1230 (gross) → fulfilled."""
        order = _create_full_order(http, A, unit_price=1000.0)
        oid = order["id"]
        total_net = float(order["total_net"])
        assert abs(total_net - 1000.0) < 0.01

        # Plan
        r = http.put(f"{API}/orders/{oid}/plan", headers=A, json={
            "lines": [{"type": "projeto", "description": "TEST full",
                       "expected_date": "2026-02-15", "value": total_net}],
        }, timeout=15)
        assert r.status_code == 200
        pl_id = r.json()["lines"][-1]["id"]

        # Full invoice
        r2 = http.post(f"{API}/invoices", headers=A, json={
            "order_id": oid,
            "lines": [{"plan_line_id": pl_id, "amount": total_net}],
            "vat_pct": 23,
        }, timeout=20)
        assert r2.status_code == 200
        inv = r2.json()
        assert abs(inv["total_gross"] - 1230.0) < 0.01, f"expected gross=1230, got {inv['total_gross']}"

        # Full payment in gross
        r3 = http.post(f"{API}/payments", headers=A, json={
            "invoice_id": inv["id"],
            "amount": inv["total_gross"],
            "method": "transferencia",
        }, timeout=15)
        assert r3.status_code == 200, r3.text

        # Verify order status → fulfilled
        orders = http.get(f"{API}/orders", headers=A, timeout=15).json()
        o_final = next(o for o in orders if o["id"] == oid)
        assert o_final["status"] == "fulfilled", \
            f"expected fulfilled, got {o_final['status']}"

    def test_net_payment_does_NOT_reach_fulfilled(self, http, A):
        """Same scenario but pay only net → invoice=parcialmente_recebida, order not fulfilled."""
        order = _create_full_order(http, A, unit_price=1000.0)
        oid = order["id"]
        total_net = float(order["total_net"])

        r = http.put(f"{API}/orders/{oid}/plan", headers=A, json={
            "lines": [{"type": "projeto", "description": "TEST",
                       "expected_date": "2026-02-15", "value": total_net}],
        }, timeout=15)
        pl_id = r.json()["lines"][-1]["id"]

        r2 = http.post(f"{API}/invoices", headers=A, json={
            "order_id": oid,
            "lines": [{"plan_line_id": pl_id, "amount": total_net}],
            "vat_pct": 23,
        }, timeout=20)
        inv = r2.json()

        # Pay only net (less than gross)
        r3 = http.post(f"{API}/payments", headers=A, json={
            "invoice_id": inv["id"],
            "amount": total_net,  # net, not gross
            "method": "transferencia",
        }, timeout=15)
        assert r3.status_code == 200, r3.text

        # Invoice should be parcialmente_recebida
        invs = http.get(f"{API}/invoices", headers=A, timeout=15).json()
        inv_after = next(i for i in invs if i["id"] == inv["id"])
        assert inv_after["status"] == "parcialmente_recebida", \
            f"expected parcialmente_recebida, got {inv_after['status']}"

        # Order should NOT be fulfilled
        orders = http.get(f"{API}/orders", headers=A, timeout=15).json()
        o_after = next(o for o in orders if o["id"] == oid)
        assert o_after["status"] != "fulfilled", \
            f"order should NOT be fulfilled with net-only payment, got {o_after['status']}"


# ==================== 6. Analytics — /analytics/vab ====================

class TestAnalyticsVAB:
    def test_vab_endpoint_has_new_shape(self, http, A):
        r = http.get(f"{API}/analytics/vab", headers=A, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        # New required keys
        assert "pipeline_vab" in body, f"missing pipeline_vab: {body.keys()}"
        assert "won_vab" in body, f"missing won_vab: {body.keys()}"
        assert "orders_vab" in body, f"missing orders_vab: {body.keys()}"
        assert "monthly" in body, f"missing monthly: {body.keys()}"
        # Removed keys must NOT be present
        assert "planned_vab" not in body, f"planned_vab should be removed: {body}"
        assert "invoiced_vab" not in body, f"invoiced_vab should be removed: {body}"


# ==================== 7. Analytics — /analytics/forecast/invoicing ====================

class TestForecastInvoicing:
    def test_forecast_invoicing_shape(self, http, A):
        r = http.get(f"{API}/analytics/forecast/invoicing", headers=A, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "months" in body
        assert isinstance(body["months"], list)
        for m in body["months"]:
            assert "planned_value" in m, f"missing planned_value in {m}"
            assert "remaining_value" in m, f"missing remaining_value in {m}"
            assert "planned_vab" not in m, f"planned_vab should be removed: {m}"


# ==================== 8. Export /exports/invoices.csv — no vab column ====================

class TestExportInvoicesCSV:
    def test_invoices_csv_no_vab_column(self, http, A):
        r = http.get(f"{API}/exports/invoices.csv", headers=A, timeout=20)
        assert r.status_code == 200, r.text
        assert "text/csv" in r.headers.get("Content-Type", "")
        # Get first line = header
        header = r.text.split("\n")[0].lower()
        assert "vab" not in header, f"CSV header should not contain 'vab', got: {header}"
        # But should contain expected columns
        assert "total_sem_iva" in header
        assert "total_com_iva" in header


# ==================== 9. Regression — VAB tracking preserved up to Order ====================

class TestVABPreservedUpToOrder:
    def test_opportunity_estimated_vab_preserved(self, http, A):
        opps = http.get(f"{API}/opportunities", headers=A, timeout=15).json()
        # Each opp should have estimated_vab field (may be 0)
        assert isinstance(opps, list)
        if opps:
            # At least the schema field exists
            sample = opps[0]
            assert "estimated_vab" in sample, f"opportunity missing estimated_vab: {sample.keys()}"

    def test_proposal_has_total_vab_and_per_line_vab(self, http, A):
        props = http.get(f"{API}/proposals", headers=A, timeout=15).json()
        assert isinstance(props, list)
        if props:
            # find a proposal with lines
            p = next((p for p in props if p.get("lines")), None)
            if p:
                assert "total_vab" in p, f"proposal missing total_vab: {p.keys()}"
                # Per-line VAB is derived from unit_price and unit_cost (VAB = qty*(unit_price*(1-disc)) - qty*unit_cost)
                for ln in p["lines"]:
                    assert "unit_price" in ln, f"proposal line missing unit_price: {ln.keys()}"
                    assert "unit_cost" in ln, f"proposal line missing unit_cost (per-line VAB source): {ln.keys()}"

    def test_order_has_total_vab(self, http, A):
        orders = http.get(f"{API}/orders", headers=A, timeout=15).json()
        assert isinstance(orders, list)
        if orders:
            assert "total_vab" in orders[0], f"order missing total_vab: {orders[0].keys()}"
