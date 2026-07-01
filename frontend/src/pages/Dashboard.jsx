import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { eur, pct } from "@/lib/fmt";
import PageHeader from "@/components/PageHeader";
import { TrendingUp, Sparkles, Target, FileText, Package, Percent } from "lucide-react";

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

  useEffect(() => {
    api.get("/dashboard/kpis").then((r) => setKpis(r.data));
  }, []);

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

        <section className="border border-neutral-200 p-6">
          <div className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-2">Regra Fulfilled</div>
          <div className="font-display text-xl tracking-tight">
            Valor Encomenda = Valor Planeado = Valor Faturado = Valor Recebido
          </div>
          <p className="text-sm text-neutral-600 mt-2 max-w-2xl">
            Uma encomenda só transita para <span className="font-medium text-[#00A859]">Fulfilled</span> quando as quatro linhas de reconciliação
            coincidirem — em valor e em VAB. Módulos de plano/faturação/recebimento a chegar na Fase 2.
          </p>
        </section>
      </div>
    </div>
  );
}
