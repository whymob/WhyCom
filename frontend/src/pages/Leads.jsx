import React, { useEffect, useMemo, useState } from "react";
import { api, formatApiErrorDetail } from "@/lib/api";
import { eur, dateShort, LEAD_STATUS } from "@/lib/fmt";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, ArrowRight } from "lucide-react";

const STATUS_STYLE = {
  nova: "bg-neutral-100 text-neutral-800",
  em_qualificacao: "bg-[#E0E7FF] text-[#002FA7]",
  convertida: "bg-[#DCFCE7] text-[#00A859]",
  descartada: "bg-[#FEE2E2] text-[#B91C1C]",
};

export default function Leads() {
  const [leads, setLeads] = useState([]);
  const [clients, setClients] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultForm());
  const [lostOpen, setLostOpen] = useState(null); // lead id
  const [lostReason, setLostReason] = useState("");

  function defaultForm() {
    return { client_id: "", client_name_raw: "", description: "", estimated_value: 0, status: "nova" };
  }

  const load = async () => {
    const [l, c] = await Promise.all([api.get("/leads"), api.get("/clients")]);
    setLeads(l.data);
    setClients(c.data);
  };
  useEffect(() => { load(); }, []);

  const clientName = (id) => clients.find((c) => c.id === id)?.name || "—";

  const openCreate = () => { setEditing(null); setForm(defaultForm()); setOpen(true); };
  const openEdit = (l) => {
    setEditing(l);
    setForm({
      client_id: l.client_id || "",
      client_name_raw: l.client_name_raw || "",
      description: l.description,
      estimated_value: l.estimated_value,
      status: l.status,
    });
    setOpen(true);
  };

  const submit = async () => {
    try {
      const payload = { ...form, estimated_value: Number(form.estimated_value) || 0 };
      if (editing) {
        await api.patch(`/leads/${editing.id}`, payload);
        toast.success("Lead atualizada");
      } else {
        await api.post("/leads", { ...payload, owner_id: "" });
        toast.success("Lead criada");
      }
      setOpen(false);
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const convert = async (id) => {
    try {
      await api.post(`/leads/${id}/convert`);
      toast.success("Lead convertida em oportunidade");
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const discard = async () => {
    if (!lostReason.trim()) {
      toast.error("Indique o motivo");
      return;
    }
    try {
      await api.patch(`/leads/${lostOpen}`, { status: "descartada", lost_reason: lostReason });
      toast.success("Lead descartada");
      setLostOpen(null);
      setLostReason("");
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  return (
    <div>
      <PageHeader
        kicker="Fase 1"
        title="Leads"
        actions={
          <Button data-testid="new-lead-btn" onClick={openCreate} className="rounded-none bg-[#002FA7] hover:bg-[#002277] text-white">
            <Plus size={16} className="mr-1" /> Nova lead
          </Button>
        }
      />
      <div className="p-8">
        <div className="border border-neutral-200">
          <div className="grid grid-cols-12 text-[10px] uppercase tracking-widest text-neutral-500 border-b border-neutral-200 px-4 py-2">
            <div className="col-span-3">Cliente</div>
            <div className="col-span-4">Descrição</div>
            <div className="col-span-2 text-right">Valor estimado</div>
            <div className="col-span-2">Estado</div>
            <div className="col-span-1 text-right">Ações</div>
          </div>
          {leads.length === 0 && (
            <div className="p-6 text-sm text-neutral-500" data-testid="leads-empty">Sem leads registadas.</div>
          )}
          {leads.map((l) => (
            <div key={l.id} className="grid grid-cols-12 items-center px-4 py-3 border-b border-neutral-100 text-sm hover:bg-neutral-50" data-testid={`lead-row-${l.id}`}>
              <div className="col-span-3 font-medium">{l.client_id ? clientName(l.client_id) : (l.client_name_raw || "—")}</div>
              <div className="col-span-4 text-neutral-700 truncate">{l.description}</div>
              <div className="col-span-2 text-right font-mono">{eur(l.estimated_value)}</div>
              <div className="col-span-2"><Badge className={`${STATUS_STYLE[l.status]} rounded-none font-normal`}>{LEAD_STATUS[l.status]}</Badge></div>
              <div className="col-span-1 flex justify-end gap-1">
                {l.status !== "convertida" && l.status !== "descartada" && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(l)} data-testid={`edit-lead-${l.id}`} className="rounded-none text-xs">Editar</Button>
                    <Button size="sm" onClick={() => convert(l.id)} data-testid={`convert-lead-${l.id}`} className="rounded-none bg-[#002FA7] hover:bg-[#002277] text-white text-xs h-8">
                      <ArrowRight size={12} />
                    </Button>
                  </>
                )}
                {l.status !== "convertida" && l.status !== "descartada" && (
                  <Button size="sm" variant="ghost" onClick={() => { setLostOpen(l.id); setLostReason(""); }} data-testid={`discard-lead-${l.id}`} className="rounded-none text-xs text-[#FF2A00]">×</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create/Edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg rounded-none">
          <DialogHeader>
            <DialogTitle className="font-display">{editing ? "Editar lead" : "Nova lead"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Cliente</Label>
              <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                <SelectTrigger data-testid="lead-client-select" className="rounded-none"><SelectValue placeholder="Selecionar cliente" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="text-xs text-neutral-500 mt-1">Ou indicar prospect (cliente ainda não registado):</div>
              <Input
                placeholder="Nome do prospect"
                value={form.client_name_raw}
                onChange={(e) => setForm({ ...form, client_name_raw: e.target.value })}
                className="mt-1 rounded-none"
                data-testid="lead-prospect-input"
              />
            </div>
            <div>
              <Label>Descrição da necessidade</Label>
              <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="lead-description-input" className="rounded-none" />
            </div>
            <div>
              <Label>Valor estimado (EUR)</Label>
              <Input type="number" value={form.estimated_value} onChange={(e) => setForm({ ...form, estimated_value: e.target.value })} data-testid="lead-value-input" className="rounded-none font-mono" />
            </div>
            <div>
              <Label>Estado</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger className="rounded-none" data-testid="lead-status-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nova">Nova</SelectItem>
                  <SelectItem value="em_qualificacao">Em qualificação</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} className="rounded-none">Cancelar</Button>
            <Button onClick={submit} data-testid="lead-save-btn" className="rounded-none bg-[#002FA7] hover:bg-[#002277] text-white">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discard reason */}
      <Dialog open={!!lostOpen} onOpenChange={(o) => !o && setLostOpen(null)}>
        <DialogContent className="max-w-md rounded-none">
          <DialogHeader><DialogTitle className="font-display">Descartar lead</DialogTitle></DialogHeader>
          <Label>Motivo</Label>
          <Textarea rows={3} value={lostReason} onChange={(e) => setLostReason(e.target.value)} data-testid="lead-discard-reason" className="rounded-none" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLostOpen(null)} className="rounded-none">Cancelar</Button>
            <Button onClick={discard} className="rounded-none bg-[#FF2A00] hover:bg-[#D62200] text-white" data-testid="lead-discard-confirm">Descartar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
