import React, { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { dateShort, eur } from "@/lib/fmt";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import StatusMultiSelect from "@/components/StatusMultiSelect";
import ListFilterSettings from "@/components/ListFilterSettings";
import { useListFilters } from "@/lib/listPreferences";
import Pagination from "@/components/Pagination";

const STATUS = { emitida: "Emitida", parcialmente_recebida: "Parcialmente recebida", recebida: "Recebida", anulada: "Anulada" };
const STATUS_STYLE = { emitida: "bg-sky-50 text-sky-700", parcialmente_recebida: "bg-amber-50 text-amber-700", recebida: "bg-emerald-50 text-emerald-700", anulada: "bg-red-50 text-red-700" };
const COLLECTION = { em_atraso: "Em atraso", por_receber: "Por receber", recebida: "Recebida", anulada: "Anulada" };
const COLLECTION_STYLE = { em_atraso: "bg-red-500", por_receber: "bg-amber-400", recebida: "bg-emerald-500", anulada: "bg-slate-400" };
const COLLECTION_OPTIONS = Object.entries(COLLECTION).map(([value, label]) => ({ value, label }));

function SortButton({ label, keyName, sort, onSort, align = "left" }) {
  const active = sort.key === keyName;
  const Icon = !active ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
  const justify = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  return <button type="button" onClick={() => onSort(keyName)} className={`flex w-full items-center gap-1 ${justify}`}><span>{label}</span><Icon size={12} /></button>;
}

function collectionStatus(invoice) {
  if (invoice.collection_status) return invoice.collection_status;
  if (invoice.status === "anulada") return "anulada";
  const gross = Number(invoice.total_gross ?? invoice.total_net) || 0;
  const received = Number(invoice.received_amount) || 0;
  if (invoice.status === "recebida" || gross - received <= 0.01) return "recebida";
  const issuedAt = new Date(invoice.issued_at);
  const ageInDays = Number.isNaN(issuedAt.getTime()) ? 0 : Math.floor((Date.now() - issuedAt.getTime()) / 86400000);
  return ageInDays > 30 ? "em_atraso" : "por_receber";
}

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [sort, setSort] = useState({ key: "issued_at", direction: "desc" });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const { filters, setFilters, saveFilters, clearSavedFilters } = useListFilters("invoices", { search: "", statuses: [], pageSize: 30 });

  useEffect(() => { api.get("/invoices").then((response) => setInvoices(response.data || [])).finally(() => setLoading(false)); }, []);
  useEffect(() => { setPage(1); }, [filters.search, filters.statuses, filters.pageSize, sort]);

  const rows = useMemo(() => {
    const term = filters.search.trim().toLowerCase();
    const enriched = invoices.map((invoice) => ({ ...invoice, collection_status: collectionStatus(invoice) }));
    const filtered = enriched.filter((invoice) => (!term || [invoice.order_number, invoice.client_name, invoice.external_invoice_number, STATUS[invoice.status], COLLECTION[invoice.collection_status]].some((value) => String(value || "").toLowerCase().includes(term))) && (!filters.statuses.length || filters.statuses.includes(invoice.collection_status)));
    return [...filtered].sort((left, right) => { const a = left[sort.key] ?? ""; const b = right[sort.key] ?? ""; const result = typeof a === "number" ? a - b : String(a).localeCompare(String(b), "pt"); return sort.direction === "asc" ? result : -result; });
  }, [filters.search, filters.statuses, invoices, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / filters.pageSize));
  const visibleRows = rows.slice((page - 1) * filters.pageSize, page * filters.pageSize);
  const toggleSort = (key) => setSort((current) => current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: key.includes("value") || key.includes("vab") ? "desc" : "asc" });

  return <div><PageHeader kicker="Financeiro" title="Faturas" actions={<ListFilterSettings filters={filters} statusOptions={COLLECTION_OPTIONS} filterLabel="Situação de recebimento predefinida" onSave={saveFilters} onClear={clearSavedFilters} />} /><div className="p-7"><div className="wc-list-panel overflow-hidden"><div className="wc-filter-bar flex flex-wrap items-end gap-3 px-4 py-3"><div className="min-w-[260px] flex-1"><Label className="text-[10px] uppercase tracking-widest text-neutral-500">Pesquisar</Label><Input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Encomenda, cliente ou nº de fatura" className="mt-1 rounded-none" /></div><div className="w-[260px]"><Label className="text-[10px] uppercase tracking-widest text-neutral-500">Situação de recebimento</Label><div className="mt-1"><StatusMultiSelect options={COLLECTION_OPTIONS} value={filters.statuses} onChange={(statuses) => setFilters((current) => ({ ...current, statuses }))} testId="invoice-status-filter" /></div></div><button type="button" onClick={() => setFilters((current) => ({ ...current, search: "", statuses: [] }))} className="h-9 px-2 text-xs font-medium text-slate-600 hover:text-[var(--wc-cyan-700)]">Limpar filtros</button></div><div className="overflow-x-auto"><div className="min-w-[1370px]"><div className="grid grid-cols-[1.2fr_1.3fr_115px_120px_115px_120px_115px_130px_120px_90px] border-b border-neutral-200 px-4 py-2 text-[10px] uppercase tracking-widest text-neutral-500"><SortButton label="Encomenda" keyName="order_number" sort={sort} onSort={toggleSort} /><SortButton label="Cliente" keyName="client_name" sort={sort} onSort={toggleSort} /><SortButton label="Data planeada" keyName="planned_date" sort={sort} onSort={toggleSort} /><SortButton label="Valor planeado" keyName="planned_value" sort={sort} onSort={toggleSort} align="right" /><SortButton label="VAB planeado" keyName="planned_vab" sort={sort} onSort={toggleSort} align="right" /><SortButton label="Valor faturado" keyName="total_net" sort={sort} onSort={toggleSort} align="right" /><SortButton label="VAB faturado" keyName="billed_vab" sort={sort} onSort={toggleSort} align="right" /><SortButton label="Nº da fatura" keyName="external_invoice_number" sort={sort} onSort={toggleSort} align="center" /><SortButton label="Estado" keyName="status" sort={sort} onSort={toggleSort} /><SortButton label="Recebimento" keyName="collection_status" sort={sort} onSort={toggleSort} /></div>{loading ? <div className="px-4 py-8 text-center text-sm text-slate-500">A carregar faturas…</div> : visibleRows.length === 0 ? <div className="px-4 py-8 text-sm text-slate-500">Sem faturas para os critérios atuais.</div> : visibleRows.map((invoice) => <div key={invoice.id} className="wc-table-row grid grid-cols-[1.2fr_1.3fr_115px_120px_115px_120px_115px_130px_120px_90px] items-center border-b px-4 py-3 text-sm"><Link to={`/encomendas/${invoice.order_id}#faturas`} className="truncate font-medium text-slate-800 hover:text-[var(--wc-cyan-700)] hover:underline">{invoice.order_number}</Link><div className="truncate text-slate-700">{invoice.client_name}</div><div className="font-mono text-xs text-slate-600">{dateShort(invoice.planned_date)}</div><div className="text-right font-mono text-xs">{eur(invoice.planned_value)}</div><div className="text-right font-mono text-xs">{eur(invoice.planned_vab)}</div><div className="text-right font-mono text-xs font-semibold">{eur(invoice.total_net)}</div><div className="text-right font-mono text-xs">{eur(invoice.billed_vab)}</div><div className="truncate text-center font-mono text-xs">{invoice.external_invoice_number || ""}</div><div><Badge className={`${STATUS_STYLE[invoice.status] || "bg-slate-100 text-slate-700"} rounded-full font-normal`}>{STATUS[invoice.status] || invoice.status}</Badge></div><div className="flex justify-center"><span className={`h-3 w-3 rounded-full ${COLLECTION_STYLE[invoice.collection_status] || "bg-slate-300"}`} title={COLLECTION[invoice.collection_status] || "Sem situação"} aria-label={COLLECTION[invoice.collection_status] || "Sem situação"} /></div></div>)}</div></div><Pagination page={page} pages={pages} total={rows.length} pageSize={filters.pageSize} onPageChange={setPage} /></div></div></div>;
}
