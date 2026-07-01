import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { eur, pct } from "@/lib/fmt";
import PageHeader from "@/components/PageHeader";

const COLORS = {
  leads: "#111111",
  opportunities: "#002FA7",
  proposals: "#FFC800",
  orders: "#00A859",
};

export default function Funnel() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/dashboard/funnel").then((r) => setData(r.data));
  }, []);

  const stages = data?.stages || [];
  const maxCount = Math.max(1, ...stages.map((s) => s.count));

  return (
    <div>
      <PageHeader kicker="Ciclo Comercial" title="Funil de Vendas" />
      <div className="p-8 space-y-8">
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
