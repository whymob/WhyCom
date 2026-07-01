import React, { useEffect, useState } from "react";
import { api, formatApiErrorDetail } from "@/lib/api";
import { eur, OPP_STATUS } from "@/lib/fmt";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, ArrowRight } from "lucide-react";

const STATUS_STYLE = {
  aberta: "bg-neutral-100 text-neutral-800",
  em_analise: "bg-[#FEF08A] text-[#854D0E]",
  convertida: "bg-[#DCFCE7] text-[#00A859]",
  perdida: "bg-[#FEE2E2] text-[#B91C1C]",
};

export default function Opportunities() {
  const [opps, setOpps] = useState([]);
  const [clients, setClients] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultForm());
  const [lostOpen, setLostOpen] = useState(null);
  const [lostReason, setLostReason] = useState("");

  function defaultForm() {
    return { client_id: "", description: "", estimated_value: 0, estimated_vab: 0, probability: 50, priority: "media", competitor: "", notes: "", status: "aberta" };
  }

  const load = async () => {
    const [o, c] = await Promise.all([api.get("/opportunities"), api.get("/clients")]);
    setOpps(o.data); setClients(c.data);
  };
  useEffect(() => { load(); }, []);

  const cn = (id) => clients.find((c) => c.id === id)?.name || "—";
  const openCreate = () => { setEditing(null); setForm(defaultForm()); setOpen(true); };
  const openEdit = (o) => {
    setEditing(o);
    setForm({
      client_id: o.client_id, description: o.description,
      estimated_value: o.estimated_value, estimated_vab: o.estimated_vab,
      probability: o.probability, priority: o.priority, competitor: o.competitor || "",
      notes: o.notes || "", status: o.status,
    });
    setOpen(true);
  };

  const submit = async () => {
    try {
      const p = {
        ...form,
        estimated_value: Number(form.estimated_value) || 0,
        estimated_vab: Number(form.estimated_vab) || 0,
        probability: Number(form.probability) || 0,
      };
      if (editing) {
        await api.patch(`/opportunities/${editing.id}`, p);
        toast.success("Oportunidade atualizada");
      } else {
        await api.post("/opportunities", { ...p, owner_id: "" });
        toast.success("Oportunidade criada");
      }
      setOpen(false);
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const convert = async (id) => {
    try {
      await api.post(`/opportunities/${id}/convert`);
      toast.success("Proposta criada a partir da oportunidade");
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const markLost = async () => {
    if (!lostReason.trim()) { toast.error("Indique o motivo"); return; }
    try {
      await api.patch(`/opportunities/${lostOpen}`, { status: "perdida", lost_reason: lostReason });
      toast.success("Oportunidade marcada como perdida");
      setLostOpen(null); setLostReason(""); load();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  return (
    <div>
      <PageHeader
        kicker="Fase 2"
        title="Oportunidades"
        actions={<Button onClick={openCreate} data-testid="new-opp-btn" className="rounded-none bg-[#002FA7] hover:bg-[#002277] text-white"><Plus size={16} className="mr-1" /> Nova oportunidade</Button>}
      />
      <div className="p-8">
        <div className="border border-neutral-200">
          <div className="grid grid-cols-12 text-[10px] uppercase tracking-widest text-neutral-500 border-b border-neutral-200 px-4 py-2">
            <div className="col-span-3">Cliente</div>
            <div className="col-span-3">Descrição</div>
            <div className="col-span-2 text-right">Valor</div>
            <div className="col-span-1 text-right">Prob.</div>
            <div className="col-span-2">Estado</div>
            <div className="col-span-1 text-right">Ações</div>
          </div>
          {opps.length === 0 && <div className="p-6 text-sm text-neutral-500" data-testid="opps-empty">Sem oportunidades.</div>}
          {opps.map((o) => (
            <div key={o.id} className="grid grid-cols-12 items-center px-4 py-3 border-b border-neutral-100 text-sm hover:bg-neutral-50" data-testid={`opp-row-${o.id}`}>
              <div className="col-span-3 font-medium">{cn(o.client_id)}</div>
              <div className="col-span-3 text-neutral-700 truncate">{o.description}</div>
              <div className="col-span-2 text-right font-mono">{eur(o.estimated_value)}<div className="text-[10px] text-neutral-500">VAB {eur(o.estimated_vab)}</div></div>
              <div className="col-span-1 text-right font-mono">{o.probability}%</div>
              <div className="col-span-2"><Badge className={`${STATUS_STYLE[o.status]} rounded-none font-normal`}>{OPP_STATUS[o.status]}</Badge></div>
              <div className="col-span-1 flex justify-end gap-1">
                {o.status !== "convertida" && o.status !== "perdida" && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(o)} data-testid={`edit-opp-${o.id}`} className="rounded-none text-xs">Editar</Button>
                    <Button size="sm" onClick={() => convert(o.id)} data-testid={`convert-opp-${o.id}`} className="rounded-none bg-[#002FA7] hover:bg-[#002277] text-white text-xs h-8"><ArrowRight size={12} /></Button>
                    <Button size="sm" variant="ghost" onClick={() => { setLostOpen(o.id); setLostReason(""); }} data-testid={`lose-opp-${o.id}`} className="rounded-none text-xs text-[#FF2A00]">×</Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl rounded-none">
          <DialogHeader><DialogTitle className="font-display">{editing ? "Editar oportunidade" : "Nova oportunidade"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Cliente</Label>
              <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                <SelectTrigger data-testid="opp-client-select" className="rounded-none"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Descrição</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="opp-description-input" className="rounded-none" />
            </div>
            <div>
              <Label>Valor estimado</Label>
              <Input type="number" value={form.estimated_value} onChange={(e) => setForm({ ...form, estimated_value: e.target.value })} data-testid="opp-value-input" className="rounded-none font-mono" />
            </div>
            <div>
              <Label>VAB estimado</Label>
              <Input type="number" value={form.estimated_vab} onChange={(e) => setForm({ ...form, estimated_vab: e.target.value })} data-testid="opp-vab-input" className="rounded-none font-mono" />
            </div>
            <div>
              <Label>Probabilidade (%)</Label>
              <Input type="number" min="0" max="100" value={form.probability} onChange={(e) => setForm({ ...form, probability: e.target.value })} data-testid="opp-prob-input" className="rounded-none font-mono" />
            </div>
            <div>
              <Label>Prioridade</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger className="rounded-none"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Concorrente</Label>
              <Input value={form.competitor} onChange={(e) => setForm({ ...form, competitor: e.target.value })} className="rounded-none" />
            </div>
            <div>
              <Label>Estado</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger className="rounded-none" data-testid="opp-status-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aberta">Aberta</SelectItem>
                  <SelectItem value="em_analise">Em análise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Notas</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="rounded-none" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} className="rounded-none">Cancelar</Button>
            <Button onClick={submit} data-testid="opp-save-btn" className="rounded-none bg-[#002FA7] hover:bg-[#002277] text-white">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!lostOpen} onOpenChange={(o) => !o && setLostOpen(null)}>
        <DialogContent className="max-w-md rounded-none">
          <DialogHeader><DialogTitle className="font-display">Marcar como perdida</DialogTitle></DialogHeader>
          <Label>Motivo de perda</Label>
          <Textarea rows={3} value={lostReason} onChange={(e) => setLostReason(e.target.value)} data-testid="opp-lost-reason" className="rounded-none" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLostOpen(null)} className="rounded-none">Cancelar</Button>
            <Button onClick={markLost} className="rounded-none bg-[#FF2A00] hover:bg-[#D62200] text-white" data-testid="opp-lost-confirm">Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
