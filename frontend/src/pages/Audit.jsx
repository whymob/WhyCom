import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { dateShort } from "@/lib/fmt";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";

const ACTION_STYLE = {
  status_change: "bg-[#E0E7FF] text-[#002FA7]",
  update: "bg-neutral-100 text-neutral-800",
  cancel: "bg-[#FEE2E2] text-[#B91C1C]",
};

export default function Audit() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get("/audit?limit=200").then((r) => setRows(r.data.rows)); }, []);

  return (
    <div>
      <PageHeader kicker="Governance" title="Auditoria" />
      <div className="p-8">
        <div className="border border-neutral-200">
          <div className="grid grid-cols-12 text-[10px] uppercase tracking-widest text-neutral-500 border-b border-neutral-200 px-4 py-2">
            <div className="col-span-2">Data</div><div className="col-span-2">Utilizador</div>
            <div className="col-span-2">Ação</div><div className="col-span-2">Entidade</div>
            <div className="col-span-4">Alteração</div>
          </div>
          {rows.length === 0 && <div className="p-4 text-sm text-neutral-500" data-testid="audit-empty">Sem eventos de auditoria.</div>}
          {rows.map((r) => (
            <div key={r.id} className="grid grid-cols-12 items-center px-4 py-2.5 border-b border-neutral-100 text-sm" data-testid={`audit-row-${r.id}`}>
              <div className="col-span-2 font-mono text-xs text-neutral-600">{dateShort(r.at)} <span className="text-neutral-400">{r.at.slice(11, 16)}</span></div>
              <div className="col-span-2 text-xs">{r.user_name}</div>
              <div className="col-span-2"><Badge className={`${ACTION_STYLE[r.action] || ""} rounded-none font-normal text-[10px]`}>{r.action}</Badge></div>
              <div className="col-span-2 text-xs font-mono text-neutral-700">{r.entity} · {r.entity_id.slice(0, 8)}</div>
              <div className="col-span-4 text-xs text-neutral-600">
                {r.before && r.after && (
                  <span>{Object.keys(r.after || {}).map((k) => (
                    <span key={k} className="mr-3">{k}: <span className="font-mono line-through text-neutral-400">{String(r.before[k])}</span> → <span className="font-mono">{String(r.after[k])}</span></span>
                  ))}</span>
                )}
                {r.reason && <div className="italic text-neutral-500 mt-0.5">Motivo: {r.reason}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
