import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api, formatApiErrorDetail } from "@/lib/api";
import { eur, PROP_STATUS, dateShort } from "@/lib/fmt";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, ChevronLeft } from "lucide-react";

function computeLine(l) {
  const net = (Number(l.quantity) || 0) * (Number(l.unit_price) || 0) * (1 - (Number(l.discount_pct) || 0) / 100);
  const vat = net * (Number(l.vat_pct) || 0) / 100;
  const gross = net + vat;
  const vab = net - (Number(l.unit_cost) || 0) * (Number(l.quantity) || 0);
  return { net, vat, gross, vab };
}

export default function ProposalDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [proposal, setProposal] = useState(null);
  const [products, setProducts] = useState([]);
  const [clients, setClients] = useState([]);
  const [manufs, setManufs] = useState([]);
  const [lostReason, setLostReason] = useState("");

  const load = async () => {
    const [p, prd, c, m] = await Promise.all([api.get(`/proposals/${id}`), api.get("/products"), api.get("/clients"), api.get("/manufacturers")]);
    setProposal(p.data); setProducts(prd.data); setClients(c.data); setManufs(m.data);
  };
  useEffect(() => { load(); }, [id]);

  if (!proposal) return <div className="p-8 text-sm text-neutral-500">A carregar…</div>;

  const clientName = clients.find((c) => c.id === proposal.client_id)?.name || "—";
  const manufName = (id) => manufs.find((m) => m.id === id)?.name || "—";
  const lineManuf = (l) => {
    const prod = products.find((p) => p.id === l.product_id);
    return prod?.manufacturer_id ? manufName(prod.manufacturer_id) : "—";
  };

  const addLine = () => {
    const lines = [...proposal.lines, { product_id: "", description: "", quantity: 1, unit: "unidade", unit_price: 0, discount_pct: 0, vat_pct: 23, unit_cost: 0 }];
    setProposal({ ...proposal, lines });
  };
  const removeLine = (i) => {
    const lines = proposal.lines.filter((_, idx) => idx !== i);
    setProposal({ ...proposal, lines });
  };
  const updateLine = (i, patch) => {
    const lines = proposal.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l));
    if (patch.product_id) {
      const prod = products.find((p) => p.id === patch.product_id);
      if (prod) {
        lines[i].description = lines[i].description || prod.name;
        lines[i].unit = prod.unit;
        lines[i].unit_price = lines[i].unit_price || prod.base_price;
        lines[i].unit_cost = lines[i].unit_cost || prod.base_cost;
      }
    }
    setProposal({ ...proposal, lines });
  };

  const totals = proposal.lines.reduce((acc, l) => {
    const c = computeLine(l);
    return { net: acc.net + c.net, vat: acc.vat + c.vat, gross: acc.gross + c.gross, vab: acc.vab + c.vab };
  }, { net: 0, vat: 0, gross: 0, vab: 0 });

  const save = async () => {
    try {
      const payload = { lines: proposal.lines, notes: proposal.notes, valid_until: proposal.valid_until };
      const { data } = await api.patch(`/proposals/${id}`, payload);
      setProposal(data);
      toast.success("Proposta guardada");
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const changeStatus = async (status) => {
    try {
      const payload = { status };
      if (status === "perdida") {
        if (!lostReason.trim()) { toast.error("Indique o motivo de perda"); return; }
        payload.lost_reason = lostReason;
      }
      const { data } = await api.patch(`/proposals/${id}`, payload);
      setProposal(data);
      toast.success(`Estado: ${PROP_STATUS[status]}`);
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const convertToOrder = async () => {
    try {
      const { data } = await api.post(`/proposals/${id}/convert`);
      toast.success(`Encomenda ${data.number} criada`);
      nav("/encomendas");
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  return (
    <div>
      <PageHeader
        kicker={`Proposta · ${dateShort(proposal.created_at)}`}
        title={proposal.number}
        actions={
          <div className="flex gap-2">
            <Link to="/propostas"><Button variant="ghost" className="rounded-none"><ChevronLeft size={14} className="mr-1" /> Voltar</Button></Link>
            <Button onClick={save} data-testid="save-proposal-btn" className="rounded-none bg-[#002FA7] hover:bg-[#002277] text-white">Guardar</Button>
          </div>
        }
      />
      <div className="p-8 space-y-6">
        <div className="grid grid-cols-4 gap-4">
          <div className="border border-neutral-200 p-4">
            <div className="text-[10px] uppercase tracking-widest text-neutral-500">Cliente</div>
            <div className="mt-1 font-medium">{clientName}</div>
          </div>
          <div className="border border-neutral-200 p-4">
            <div className="text-[10px] uppercase tracking-widest text-neutral-500">Estado</div>
            <div className="mt-1"><Badge className="rounded-none">{PROP_STATUS[proposal.status]}</Badge></div>
          </div>
          <div className="border border-neutral-200 p-4">
            <div className="text-[10px] uppercase tracking-widest text-neutral-500">Total (s/ IVA)</div>
            <div className="mt-1 font-mono text-lg">{eur(totals.net)}</div>
          </div>
          <div className="border border-neutral-200 p-4">
            <div className="text-[10px] uppercase tracking-widest text-neutral-500">VAB</div>
            <div className="mt-1 font-mono text-lg">{eur(totals.vab)}</div>
          </div>
        </div>

        {/* Lines */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">Linhas da proposta</div>
            <Button size="sm" onClick={addLine} data-testid="add-line-btn" className="rounded-none bg-neutral-900 text-white hover:bg-neutral-700"><Plus size={14} className="mr-1" /> Nova linha</Button>
          </div>
          <div className="border border-neutral-200">
            <div className="grid grid-cols-12 text-[10px] uppercase tracking-widest text-neutral-500 border-b border-neutral-200 px-3 py-2 gap-2">
              <div className="col-span-3">Produto/Serviço</div>
              <div className="col-span-1 text-right">Qtd</div>
              <div className="col-span-2 text-right">Preço unit.</div>
              <div className="col-span-1 text-right">Desc %</div>
              <div className="col-span-1 text-right">IVA %</div>
              <div className="col-span-1 text-right">Custo unit.</div>
              <div className="col-span-1 text-right">Total</div>
              <div className="col-span-1 text-right">VAB</div>
              <div className="col-span-1"></div>
            </div>
            {proposal.lines.length === 0 && <div className="p-4 text-sm text-neutral-500">Sem linhas.</div>}
            {proposal.lines.map((l, i) => {
              const c = computeLine(l);
              return (
                <div key={i} className="grid grid-cols-12 px-3 py-2 border-b border-neutral-100 items-center gap-2" data-testid={`prop-line-${i}`}>
                  <div className="col-span-3">
                    <Select value={l.product_id || ""} onValueChange={(v) => updateLine(i, { product_id: v })}>
                      <SelectTrigger className="rounded-none h-8 text-xs"><SelectValue placeholder="Produto/serviço" /></SelectTrigger>
                      <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input placeholder="Descrição" value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} className="mt-1 rounded-none h-8 text-xs" />
                    <div className="text-[10px] uppercase tracking-widest text-neutral-500 mt-1" data-testid={`prop-line-manuf-${i}`}>Fabricante: <span className="text-neutral-800 normal-case tracking-normal">{lineManuf(l)}</span></div>
                  </div>
                  <Input type="number" value={l.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} className="col-span-1 rounded-none h-8 text-right font-mono" data-testid={`line-qty-${i}`} />
                  <Input type="number" value={l.unit_price} onChange={(e) => updateLine(i, { unit_price: e.target.value })} className="col-span-2 rounded-none h-8 text-right font-mono" data-testid={`line-price-${i}`} />
                  <Input type="number" value={l.discount_pct} onChange={(e) => updateLine(i, { discount_pct: e.target.value })} className="col-span-1 rounded-none h-8 text-right font-mono" />
                  <Input type="number" value={l.vat_pct} onChange={(e) => updateLine(i, { vat_pct: e.target.value })} className="col-span-1 rounded-none h-8 text-right font-mono" />
                  <Input type="number" value={l.unit_cost} onChange={(e) => updateLine(i, { unit_cost: e.target.value })} className="col-span-1 rounded-none h-8 text-right font-mono" />
                  <div className="col-span-1 text-right font-mono text-xs">{eur(c.net)}</div>
                  <div className="col-span-1 text-right font-mono text-xs">{eur(c.vab)}</div>
                  <div className="col-span-1 text-right">
                    <Button size="sm" variant="ghost" onClick={() => removeLine(i)} className="rounded-none text-[#FF2A00]" data-testid={`remove-line-${i}`}><Trash2 size={14} /></Button>
                  </div>
                </div>
              );
            })}
            <div className="grid grid-cols-12 px-3 py-3 gap-2 bg-neutral-50 text-sm">
              <div className="col-span-8 text-right font-medium">Totais</div>
              <div className="col-span-1 text-right font-mono">{/* qty */}</div>
              <div className="col-span-1 text-right font-mono">{eur(totals.net)}</div>
              <div className="col-span-1 text-right font-mono">{eur(totals.vab)}</div>
              <div className="col-span-1"></div>
            </div>
            <div className="grid grid-cols-12 px-3 py-2 gap-2 text-xs text-neutral-600">
              <div className="col-span-8 text-right">IVA: <span className="font-mono">{eur(totals.vat)}</span> · Total c/ IVA: <span className="font-mono">{eur(totals.gross)}</span></div>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-neutral-200 p-4">
            <Label className="text-[10px] uppercase tracking-widest text-neutral-500">Notas internas</Label>
            <Textarea rows={3} value={proposal.notes || ""} onChange={(e) => setProposal({ ...proposal, notes: e.target.value })} className="rounded-none mt-2" data-testid="prop-notes" />
          </div>
          <div className="border border-neutral-200 p-4">
            <Label className="text-[10px] uppercase tracking-widest text-neutral-500">Validade</Label>
            <Input type="date" value={(proposal.valid_until || "").slice(0, 10)} onChange={(e) => setProposal({ ...proposal, valid_until: e.target.value })} className="rounded-none mt-2 font-mono" />
          </div>
        </div>

        {/* Status transitions */}
        <div className="border border-neutral-200 p-4">
          <div className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-3">Alterar estado</div>
          <div className="flex flex-wrap gap-2 items-center">
            {["em_elaboracao", "enviada", "em_negociacao", "ganha"].map((s) => (
              <Button key={s} size="sm" onClick={() => changeStatus(s)} data-testid={`status-${s}-btn`} disabled={proposal.status === s} className="rounded-none bg-neutral-900 hover:bg-neutral-700 text-white text-xs">
                {PROP_STATUS[s]}
              </Button>
            ))}
            <div className="flex items-center gap-2 ml-2">
              <Input placeholder="Motivo de perda" value={lostReason} onChange={(e) => setLostReason(e.target.value)} className="rounded-none h-9 w-56" data-testid="prop-lost-reason-input" />
              <Button size="sm" onClick={() => changeStatus("perdida")} data-testid="status-perdida-btn" className="rounded-none bg-[#FF2A00] hover:bg-[#D62200] text-white text-xs">Perdida</Button>
            </div>
            {proposal.status === "ganha" && !proposal.converted_order_id && (
              <Button size="sm" onClick={convertToOrder} data-testid="convert-to-order-btn" className="rounded-none bg-[#00A859] hover:bg-[#008C4A] text-white text-xs ml-2">Gerar encomenda →</Button>
            )}
          </div>
          {proposal.lost_reason && <div className="mt-2 text-xs text-[#B91C1C]">Motivo: {proposal.lost_reason}</div>}
        </div>
      </div>
    </div>
  );
}
