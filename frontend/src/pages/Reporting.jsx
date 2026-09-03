import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, API } from "@/lib/api";
import { eur, pct, dateShort, LEAD_STATUS, OPP_STATUS, PROP_STATUS, ORDER_STATUS } from "@/lib/fmt";
import PageHeader from "@/components/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, Legend, Cell } from "recharts";

const COLORS = { blue: "#002FA7", green: "#00A859", yellow: "#FFC800", red: "#FF2A00" };
const MONTH_COLORS = ["#0072B2", "#E69F00", "#56B4E9", "#009E73", "#F0E442", "#D55E00", "#CC79A7", "#332288", "#88CCEE", "#117733", "#AA4499", "#661100"];

function ForecastTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="border border-neutral-300 bg-white p-3 text-xs shadow-sm">
      <div className="font-medium">{label}</div>
      <div className="mt-1">Planeado: <span className="font-mono">{eur(row.planned_value)}</span></div>
      <div>Faturado: <span className="font-mono">{eur(row.billed_value)}</span></div>
      <div>Por faturar: <span className="font-mono">{eur(row.remaining_value)}</span></div>
      {row.items?.length > 0 && <div className="mt-2 border-t border-neutral-200 pt-2"><div className="mb-1 font-medium">Itens</div>{row.items.map((item, index) => <div key={item.name} className="flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0" style={{ backgroundColor: MONTH_COLORS[index % MONTH_COLORS.length] }} /><span className="max-w-[180px] truncate" title={item.name}>{item.name}</span><span className="ml-auto font-mono">{eur(item.planned_value)}</span></div>)}</div>}
    </div>
  );
}

function recordYear(item, fields) {
  for (const field of fields) {
    const value = item?.[field];
    if (value) {
      const year = Number(String(value).slice(0, 4));
      if (year) return year;
    }
  }
  return null;
}

function Table({ columns, rows, testid, footer }) {
  return (
    <div className="wc-list-panel" data-testid={testid}>
      <div className="wc-table-head grid gap-3 border-b border-[var(--wc-border)] px-4 py-2 text-[10px] uppercase tracking-widest" style={{ gridTemplateColumns: columns.map((column) => column.w || "1fr").join(" ") }}>
        {columns.map((column) => <div key={column.key} className={column.align === "right" ? "text-right" : ""}>{column.label}</div>)}
      </div>
      {rows.length === 0 && <div className="p-4 text-sm text-neutral-500">Sem dados.</div>}
      {rows.map((row, index) => (
        <div key={index} className="wc-table-row grid gap-3 border-b px-4 py-2.5 text-sm" style={{ gridTemplateColumns: columns.map((column) => column.w || "1fr").join(" ") }}>
          {columns.map((column) => (
            <div key={column.key} className={`${column.align === "right" ? "text-right font-mono" : ""} ${column.mono ? "font-mono" : ""}`}>
              {column.render ? column.render(row) : row[column.key]}
            </div>
          ))}
        </div>
      ))}
      {footer && (
        <div className="grid gap-3 bg-neutral-50 px-4 py-2.5 text-sm font-medium" style={{ gridTemplateColumns: columns.map((column) => column.w || "1fr").join(" ") }}>
          {columns.map((column) => (
            <div key={column.key} className={`${column.align === "right" ? "text-right font-mono" : ""} ${column.mono ? "font-mono" : ""}`}>
              {column.render ? column.render(footer) : footer[column.key] || ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function KPI({ label, value, sub, testid }) {
  return (
    <div className="rounded-[14px] border border-[var(--wc-border)] bg-white p-4 shadow-sm" data-testid={testid}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className="mt-2 font-mono text-2xl">{value}</div>
      {sub && <div className="mt-1 text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}

function DetailLink({ children, onClick, testId, align = "left" }) {
  const className = align === "right"
    ? "font-mono text-[#002FA7] hover:underline"
    : "text-[#002FA7] hover:underline";
  return (
    <button type="button" onClick={onClick} data-testid={testId} className={className}>
      {children}
    </button>
  );
}

export default function Reporting() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState("executive");
  const [reportingYear, setReportingYear] = useState(new Date().getFullYear());
  const [exec, setExec] = useState(null);
  const [comm, setComm] = useState([]);
  const [cli, setCli] = useState([]);
  const [manuf, setManuf] = useState([]);
  const [vab, setVab] = useState(null);
  const [fi, setFi] = useState([]);
  const [fr, setFr] = useState(null);
  const [leads, setLeads] = useState([]);
  const [opps, setOpps] = useState([]);
  const [propsList, setPropsList] = useState([]);
  const [allProps, setAllProps] = useState([]);
  const [allOpps, setAllOpps] = useState([]);
  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [followUpScope, setFollowUpScope] = useState("30d");
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailConfig, setDetailConfig] = useState({ title: "", description: "", columns: [], rows: [] });

  const [billingOpen, setBillingOpen] = useState(false);
  const [billingMonth, setBillingMonth] = useState(() => {
    const current = new Date();
    return `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
  });
  const [billingFormat, setBillingFormat] = useState("csv");
  const [competenceMonth, setCompetenceMonth] = useState("");
  const [annualBillingOpen, setAnnualBillingOpen] = useState(false);
  const [annualBillingFormat, setAnnualBillingFormat] = useState("pdf");
  const [annualBillingMode, setAnnualBillingMode] = useState("year");
  const [annualBillingStart, setAnnualBillingStart] = useState(`${new Date().getFullYear()}-01`);
  const [annualBillingEnd, setAnnualBillingEnd] = useState(`${new Date().getFullYear()}-12`);
  const [paymentImportOpen, setPaymentImportOpen] = useState(false);
  const [paymentImportPreview, setPaymentImportPreview] = useState(null);
  const [paymentImportLoading, setPaymentImportLoading] = useState(false);
  const [paymentImportReason, setPaymentImportReason] = useState("");

  useEffect(() => {
    setBillingMonth(`${reportingYear}-01`);
    setAnnualBillingStart(`${reportingYear}-01`);
    setAnnualBillingEnd(`${reportingYear}-12`);
  }, [reportingYear]);

  const clientMap = useMemo(() => Object.fromEntries(clients.map((client) => [client.id, client])), [clients]);
  const opportunityMap = useMemo(() => Object.fromEntries(allOpps.map((opportunity) => [opportunity.id, opportunity])), [allOpps]);
  const productMap = useMemo(() => Object.fromEntries(products.map((product) => [product.id, product])), [products]);
  const forecastTotals = useMemo(() => fi.reduce((totals, month) => ({
    planned: totals.planned + (Number(month.planned_value) || 0),
    billed: totals.billed + (Number(month.billed_value) || 0),
    remaining: totals.remaining + (Number(month.remaining_value) || 0),
  }), { planned: 0, billed: 0, remaining: 0 }), [fi]);

  const proposalFollowUpRows = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const anchor = reportingYear === today.getFullYear() ? today : new Date(reportingYear, 0, 1);
    const thirtyDaysEnd = new Date(anchor);
    thirtyDaysEnd.setDate(thirtyDaysEnd.getDate() + 30);
    const quarterEnd = new Date(anchor.getFullYear(), Math.floor(anchor.getMonth() / 3) * 3 + 3, 0);
    const yearEnd = new Date(reportingYear, 11, 31);

    return allProps
      .map((proposal) => {
        const followUp = proposal.next_follow_up_date;
        if (!followUp) return null;
        const date = new Date(`${String(followUp).slice(0, 10)}T00:00:00`);
        if (Number.isNaN(date.getTime()) || date < anchor || date > yearEnd) return null;
        const horizon = date <= thirtyDaysEnd
          ? "Próximos 30 dias"
          : date <= quarterEnd
            ? "Trimestre atual"
            : "Até ao fim do ano";
        const client = clientMap[proposal.client_id]?.name || "-";
        return {
          id: proposal.id,
          scope: date <= thirtyDaysEnd ? "30d" : date <= quarterEnd ? "quarter" : "year",
          horizon,
          number: proposal.number || "-",
          client,
          description: proposal.description || opportunityMap[proposal.opportunity_id]?.description || "-",
          value: Number(proposal.total_net) || 0,
          vab: Number(proposal.total_vab) || 0,
          status: PROP_STATUS[proposal.status] || proposal.status || "-",
          followUp,
        };
      })
      .filter(Boolean)
      .sort((left, right) => String(left.followUp).localeCompare(String(right.followUp)));
  }, [allProps, clientMap, opportunityMap, reportingYear]);

  const visibleProposalFollowUps = useMemo(() => {
    const allowed = followUpScope === "30d" ? ["30d"] : followUpScope === "quarter" ? ["30d", "quarter"] : ["30d", "quarter", "year"];
    return proposalFollowUpRows.filter((row) => allowed.includes(row.scope));
  }, [followUpScope, proposalFollowUpRows]);

  const download = async (path, filename) => {
    const token = localStorage.getItem("whymob_token");
    const response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      let detail = `Falha ao gerar o ficheiro (${response.status})`;
      try {
        const body = await response.json();
        if (body?.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
      } catch (_error) {
        // Keep the HTTP status when the server does not return JSON.
      }
      throw new Error(detail);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
  };

  const submitBillingExport = async () => {
    if (!/^\d{4}-\d{2}$/.test(billingMonth)) {
      toast.error("Mes invalido. Use o formato AAAA-MM.");
      return;
    }
    if (!billingMonth.startsWith(`${reportingYear}-`)) {
      toast.error(`Escolha um mes do ano ${reportingYear}.`);
      return;
    }
    const format = billingFormat === "pdf" ? "pdf" : "csv";
    try {
      await download(`/exports/billing-orders.${format}?month=${billingMonth}`, `ordem-faturacao-${billingMonth}.${format}`);
      setBillingOpen(false);
      toast.success(`Download iniciado (${billingMonth}, ${format.toUpperCase()})`);
    } catch (error) {
      toast.error(error.message || "Não foi possível gerar o ficheiro");
    }
  };

  const submitCompetenceExport = async () => {
    try {
      const reportMonth = competenceMonth || billingMonth;
      const query = reportMonth ? `?month=${reportMonth}` : "";
      const suffix = reportMonth || "todas";
      await download(`/exports/billing-competence.csv${query}`, `competencias-faturacao-${suffix}.csv`);
      setCompetenceOpen(false);
      toast.success("Relatório de competências exportado");
    } catch (error) {
      toast.error(error.message || "Não foi possível exportar o relatório");
    }
  };

  const openAnnualBillingExport = (format) => {
    setAnnualBillingFormat(format);
    setAnnualBillingOpen(true);
  };

  const submitAnnualBillingExport = async () => {
    const startMonth = annualBillingMode === "year" ? `${reportingYear}-01` : annualBillingStart;
    const endMonth = annualBillingMode === "year" ? `${reportingYear}-12` : annualBillingEnd;
    if (!/^\d{4}-\d{2}$/.test(startMonth) || !/^\d{4}-\d{2}$/.test(endMonth) || startMonth > endMonth || !startMonth.startsWith(`${reportingYear}-`) || !endMonth.startsWith(`${reportingYear}-`)) {
      toast.error(`Escolha um periodo valido dentro de ${reportingYear}.`);
      return;
    }
    const query = `?year=${reportingYear}&start_month=${startMonth}&end_month=${endMonth}`;
    const suffix = annualBillingMode === "year" ? `${reportingYear}` : `${startMonth}_${endMonth}`;
    const extension = annualBillingFormat === "pdf" ? "pdf" : "csv";
    try {
      await download(`/exports/billing-annual.${extension}${query}`, `faturacao-${suffix}.${extension}`);
      setAnnualBillingOpen(false);
      toast.success(`Faturacao exportada (${suffix}, ${extension.toUpperCase()})`);
    } catch (error) {
      toast.error(error.message || "Nao foi possivel exportar a faturacao");
    }
  };

  const importPayments = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPaymentImportLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await api.post("/payments/import/preview", formData, { headers: { "Content-Type": "multipart/form-data" } });
      setPaymentImportPreview({ ...response.data, rows: response.data.rows.map((row) => ({ ...row, _selected: row.status === "correspondencia_exata" })) });
      setPaymentImportReason("");
      setPaymentImportOpen(true);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Não foi possível ler o ficheiro");
    } finally {
      setPaymentImportLoading(false);
    }
  };

  const confirmPaymentImport = async () => {
    const selected = (paymentImportPreview?.rows || []).filter((row) => row._selected && row.invoice_id);
    if (!selected.length) {
      toast.error("Selecione pelo menos uma correspondência");
      return;
    }
    if (!paymentImportReason.trim()) {
      toast.error("Indique o motivo da importação");
      return;
    }
    setPaymentImportLoading(true);
    try {
      const response = await api.post("/payments/import/confirm", {
        filename: paymentImportPreview.filename,
        reason: paymentImportReason,
        rows: selected,
      });
      toast.success(`${response.data.created} recebimento(s) registado(s)`);
      setPaymentImportOpen(false);
      setPaymentImportPreview(null);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Não foi possível confirmar a conciliação");
    } finally {
      setPaymentImportLoading(false);
    }
  };

  useEffect(() => {
    api.get(`/analytics/executive?year=${reportingYear}`).then((response) => {
      setExec(response.data);
      setFi(response.data.forecast_invoicing);
      setFr(response.data.forecast_receiving);
      setVab(response.data.vab);
    });
    api.get(`/analytics/by-commercial?year=${reportingYear}`).then((response) => setComm(response.data.rows));
    api.get(`/analytics/by-client?year=${reportingYear}`).then((response) => setCli(response.data.rows));
    api.get(`/analytics/by-manufacturer?year=${reportingYear}`).then((response) => setManuf(response.data.rows));

    Promise.all([
      api.get("/leads"),
      api.get("/opportunities"),
      api.get("/proposals"),
      api.get("/orders"),
      api.get("/clients"),
      api.get("/products"),
    ]).then(([
      leadsResponse,
      oppsResponse,
      propsResponse,
      ordersResponse,
      clientsResponse,
      productsResponse,
    ]) => {
      setLeads((leadsResponse.data.items || leadsResponse.data).filter((item) => recordYear(item, ["created_at"]) === reportingYear));
      setOpps((oppsResponse.data.items || oppsResponse.data).filter((item) => recordYear(item, ["created_at"]) === reportingYear));
      setAllOpps(oppsResponse.data);
      setPropsList((propsResponse.data.items || propsResponse.data).filter((item) => recordYear(item, ["updated_at", "created_at"]) === reportingYear));
      setAllProps(propsResponse.data);
      setOrders((ordersResponse.data.items || ordersResponse.data).filter((item) => !["cancelada", "anulada"].includes(item.status) && recordYear(item, ["order_date", "created_at"]) === reportingYear));
      setClients(clientsResponse.data);
      setProducts(productsResponse.data);
    });
  }, [reportingYear]);

  const openDetail = ({ title, description, columns, rows }) => {
    setDetailConfig({ title, description, columns, rows });
    setDetailOpen(true);
  };

  const proposalColumns = [
    { key: "number", label: "Numero", w: "160px", mono: true },
    { key: "client", label: "Cliente" },
    { key: "status", label: "Estado", w: "140px" },
    { key: "value", label: "Valor", w: "120px", align: "right", mono: true },
    { key: "vab", label: "VAB", w: "120px", align: "right", mono: true },
    { key: "date", label: "Data", w: "110px", mono: true },
  ];
  const orderColumns = [
    { key: "number", label: "Numero", w: "160px", mono: true },
    { key: "client", label: "Cliente" },
    { key: "status", label: "Estado", w: "170px" },
    { key: "value", label: "Valor", w: "120px", align: "right", mono: true },
    { key: "vab", label: "VAB", w: "120px", align: "right", mono: true },
    { key: "date", label: "Data", w: "110px", mono: true },
  ];
  const opportunityColumns = [
    { key: "client", label: "Cliente" },
    { key: "description", label: "Descricao", w: "2fr" },
    { key: "status", label: "Estado", w: "140px" },
    { key: "value", label: "Valor", w: "120px", align: "right", mono: true },
    { key: "vab", label: "VAB", w: "120px", align: "right", mono: true },
  ];
  const leadColumns = [
    { key: "client", label: "Cliente" },
    { key: "description", label: "Descricao", w: "2fr" },
    { key: "status", label: "Estado", w: "140px" },
    { key: "value", label: "Valor", w: "120px", align: "right", mono: true },
  ];

  const mapProposalRows = (rows) => rows.map((proposal) => ({
    number: proposal.number,
    client: clientMap[proposal.client_id]?.name || proposal.client_id,
    status: PROP_STATUS[proposal.status] || proposal.status,
    value: eur(proposal.total_net),
    vab: eur(proposal.total_vab),
    date: dateShort(proposal.updated_at || proposal.created_at),
  }));

  const mapOrderRows = (rows) => rows.map((order) => ({
    number: order.number,
    client: clientMap[order.client_id]?.name || order.client_id,
    status: ORDER_STATUS[order.status] || order.status,
    value: eur(order.total_net),
    vab: eur(order.total_vab),
    date: dateShort(order.order_date),
  }));

  const mapOpportunityRows = (rows) => rows.map((opportunity) => ({
    client: clientMap[opportunity.client_id]?.name || opportunity.client_id,
    description: opportunity.description,
    status: OPP_STATUS[opportunity.status] || opportunity.status,
    value: eur(opportunity.estimated_value),
    vab: eur(opportunity.estimated_vab),
  }));

  const mapLeadRows = (rows) => rows.map((lead) => ({
    client: lead.client_id ? (clientMap[lead.client_id]?.name || lead.client_id) : (lead.client_name_raw || "-"),
    description: lead.description,
    status: LEAD_STATUS[lead.status] || lead.status,
    value: eur(lead.estimated_value),
  }));

  const openCommercialDetail = (row, metric) => {
    if (metric === "leads") {
      openDetail({
        title: `Leads · ${row.name}`,
        description: "Leads associadas a este comercial.",
        columns: leadColumns,
        rows: mapLeadRows(leads.filter((lead) => lead.owner_id === row.user_id)),
      });
      return;
    }
    if (metric === "opps") {
      openDetail({
        title: `Oportunidades · ${row.name}`,
        description: "Oportunidades associadas a este comercial.",
        columns: opportunityColumns,
        rows: mapOpportunityRows(opps.filter((opportunity) => opportunity.owner_id === row.user_id)),
      });
      return;
    }
    const proposalsByOwner = propsList.filter((proposal) => proposal.owner_id === row.user_id);
    if (metric === "props") {
      openDetail({
        title: `Propostas · ${row.name}`,
        description: "Todas as propostas deste comercial.",
        columns: proposalColumns,
        rows: mapProposalRows(proposalsByOwner),
      });
      return;
    }
    if (["won", "won_value", "won_vab"].includes(metric)) {
      openDetail({
        title: `Propostas ganhas · ${row.name}`,
        description: "Propostas ganhas que compoem este indicador.",
        columns: proposalColumns,
        rows: mapProposalRows(proposalsByOwner.filter((proposal) => proposal.status === "ganha")),
      });
    }
  };

  const openClientDetail = (row, metric) => {
    if (metric === "name") {
      const mixedRows = [
        ...propsList.filter((proposal) => proposal.client_id === row.client_id).map((proposal) => ({
          type: "Proposta",
          reference: proposal.number,
          status: PROP_STATUS[proposal.status] || proposal.status,
          value: eur(proposal.total_net),
          date: dateShort(proposal.updated_at || proposal.created_at),
        })),
        ...orders.filter((order) => order.client_id === row.client_id).map((order) => ({
          type: "Encomenda",
          reference: order.number,
          status: ORDER_STATUS[order.status] || order.status,
          value: eur(order.total_net),
          date: dateShort(order.order_date),
        })),
      ];
      openDetail({
        title: `Cliente · ${row.name}`,
        description: "Registos comerciais relacionados com este cliente.",
        columns: [
          { key: "type", label: "Tipo", w: "130px" },
          { key: "reference", label: "Referencia", w: "160px", mono: true },
          { key: "status", label: "Estado", w: "180px" },
          { key: "value", label: "Valor", w: "120px", align: "right", mono: true },
          { key: "date", label: "Data", w: "110px", mono: true },
        ],
        rows: mixedRows,
      });
      return;
    }
    if (metric === "props") {
      openDetail({
        title: `Propostas · ${row.name}`,
        description: "Todas as propostas deste cliente.",
        columns: proposalColumns,
        rows: mapProposalRows(propsList.filter((proposal) => proposal.client_id === row.client_id)),
      });
      return;
    }
    if (metric === "won") {
      openDetail({
        title: `Propostas ganhas · ${row.name}`,
        description: "Propostas ganhas deste cliente.",
        columns: proposalColumns,
        rows: mapProposalRows(propsList.filter((proposal) => proposal.client_id === row.client_id && proposal.status === "ganha")),
      });
      return;
    }
    if (["orders", "orders_value", "orders_vab"].includes(metric)) {
      openDetail({
        title: `Encomendas · ${row.name}`,
        description: "Encomendas deste cliente.",
        columns: orderColumns,
        rows: mapOrderRows(orders.filter((order) => order.client_id === row.client_id)),
      });
    }
  };

  const openManufacturerDetail = (row, metric) => {
    const opportunitiesByManufacturer = opps.filter((opportunity) => opportunity.manufacturer_id === row.manufacturer_id);
    const proposalsByManufacturer = propsList.filter((proposal) => proposal.lines.some((line) => {
      const product = productMap[line.product_id];
      return product?.manufacturer_id === row.manufacturer_id;
    }));

    if (["opps", "opps_value"].includes(metric)) {
      openDetail({
        title: `Oportunidades · ${row.name}`,
        description: "Oportunidades relacionadas com este fabricante.",
        columns: opportunityColumns,
        rows: mapOpportunityRows(opportunitiesByManufacturer),
      });
      return;
    }

    if (metric === "props") {
      openDetail({
        title: `Propostas · ${row.name}`,
        description: "Propostas com produtos deste fabricante.",
        columns: proposalColumns,
        rows: mapProposalRows(proposalsByManufacturer),
      });
      return;
    }

    if (["won", "won_value", "won_vab"].includes(metric)) {
      openDetail({
        title: `Propostas ganhas · ${row.name}`,
        description: "Propostas ganhas com produtos deste fabricante.",
        columns: proposalColumns,
        rows: mapProposalRows(proposalsByManufacturer.filter((proposal) => proposal.status === "ganha")),
      });
    }
  };

  return (
    <div>
      <PageHeader
        kicker="Reporting"
        title="Dashboards Avancados"
        actions={(
          <div className="flex flex-wrap gap-2 text-xs">
            <label className="flex items-center gap-2 border border-neutral-300 px-2 py-1.5 text-neutral-600">
              Ano
              <select value={reportingYear} onChange={(event) => setReportingYear(Number(event.target.value))} className="bg-white font-mono text-[#002FA7]" data-testid="reporting-year-select">
                {Array.from({ length: 7 }, (_, index) => new Date().getFullYear() - 3 + index).map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </label>
            {isAdmin && (
              <label className="cursor-pointer border border-[#002FA7] px-3 py-1.5 text-[#002FA7] transition-colors hover:bg-[#002FA7] hover:text-white">
                {paymentImportLoading ? "A ler recebimentos..." : "Importar recebimentos"}
                <input type="file" accept=".csv,.xlsx,.xls" onChange={importPayments} disabled={paymentImportLoading} className="hidden" data-testid="payment-import-input" />
              </label>
            )}
        <button onClick={() => download(`/exports/dashboard.pdf?year=${reportingYear}`, `dashboard-${reportingYear}.pdf`)} data-testid="export-dashboard-pdf" className="border border-[#002FA7] px-3 py-1.5 text-[#002FA7] transition-colors hover:bg-[#002FA7] hover:text-white">↓ Dashboard PDF</button>
        <button onClick={() => download(`/exports/proposals-follow-up.pdf?year=${reportingYear}`, `propostas-fecho-${reportingYear}.pdf`)} data-testid="export-proposals-follow-up-pdf" className="border border-[#002FA7] px-3 py-1.5 text-[#002FA7] transition-colors hover:bg-[#002FA7] hover:text-white">↓ Fecho propostas PDF</button>
            <button onClick={() => setBillingOpen(true)} data-testid="export-billing-orders-btn" className="border border-[#002FA7] px-3 py-1.5 text-[#002FA7] transition-colors hover:bg-[#002FA7] hover:text-white">↓ Ordem faturacao (por mes)</button>
            <button onClick={() => openAnnualBillingExport("pdf")} data-testid="export-annual-billing-pdf" className="border border-[#002FA7] px-3 py-1.5 text-[#002FA7] transition-colors hover:bg-[#002FA7] hover:text-white">↓ Faturação anual PDF</button>
            <button onClick={() => openAnnualBillingExport("csv")} data-testid="export-annual-billing-csv" className="border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50">↓ Faturação anual Excel/CSV</button>
            <button onClick={() => download("/exports/invoices.csv", "faturas.csv")} data-testid="export-invoices-csv" className="border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50">↓ Faturas CSV</button>
            <button onClick={() => download(`/exports/reporting-commercial.csv?year=${reportingYear}`, `reporting-comerciais-${reportingYear}.csv`)} data-testid="export-commercial-csv" className="border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50">↓ Comerciais CSV</button>
            <button onClick={() => download("/exports/timesheet.csv", "timesheet.csv")} data-testid="export-timesheet-csv" className="border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50">↓ Timesheet CSV</button>
          </div>
        )}
      />
      <div className="p-8">
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => download("/exports/orders.csv", "encomendas-com-propostas.csv")}
            data-testid="export-orders-csv"
            className="border border-[#002FA7] px-3 py-1.5 text-xs text-[#002FA7] transition-colors hover:bg-[#002FA7] hover:text-white"
          >
            ↓ Encomendas + propostas (Excel/CSV)
          </button>
        </div>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="h-auto rounded-none border border-neutral-200 bg-transparent p-0">
            {[
              ["executive", "Executivo"],
              ["commercial", "Por Comercial"],
              ["client", "Por Cliente"],
              ["manufacturer", "Por Fabricante"],
              ["forecast", "Previsoes"],
              ["vab", "Analise VAB"],
            ].map(([key, label]) => (
              <TabsTrigger key={key} value={key} className="rounded-none px-4 py-2 text-xs data-[state=active]:bg-[#002FA7] data-[state=active]:text-white" data-testid={`tab-${key}`}>{label}</TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="executive" className="mt-6">
            {exec && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <KPI testid="exec-won-value" label="Valor Ganho" value={eur(exec.kpis.won_value)} sub={`${exec.kpis.props} propostas`} />
                  <KPI testid="exec-won-vab" label="VAB Ganho" value={eur(exec.kpis.won_vab)} sub={`Margem ${pct(exec.kpis.won_value ? (exec.kpis.won_vab / exec.kpis.won_value) * 100 : 0)}`} />
                  <KPI testid="exec-orders" label="Encomendas" value={eur(exec.kpis.orders_value)} sub={`${exec.kpis.orders} total · ${exec.kpis.fulfilled} fulfilled`} />
                  <KPI testid="exec-open" label="Em Aberto p/ Receber" value={eur(fr?.total_open)} sub={`${fr?.count || 0} faturas · atraso ${eur(fr?.buckets.em_atraso)}`} />
                </div>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <div className="border border-neutral-200 p-4">
                    <div className="mb-1 text-[10px] uppercase tracking-widest text-neutral-500">Previsao de Faturacao (ano {reportingYear})</div>
                    <div className="mb-3 text-xs text-neutral-500">Planeado: <span className="font-mono">{eur(forecastTotals.planned)}</span> · Faturado: <span className="font-mono">{eur(forecastTotals.billed)}</span> · Por faturar: <span className="font-mono">{eur(forecastTotals.remaining)}</span></div>
                    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-neutral-600" aria-label="Legenda da previsao de faturacao">
                      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 border border-[#0072B2] bg-[#0072B2]" aria-hidden="true" />Planeado (por mes)</span>
                      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 border border-[#1F2937] bg-[#1F2937]" aria-hidden="true" />Faturado</span>
                      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 border border-[#9A6700] bg-[#FFC800]" aria-hidden="true" />Por faturar</span>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={fi}>
                        <CartesianGrid stroke="#eee" strokeDasharray="3 3" />
                        <XAxis dataKey="month" fontSize={11} />
                        <YAxis fontSize={11} />
                        <Tooltip content={<ForecastTooltip />} />
                        <Bar dataKey="planned_value" name="Planeado">
                          {fi.map((entry, index) => <Cell key={`planned-${entry.month}`} fill={MONTH_COLORS[index % MONTH_COLORS.length]} />)}
                        </Bar>
                        <Bar dataKey="billed_value" fill="#1F2937" name="Faturado" />
                        <Bar dataKey="remaining_value" fill={COLORS.yellow} name="Por faturar" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="border border-neutral-200 p-4">
                    <div className="mb-3 text-[10px] uppercase tracking-widest text-neutral-500">Recebimentos em aberto (Aging)</div>
                    {fr && (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={[
                          { label: "0-30d", value: fr.buckets["0_30"] },
                          { label: "31-60d", value: fr.buckets["31_60"] },
                          { label: "61-90d", value: fr.buckets["61_90"] },
                          { label: ">90d", value: fr.buckets.gt_90 },
                          { label: "Em atraso", value: fr.buckets.em_atraso },
                        ]}>
                          <CartesianGrid stroke="#eee" strokeDasharray="3 3" />
                          <XAxis dataKey="label" fontSize={11} />
                          <YAxis fontSize={11} />
                          <Tooltip formatter={(value) => eur(value)} />
                          <Bar dataKey="value" fill={COLORS.red} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="commercial" className="mt-6">
            <Table
              testid="table-commercial"
              rows={comm}
              columns={[
                { key: "name", label: "Comercial" },
                { key: "role", label: "Cargo", w: "120px" },
                { key: "leads", label: "Leads", align: "right", w: "80px", render: (row) => <DetailLink align="right" onClick={() => openCommercialDetail(row, "leads")}>{row.leads}</DetailLink> },
                { key: "opps", label: "Opps", align: "right", w: "80px", render: (row) => <DetailLink align="right" onClick={() => openCommercialDetail(row, "opps")}>{row.opps}</DetailLink> },
                { key: "props", label: "Props", align: "right", w: "80px", render: (row) => <DetailLink align="right" onClick={() => openCommercialDetail(row, "props")}>{row.props}</DetailLink> },
                { key: "won", label: "Ganhas", align: "right", w: "80px", render: (row) => <DetailLink align="right" onClick={() => openCommercialDetail(row, "won")}>{row.won}</DetailLink> },
                { key: "conversion_rate", label: "Conv %", align: "right", w: "90px", render: (row) => pct(row.conversion_rate) },
                { key: "won_value", label: "Valor Ganho", align: "right", w: "140px", render: (row) => <DetailLink align="right" onClick={() => openCommercialDetail(row, "won_value")}>{eur(row.won_value)}</DetailLink> },
                { key: "won_vab", label: "VAB", align: "right", w: "120px", render: (row) => <DetailLink align="right" onClick={() => openCommercialDetail(row, "won_vab")}>{eur(row.won_vab)}</DetailLink> },
              ]}
            />
          </TabsContent>

          <TabsContent value="client" className="mt-6">
            <Table
              testid="table-client"
              rows={cli}
              columns={[
                { key: "name", label: "Cliente", render: (row) => <DetailLink onClick={() => openClientDetail(row, "name")}>{row.name}</DetailLink> },
                { key: "segment", label: "Segmento", w: "120px" },
                { key: "props", label: "Props", align: "right", w: "80px", render: (row) => <DetailLink align="right" onClick={() => openClientDetail(row, "props")}>{row.props}</DetailLink> },
                { key: "won", label: "Ganhas", align: "right", w: "80px", render: (row) => <DetailLink align="right" onClick={() => openClientDetail(row, "won")}>{row.won}</DetailLink> },
                { key: "orders", label: "Enc.", align: "right", w: "80px", render: (row) => <DetailLink align="right" onClick={() => openClientDetail(row, "orders")}>{row.orders}</DetailLink> },
                { key: "orders_value", label: "Valor Enc.", align: "right", w: "140px", render: (row) => <DetailLink align="right" onClick={() => openClientDetail(row, "orders_value")}>{eur(row.orders_value)}</DetailLink> },
                { key: "orders_vab", label: "VAB Enc.", align: "right", w: "140px", render: (row) => <DetailLink align="right" onClick={() => openClientDetail(row, "orders_vab")}>{eur(row.orders_vab)}</DetailLink> },
              ]}
            />
          </TabsContent>

          <TabsContent value="manufacturer" className="mt-6">
            <Table
              testid="table-manufacturer"
              rows={manuf}
              columns={[
                { key: "name", label: "Fabricante" },
                { key: "opps", label: "Opps", align: "right", w: "100px", render: (row) => <DetailLink align="right" onClick={() => openManufacturerDetail(row, "opps")}>{row.opps}</DetailLink> },
                { key: "opps_value", label: "Valor Opps", align: "right", w: "160px", render: (row) => <DetailLink align="right" onClick={() => openManufacturerDetail(row, "opps_value")}>{eur(row.opps_value)}</DetailLink> },
                { key: "props", label: "Props", align: "right", w: "100px", render: (row) => <DetailLink align="right" onClick={() => openManufacturerDetail(row, "props")}>{row.props}</DetailLink> },
                { key: "won", label: "Ganhas", align: "right", w: "100px", render: (row) => <DetailLink align="right" onClick={() => openManufacturerDetail(row, "won")}>{row.won}</DetailLink> },
                { key: "won_value", label: "Valor Ganho", align: "right", w: "160px", render: (row) => <DetailLink align="right" onClick={() => openManufacturerDetail(row, "won_value")}>{eur(row.won_value)}</DetailLink> },
                { key: "won_vab", label: "VAB", align: "right", w: "140px", render: (row) => <DetailLink align="right" onClick={() => openManufacturerDetail(row, "won_vab")}>{eur(row.won_vab)}</DetailLink> },
              ]}
            />
          </TabsContent>

          <TabsContent value="forecast" className="mt-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="border border-neutral-200 p-4" data-testid="forecast-invoicing-panel">
                <div className="mb-1 text-[10px] uppercase tracking-widest text-neutral-500">Previsao de Faturacao por Mes · {reportingYear}</div>
                <div className="mb-3 text-xs text-neutral-500">Planeado: <span className="font-mono">{eur(forecastTotals.planned)}</span> · Faturado: <span className="font-mono">{eur(forecastTotals.billed)}</span> · Por faturar: <span className="font-mono">{eur(forecastTotals.remaining)}</span></div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={fi}>
                    <CartesianGrid stroke="#eee" strokeDasharray="3 3" />
                    <XAxis dataKey="month" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip content={<ForecastTooltip />} />
                    <Legend />
                    <Bar dataKey="planned_value" name="Planeado">
                      {fi.map((entry, index) => <Cell key={`forecast-planned-${entry.month}`} fill={MONTH_COLORS[index % MONTH_COLORS.length]} />)}
                    </Bar>
                    <Bar dataKey="billed_value" fill="#1F2937" name="Faturado" />
                    <Bar dataKey="remaining_value" fill={COLORS.yellow} name="Por faturar" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="border border-neutral-200 p-4" data-testid="forecast-receiving-panel">
                <div className="mb-3 text-[10px] uppercase tracking-widest text-neutral-500">Recebimentos em aberto (Aging)</div>
                {fr && (
                  <div className="space-y-2">
                    <div className="text-3xl font-mono">{eur(fr.total_open)}</div>
                    <div className="mb-3 text-xs text-neutral-500">
                      Mostra apenas faturas emitidas e ainda nao totalmente recebidas · {fr.count} faturas
                    </div>
                    {[
                      ["0-30 dias", fr.buckets["0_30"], "#00A859"],
                      ["31-60 dias", fr.buckets["31_60"], "#FFC800"],
                      ["61-90 dias", fr.buckets["61_90"], "#FF8800"],
                      [">90 dias", fr.buckets.gt_90, "#FF2A00"],
                      ["Em atraso (>30d)", fr.buckets.em_atraso, "#B91C1C"],
                    ].map(([label, value, color]) => (
                      <div key={label} className="flex items-center gap-3 text-sm">
                        <div className="w-32 text-xs text-neutral-600">{label}</div>
                        <div className="h-6 flex-1 bg-neutral-100">
                          <div className="h-full" style={{ width: `${fr.total_open ? Math.min(100, (value / fr.total_open) * 100) : 0}%`, background: color }} />
                        </div>
                        <div className="w-24 text-right font-mono text-xs">{eur(value)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-6 border border-neutral-200 p-4" data-testid="proposal-follow-up-panel">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-[10px] uppercase tracking-widest text-neutral-500">Propostas com data prevista de fecho · {reportingYear}</div>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => download(`/exports/proposals-follow-up.pdf?year=${reportingYear}&scope=${followUpScope}`, `propostas-fecho-${reportingYear}-${followUpScope}.pdf`)} data-testid="export-proposal-follow-up-panel-pdf" className="border border-[#002FA7] px-3 py-1.5 text-xs text-[#002FA7] transition-colors hover:bg-[#002FA7] hover:text-white">↓ PDF</button>
                  <button onClick={() => download(`/exports/proposals-follow-up.csv?year=${reportingYear}&scope=${followUpScope}`, `propostas-fecho-${reportingYear}-${followUpScope}.csv`)} data-testid="export-proposal-follow-up-panel-csv" className="border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50">↓ Excel/CSV</button>
                  {[['30d', '30 dias'], ['quarter', 'Quarter'], ['year', 'Até final do ano']].map(([value, label]) => (
                    <button key={value} type="button" onClick={() => setFollowUpScope(value)} className={`px-3 py-1.5 text-xs ${followUpScope === value ? "bg-[#002FA7] text-white" : "bg-white text-neutral-700 hover:bg-neutral-50"}`} data-testid={`proposal-follow-up-${value}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mb-3 text-xs text-neutral-500">A apresentar propostas com data prevista de fecho no período selecionado.</div>
              <Table
                testid="proposal-follow-up-table"
                rows={visibleProposalFollowUps}
                footer={{
                  horizon: "TOTAL",
                  value: visibleProposalFollowUps.reduce((total, row) => total + row.value, 0),
                  vab: visibleProposalFollowUps.reduce((total, row) => total + row.vab, 0),
                }}
                columns={[
                  { key: "horizon", label: "Horizonte", w: "170px" },
                  { key: "number", label: "Proposta", w: "150px", mono: true, render: (row) => <Link to={`/propostas/${row.id}`} className="text-[#002FA7] hover:underline">{row.number}</Link> },
                  { key: "client", label: "Cliente" },
                  { key: "description", label: "Descrição", w: "260px" },
                  { key: "value", label: "Valor", w: "130px", align: "right", render: (row) => eur(row.value) },
                  { key: "vab", label: "VAB", w: "130px", align: "right", render: (row) => eur(row.vab) },
                  { key: "status", label: "Estado", w: "140px" },
                  { key: "followUp", label: "Data prevista de fecho", w: "170px", mono: true, render: (row) => dateShort(row.followUp) },
                ]}
              />
            </div>
          </TabsContent>

          <TabsContent value="vab" className="mt-6">
            {vab && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                  <KPI testid="vab-pipeline" label="VAB Pipeline" value={eur(vab.pipeline_vab)} sub="Oportunidades abertas" />
                  <KPI testid="vab-won" label="VAB Ganho" value={eur(vab.won_vab)} sub="Propostas ganhas" />
                  <KPI testid="vab-orders" label="VAB Encomendas" value={eur(vab.orders_vab)} sub="Encomendas ativas" />
                </div>
                <div className="border border-neutral-200 p-4">
                  <div className="mb-3 text-[10px] uppercase tracking-widest text-neutral-500">Margem VAB Mensal</div>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={vab.monthly}>
                      <CartesianGrid stroke="#eee" strokeDasharray="3 3" />
                      <XAxis dataKey="month" fontSize={11} />
                      <YAxis yAxisId="left" fontSize={11} />
                      <YAxis yAxisId="right" orientation="right" fontSize={11} unit="%" />
                      <Tooltip formatter={(value, name) => name === "margin_pct" ? `${value}%` : eur(value)} />
                      <Legend />
                      <Line yAxisId="left" type="monotone" dataKey="value" stroke={COLORS.blue} name="Valor Ganho" strokeWidth={2} />
                      <Line yAxisId="left" type="monotone" dataKey="vab" stroke={COLORS.green} name="VAB" strokeWidth={2} />
                      <Line yAxisId="right" type="monotone" dataKey="margin_pct" stroke={COLORS.red} name="Margem %" strokeDasharray="5 5" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[85vh] max-w-6xl overflow-hidden rounded-none">
          <DialogHeader>
            <DialogTitle className="font-display">{detailConfig.title}</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto pr-1">
            {detailConfig.description && <div className="mb-3 text-sm text-neutral-600">{detailConfig.description}</div>}
            <Table columns={detailConfig.columns} rows={detailConfig.rows} testid="reporting-detail-table" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDetailOpen(false)} className="rounded-none">Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={annualBillingOpen} onOpenChange={setAnnualBillingOpen}>
        <DialogContent className="max-w-md rounded-none" data-testid="annual-billing-dialog">
          <DialogHeader><DialogTitle className="font-display">Faturacao anual</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="text-xs text-neutral-500">Escolha o ano completo ou um periodo especifico para exportar.</div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm"><input type="radio" checked={annualBillingMode === "year"} onChange={() => setAnnualBillingMode("year")} /> Ano completo ({reportingYear})</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" checked={annualBillingMode === "range"} onChange={() => setAnnualBillingMode("range")} /> Periodo especifico</label>
            </div>
            {annualBillingMode === "range" && (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Mes inicial</Label><Input type="month" value={annualBillingStart} min={`${reportingYear}-01`} max={`${reportingYear}-12`} onChange={(event) => setAnnualBillingStart(event.target.value)} className="rounded-none font-mono" data-testid="annual-billing-start" /></div>
                <div><Label>Mes final</Label><Input type="month" value={annualBillingEnd} min={`${reportingYear}-01`} max={`${reportingYear}-12`} onChange={(event) => setAnnualBillingEnd(event.target.value)} className="rounded-none font-mono" data-testid="annual-billing-end" /></div>
              </div>
            )}
            <div><Label>Formato</Label><div className="mt-1 flex gap-2">
              <button type="button" onClick={() => setAnnualBillingFormat("pdf")} className={`flex-1 border px-3 py-2 text-xs ${annualBillingFormat === "pdf" ? "border-[#002FA7] bg-[#002FA7] text-white" : "border-neutral-300"}`}>PDF</button>
              <button type="button" onClick={() => setAnnualBillingFormat("csv")} className={`flex-1 border px-3 py-2 text-xs ${annualBillingFormat === "csv" ? "border-[#002FA7] bg-[#002FA7] text-white" : "border-neutral-300"}`}>Excel/CSV</button>
            </div></div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setAnnualBillingOpen(false)} className="rounded-none">Cancelar</Button><Button onClick={submitAnnualBillingExport} data-testid="annual-billing-submit" className="rounded-none bg-[#002FA7] text-white">Exportar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={billingOpen} onOpenChange={setBillingOpen}>
        <DialogContent className="max-h-[85vh] max-w-md overflow-hidden rounded-none" data-testid="billing-orders-dialog">
          <DialogHeader><DialogTitle className="font-display">Ordem de Faturacao</DialogTitle></DialogHeader>
          <div className="space-y-3 overflow-y-auto pr-1">
            <div className="text-xs text-neutral-500">Escolha o mes e o formato para exportar as faturas emitidas.</div>
            <div>
              <Label>Mes (AAAA-MM)</Label>
              <Input
                type="month"
                value={billingMonth}
                onChange={(e) => setBillingMonth(e.target.value)}
                min={`${reportingYear}-01`}
                max={`${reportingYear}-12`}
                className="rounded-none font-mono"
                data-testid="billing-orders-month-input"
              />
            </div>
            <div>
              <Label>Formato</Label>
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={() => setBillingFormat("csv")}
                  data-testid="billing-format-csv"
                  className={`flex-1 border px-3 py-2 text-xs font-medium transition-colors ${billingFormat === "csv" ? "border-[#002FA7] bg-[#002FA7] text-white" : "border-neutral-300 hover:bg-neutral-50"}`}
                >CSV (importar)</button>
                <button
                  type="button"
                  onClick={() => setBillingFormat("pdf")}
                  data-testid="billing-format-pdf"
                  className={`flex-1 border px-3 py-2 text-xs font-medium transition-colors ${billingFormat === "pdf" ? "border-[#002FA7] bg-[#002FA7] text-white" : "border-neutral-300 hover:bg-neutral-50"}`}
                >PDF (contabilista)</button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBillingOpen(false)} className="rounded-none">Cancelar</Button>
            <Button variant="outline" onClick={submitCompetenceExport} data-testid="billing-competence-submit-btn" className="rounded-none">Competencias CSV</Button>
            <Button onClick={submitBillingExport} data-testid="billing-orders-submit-btn" className="rounded-none bg-[#002FA7] text-white hover:bg-[#002277]">Descarregar {billingFormat.toUpperCase()}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentImportOpen} onOpenChange={(open) => !open && setPaymentImportOpen(false)}>
        <DialogContent className="flex max-h-[90vh] max-w-6xl flex-col overflow-hidden rounded-none" data-testid="payment-import-dialog">
          <DialogHeader className="shrink-0"><DialogTitle className="font-display">Pre-conciliacao de recebimentos</DialogTitle></DialogHeader>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            <div className="text-xs text-neutral-600">Ficheiro: <span className="font-mono">{paymentImportPreview?.filename}</span>. Nenhuma baixa foi efetuada.</div>
            <div className="flex flex-wrap gap-3 text-xs text-neutral-600">
              <span>Total: {paymentImportPreview?.summary?.total || 0}</span>
              <span className="text-[#00A859]">Exatas: {paymentImportPreview?.summary?.matched || 0}</span>
              <span className="text-[#9A6700]">Divergentes: {paymentImportPreview?.summary?.divergent || 0}</span>
              <span className="text-[#B91C1C]">Pendentes: {paymentImportPreview?.summary?.unmatched || 0}</span>
            </div>
            <div className="overflow-x-auto border border-neutral-200">
              <div className="grid min-w-[1050px] grid-cols-[40px_105px_150px_150px_150px_125px_125px_145px] gap-2 border-b border-neutral-200 px-3 py-2 text-[10px] uppercase tracking-widest text-neutral-500">
                <div></div><div>Data</div><div>Fatura importada</div><div>Fatura encontrada</div><div>Cliente</div><div className="text-right">Valor recebido</div><div className="text-right">Saldo fatura</div><div>Resultado</div>
              </div>
              {(paymentImportPreview?.rows || []).map((row, index) => (
                <div key={row.source_index} className="grid min-w-[1050px] grid-cols-[40px_105px_150px_150px_150px_125px_125px_145px] items-center gap-2 border-b border-neutral-100 px-3 py-2 text-xs">
                  <input type="checkbox" checked={!!row._selected} disabled={!row.invoice_id || row.status === "erro" || row.status === "sem_correspondencia" || row.status === "conflito"} onChange={(event) => setPaymentImportPreview((current) => current ? { ...current, rows: current.rows.map((item, itemIndex) => itemIndex === index ? { ...item, _selected: event.target.checked } : item) } : current)} />
                  <div className="font-mono">{row.paid_at || "-"}</div>
                  <div className="truncate">{row.external_number || row.internal_number || "-"}</div>
                  <div className="font-mono">{row.invoice_number || "-"}</div>
                  <div className="truncate">{row.client_name || row.client || "-"}</div>
                  <div className="text-right font-mono">{eur(row.amount)}</div>
                  <div className="text-right font-mono">{row.invoice_open != null ? eur(row.invoice_open) : "-"}</div>
                  <div className={row.status === "correspondencia_exata" ? "text-[#00A859]" : row.status === "divergencia_valor" ? "text-[#9A6700]" : "text-[#B91C1C]"}>{row.status === "correspondencia_exata" ? "Correspondencia exata" : row.status === "divergencia_valor" ? `Divergencia (${eur(row.difference)})` : row.error || "Pendente"}</div>
                </div>
              ))}
            </div>
            <div>
              <Label>Motivo / referencia da importacao</Label>
              <Input value={paymentImportReason} onChange={(event) => setPaymentImportReason(event.target.value)} placeholder="Ex.: Conciliacao bancaria de julho de 2026" className="mt-1 rounded-none" data-testid="payment-import-reason" />
            </div>
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="ghost" onClick={() => setPaymentImportOpen(false)} className="rounded-none">Cancelar</Button>
            <Button onClick={confirmPaymentImport} disabled={paymentImportLoading} data-testid="confirm-payment-import" className="rounded-none bg-[#002FA7] text-white hover:bg-[#002277]">Confirmar baixas selecionadas</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
