import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from routers import exports_audit as reports


class Collection:
    def __init__(self, rows):
        self.rows = rows

    def find(self, query, projection):
        def matches(row):
            for key, value in query.items():
                if isinstance(value, dict):
                    if "$in" in value and row.get(key) not in value["$in"]:
                        return False
                    if "$ne" in value and row.get(key) == value["$ne"]:
                        return False
                elif row.get(key) != value:
                    return False
            return True

        rows = [dict(row) for row in self.rows if matches(row)]
        return SimpleNamespace(to_list=AsyncMock(return_value=rows))


@pytest.fixture
def billing(monkeypatch):
    orders = [dict(id=f"o{i}", client_id=f"c{i}", number=f"ENC-{i}", total_net=100, total_vab=20) for i in range(1, 5)]
    plans = [dict(id=f"p{i}", order_id=f"o{i}", expected_date="2026-01-01", value=100, description=f"Item-{i}") for i in range(1, 5)]
    invoices = [dict(id=f"i{i}", order_id=f"o{i}", client_id=f"c{i}", number=f"FT-{i}", status="emitida", issued_at=f"2026-0{i}-01", lines=[dict(plan_line_id=f"p{i}", amount=i * 10)]) for i in range(1, 4)]
    invoices += [dict(order_id="o4", client_id="c4", status="anulada", issued_at="2026-01-01"), dict(order_id="o4", client_id="c4", status="emitida", issued_at="2025-01-01")]
    monkeypatch.setattr(reports, "_active_orders", AsyncMock(return_value=orders))
    monkeypatch.setattr(reports, "db", SimpleNamespace(orders=Collection(orders), clients=Collection([dict(id=f"c{i}", name=f"Client-{i}") for i in range(1, 5)]), plan_lines=Collection(plans), invoices=Collection(invoices)))


def test_clients_follow_invoice_period_and_exclude_cancelled(billing):
    result = asyncio.run(reports.annual_billing_clients(year=2026, start_month="2026-01", end_month="2026-02", user={}))
    assert [row["id"] for row in result["rows"]] == ["c1", "c2"]
    result = asyncio.run(reports.annual_billing_clients(year=2026, start_month="2026-03", end_month="2026-03", user={}))
    assert [row["id"] for row in result["rows"]] == ["c3"]
    result = asyncio.run(reports.annual_billing_clients(year=2026, start_month="2026-04", end_month="2026-04", user={}))
    assert result["rows"] == []


@pytest.mark.parametrize("ids, names, billed", [(["c1"], {"Client-1"}, 10), (["c1", "c2"], {"Client-1", "Client-2"}, 30), (None, {"Client-1", "Client-2", "Client-3", "Client-4"}, 60), (["missing"], set(), 0)])
def test_report_filters_details_and_totals(billing, ids, names, billed):
    summary, rows = asyncio.run(reports._annual_billing_report(2026, client_ids=ids))
    assert {row["cliente"] for row in rows} == names
    assert sum(row["billed_value"] for row in summary) == billed
    assert sum(row["planned_value"] for row in summary) == 100 * len(names)


def test_csv_and_pdf_apply_same_client_selection(billing, monkeypatch):
    csv = asyncio.run(reports.export_billing_annual_csv(year=2026, client_ids=["c2"], user={}))
    assert b"Client-2" in csv.body
    assert b"Client-1" not in csv.body
    monkeypatch.setattr(reports, "build_annual_billing_pdf_grouped", lambda year, summary, rows: (summary, rows))
    summary, rows = asyncio.run(reports.export_billing_annual_pdf(year=2026, client_ids=["c2"], user={}))
    assert {row["cliente"] for row in rows} == {"Client-2"}
    assert sum(row["billed_value"] for row in summary) == 20


@pytest.mark.parametrize("start,end", [("2026-00", "2026-01"), ("2026-01", "2026-13"), ("2025-01", "2026-01"), ("2026-03", "2026-01")])
def test_invalid_period_rejected(start, end):
    with pytest.raises(HTTPException) as error:
        reports._annual_billing_period(2026, start, end)
    assert error.value.status_code == 400
