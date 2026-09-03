import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSearchParams } from "react-router-dom";

import PageHeader from "@/components/PageHeader";
import SearchableSelect from "@/components/ui/searchable-select";
import { api } from "@/lib/api";
import { eur, pct, dateShort } from "@/lib/fmt";

const COLORS = {
  leads: "#475569",
  opportunities: "#0B8E8E",
  proposals: "#14E0E0",
  orders: "#047857",
};

export default function Funnel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [manufs, setManufs] = useState([]);
  const [availableYears, setAvailableYears] = useState([]);
  const [manufacturerId, setManufacturerId] = useState(searchParams.get("manufacturer_id") || "__all__");
  const [funnelYear, setFunnelYear] = useState(searchParams.get("year") || "__all__");
  const [selectedStageKey, setSelectedStageKey] = useState(null);

  useEffect(() => {
    api.get("/manufacturers").then((response) => setManufs(response.data));
  }, []);

  useEffect(() => {
    const params = {};
    if (manufacturerId && manufacturerId !== "__all__") params.manufacturer_id = manufacturerId;
    if (funnelYear && funnelYear !== "__all__") params.year = funnelYear;
    api.get("/dashboard/funnel", { params }).then((response) => {
      setData(response.data);
      setAvailableYears(response.data.available_years || []);
    });

    const next = new URLSearchParams(searchParams);
    if (manufacturerId && manufacturerId !== "__all__") next.set("manufacturer_id", manufacturerId);
    else next.delete("manufacturer_id");
    if (funnelYear && funnelYear !== "__all__") next.set("year", funnelYear);
    else next.delete("year");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manufacturerId, funnelYear]);

  useEffect(() => {
    setSelectedStageKey(null);
  }, [manufacturerId, funnelYear]);

  const stages = data?.stages || [];
  const maxCount = Math.max(1, ...stages.map((stage) => stage.count));
  const selectedStage = stages.find((stage) => stage.key === selectedStageKey);
  const toggleStage = (stageKey) => setSelectedStageKey((current) => current === stageKey ? null : stageKey);
  const funnelYears = Array.from(new Set([
    ...availableYears,
    ...Array.from({ length: Math.max(0, 2030 - new Date().getFullYear()) }, (_, index) => new Date().getFullYear() + index),
  ])).sort((a, b) => a - b);
  const activeYear = funnelYear === "__all__" ? "Todos os anos" : funnelYear;
  const activeName = manufacturerId === "__all__" ? "Todos os fabricantes" : (manufs.find((manufacturer) => manufacturer.id === manufacturerId)?.name || "—");

  const recordHref = (stageKey, item) => {
    if (stageKey === "proposals") return `/propostas/${item.id}`;
    if (stageKey === "orders") return `/encomendas/${item.id}`;
    const base = stageKey === "leads" ? "/leads" : "/oportunidades";
    return `${base}?search=${encodeURIComponent(item.description || item.client || "")}`;
  };

  return (
    <div>
      <PageHeader kicker="Ciclo Comercial" title="Funil de Vendas" />
      <div className="p-7 space-y-8">
        <div className="rounded-[14px] border border-[var(--wc-border)] bg-white p-4 shadow-sm flex flex-wrap items-center gap-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Filtros do funil</div>
          <div className="w-40">
            <select
              value={funnelYear}
              onChange={(event) => setFunnelYear(event.target.value)}
              className="h-10 w-full rounded-lg border border-[var(--wc-border)] bg-white px-3 font-mono text-xs outline-none focus:border-[#14E0E0] focus:ring-4 focus:ring-[#14E0E0]/15"
              data-testid="funnel-year-select"
            >
              <option value="__all__">Todos os anos</option>
              {funnelYears.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
          <div className="w-72">
            <SearchableSelect
              value={manufacturerId}
              onValueChange={setManufacturerId}
              options={[
                { value: "__all__", label: "Todos os fabricantes" },
                ...manufs.map((manufacturer) => ({
                  value: manufacturer.id,
                  label: manufacturer.name,
                })),
              ]}
              placeholder="Selecionar fabricante"
              searchPlaceholder="Pesquisar fabricante..."
              emptyText="Sem fabricantes."
              testId="funnel-manufacturer-select"
              triggerClassName="h-10"
            />
          </div>
          <div className="ml-auto text-xs text-neutral-500 font-mono" data-testid="funnel-active-filter">{activeYear} · {activeName}</div>
        </div>

        <div className="rounded-[14px] border border-[var(--wc-border)] bg-white p-7 shadow-sm">
          <div className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-6">Lead → Oportunidade → Proposta → Encomenda</div>
          <div className="space-y-3">
            {stages.map((stage) => {
              const width = Math.max(8, (stage.count / maxCount) * 100);
              return (
                <div key={stage.key} data-testid={`funnel-stage-${stage.key}`} role="button" tabIndex={0} onClick={() => toggleStage(stage.key)} onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && toggleStage(stage.key)} className={`rounded-lg p-1 cursor-pointer transition-colors ${selectedStageKey === stage.key ? "bg-[#ECFEFF] ring-2 ring-[#14E0E0] ring-offset-2" : "hover:bg-slate-50"}`}>
                  <div className="flex items-center gap-4">
                    <div className="w-32 text-sm font-medium">{stage.label}</div>
                    <div className="flex-1 h-11 rounded-md bg-slate-100 relative overflow-hidden">
                      <div className="h-full flex items-center px-4 text-white text-sm font-mono" style={{ width: `${width}%`, background: COLORS[stage.key] }}>
                        {stage.count}
                      </div>
                    </div>
                    <div className="w-32 text-right font-mono text-sm">{eur(stage.value)}</div>
                    <div className="w-20 text-right font-mono text-xs text-neutral-500">{pct(stage.conversion_pct)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="wc-list-panel" data-testid="funnel-stage-detail">
          <div className="border-b border-neutral-200 px-4 py-3 text-[11px] uppercase tracking-[0.2em] text-neutral-500">
            {selectedStage ? `Composição · ${selectedStage.label}` : "Composição da fase"}
          </div>
          {selectedStage ? (
            selectedStage.items?.length ? (
              <div className="max-h-[420px] overflow-y-auto">
                <div className="grid grid-cols-[180px_180px_1fr_150px_130px_130px_120px] gap-3 border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-[10px] uppercase tracking-widest text-neutral-500">
                  <div>Registo</div><div>Cliente</div><div>Descrição</div><div className="text-right">Valor</div><div className="text-right">VAB</div><div>Estado</div><div>Data</div>
                </div>
                {selectedStage.items.map((item) => (
                  <div key={item.id} className="grid grid-cols-[180px_180px_1fr_150px_130px_130px_120px] gap-3 border-b border-neutral-100 px-4 py-3 text-xs">
                    <div className="font-mono"><Link to={recordHref(selectedStage.key, item)} className="text-[#002FA7] hover:underline" data-testid={`funnel-record-link-${item.id}`}>{item.title}</Link></div>
                    <div className="truncate" title={item.client}>{item.client || "-"}</div>
                    <div className="min-w-0"><div className="truncate" title={item.description}>{item.description || "-"}</div>{item.follow_up_date && <div className="text-[10px] text-neutral-500">Data prevista de fecho: {dateShort(item.follow_up_date)}</div>}</div>
                    <div className="text-right font-mono">{eur(item.value)}</div>
                    <div className="text-right font-mono">{eur(item.vab)}</div>
                    <div>{item.status || "-"}</div>
                    <div className="font-mono text-neutral-500">{dateShort(item.date)}</div>
                  </div>
                ))}
              </div>
            ) : <div className="p-6 text-sm text-neutral-500">Não existem registos nesta fase para os filtros atuais.</div>
          ) : <div className="p-6 text-sm text-neutral-500">Clique no número ou na linha de uma fase para consultar os registos que compõem o total.</div>}
        </div>

        <div className="wc-list-panel" data-testid="funnel-summary">
          <div className="grid grid-cols-5 text-[10px] uppercase tracking-widest text-neutral-500 border-b border-neutral-200 px-4 py-2">
            <div>Fase</div>
            <div className="text-right">Registos</div>
            <div className="text-right">Valor</div>
            <div className="text-right">VAB</div>
            <div className="text-right">Conversao</div>
          </div>
          {stages.map((stage) => (
            <div key={stage.key} onClick={() => toggleStage(stage.key)} className={`grid grid-cols-5 cursor-pointer px-4 py-3 border-b border-neutral-100 text-sm hover:bg-neutral-50 ${selectedStageKey === stage.key ? "bg-neutral-50" : ""}`} data-testid={`funnel-summary-${stage.key}`}>
              <div className="font-medium">{stage.label}</div>
              <div className="text-right font-mono">{stage.count}</div>
              <div className="text-right font-mono">{eur(stage.value)}</div>
              <div className="text-right font-mono">{eur(stage.vab)}</div>
              <div className="text-right font-mono">{pct(stage.conversion_pct)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
