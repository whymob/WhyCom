import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiErrorDetail } from "@/lib/api";
import { eur, ORDER_STATUS, dateShort } from "@/lib/fmt";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const STATUS_STYLE = {
  aberta: "bg-neutral-100 text-neutral-800",
  em_planeamento: "bg-[#E0E7FF] text-[#002FA7]",
  em_faturacao: "bg-[#FEF08A] text-[#854D0E]",
  parcialmente_faturada: "bg-[#FEF08A] text-[#854D0E]",
  faturada: "bg-[#FEF08A] text-[#854D0E]",
  recebida: "bg-[#DCFCE7] text-[#00A859]",
  fulfilled: "bg-[#00A859] text-white",
  cancelada: "bg-[#FEE2E2] text-[#B91C1C]",
};

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]);

  const load = async () => {
    const [o, c] = await Promise.all([api.get("/orders"), api.get("/clients")]);
    setOrders(o.data); setClients(c.data);
  };
  useEffect(() => { load(); }, []);

  const cn = (id) => clients.find((c) => c.id === id)?.name || "—";

  const patchOrder = async (id, patch) => {
    try { await api.patch(`/orders/${id}`, patch); load(); toast.success("Encomenda atualizada"); }
    catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  return (
    <div>
      <PageHeader kicker="Fase 4" title="Encomendas" />
      <div className="p-8">
        <div className="border border-neutral-200">
          <div className="grid grid-cols-12 text-[10px] uppercase tracking-widest text-neutral-500 border-b border-neutral-200 px-4 py-2">
            <div className="col-span-2">Número</div>
            <div className="col-span-3">Cliente</div>
            <div className="col-span-2">PO</div>
            <div className="col-span-1 text-right">Valor</div>
            <div className="col-span-1 text-right">VAB</div>
            <div className="col-span-2">Estado</div>
            <div className="col-span-1 text-right">Data</div>
          </div>
          {orders.length === 0 && <div className="p-6 text-sm text-neutral-500" data-testid="orders-empty">Sem encomendas. Converta uma proposta ganha para criar uma.</div>}
          {orders.map((o) => (
            <div key={o.id} className="grid grid-cols-12 items-center px-4 py-3 border-b border-neutral-100 text-sm hover:bg-neutral-50" data-testid={`order-row-${o.id}`}>
              <div className="col-span-2 font-mono"><Link to={`/encomendas/${o.id}`} className="text-[#002FA7] hover:underline" data-testid={`order-link-${o.id}`}>{o.number}</Link></div>
              <div className="col-span-3 font-medium">{cn(o.client_id)}</div>
              <div className="col-span-2">
                <Input defaultValue={o.po_number || ""} onBlur={(e) => e.target.value !== o.po_number && patchOrder(o.id, { po_number: e.target.value })} placeholder="PO / Ordem compra" className="rounded-none h-8 text-xs font-mono" data-testid={`po-input-${o.id}`} />
              </div>
              <div className="col-span-1 text-right font-mono">{eur(o.total_net)}</div>
              <div className="col-span-1 text-right font-mono">{eur(o.total_vab)}</div>
              <div className="col-span-2">
                <Select value={o.status} onValueChange={(v) => patchOrder(o.id, { status: v })}>
                  <SelectTrigger className="rounded-none h-8 text-xs" data-testid={`order-status-${o.id}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ORDER_STATUS).filter(([k]) => !["cancelada", "fulfilled"].includes(k)).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-1 text-right font-mono text-xs text-neutral-500">{dateShort(o.order_date)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
