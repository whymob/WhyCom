import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiErrorDetail } from "@/lib/api";
import { eur, PROP_STATUS, dateShort } from "@/lib/fmt";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";

const STATUS_STYLE = {
  em_elaboracao: "bg-neutral-100 text-neutral-800",
  enviada: "bg-[#E0E7FF] text-[#002FA7]",
  em_negociacao: "bg-[#FEF08A] text-[#854D0E]",
  ganha: "bg-[#DCFCE7] text-[#00A859]",
  perdida: "bg-[#FEE2E2] text-[#B91C1C]",
  expirada: "bg-neutral-200 text-neutral-600",
};

export default function Proposals() {
  const [props, setProps] = useState([]);
  const [clients, setClients] = useState([]);

  const load = async () => {
    const [p, c] = await Promise.all([api.get("/proposals"), api.get("/clients")]);
    setProps(p.data); setClients(c.data);
  };
  useEffect(() => { load(); }, []);

  const cn = (id) => clients.find((c) => c.id === id)?.name || "—";

  const convert = async (id) => {
    try {
      await api.post(`/proposals/${id}/convert`);
      toast.success("Encomenda criada");
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  return (
    <div>
      <PageHeader kicker="Fase 3" title="Propostas" />
      <div className="p-8">
        <div className="border border-neutral-200">
          <div className="grid grid-cols-12 text-[10px] uppercase tracking-widest text-neutral-500 border-b border-neutral-200 px-4 py-2">
            <div className="col-span-2">Número</div>
            <div className="col-span-3">Cliente</div>
            <div className="col-span-2 text-right">Total s/ IVA</div>
            <div className="col-span-2 text-right">VAB</div>
            <div className="col-span-2">Estado</div>
            <div className="col-span-1 text-right">Ações</div>
          </div>
          {props.length === 0 && <div className="p-6 text-sm text-neutral-500" data-testid="props-empty">Sem propostas. Converta uma oportunidade para criar uma proposta.</div>}
          {props.map((p) => (
            <div key={p.id} className="grid grid-cols-12 items-center px-4 py-3 border-b border-neutral-100 text-sm hover:bg-neutral-50" data-testid={`prop-row-${p.id}`}>
              <div className="col-span-2">
                <Link to={`/propostas/${p.id}`} className="font-mono text-[#002FA7] hover:underline" data-testid={`prop-link-${p.id}`}>
                  {p.number}
                </Link>
                <div className="text-[10px] text-neutral-500">v{p.version} · {dateShort(p.created_at)}</div>
              </div>
              <div className="col-span-3 font-medium">{cn(p.client_id)}</div>
              <div className="col-span-2 text-right font-mono">{eur(p.total_net)}</div>
              <div className="col-span-2 text-right font-mono">{eur(p.total_vab)}</div>
              <div className="col-span-2"><Badge className={`${STATUS_STYLE[p.status]} rounded-none font-normal`}>{PROP_STATUS[p.status]}</Badge></div>
              <div className="col-span-1 flex justify-end">
                {p.status === "ganha" && !p.converted_order_id && (
                  <Button size="sm" onClick={() => convert(p.id)} data-testid={`convert-prop-${p.id}`} className="rounded-none bg-[#00A859] hover:bg-[#008C4A] text-white text-xs h-8"><ArrowRight size={12} /></Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
