import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { dateShort, eur } from "@/lib/fmt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ReportingTable from "@/components/ReportingTable";

const PAYMENT = { paid: "Paga", unpaid: "Por pagar" };

export function billingRows(invoices) {
  return invoices.filter((invoice) => invoice.status !== "anulada").map((invoice) => {
    const gross = Number(invoice.total_gross ?? invoice.total_net) || 0;
    const net = Number(invoice.total_net) || 0;
    const received = Number(invoice.received_amount) || 0;
    const receivedNet = gross ? Math.round((received * net / gross + Number.EPSILON) * 100) / 100 : 0;
    return {
      id: invoice.id,
      reference: invoice.external_invoice_number || invoice.number || "—",
      internalReference: invoice.number || "",
      order: invoice.order_number || "—",
      orderId: invoice.order_id,
      description: (invoice.lines || []).map((line) => line.description).filter(Boolean).join("; ") || invoice.order_description || "—",
      date: String(invoice.issued_at || "").slice(0, 10),
      month: String(invoice.issued_at || "").slice(0, 7),
      net, receivedNet,
      outstandingNet: Math.max(0, Math.round((net - receivedNet + Number.EPSILON) * 100) / 100),
      gross, received,
      outstanding: Math.max(0, gross - received),
      payment: gross - received <= 0.01 ? "paid" : "unpaid",
    };
  });
}

function AmountPair({ net, gross }) {
  return <div className="mt-1 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
    <div><div className="font-sans text-[10px] text-neutral-500">sem IVA</div><div data-testid="amount-net" className="whitespace-nowrap font-mono text-xl">{eur(net)}</div></div>
    <div className="text-right text-neutral-500"><div className="font-sans text-[10px]">com IVA</div><div data-testid="amount-gross" className="whitespace-nowrap font-mono text-xs">{eur(gross)}</div></div>
  </div>;
}

const columns = [
  { key: "reference", label: "Fatura", w: "160px", wrap: true },
  { key: "order", label: "Encomenda", w: "160px", render: (row) => row.orderId ? <Link className="text-[#002FA7] hover:underline" to={`/encomendas/${row.orderId}#faturas`}>{row.order}</Link> : row.order },
  { key: "description", label: "Descrição", w: "minmax(220px, 1fr)", wrap: true },
  { key: "date", label: "Emissão", w: "105px", render: (row) => dateShort(row.date) },
  { key: "month", label: "Mês da fatura", w: "115px" },
  { key: "payment", label: "Pagamento", w: "140px", sortValue: (row) => PAYMENT[row.payment], render: (row) => PAYMENT[row.payment] },
  ...[
    ["net", "Sem IVA", "amount-net"],
    ["gross", "Com IVA", "amount-gross"],
    ["receivedNet", "Recebido sem IVA", "amount-net"],
    ["received", "Recebido com IVA", "amount-gross"],
    ["outstandingNet", "Em aberto sem IVA", "amount-net"],
    ["outstanding", "Em aberto com IVA", "amount-gross"],
  ].map(([key, label, testId]) => ({ key, label, w: "140px", align: "right", render: (row) => <span data-testid={testId} className="whitespace-nowrap">{eur(row[key])}</span> })),
];

export default function ClientBillingReport({ clientId, reportingYear }) {
  const [invoiceResult, setInvoiceResult] = useState({ clientId: null, invoices: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [mode, setMode] = useState("year");
  const [year, setYear] = useState(String(reportingYear));
  const [start, setStart] = useState(`${reportingYear}-01-01`);
  const [end, setEnd] = useState(`${reportingYear}-12-31`);
  const [payment, setPayment] = useState("");
  const [search, setSearch] = useState("");
  const clientRows = useMemo(() => billingRows(invoiceResult.clientId === clientId
    ? invoiceResult.invoices.filter((invoice) => (invoice.order_client_id || invoice.client_id) === clientId)
    : []), [invoiceResult, clientId]);
  const years = useMemo(() => [...new Set(clientRows.map((row) => row.date.slice(0, 4)).filter((value) => /^\d{4}$/.test(value)))].sort().reverse(), [clientRows]);
  const selectedYear = years.includes(year) ? year : years.includes(String(reportingYear)) ? String(reportingYear) : years[0] || "";

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    if (!clientId) {
      setError("Não foi possível identificar o cliente deste relatório.");
      setLoading(false);
      return;
    }
    api.get("/invoices", { params: { client_id: clientId } }).then(({ data }) => {
      if (active) setInvoiceResult({ clientId, invoices: data });
    }).catch(() => {
      if (active) setError("Não foi possível carregar as faturas. Tente novamente.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [clientId, retry]);

  const invalidPeriod = mode === "range" && (!start || !end || start > end);
  const rows = useMemo(() => {
    if (invalidPeriod) return [];
    const term = search.trim().toLocaleLowerCase("pt");
    return clientRows.filter((row) => (mode === "year" ? row.date.startsWith(`${selectedYear}-`) : row.date >= start && row.date <= end)
      && (!payment || row.payment === payment)
      && (!term || [row.reference, row.internalReference, row.order, row.description].some((value) => value.toLocaleLowerCase("pt").includes(term))));
  }, [clientRows, invalidPeriod, mode, selectedYear, start, end, payment, search]);
  const totals = rows.reduce((sum, row) => {
    for (const key of Object.keys(sum)) sum[key] += row[key];
    return sum;
  }, { net: 0, gross: 0, receivedNet: 0, received: 0, outstandingNet: 0, outstanding: 0 });

  return <div className="space-y-4" data-testid="client-billing-report">
    <p className="text-sm text-neutral-600">Faturação por data de emissão, incluindo faturas de encomendas de anos anteriores. Cada linha representa uma fatura; as descrições incluem as suas linhas.</p>
    <div className="flex flex-wrap items-end gap-3">
      <label className="space-y-1 text-xs">Período<select aria-label="Período" className="block h-10 rounded border bg-white px-3 text-sm" value={mode} onChange={(e) => setMode(e.target.value)}><option value="year">Ano completo</option><option value="range">Intervalo de datas</option></select></label>
      {mode === "year" ? <label className="space-y-1 text-xs">Ano<select aria-label="Ano da faturação" value={selectedYear} onChange={(e) => setYear(e.target.value)} disabled={loading || !years.length} className="block h-10 w-36 rounded border bg-white px-3 text-sm">{!years.length && <option value="">Sem faturação</option>}{years.map((value) => <option key={value} value={value}>{value}</option>)}</select></label> : <>
        <label className="space-y-1 text-xs">De<Input aria-label="Data inicial" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="space-y-1 text-xs">Até<Input aria-label="Data final" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      </>}
      <label className="space-y-1 text-xs">Pagamento<select aria-label="Pagamento" className="block h-10 rounded border bg-white px-3 text-sm" value={payment} onChange={(e) => setPayment(e.target.value)}><option value="">Todos</option>{Object.entries(PAYMENT).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="min-w-52 flex-1 space-y-1 text-xs">Pesquisar<Input aria-label="Pesquisar faturação" placeholder="Fatura, encomenda ou descrição" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
    </div>
    {invalidPeriod && <p role="alert" className="text-sm text-red-700">Indique um ano ou intervalo de datas válido.</p>}
    {loading ? <p role="status">A carregar faturas…</p> : error ? <div role="alert">{error} <Button variant="outline" onClick={() => setRetry((value) => value + 1)}>Tentar novamente</Button></div> : !invalidPeriod && <>
      <div className="grid gap-3 sm:grid-cols-3" data-testid="client-billing-totals">
        {[["Faturado", totals.net, totals.gross], ["Recebido", totals.receivedNet, totals.received], ["Em aberto", totals.outstandingNet, totals.outstanding]].map(([label, net, gross]) => <div key={label} className="min-w-0 rounded-lg border bg-white p-3"><div className="text-xs text-neutral-500">{label}</div><AmountPair net={net} gross={gross} /></div>)}
      </div>
      <p className="text-xs text-neutral-500">{rows.length} fatura(s). Totais dos resultados filtrados. Faturas anuladas excluídas da listagem e dos totais. Por pagar inclui faturas parcialmente pagas e em atraso. Recebimentos acumulados até à data atual, relativos a estas faturas.</p>
      <p className="text-xs text-neutral-500">Nos cartões, valores principais sem IVA e valores menores com IVA. O recebido e o saldo sem IVA são calculados proporcionalmente ao total de cada fatura, com arredondamento ao cêntimo.</p>
      <ReportingTable sortable columns={columns} rows={rows} minWidth={1920} testid="client-billing-table" />
    </>}
  </div>;
}
