import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiErrorDetail } from "@/lib/api";
import { eur, LEAD_STATUS } from "@/lib/fmt";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lead, setLead] = useState(null);
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discardReason, setDiscardReason] = useState("");
  const [converting, setConverting] = useState(false);

  const load = () => {
    Promise.all([
      api.get("/leads", { params: { page: 1, page_size: 1, search: id } }),
      api.get("/clients"),
    ]).then(([leadResponse, clientResponse]) => {
      const item = (leadResponse.data.items || []).find((row) => row.id === id);
      if (!item) { toast.error("Lead não encontrada."); navigate("/leads", { replace: true }); return; }
      setLead(item);
      setForm({ client_id: item.client_id || "", client_name_raw: item.client_name_raw || "", description: item.description || "", estimated_value: item.estimated_value || 0, status: item.status });
      setClients(clientResponse.data || []);
    }).catch(() => toast.error("Não foi possível carregar a lead."));
  };

  useEffect(load, [id]);

  const save = async () => {
    try {
      const response = await api.patch(`/leads/${id}`, { ...form, estimated_value: Number(form.estimated_value) || 0 });
      setLead(response.data);
      setForm({ client_id: response.data.client_id || "", client_name_raw: response.data.client_name_raw || "", description: response.data.description || "", estimated_value: response.data.estimated_value || 0, status: response.data.status });
      toast.success("Lead atualizada.");
    } catch (error) { toast.error(formatApiErrorDetail(error.response?.data?.detail)); }
  };

  const discard = async () => {
    if (!discardReason.trim()) { toast.error("Indique o motivo do descarte."); return; }
    try {
      await api.patch(`/leads/${id}`, { status: "descartada", lost_reason: discardReason.trim() });
      toast.success("Lead descartada.");
      navigate("/leads");
    } catch (error) { toast.error(formatApiErrorDetail(error.response?.data?.detail)); }
  };

  const convert = async () => {
    setConverting(true);
    try {
      await api.post(`/leads/${id}/convert`);
      toast.success("Lead convertida em oportunidade.");
      navigate("/oportunidades");
    } catch (error) { toast.error(formatApiErrorDetail(error.response?.data?.detail)); }
    finally { setConverting(false); }
  };

  if (!lead || !form) return <div className="p-8 text-sm text-neutral-500">A carregar lead…</div>;

  return <div>
    <PageHeader kicker="Ciclo comercial" title="Lead" actions={<Link to="/leads" className="rounded-lg border border-[var(--wc-border)] px-3 py-2 text-xs text-slate-600 hover:bg-[#ECFEFF]">Voltar a Leads</Link>} />
    <div className="max-w-4xl p-7">
      <div className="rounded-[14px] border border-[var(--wc-border)] bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-start justify-between gap-4 border-b border-[var(--wc-border)] pb-5"><div><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{LEAD_STATUS[lead.status]}</div><h2 className="mt-1 text-xl font-semibold">{lead.description}</h2></div><div className="font-mono text-lg text-[var(--wc-cyan-700)]">{eur(lead.estimated_value)}</div></div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div><Label>Cliente</Label><select value={form.client_id} onChange={(event) => setForm({ ...form, client_id: event.target.value, client_name_raw: "" })} className="mt-1 h-10 w-full border border-neutral-300 bg-white px-3 text-sm"><option value="">Cliente por identificar</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></div>
          {!form.client_id && <div><Label>Nome do potencial cliente</Label><Input value={form.client_name_raw} onChange={(event) => setForm({ ...form, client_name_raw: event.target.value })} className="mt-1 rounded-none" /></div>}
          <div className={form.client_id ? "md:col-span-2" : ""}><Label>Descrição</Label><Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} className="mt-1 rounded-none" /></div>
          <div><Label>Valor estimado</Label><Input type="number" value={form.estimated_value} onChange={(event) => setForm({ ...form, estimated_value: event.target.value })} className="mt-1 rounded-none font-mono" /></div>
          <div><Label>Estado</Label><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="mt-1 h-10 w-full border border-neutral-300 bg-white px-3 text-sm"><option value="nova">Nova</option><option value="em_qualificacao">Em qualificação</option></select></div>
        </div>
        <div className="mt-7 flex flex-wrap justify-between gap-3 border-t border-neutral-200 pt-5"><Button variant="outline" onClick={() => { setDiscardReason(""); setDiscardOpen(true); }} className="rounded-none border-[#FF2A00] text-[#FF2A00] hover:bg-[#FFF1F0]"><Trash2 size={15} className="mr-2" /> Descartar</Button><div className="flex gap-2"><Button variant="outline" onClick={save} className="rounded-none"><Save size={15} className="mr-2" /> Guardar</Button>{lead.status === "em_qualificacao" && <Button onClick={convert} disabled={converting} className="rounded-none bg-[#002FA7] text-white hover:bg-[#002277]"><ArrowRight size={15} className="mr-2" /> {converting ? "A converter…" : "Converter em oportunidade"}</Button>}</div></div>
      </div>
    </div>
    <Dialog open={discardOpen} onOpenChange={setDiscardOpen}><DialogContent className="max-w-md rounded-none"><DialogHeader><DialogTitle>Descartar lead</DialogTitle></DialogHeader><Label>Motivo do descarte</Label><Textarea value={discardReason} onChange={(event) => setDiscardReason(event.target.value)} rows={3} placeholder="Indique o motivo" className="rounded-none" /><DialogFooter><Button variant="ghost" onClick={() => setDiscardOpen(false)} className="rounded-none">Cancelar</Button><Button onClick={discard} className="rounded-none bg-[#FF2A00] text-white hover:bg-[#CC2200]">Confirmar descarte</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
