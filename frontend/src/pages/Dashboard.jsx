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

function KPI({ label, value, sub, testid, icon: Icon }) {
  return (
    <div className="border border-neutral-200 p-5 bg-white" data-testid={testid}>
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">{label}</div>
        {Icon && <Icon size={14} strokeWidth={1.5} className="text-neutral-400" />}
      </div>
      <div className="mt-3 font-mono font-medium text-2xl tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [kpis, setKpis] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [topManuf, setTopManuf] = useState([]);

  useEffect(() => {
    api.get("/dashboard/kpis").then((r) => setKpis(r.data));
    api.get("/dashboard/alerts").then((r) => setAlerts(r.data.alerts));
    api.get("/analytics/by-manufacturer").then((r) => {
      const rows = (r.data.rows || [])
        .filter((row) => row.manufacturer_id && row.won_vab > 0)
        .sort((a, b) => b.won_vab - a.won_vab)
        .slice(0, 5);
      setTopManuf(rows);
    });
  }, []);

  const maxVab = Math.max(1, ...topManuf.map((r) => r.won_vab));

  return (
    <div>
      <PageHeader kicker="Visão geral" title="Dashboard Comercial" />
      <div className="p-8 space-y-8">
        <section>
          <div className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-3">Pipeline</div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <KPI testid="kpi-leads-open" label="Leads Abertas" value={kpis?.leads_open ?? "—"} sub={`Valor pot. ${eur(kpis?.leads_open_value)}`} icon={Sparkles} />
            <KPI testid="kpi-opps-open" label="Oportunidades" value={kpis?.opps_open ?? "—"} sub={`Ponderado ${eur(kpis?.opps_weighted_value)}`} icon={Target} />
            <KPI testid="kpi-props-sent" label="Propostas em Curso" value={kpis?.props_sent ?? "—"} sub={`${kpis?.props_won ?? 0} ganhas · ${kpis?.props_lost ?? 0} perdidas`} icon={FileText} />
            <KPI testid="kpi-conv-rate" label="Taxa de Conversão" value={pct(kpis?.conversion_rate)} sub="Propostas fechadas" icon={Percent} />
          </div>
        </section>

        <section>
          <div className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-3">Resultado</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KPI testid="kpi-won-value" label="Valor Ganho" value={eur(kpis?.won_value)} sub="Propostas ganhas · sem IVA" icon={TrendingUp} />
            <KPI testid="kpi-won-vab" label="VAB Ganho" value={eur(kpis?.won_vab)} sub="Margem bruta ganha" icon={TrendingUp} />
            <KPI testid="kpi-orders" label="Encomendas" value={kpis?.orders_count ?? "—"} sub={`${eur(kpis?.orders_value)} · VAB ${eur(kpis?.orders_vab)}`} icon={Package} />
          </div>
        </section>

        <section>
          <div className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-3 flex items-center gap-2"><Factory size={12} /> Top 5 Fabricantes por VAB</div>
          <div className="border border-neutral-200 bg-white" data-testid="top-manufacturers">
            {topManuf.length === 0 && (
              <div className="p-4 text-sm text-neutral-500" data-testid="top-manufacturers-empty">
                Sem VAB por fabricante — associe fabricantes aos produtos e ganhe propostas para começar.
              </div>
            )}
            {topManuf.map((m, i) => {
              const w = Math.max(6, (m.won_vab / maxVab) * 100);
              return (
                <Link
                  key={m.manufacturer_id}
                  to={`/funil?manufacturer_id=${m.manufacturer_id}`}
                  data-testid={`top-manuf-${i}`}
                  className="grid grid-cols-12 gap-3 px-4 py-3 border-b border-neutral-100 items-center hover:bg-neutral-50 transition-colors"
                >
                  <div className="col-span-3 text-sm font-medium truncate">{m.name}</div>
                  <div className="col-span-6">
                    <div className="h-6 bg-neutral-100 relative overflow-hidden">
                      <div className="h-full bg-[#002FA7] flex items-center px-2 text-white text-[11px] font-mono" style={{ width: `${w}%` }}>
                        {eur(m.won_vab)}
                      </div>
                    </div>
                  </div>
                  <div className="col-span-2 text-right font-mono text-xs text-neutral-600">{eur(m.won_value)}</div>
                  <div className="col-span-1 text-right text-[10px] uppercase tracking-widest text-neutral-500">{m.won} ganhas</div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="border border-neutral-200 p-6">
          <div className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-2">Regra Fulfilled</div>
          <div className="font-display text-xl tracking-tight">
            Valor Encomenda = Valor Planeado = Valor Faturado = Valor Recebido
          </div>
          <p className="text-sm text-neutral-600 mt-2 max-w-2xl">
            Uma encomenda só transita para <span className="font-medium text-[#00A859]">Fulfilled</span> quando as quatro linhas de reconciliação
            coincidirem — em valor e em VAB.
          </p>
        </section>

        <section>
          <div className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-3 flex items-center gap-2"><AlertTriangle size={12} /> Alertas & Desvios</div>
          <div className="border border-neutral-200" data-testid="alerts-list">
            {alerts.length === 0 && <div className="p-4 text-sm text-neutral-500" data-testid="alerts-empty">Sem alertas ativos.</div>}
            {alerts.map((a, i) => (
              <div key={i} className={`border-l-4 px-4 py-2.5 text-sm border-b border-neutral-100 ${LEVEL_STYLE[a.level] || ""}`} data-testid={`alert-${i}`}>
                <div className="flex items-center justify-between gap-2">
                  <span>{a.message}</span>
                  <span className="text-[10px] uppercase tracking-widest text-neutral-500">{a.type}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
