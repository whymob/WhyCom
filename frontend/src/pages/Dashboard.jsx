import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { eur, pct } from "@/lib/fmt";
import PageHeader from "@/components/PageHeader";
import { TrendingUp, Sparkles, Target, FileText, Package, Percent, AlertTriangle, Factory } from "lucide-react";

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

export default function Dashboard() {
  const [kpis, setKpis] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [topManuf, setTopManuf] = useState([]);

  useEffect(() => {
    api.get("/dashboard/kpis").then((response) => setKpis(response.data));
    api.get("/dashboard/alerts").then((response) => setAlerts(response.data.alerts));
    api.get("/analytics/by-manufacturer").then((response) => {
      const rows = (response.data.rows || [])
        .filter((row) => row.manufacturer_id && row.won_vab > 0)
        .sort((a, b) => b.won_vab - a.won_vab)
        .slice(0, 5);
      setTopManuf(rows);
    });
  }, []);

  const maxVab = Math.max(1, ...topManuf.map((row) => row.won_vab));

  return (
    <div>
      <PageHeader kicker="Visao geral" title="Dashboard Comercial" />
      <div className="space-y-8 p-8">
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
              to="/opportunities?status_scope=open"
            />
            <KPI
              testid="kpi-props-sent"
              label="Propostas em Curso"
              value={kpis?.props_sent ?? "-"}
              sub={`${kpis?.props_won ?? 0} ganhas · ${kpis?.props_lost ?? 0} perdidas`}
              icon={FileText}
              to="/proposals?status_scope=in_progress"
            />
            <KPI testid="kpi-conv-rate" label="Taxa de Conversao" value={pct(kpis?.conversion_rate)} sub="Propostas fechadas" icon={Percent} />
          </div>
        </section>

        <section>
          <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-neutral-500">Resultado</div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <KPI testid="kpi-won-value" label="Valor Ganho" value={eur(kpis?.won_value)} sub="Propostas ganhas · sem IVA" icon={TrendingUp} />
            <KPI testid="kpi-won-vab" label="VAB Ganho" value={eur(kpis?.won_vab)} sub="Margem bruta ganha" icon={TrendingUp} />
            <KPI testid="kpi-orders" label="Encomendas" value={kpis?.orders_count ?? "-"} sub={`${eur(kpis?.orders_value)} · VAB ${eur(kpis?.orders_vab)}`} icon={Package} />
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-neutral-500"><Factory size={12} /> Top 5 Fabricantes por VAB</div>
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

        <section>
          <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-neutral-500"><AlertTriangle size={12} /> Alertas & Desvios</div>
          <div className="border border-neutral-200" data-testid="alerts-list">
            {alerts.length === 0 && <div className="p-4 text-sm text-neutral-500" data-testid="alerts-empty">Sem alertas ativos.</div>}
            {alerts.map((alert, index) => (
              <div key={index} className={`border-b border-neutral-100 border-l-4 px-4 py-2.5 text-sm ${LEVEL_STYLE[alert.level] || ""}`} data-testid={`alert-${index}`}>
                <div className="flex items-center justify-between gap-2">
                  <span>{alert.message}</span>
                  <span className="text-[10px] uppercase tracking-widest text-neutral-500">{alert.type}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
