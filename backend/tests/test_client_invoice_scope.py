import asyncio
from types import SimpleNamespace

import pytest
from routers import finance


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

        return Cursor([dict(row) for row in self.rows if matches(row)])


class Cursor:
    def __init__(self, rows):
        self.rows = rows

    def sort(self, key, direction):
        self.rows.sort(key=lambda row: row.get(key, ""), reverse=direction < 0)
        return self

    async def to_list(self, length):
        return self.rows if length is None else self.rows[:length]


@pytest.fixture
def invoices(monkeypatch):
    orders = [dict(id="o1", client_id="c1", number="ENC-1"), dict(id="o2", client_id="c2", number="ENC-2")]
    rows = [
        dict(id="i1", client_id="c1", order_id="o1", total_net=100, total_gross=123, issued_at="2026-01-01", lines=[]),
        dict(id="i2", client_id="c2", order_id="o2", total_net=900, total_gross=1107, issued_at="2026-01-01", lines=[]),
        # Incorrect invoice client metadata must not override the order owner.
        dict(id="i3", client_id="c1", order_id="o2", total_net=500, total_gross=615, issued_at="2026-01-01", lines=[]),
        dict(id="i4", order_id="o1", total_net=50, total_gross=61.5, issued_at="2025-01-01", lines=[]),
        dict(id="orphan", client_id="c1", order_id="missing", total_net=999, lines=[]),
    ]
    payments = [dict(invoice_id="i1", amount=123), dict(invoice_id="i2", amount=1107), dict(invoice_id="i4", amount=10)]
    monkeypatch.setattr(finance, "db", SimpleNamespace(orders=Collection(orders), invoices=Collection(rows), clients=Collection([dict(id="c1", name="Alfa"), dict(id="c2", name="Beta")]), plan_lines=Collection([]), payments=Collection(payments)))


def test_client_scope_uses_order_owner_and_its_payments(invoices):
    rows = asyncio.run(finance.list_invoices(client_id="c1", user={}))
    assert {row["id"] for row in rows} == {"i1", "i4"}
    assert sum(row["total_net"] for row in rows) == 150
    assert sum(row["received_amount"] for row in rows) == 133
    assert {row["client_name"] for row in rows} == {"Alfa"}
    assert {row["order_client_id"] for row in rows} == {"c1"}
    rows = asyncio.run(finance.list_invoices(client_id="c2", user={}))
    assert {row["id"] for row in rows} == {"i2", "i3"}
    assert {row["client_name"] for row in rows} == {"Beta"}


def test_order_and_client_filters_intersect(invoices):
    assert asyncio.run(finance.list_invoices(order_id="o2", client_id="c1", user={})) == []
    assert asyncio.run(finance.list_invoices(client_id="missing", user={})) == []
    rows = asyncio.run(finance.list_invoices(order_id="o1", client_id="c1", user={}))
    assert {row["id"] for row in rows} == {"i1", "i4"}
