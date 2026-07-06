import React, { useEffect, useState } from "react";
import { api, API } from "@/lib/api";
import { eur, pct } from "@/lib/fmt";
import PageHeader from "@/components/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, Legend } from "recharts";

const COLORS = { blue: "#002FA7", green: "#00A859", yellow: "#FFC800", red: "#FF2A00" };

function Table({ columns, rows, testid }) {
  return (
    <div className="border border-neutral-200" data-testid={testid}>
      <div className={`grid text-[10px] uppercase tracking-widest text-neutral-500 border-b border-neutral-200 px-4 py-2`} style={{ gridTemplateColumns: columns.map((c) => c.w || "1fr").join(" ") }}>
        {columns.map((c) => <div key={c.key} className={c.align === "right" ? "text-right" : ""}>{c.label}</div>)}
      </div>
      {rows.length === 0 && <div className="p-4 text-sm text-neutral-500">Sem dados.</div>}
      {rows.map((r, i) => (
        <div key={i} className="grid px-4 py-2.5 border-b border-neutral-100 text-sm" style={{ gridTemplateColumns: columns.map((c) => c.w || "1fr").join(" ") }}>
          {columns.map((c) => (
            <div key={c.key} className={`${c.align === "right" ? "text-right font-mono" : ""} ${c.mono ? "font-mono" : ""}`}>{c.render ? c.render(r) : r[c.key]}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

function KPI({ label, value, sub, testid }) {
  return (
    <div className="border border-neutral-200 p-4" data-testid={testid}>
      <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">{label}</div>
      <div className="mt-2 font-mono text-2xl">{value}</div>
      {sub && <div className="text-xs text-neutral-500 mt-1">{sub}</div>}
    </div>
  );
}

export default function Reporting() {
  const [tab, setTab] = useState("executive");
  const [exec, setExec] = useState(null);
  const [comm, setComm] = useState([]);
  const [cli, setCli] = useState([]);
  const [manuf, setManuf] = useState([]);
  const [vab, setVab] = useState(null);
  const [fi, setFi] = useState([]);
  const [fr, setFr] = useState(null);

  const download = async (path, filename) => {
    const token = localStorage.getItem("whymob_token");
    const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  };

  const [billingOpen, setBillingOpen] = useState(false);
  const [billingMonth, setBillingMonth] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const submitBillingExport = async () => {
    if (!/^\d{4}-\d{2}$/.test(billingMonth)) { toast.error("Mês inválido. Use o formato AAAA-MM."); return; }
    await download(`/exports/billing-orders.csv?month=${billingMonth}`, `ordem-faturacao-${billingMonth}.csv`);
    setBillingOpen(false);
    toast.success(`Download iniciado (${billingMonth})`);
  };

  useEffect(() => {
    api.get("/analytics/executive").then((r) => { setExec(r.data); setFi(r.data.forecast_invoicing); setFr(r.data.forecast_receiving); setVab(r.data.vab); });
    api.get("/analytics/by-commercial").then((r) => setComm(r.data.rows));
    api.get("/analytics/by-client").then((r) => setCli(r.data.rows));
    api.get("/analytics/by-manufacturer").then((r) => setManuf(r.data.rows));
  }, []);

  return (
    <div>
      <PageHeader kicker="Reporting" title="Dashboards Avançados" actions={
        <div className="flex gap-2 text-xs flex-wrap">
          <button onClick={() => setBillingOpen(true)} data-testid="export-billing-orders-btn" className="border border-[#002FA7] text-[#002FA7] px-3 py-1.5 hover:bg-[#002FA7] hover:text-white transition-colors">↓ Ordem faturação (por mês)</button>
          <button onClick={() => download("/exports/invoices.csv", "faturas.csv")} data-testid="export-invoices-csv" className="border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50">↓ Faturas CSV</button>
          <button onClick={() => download("/exports/reporting-commercial.csv", "reporting-comerciais.csv")} data-testid="export-commercial-csv" className="border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50">↓ Comerciais CSV</button>
          <button onClick={() => download("/exports/timesheet.csv", "timesheet.csv")} data-testid="export-timesheet-csv" className="border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50">↓ Timesheet CSV</button>
        </div>
      } />
      <div className="p-8">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="rounded-none bg-transparent border border-neutral-200 p-0 h-auto">
            {[
              ["executive", "Executivo"], ["commercial", "Por Comercial"], ["client", "Por Cliente"],
              ["manufacturer", "Por Fabricante"], ["forecast", "Previsões"], ["vab", "Análise VAB"],
            ].map(([k, l]) => (
              <TabsTrigger key={k} value={k} className="rounded-none data-[state=active]:bg-[#002FA7] data-[state=active]:text-white text-xs px-4 py-2" data-testid={`tab-${k}`}>{l}</TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="executive" className="mt-6">
            {exec && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <KPI testid="exec-won-value" label="Valor Ganho" value={eur(exec.kpis.won_value)} sub={`${exec.kpis.props} propostas`} />
                  <KPI testid="exec-won-vab" label="VAB Ganho" value={eur(exec.kpis.won_vab)} sub={`Margem ${pct(exec.kpis.won_value ? exec.kpis.won_vab / exec.kpis.won_value * 100 : 0)}`} />
                  <KPI testid="exec-orders" label="Encomendas" value={eur(exec.kpis.orders_value)} sub={`${exec.kpis.orders} total · ${exec.kpis.fulfilled} fulfilled`} />
                  <KPI testid="exec-open" label="Em Aberto p/ Receber" value={eur(fr?.total_open)} sub={`${fr?.count || 0} faturas · atraso ${eur(fr?.buckets.em_atraso)}`} />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="border border-neutral-200 p-4">
                    <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-3">Previsão de Faturação (próximos meses)</div>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={fi}>
                        <CartesianGrid stroke="#eee" strokeDasharray="3 3" />
                        <XAxis dataKey="month" fontSize={11} />
                        <YAxis fontSize={11} />
                        <Tooltip formatter={(v) => eur(v)} />
                        <Bar dataKey="planned_value" fill={COLORS.blue} name="Planeado" />
                        <Bar dataKey="remaining_value" fill={COLORS.yellow} name="Por faturar" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="border border-neutral-200 p-4">
                    <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-3">Aging de Recebimentos</div>
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
                          <Tooltip formatter={(v) => eur(v)} />
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
            <Table testid="table-commercial" rows={comm} columns={[
              { key: "name", label: "Comercial" },
              { key: "role", label: "Cargo", w: "120px" },
              { key: "leads", label: "Leads", align: "right", w: "80px", mono: true },
              { key: "opps", label: "Opps", align: "right", w: "80px", mono: true },
              { key: "props", label: "Props", align: "right", w: "80px", mono: true },
              { key: "won", label: "Ganhas", align: "right", w: "80px", mono: true },
              { key: "conversion_rate", label: "Conv %", align: "right", w: "90px", render: (r) => pct(r.conversion_rate) },
              { key: "won_value", label: "Valor Ganho", align: "right", w: "140px", render: (r) => eur(r.won_value) },
              { key: "won_vab", label: "VAB", align: "right", w: "120px", render: (r) => eur(r.won_vab) },
            ]} />
          </TabsContent>

          <TabsContent value="client" className="mt-6">
            <Table testid="table-client" rows={cli} columns={[
              { key: "name", label: "Cliente" },
              { key: "segment", label: "Segmento", w: "120px" },
              { key: "props", label: "Props", align: "right", w: "80px", mono: true },
              { key: "won", label: "Ganhas", align: "right", w: "80px", mono: true },
              { key: "orders", label: "Enc.", align: "right", w: "80px", mono: true },
              { key: "orders_value", label: "Valor Enc.", align: "right", w: "140px", render: (r) => eur(r.orders_value) },
              { key: "orders_vab", label: "VAB Enc.", align: "right", w: "140px", render: (r) => eur(r.orders_vab) },
            ]} />
          </TabsContent>

          <TabsContent value="manufacturer" className="mt-6">
            <Table testid="table-manufacturer" rows={manuf} columns={[
              { key: "name", label: "Fabricante" },
              { key: "opps", label: "Opps", align: "right", w: "100px", mono: true },
              { key: "opps_value", label: "Valor Opps", align: "right", w: "160px", render: (r) => eur(r.opps_value) },
              { key: "props", label: "Props", align: "right", w: "100px", mono: true },
              { key: "won", label: "Ganhas", align: "right", w: "100px", mono: true },
              { key: "won_value", label: "Valor Ganho", align: "right", w: "160px", render: (r) => eur(r.won_value) },
              { key: "won_vab", label: "VAB", align: "right", w: "140px", render: (r) => eur(r.won_vab) },
            ]} />
          </TabsContent>

          <TabsContent value="forecast" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="border border-neutral-200 p-4" data-testid="forecast-invoicing-panel">
                <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-3">Previsão de Faturação por Mês</div>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={fi}>
                    <CartesianGrid stroke="#eee" strokeDasharray="3 3" />
                    <XAxis dataKey="month" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip formatter={(v) => eur(v)} />
                    <Legend />
                    <Line type="monotone" dataKey="planned_value" stroke={COLORS.blue} name="Planeado" strokeWidth={2} />
                    <Line type="monotone" dataKey="remaining_value" stroke={COLORS.green} name="Por faturar" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="border border-neutral-200 p-4" data-testid="forecast-receiving-panel">
                <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-3">Previsão de Recebimento (Aging)</div>
                {fr && (
                  <div className="space-y-2">
                    <div className="text-3xl font-mono">{eur(fr.total_open)}</div>
                    <div className="text-xs text-neutral-500 mb-3">Total em aberto · {fr.count} faturas</div>
                    {[
                      ["0-30 dias", fr.buckets["0_30"], "#00A859"],
                      ["31-60 dias", fr.buckets["31_60"], "#FFC800"],
                      ["61-90 dias", fr.buckets["61_90"], "#FF8800"],
                      [">90 dias", fr.buckets.gt_90, "#FF2A00"],
                      ["Em atraso (>30d)", fr.buckets.em_atraso, "#B91C1C"],
                    ].map(([l, v, c]) => (
                      <div key={l} className="flex items-center gap-3 text-sm">
                        <div className="w-32 text-xs text-neutral-600">{l}</div>
                        <div className="flex-1 h-6 bg-neutral-100">
                          <div className="h-full" style={{ width: `${fr.total_open ? Math.min(100, (v / fr.total_open) * 100) : 0}%`, background: c }} />
                        </div>
                        <div className="w-24 text-right font-mono text-xs">{eur(v)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="vab" className="mt-6">
            {vab && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <KPI testid="vab-pipeline" label="VAB Pipeline" value={eur(vab.pipeline_vab)} sub="Oportunidades abertas" />
                  <KPI testid="vab-won" label="VAB Ganho" value={eur(vab.won_vab)} sub="Propostas ganhas" />
                  <KPI testid="vab-orders" label="VAB Encomendas" value={eur(vab.orders_vab)} sub="Encomendas ativas" />
                </div>
                <div className="border border-neutral-200 p-4">
                  <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-3">Margem VAB Mensal</div>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={vab.monthly}>
                      <CartesianGrid stroke="#eee" strokeDasharray="3 3" />
                      <XAxis dataKey="month" fontSize={11} />
                      <YAxis yAxisId="left" fontSize={11} />
                      <YAxis yAxisId="right" orientation="right" fontSize={11} unit="%" />
                      <Tooltip formatter={(v, name) => name === "margin_pct" ? `${v}%` : eur(v)} />
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

      <Dialog open={billingOpen} onOpenChange={setBillingOpen}>
        <DialogContent className="max-w-md rounded-none" data-testid="billing-orders-dialog">
          <DialogHeader><DialogTitle className="font-display">Ordem de Faturação</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-neutral-500">Escolha o mês para exportar as faturas emitidas. O ficheiro CSV contém uma linha por linha de fatura (fatura, cliente, encomenda, valores, IVA, estado).</div>
            <div>
              <Label>Mês (AAAA-MM)</Label>
              <Input
                type="month"
                value={billingMonth}
                onChange={(e) => setBillingMonth(e.target.value)}
                className="rounded-none font-mono"
                data-testid="billing-orders-month-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBillingOpen(false)} className="rounded-none">Cancelar</Button>
            <Button onClick={submitBillingExport} data-testid="billing-orders-submit-btn" className="rounded-none bg-[#002FA7] hover:bg-[#002277] text-white">Descarregar CSV</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
