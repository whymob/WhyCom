import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarDays, CalendarClock, CheckCircle2, ChevronRight, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { dateShort, eur, OPP_STATUS, PROP_STATUS } from "@/lib/fmt";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

const SECTION_STYLE = {
  overdue: { icon: AlertTriangle, accent: "border-[#FF2A00]", iconClass: "text-[#FF2A00]" },
  today: { icon: CalendarDays, accent: "border-[#FFC800]", iconClass: "text-[#7C5A00]" },
  upcoming: { icon: CheckCircle2, accent: "border-[#002FA7]", iconClass: "text-[#002FA7]" },
};

function statusLabel(item) {
  return item.kind === "proposal" ? (PROP_STATUS[item.status] || item.status) : (OPP_STATUS[item.status] || item.status);
}

export default function Workday() {
  const { user } = useAuth();
  const [workday, setWorkday] = useState(null);
  const [loading, setLoading] = useState(true);
  const [owners, setOwners] = useState([]);
  const [ownerId, setOwnerId] = useState("");
  const [actionDialog, setActionDialog] = useState(null);
  const [nextDate, setNextDate] = useState("");
  const [nextType, setNextType] = useState("follow_up");
  const [actionNote, setActionNote] = useState("");
  const [savingAction, setSavingAction] = useState(false);
  const [selectedItems, setSelectedItems] = useState({});
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkDate, setBulkDate] = useState("");
  const [bulkNote, setBulkNote] = useState("");
  const [savingBulk, setSavingBulk] = useState(false);
  const isManager = ["admin", "ceo"].includes(user?.role);

  const load = (selectedOwner = ownerId) => {
    setLoading(true);
    api.get("/workday", { params: selectedOwner ? { owner_id: selectedOwner } : {} }).then((response) => setWorkday(response.data)).finally(() => setLoading(false));
  };

  useEffect(load, []);
  useEffect(() => { if (isManager) api.get("/users").then((response) => setOwners((response.data || []).filter((item) => item.active))); }, [isManager]);

  const openAction = (item, action) => {
    setActionDialog({ item, action });
    setNextDate(action === "reschedule" ? item.due_date : "");
    setNextType(item.follow_up_type || "follow_up");
    setActionNote("");
  };

  const toggleSelected = (item, checked) => {
    const key = `${item.kind}-${item.id}`;
    if (checked && !selectedItems[key] && Object.keys(selectedItems).length >= 100) {
      toast.error("Pode selecionar até 100 ações de cada vez");
      return;
    }
    setSelectedItems((current) => {
      const next = { ...current };
      if (checked) next[key] = { kind: item.kind, id: item.id };
      else delete next[key];
      return next;
    });
  };

  const saveBulkReschedule = async () => {
    const items = Object.values(selectedItems);
    if (!items.length || !bulkDate) return;
    setSavingBulk(true);
    try {
      const { data } = await api.post("/workday/reschedule", {
        items,
        next_follow_up_date: bulkDate,
        note: bulkNote,
      });
      const succeededKeys = new Set((data.results || []).filter((result) => result.success).map((item) => `${item.kind}-${item.id}`));
      setSelectedItems((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !succeededKeys.has(key))));
      setBulkDialogOpen(false);
      setBulkDate("");
      setBulkNote("");
      load();
      if (data.failed) toast.error(`${data.succeeded} reagendada(s); ${data.failed} não foi/foram atualizada(s). Mantenha as selecionadas para tentar novamente.`);
      else toast.success(`${data.succeeded} ação(ões) reagendada(s)`);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Não foi possível reagendar as ações selecionadas");
    } finally {
      setSavingBulk(false);
    }
  };

  const saveAction = async () => {
    if (!actionDialog) return;
    if (actionDialog.action === "reschedule" && !nextDate) return;
    setSavingAction(true);
    try {
      await api.post(`/workday/${actionDialog.item.kind}/${actionDialog.item.id}/follow-up`, {
        action: actionDialog.action,
        next_follow_up_date: nextDate || null,
        next_follow_up_type: nextType,
        note: actionNote,
      });
      const completedKey = `${actionDialog.item.kind}-${actionDialog.item.id}`;
      setSelectedItems((current) => {
        const next = { ...current };
        delete next[completedKey];
        return next;
      });
      setActionDialog(null);
      load();
      toast.success(actionDialog.action === "complete" ? "Ação concluída" : "Ação reagendada");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Não foi possível atualizar a ação");
    } finally {
      setSavingAction(false);
    }
  };

  return (
    <div>
      <PageHeader
        kicker="Execução comercial"
        title="O meu dia"
        actions={<><>{isManager && <select value={ownerId} onChange={(event) => { setOwnerId(event.target.value); load(event.target.value); }} className="h-9 rounded-lg border border-[var(--wc-border)] bg-white px-3 text-xs text-slate-700 outline-none focus:border-[#14E0E0] focus:ring-4 focus:ring-[#14E0E0]/15"><option value="">Toda a equipa</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select>}</><button onClick={() => load()} className="flex items-center gap-2 rounded-lg border border-[#14E0E0] bg-[#14E0E0] px-3 py-2 text-xs font-semibold text-[#14181F] shadow-[0_0_14px_rgba(20,224,224,.22)] hover:bg-[#0B8E8E] hover:text-white"><RefreshCw size={14} /> Atualizar</button></>}
      />
      <div className="space-y-6 p-7">
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            ["Em atraso", workday?.summary?.overdue ?? "-", "Replanear ou concluir primeiro", "overdue"],
            ["Para hoje", workday?.summary?.today ?? "-", "Negociações e propostas com ação hoje", "today"],
            ["Próximos 7 dias", workday?.summary?.upcoming ?? "-", "Prepare os próximos contactos", "upcoming"],
          ].map(([label, value, sub, key]) => {
            const Icon = SECTION_STYLE[key].icon;
            return <div key={key} className="rounded-[14px] border border-[var(--wc-border)] bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400"><span>{label}</span><Icon size={16} className={SECTION_STYLE[key].iconClass} /></div>
              <div className="mt-3 font-mono text-3xl font-semibold">{value}</div>
              <div className="mt-1 text-xs text-slate-500">{sub}</div>
            </div>;
          })}
        </section>

        {loading && <div className="py-10 text-center text-sm text-neutral-500">A carregar trabalho comercial…</div>}
        {!loading && Object.keys(selectedItems).length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#14A6A6]/30 bg-[#ECFEFF] px-4 py-3">
          <div className="text-sm text-slate-700">{Object.keys(selectedItems).length} ação(ões) selecionada(s)</div>
          <div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setSelectedItems({})}>Limpar seleção</Button><Button type="button" size="sm" onClick={() => { setBulkDate(""); setBulkNote(""); setBulkDialogOpen(true); }} className="bg-[#002FA7] text-white hover:bg-[#002277]">Reagendar selecionadas</Button></div>
        </div>}
        {!loading && workday?.sections?.map((section) => {
          const style = SECTION_STYLE[section.key];
          const Icon = style.icon;
          return (
            <section key={section.key} className="overflow-hidden rounded-[14px] border border-[var(--wc-border)] bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-[var(--wc-border)] px-5 py-4">
                <div className="flex items-center gap-3"><Icon size={16} className={style.iconClass} /><div><div className="text-sm font-medium">{section.label}</div><div className="text-xs text-neutral-500">{section.items.length} ação(ões)</div></div></div>
              </div>
              {section.items.length === 0 ? <div className="px-5 py-6 text-sm text-neutral-500">Sem ações nesta secção.</div> : (
                <div className="divide-y divide-neutral-100">
                  {section.items.map((item) => {
                    const key = `${item.kind}-${item.id}`;
                    return <div key={key} className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-[#ECFEFF] sm:gap-4 sm:px-5">
                      <Checkbox aria-label={`Selecionar ${item.title}`} checked={Boolean(selectedItems[key])} onCheckedChange={(checked) => toggleSelected(item, checked === true)} />
                      <Link to={item.href} className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
                        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{item.kind_label}</span><span className="rounded-full border border-[var(--wc-border)] bg-[var(--wc-surface-2)] px-2 py-0.5 text-[10px] text-slate-600">{statusLabel(item)}</span></div><div className="mt-1 truncate text-sm font-medium">{item.title}</div><div className="mt-1 truncate text-xs text-slate-500">{item.client}{item.description ? ` · ${item.description}` : ""}</div></div>
                        <div className="hidden text-right text-xs text-neutral-500 md:block"><div>{dateShort(item.due_date)}</div><div className="mt-1 font-mono text-neutral-800">{eur(item.value)}</div></div><ChevronRight size={16} className="shrink-0 text-neutral-400" />
                      </Link>
                      <div className="flex shrink-0 gap-2"><Button size="sm" variant="outline" onClick={() => openAction(item, "reschedule")} className="h-8 rounded-none px-2 text-xs"><CalendarClock size={13} className="mr-1" />Reagendar</Button><Button size="sm" onClick={() => openAction(item, "complete")} className="h-8 rounded-none bg-[#00A859] px-2 text-xs text-white hover:bg-[#008C4A]">Concluir</Button></div>
                    </div>;
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
      <Dialog open={Boolean(actionDialog)} onOpenChange={(open) => !open && setActionDialog(null)}>
        <DialogContent className="max-w-md rounded-none">
          <DialogHeader><DialogTitle>{actionDialog?.action === "complete" ? "Concluir ação" : "Reagendar ação"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-neutral-600">{actionDialog?.item?.title}</div>
            <div>
              <Label>Tipo da próxima ação</Label>
              <select value={nextType} onChange={(event) => setNextType(event.target.value)} className="mt-1 h-10 w-full rounded-none border border-neutral-300 bg-white px-3 text-sm"><option value="follow_up">Follow-up</option><option value="entrega">Entrega</option></select>
            </div>
            {actionDialog?.action === "complete" ? <div><Label>Agendar novo follow-up (opcional)</Label><Input type="date" value={nextDate} onChange={(event) => setNextDate(event.target.value)} className="mt-1 rounded-none font-mono" /></div> : <div><Label>Nova data</Label><Input type="date" required value={nextDate} onChange={(event) => setNextDate(event.target.value)} className="mt-1 rounded-none font-mono" /></div>}
            <div><Label>Nota</Label><Textarea rows={3} value={actionNote} onChange={(event) => setActionNote(event.target.value)} placeholder="Registe o resultado ou motivo do reagendamento" className="mt-1 rounded-none" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setActionDialog(null)} className="rounded-none">Cancelar</Button><Button disabled={savingAction || (actionDialog?.action === "reschedule" && !nextDate)} onClick={saveAction} className="rounded-none bg-[#002FA7] text-white hover:bg-[#002277]">{savingAction ? "A guardar…" : actionDialog?.action === "complete" ? "Concluir" : "Reagendar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={bulkDialogOpen} onOpenChange={(open) => !savingBulk && setBulkDialogOpen(open)}>
        <DialogContent className="max-w-md rounded-none">
          <DialogHeader><DialogTitle>Reagendar ações selecionadas</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-neutral-600">{Object.keys(selectedItems).length} ação(ões) receberão a mesma data.</div>
            <div><Label>Nova data</Label><Input type="date" required value={bulkDate} onChange={(event) => setBulkDate(event.target.value)} className="mt-1 rounded-none font-mono" /></div>
            <div><Label>Nota (opcional)</Label><Textarea rows={3} value={bulkNote} onChange={(event) => setBulkNote(event.target.value)} placeholder="Registe o motivo do reagendamento" className="mt-1 rounded-none" /></div>
          </div>
          <DialogFooter><Button variant="outline" disabled={savingBulk} onClick={() => setBulkDialogOpen(false)} className="rounded-none">Cancelar</Button><Button disabled={savingBulk || !bulkDate} onClick={saveBulkReschedule} className="rounded-none bg-[#002FA7] text-white hover:bg-[#002277]">{savingBulk ? "A guardar…" : "Reagendar selecionadas"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
