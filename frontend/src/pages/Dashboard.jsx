import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { eur, pct } from "@/lib/fmt";
import PageHeader from "@/components/PageHeader";
import { TrendingUp, Sparkles, Target, FileText, Package, Percent, AlertTriangle, Factory } from "lucide-react";
import { BarChart, Bar, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const LEVEL_STYLE = {
  info: "border-l-[#002FA7] bg-[#E0E7FF]/40",
  warning: "border-l-[#FFC800] bg-[#FEF9C3]",
  danger: "border-l-[#FF2A00] bg-[#FEE2E2]",
};

function KPI({ label, value, sub, testid, icon: Icon, to }) {
  return (
    <div className="border border-neutral-200 bg-white p-5" data-testid={testid}>
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">{label}</div>
        {Icon && <Icon size={14} strokeWidth={1.5} className="text-neutral-400" />}
      </div>
      {to ? (
        <Link to={to} className="mt-3 inline-block font-mono font-medium text-2xl tracking-tight text-[#002FA7] hover:underline">
          {value}
        </Link>
      ) : (
        <div className="mt-3 font-mono font-medium text-2xl tracking-tight">{value}</div>
      )}
      {sub && <div className="mt-1 text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}

function getAlertHref(alert) {
  if (alert.type === "proposta_sem_encomenda") return `/propostas/${alert.ref_id}`;
  if (alert.type === "fatura_atraso" && alert.order_id) return `/encomendas/${alert.order_id}#faturas`;
  if (["encomenda_sem_plano", "desvio_plano", "plano_atraso"].includes(alert.type)) return `/encomendas/${alert.ref_id}`;
  return null;
}

function getAlertTypeLabel(type) {
  if (type === "proposta_sem_encomenda") return "Proposta";
  if (type === "encomenda_sem_plano") return "Encomenda sem plano";
  if (type === "desvio_plano") return "Desvio no plano";
  if (type === "plano_atraso") return "Plano em atraso";
  if (type === "fatura_atraso") return "Fatura em atraso";
  return type;
}

export default function Dashboard() {
  const [kpis, setKpis] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [topManuf, setTopManuf] = useState([]);
  const [dashboardYear, setDashboardYear] = useState(new Date().getFullYear());

  useEffect(() => {
    api.get(`/dashboard/kpis?year=${dashboardYear}`).then((response) => setKpis(response.data));
    api.get("/dashboard/alerts").then((response) => setAlerts(response.data.alerts));
    api.get(`/analytics/by-manufacturer?year=${dashboardYear}`).then((response) => {
      const rows = (response.data.rows || [])
        .filter((row) => row.manufacturer_id && row.won_vab > 0)
        .sort((a, b) => b.won_vab - a.won_vab)
        .slice(0, 5);
      setTopManuf(rows);
    });
  }, [dashboardYear]);

  const maxVab = Math.max(1, ...topManuf.map((row) => row.won_vab));
  const criticalAlerts = alerts.filter((alert) => alert.level === "danger");
  const visibleAlerts = alerts.slice(0, 5);

  return (
    <div>
      <PageHeader
        kicker="Visao geral"
        title="Dashboard Comercial"
        actions={(
          <div className="flex items-center gap-2 text-xs">
            <label htmlFor="dashboard-year" className="text-neutral-500">Ano</label>
            <select
              id="dashboard-year"
              value={dashboardYear}
              onChange={(event) => setDashboardYear(Number(event.target.value))}
              className="h-8 rounded-none border border-neutral-300 bg-white px-2 font-mono text-xs"
              data-testid="dashboard-year-select"
            >
              {Array.from({ length: 7 }, (_, index) => new Date().getFullYear() - 3 + index).map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
        )}
      />
      <div className="space-y-8 p-8">
        <section className="border border-neutral-200 bg-white" data-testid="alerts-highlight">
          <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center border border-[#FFC800] bg-[#FEF9C3] text-[#7C5A00]">
                <AlertTriangle size={16} />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">Alertas & Desvios</div>
                <div className="mt-1 text-sm text-neutral-700">
                  {alerts.length === 0
                    ? "Sem alertas ativos."
                    : `${alerts.length} alerta(s) ativo(s)${criticalAlerts.length ? ` · ${criticalAlerts.length} crítico(s)` : ""}`}
                </div>
              </div>
            </div>
            {alerts.length > visibleAlerts.length && (
              <div className="text-xs text-neutral-500">
                A mostrar os {visibleAlerts.length} mais recentes
              </div>
            )}
          </div>
          <div data-testid="alerts-list">
            {alerts.length === 0 && <div className="p-4 text-sm text-neutral-500" data-testid="alerts-empty">Sem alertas ativos.</div>}
            {visibleAlerts.map((alert, index) => {
              const href = getAlertHref(alert);
              const content = (
                <div
                  className={`border-b border-neutral-100 border-l-4 px-4 py-3 text-sm transition-colors ${LEVEL_STYLE[alert.level] || ""} ${href ? "hover:bg-neutral-50" : ""}`}
                  data-testid={`alert-${index}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-neutral-900">{alert.message}</div>
                      {href && <div className="mt-1 text-xs text-[#002FA7]">Abrir documento relacionado</div>}
                    </div>
                    <span className="whitespace-nowrap text-[10px] uppercase tracking-widest text-neutral-500">{getAlertTypeLabel(alert.type)}</span>
                  </div>
                </div>
              );

              if (!href) return <div key={`${alert.type}-${index}`}>{content}</div>;
              return (
                <Link key={`${alert.type}-${index}`} to={href} className="block">
                  {content}
                </Link>
              );
            })}
          </div>
        </section>

        <section>
          <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-neutral-500">Pipeline</div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4">
            <KPI
              testid="kpi-leads-open"
              label="Leads Abertas"
              value={kpis?.leads_open ?? "-"}
              sub={`Valor pot. ${eur(kpis?.leads_open_value)}`}
              icon={Sparkles}
              to="/leads?status_scope=open"
            />
            <KPI
              testid="kpi-opps-open"
              label="Oportunidades"
              value={kpis?.opps_open ?? "-"}
              sub={`Ponderado ${eur(kpis?.opps_weighted_value)}`}
              icon={Target}
              to="/oportunidades?status_scope=open"
            />
            <KPI
              testid="kpi-props-sent"
              label="Propostas em Curso"
              value={kpis?.props_sent ?? "-"}
              sub={`${kpis?.props_won ?? 0} ganhas · ${kpis?.props_lost ?? 0} perdidas`}
              icon={FileText}
              to="/propostas?status_scope=in_progress"
            />
            <KPI testid="kpi-conv-rate" label="Taxa de Conversao" value={pct(kpis?.conversion_rate)} sub="Propostas fechadas" icon={Percent} />
          </div>
        </section>

        <section>
          <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-neutral-500">Resultado</div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <KPI testid="kpi-won-value" label="Valor Ganho" value={eur(kpis?.won_value)} sub="Propostas ganhas · sem IVA" icon={TrendingUp} />
            <KPI testid="kpi-won-vab" label="VAB Ganho" value={eur(kpis?.won_vab)} sub="Margem bruta ganha" icon={TrendingUp} />
            <KPI testid="kpi-orders" label="Encomendas" value={kpis?.orders_count ?? "-"} sub={`${eur(kpis?.orders_value)} · VAB ${eur(kpis?.orders_vab)}`} icon={Package} to="/encomendas" />
          </div>
        </section>

        <section className="border border-neutral-200 bg-white p-5" data-testid="billing-monthly-chart">
          <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-neutral-500">Faturação mensal c/IVA · {dashboardYear}</div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={kpis?.billing_monthly || []} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid stroke="#eee" strokeDasharray="3 3" />
              <XAxis dataKey="month" fontSize={10} />
              <YAxis fontSize={10} />
              <Tooltip formatter={(value) => eur(value)} />
              <Bar dataKey="total_gross" fill="#002FA7" name="Faturado c/IVA">
                <LabelList dataKey="total_gross" position="top" formatter={(value) => eur(value)} fill="#111111" fontSize={10} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section>
          <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-neutral-500"><Factory size={12} /> Top 5 Fabricantes por VAB · {dashboardYear}</div>
          <div className="border border-neutral-200 bg-white" data-testid="top-manufacturers">
            {topManuf.length === 0 && (
              <div className="p-4 text-sm text-neutral-500" data-testid="top-manufacturers-empty">
                Sem VAB por fabricante - associe fabricantes aos produtos e ganhe propostas para comecar.
              </div>
            )}
            {topManuf.map((manufacturer, index) => {
              const width = Math.max(6, (manufacturer.won_vab / maxVab) * 100);
              return (
                <Link
                  key={manufacturer.manufacturer_id}
                  to={`/funil?manufacturer_id=${manufacturer.manufacturer_id}`}
                  data-testid={`top-manuf-${index}`}
                  className="grid grid-cols-12 items-center gap-3 border-b border-neutral-100 px-4 py-3 transition-colors hover:bg-neutral-50"
                >
                  <div className="col-span-3 truncate text-sm font-medium">{manufacturer.name}</div>
                  <div className="col-span-6">
                    <div className="relative h-6 overflow-hidden bg-neutral-100">
                      <div className="flex h-full items-center bg-[#002FA7] px-2 text-[11px] text-white font-mono" style={{ width: `${width}%` }}>
                        {eur(manufacturer.won_vab)}
                      </div>
                    </div>
                  </div>
                  <div className="col-span-2 text-right font-mono text-xs text-neutral-600">{eur(manufacturer.won_value)}</div>
                  <div className="col-span-1 text-right text-[10px] uppercase tracking-widest text-neutral-500">{manufacturer.won} ganhas</div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="border border-neutral-200 p-6">
          <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-neutral-500">Regra Fulfilled</div>
          <div className="font-display text-xl tracking-tight">
            Valor Encomenda = Valor Planeado = Valor Faturado = Valor Recebido
          </div>
          <p className="mt-2 max-w-2xl text-sm text-neutral-600">
            Uma encomenda so transita para <span className="font-medium text-[#00A859]">Fulfilled</span> quando as quatro linhas de reconciliacao
            coincidirem - em valor e em VAB.
          </p>
        </section>

      </div>
    </div>
  );
}
