import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiErrorDetail } from "@/lib/api";
import { eur, OPP_STATUS } from "@/lib/fmt";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function OpportunityDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [opportunity, setOpportunity] = useState(null);
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState(null);
  const [descriptionReason, setDescriptionReason] = useState("");
  const [loseOpen, setLoseOpen] = useState(false);
  const [loseReason, setLoseReason] = useState("");
  const [converting, setConverting] = useState(false);
  const canEditDescription = ["admin", "comercial"].includes(user?.role);

  const load = () => {
    Promise.all([
      api.get("/opportunities", { params: { page: 1, page_size: 1, search: id } }),
      api.get("/clients"),
    ]).then(([opportunityResponse, clientResponse]) => {
      const item = (opportunityResponse.data.items || []).find((row) => row.id === id);
      if (!item) { toast.error("Oportunidade não encontrada."); navigate("/oportunidades", { replace: true }); return; }
      setOpportunity(item);
      setForm({ client_id: item.client_id, description: item.description || "", estimated_value: item.estimated_value || 0, estimated_vab: item.estimated_vab || 0, probability: item.probability || 0, expected_close_date: (item.expected_close_date || "").slice(0, 10), priority: item.priority || "media", competitor: item.competitor || "", notes: item.notes || "", status: item.status });
      setClients(clientResponse.data || []);
    }).catch(() => toast.error("Não foi possível carregar a oportunidade."));
  };

  useEffect(load, [id]);

  const save = async () => {
    const descriptionChanged = form.description.trim() !== (opportunity.description || "").trim();
    if (descriptionChanged && !canEditDescription) { toast.error("A descrição só pode ser alterada por admin ou comercial."); return; }
    if (descriptionChanged && !descriptionReason.trim()) { toast.error("Indique a justificação para alterar a descrição."); return; }
    try {
      const payload = { ...form, estimated_value: Number(form.estimated_value) || 0, estimated_vab: Number(form.estimated_vab) || 0, probability: Number(form.probability) || 0 };
      if (descriptionChanged) payload.description_change_reason = descriptionReason.trim();
      const response = await api.patch(`/opportunities/${id}`, payload);
      setOpportunity(response.data);
      setDescriptionReason("");
      toast.success("Oportunidade atualizada.");
    } catch (error) { toast.error(formatApiErrorDetail(error.response?.data?.detail)); }
  };

  const lose = async () => {
    if (!loseReason.trim()) { toast.error("Indique o motivo da perda."); return; }
    try {
      await api.patch(`/opportunities/${id}`, { status: "perdida", lost_reason: loseReason.trim() });
      toast.success("Oportunidade marcada como perdida.");
      navigate("/oportunidades");
    } catch (error) { toast.error(formatApiErrorDetail(error.response?.data?.detail)); }
  };

  const convert = async () => {
    setConverting(true);
    try { const response = await api.post(`/opportunities/${id}/convert`); toast.success("Proposta criada a partir da oportunidade."); navigate(`/propostas/${response.data.id}`); }
    catch (error) { toast.error(formatApiErrorDetail(error.response?.data?.detail)); }
    finally { setConverting(false); }
  };

  if (!opportunity || !form) return <div className="p-8 text-sm text-neutral-500">A carregar oportunidade…</div>;

  return <div>
    <PageHeader kicker="Ciclo comercial" title="Oportunidade" actions={<Link to="/oportunidades" className="border border-neutral-300 px-3 py-2 text-xs hover:bg-neutral-50">Voltar a Oportunidades</Link>} />
    <div className="max-w-4xl p-8"><div className="border border-neutral-200 bg-white p-6"><div className="mb-6 flex items-start justify-between gap-4 border-b border-neutral-200 pb-5"><div><div className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">{OPP_STATUS[opportunity.status]}</div><h2 className="mt-1 text-xl font-semibold">{opportunity.description}</h2></div><div className="font-mono text-lg">{eur(opportunity.estimated_value)}</div></div><div className="grid grid-cols-1 gap-5 md:grid-cols-2"><div className="md:col-span-2"><Label>Cliente</Label><select value={form.client_id} onChange={(event) => setForm({ ...form, client_id: event.target.value })} className="mt-1 h-10 w-full border border-neutral-300 bg-white px-3 text-sm">{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></div><div className="md:col-span-2"><Label>Descrição</Label><Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} disabled={!canEditDescription} className="mt-1 rounded-none" />{!canEditDescription && <div className="mt-1 text-xs text-neutral-500">A descrição só pode ser alterada por admin ou comercial.</div>}{canEditDescription && form.description.trim() !== (opportunity.description || "").trim() && <div className="mt-3"><Label>Justificação da alteração da descrição</Label><Textarea value={descriptionReason} onChange={(event) => setDescriptionReason(event.target.value)} rows={2} className="mt-1 rounded-none" /></div>}</div><div><Label>Valor estimado</Label><Input type="number" value={form.estimated_value} onChange={(event) => setForm({ ...form, estimated_value: event.target.value })} className="mt-1 rounded-none font-mono" /></div><div><Label>VAB estimado</Label><Input type="number" value={form.estimated_vab} onChange={(event) => setForm({ ...form, estimated_vab: event.target.value })} className="mt-1 rounded-none font-mono" /></div><div><Label>Probabilidade (%)</Label><Input type="number" min="0" max="100" value={form.probability} onChange={(event) => setForm({ ...form, probability: event.target.value })} className="mt-1 rounded-none font-mono" /></div><div><Label>Data prevista de fecho</Label><Input type="date" value={form.expected_close_date} onChange={(event) => setForm({ ...form, expected_close_date: event.target.value })} className="mt-1 rounded-none font-mono" /></div><div><Label>Prioridade</Label><select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} className="mt-1 h-10 w-full border border-neutral-300 bg-white px-3 text-sm"><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option></select></div><div><Label>Estado</Label><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="mt-1 h-10 w-full border border-neutral-300 bg-white px-3 text-sm"><option value="aberta">Aberta</option><option value="em_analise">Em análise</option></select></div><div className="md:col-span-2"><Label>Concorrente</Label><Input value={form.competitor} onChange={(event) => setForm({ ...form, competitor: event.target.value })} className="mt-1 rounded-none" /></div><div className="md:col-span-2"><Label>Notas</Label><Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={3} className="mt-1 rounded-none" /></div></div><div className="mt-7 flex flex-wrap justify-between gap-3 border-t border-neutral-200 pt-5"><Button variant="outline" onClick={() => { setLoseReason(""); setLoseOpen(true); }} className="rounded-none border-[#FF2A00] text-[#FF2A00] hover:bg-[#FFF1F0]"><Trash2 size={15} className="mr-2" /> Marcar como perdida</Button><div className="flex gap-2"><Button variant="outline" onClick={save} className="rounded-none"><Save size={15} className="mr-2" /> Guardar</Button>{opportunity.status === "em_analise" && <Button onClick={convert} disabled={converting} className="rounded-none bg-[#002FA7] text-white hover:bg-[#002277]"><ArrowRight size={15} className="mr-2" /> {converting ? "A converter…" : "Converter em proposta"}</Button>}</div></div></div></div>
    <Dialog open={loseOpen} onOpenChange={setLoseOpen}><DialogContent className="max-w-md rounded-none"><DialogHeader><DialogTitle>Marcar oportunidade como perdida</DialogTitle></DialogHeader><Label>Motivo da perda</Label><Textarea value={loseReason} onChange={(event) => setLoseReason(event.target.value)} rows={3} placeholder="Indique o motivo" className="rounded-none" /><DialogFooter><Button variant="ghost" onClick={() => setLoseOpen(false)} className="rounded-none">Cancelar</Button><Button onClick={lose} className="rounded-none bg-[#FF2A00] text-white hover:bg-[#CC2200]">Confirmar perda</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
