import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { eur, pct } from "@/lib/fmt";
import PageHeader from "@/components/PageHeader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const COLORS = {
  leads: "#111111",
  opportunities: "#002FA7",
  proposals: "#FFC800",
  orders: "#00A859",
};

export default function Funnel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [manufs, setManufs] = useState([]);
  const [manufacturerId, setManufacturerId] = useState(searchParams.get("manufacturer_id") || "__all__");

  useEffect(() => {
    api.get("/manufacturers").then((r) => setManufs(r.data));
  }, []);

  useEffect(() => {
    const params = manufacturerId && manufacturerId !== "__all__" ? { manufacturer_id: manufacturerId } : {};
    api.get("/dashboard/funnel", { params }).then((r) => setData(r.data));
    // sync URL
    const next = new URLSearchParams(searchParams);
    if (manufacturerId && manufacturerId !== "__all__") next.set("manufacturer_id", manufacturerId);
    else next.delete("manufacturer_id");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manufacturerId]);

  const stages = data?.stages || [];
  const maxCount = Math.max(1, ...stages.map((s) => s.count));
  const activeName = manufacturerId === "__all__" ? "Todos os fabricantes" : (manufs.find((m) => m.id === manufacturerId)?.name || "—");

  return (
    <div>
      <PageHeader kicker="Ciclo Comercial" title="Funil de Vendas" />
      <div className="p-8 space-y-8">
        {/* Filter */}
        <div className="border border-neutral-200 p-4 flex items-center gap-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Filtro por fabricante</div>
          <Select value={manufacturerId} onValueChange={setManufacturerId}>
            <SelectTrigger className="rounded-none w-72" data-testid="funnel-manufacturer-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os fabricantes</SelectItem>
              {manufs.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="ml-auto text-xs text-neutral-500 font-mono" data-testid="funnel-active-filter">{activeName}</div>
        </div>

        {/* Visual funnel */}
        <div className="border border-neutral-200 p-8">
          <div className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-6">Lead → Oportunidade → Proposta → Encomenda</div>
          <div className="space-y-3">
            {stages.map((s) => {
              const w = Math.max(8, (s.count / maxCount) * 100);
              return (
                <div key={s.key} data-testid={`funnel-stage-${s.key}`}>
                  <div className="flex items-center gap-4">
                    <div className="w-32 text-sm font-medium">{s.label}</div>
                    <div className="flex-1 h-11 bg-neutral-100 relative overflow-hidden">
                      <div
                        className="h-full flex items-center px-4 text-white text-sm font-mono"
                        style={{ width: `${w}%`, background: COLORS[s.key] }}
                      >
                        {s.count}
                      </div>
                    </div>
                    <div className="w-32 text-right font-mono text-sm">{eur(s.value)}</div>
                    <div className="w-20 text-right font-mono text-xs text-neutral-500">{pct(s.conversion_pct)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Metrics table */}
        <div className="border border-neutral-200">
          <div className="grid grid-cols-5 text-[10px] uppercase tracking-widest text-neutral-500 border-b border-neutral-200 px-4 py-2">
            <div>Fase</div>
            <div className="text-right">Registos</div>
            <div className="text-right">Valor</div>
            <div className="text-right">VAB</div>
            <div className="text-right">Conversão</div>
          </div>
          {stages.map((s) => (
            <div key={s.key} className="grid grid-cols-5 px-4 py-3 border-b border-neutral-100 text-sm">
              <div className="font-medium">{s.label}</div>
              <div className="text-right font-mono">{s.count}</div>
              <div className="text-right font-mono">{eur(s.value)}</div>
              <div className="text-right font-mono">{eur(s.vab)}</div>
              <div className="text-right font-mono">{pct(s.conversion_pct)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
