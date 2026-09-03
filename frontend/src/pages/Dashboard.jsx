import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { eur, pct } from "@/lib/fmt";
import PageHeader from "@/components/PageHeader";
import { TrendingUp, Sparkles, Target, FileText, Package, Percent, Factory } from "lucide-react";
import { BarChart, Bar, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

function KPI({ label, value, sub, valueExtra, testid, icon: Icon, to }) {
  return (
    <div className="rounded-[14px] border border-[var(--wc-border)] bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md" data-testid={testid}>
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</div>
        {Icon && <div className="rounded-lg bg-[var(--wc-cyan-50)] p-2 text-[var(--wc-cyan-700)]"><Icon size={15} strokeWidth={1.7} /></div>}
      </div>
      {to ? (
        <Link to={to} className="mt-3 inline-block font-mono font-semibold text-2xl tracking-tight text-[var(--wc-cyan-700)] hover:underline">
          {value}
        </Link>
      ) : (
        <div className="mt-3 font-mono font-semibold text-2xl tracking-tight">{value}</div>
      )}
      {(sub || valueExtra) && <div className="mt-1 text-xs text-neutral-500">{valueExtra && <span>{valueExtra} · </span>}{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [kpis, setKpis] = useState(null);
  const [topManuf, setTopManuf] = useState([]);
  const [dashboardYear, setDashboardYear] = useState(new Date().getFullYear());
  const [selectedBillingMonth, setSelectedBillingMonth] = useState(null);

  useEffect(() => {
    setSelectedBillingMonth(null);
    api.get(`/dashboard/kpis?year=${dashboardYear}`).then((response) => setKpis(response.data));
    api.get(`/analytics/by-manufacturer?year=${dashboardYear}`).then((response) => {
      const rows = (response.data.rows || [])
        .filter((row) => row.manufacturer_id && row.won_vab > 0)
        .sort((a, b) => b.won_vab - a.won_vab)
        .slice(0, 5);
      setTopManuf(rows);
    });
  }, [dashboardYear]);

  const maxVab = Math.max(1, ...topManuf.map((row) => row.won_vab));
  const selectedBilling = (kpis?.billing_monthly || []).find((month) => month.month === selectedBillingMonth);

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
      <div className="space-y-8 p-7">
        <section>
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Pipeline</div>
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
              valueExtra={eur(kpis?.props_sent_value)}
              sub={`${kpis?.props_won ?? 0} ganhas · ${kpis?.props_lost ?? 0} perdidas`}
              icon={FileText}
              to="/propostas?status_scope=in_progress"
            />
            <KPI testid="kpi-conv-rate" label="Taxa de Conversao" value={pct(kpis?.conversion_rate)} sub="Propostas fechadas" icon={Percent} />
          </div>
        </section>

        <section>
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Resultado</div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
            <KPI testid="kpi-won-value" label="Valor Ganho" value={eur(kpis?.won_value)} sub="Propostas ganhas · sem IVA" icon={TrendingUp} />
            <KPI testid="kpi-won-vab" label="VAB Ganho" value={eur(kpis?.won_vab)} sub="Margem bruta ganha" icon={TrendingUp} />
            <KPI testid="kpi-orders" label="Encomendas" value={kpis?.orders_count ?? "-"} sub={`${eur(kpis?.orders_value)} · VAB ${eur(kpis?.orders_vab)}`} icon={Package} to="/encomendas" />
            <KPI testid="kpi-billed-year" label="Faturado no ano" value={eur(kpis?.billed_net)} sub={`${kpis?.billed_invoice_count ?? 0} fatura(s) · sem IVA`} icon={FileText} />
            <KPI testid="kpi-billed-vab" label="VAB faturado no ano" value={eur(kpis?.billed_vab)} sub="VAB proporcional das faturas · sem IVA" icon={TrendingUp} />
          </div>
        </section>

        <section className="rounded-[14px] border border-[var(--wc-border)] bg-white p-5 shadow-sm" data-testid="billing-monthly-chart">
          <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-neutral-500">Faturação mensal s/IVA · {dashboardYear}</div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart
              data={kpis?.billing_monthly || []}
              margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
              onClick={({ activeLabel }) => activeLabel && setSelectedBillingMonth(activeLabel)}
              style={{ cursor: "pointer" }}
            >
              <CartesianGrid stroke="#E5E9F0" strokeDasharray="3 3" />
              <XAxis dataKey="month" fontSize={10} tick={{ fill: "#64748B" }} axisLine={false} tickLine={false} />
              <YAxis fontSize={10} tick={{ fill: "#64748B" }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(value) => eur(value)} />
              <Legend />
              <Bar dataKey="total_net" fill="#14E0E0" radius={[5, 5, 0, 0]} name="Faturado s/IVA">
                <LabelList dataKey="total_net" position="top" formatter={(value) => eur(value)} fill="#475569" fontSize={10} />
              </Bar>
              <Bar dataKey="billed_vab" fill="#0B8E8E" radius={[5, 5, 0, 0]} name="VAB faturado">
                <LabelList dataKey="billed_vab" position="top" formatter={(value) => eur(value)} fill="#475569" fontSize={10} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="rounded-[14px] border border-[var(--wc-border)] bg-white p-5 shadow-sm" data-testid="billing-month-detail-chart">
          <div className="mb-1 text-[11px] uppercase tracking-[0.2em] text-neutral-500">
            Composicao da faturacao {selectedBillingMonth ? `· ${selectedBillingMonth}` : "· selecione um mes"}
          </div>
          {selectedBilling?.items?.length ? (
            <>
              <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-neutral-600">
                <span>Total faturado: <strong className="font-mono text-neutral-900">{eur(selectedBilling.total_net)}</strong></span>
                <span>VAB faturado: <strong className="font-mono text-[#00A859]">{eur(selectedBilling.billed_vab)}</strong></span>
                <span>{selectedBilling.items.length} item(ns)</span>
              </div>
              <div className="max-h-[420px] overflow-y-auto border border-neutral-200">
                <div className="grid grid-cols-[120px_1fr_150px_130px_130px] gap-3 border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-[10px] uppercase tracking-widest text-neutral-500">
                  <div>Fatura</div><div>Descricao</div><div>Cliente</div><div className="text-right">Faturado s/IVA</div><div className="text-right">VAB faturado</div>
                </div>
                {[...selectedBilling.items].sort((a, b) => b.amount - a.amount).map((item, index) => (
                  <div key={`${item.invoice}-${index}`} className="grid grid-cols-[120px_1fr_150px_130px_130px] gap-3 border-b border-neutral-100 px-3 py-2 text-xs">
                    <div className="font-mono text-[#002FA7]">{item.invoice}<div className="mt-0.5 text-[10px] text-neutral-500">{item.order}</div></div>
                    <div className="truncate" title={item.item}>{item.item}</div>
                    <div className="truncate" title={item.client}>{item.client || "-"}</div>
                    <div className="text-right font-mono">{eur(item.amount)}</div>
                    <div className="text-right font-mono text-[#00A859]">{eur(item.vab)}</div>
                  </div>
                ))}
              </div>
            <div className="hidden">
              <ResponsiveContainer width="100%" height={Math.max(220, selectedBilling.items.length * 42)}>
              <BarChart
                layout="vertical"
                data={selectedBilling.items.map((item) => ({ ...item, label: `${item.item} · ${item.invoice}` }))}
                margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
              >
                <CartesianGrid stroke="#E5E9F0" strokeDasharray="3 3" />
                <XAxis type="number" fontSize={10} tickFormatter={(value) => eur(value)} />
                <YAxis type="category" dataKey="label" width={260} fontSize={10} tick={{ fill: "#444" }} />
                <Tooltip formatter={(value) => eur(value)} />
                <Legend />
                <Bar dataKey="amount" fill="#14E0E0" name="Faturado s/IVA" />
                <Bar dataKey="vab" fill="#0B8E8E" name="VAB faturado" />
              </BarChart>
              </ResponsiveContainer>
            </div>
            </>
          ) : (
            <div className="py-8 text-sm text-neutral-500">Clique numa barra mensal para consultar os itens e o VAB faturado.</div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-neutral-500"><Factory size={12} /> Top 5 Fabricantes por VAB · {dashboardYear}</div>
          <div className="overflow-hidden rounded-[14px] border border-[var(--wc-border)] bg-white shadow-sm" data-testid="top-manufacturers">
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
                  <div className="relative h-6 overflow-hidden rounded-md bg-slate-100">
                      <div className="flex h-full items-center bg-[var(--wc-cyan-700)] px-2 text-[11px] text-white font-mono" style={{ width: `${width}%` }}>
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

        <section className="rounded-[14px] border border-[var(--wc-border)] bg-white p-6 shadow-sm">
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
