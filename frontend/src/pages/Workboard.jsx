import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarClock, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiErrorDetail } from "@/lib/api";
import { dateShort, eur, LEAD_STATUS, OPP_STATUS, ORDER_STATUS, PROP_STATUS } from "@/lib/fmt";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const KIND_LABEL = { lead: "Lead", opportunity: "Oportunidade", proposal: "Proposta", order: "Encomenda" };
const NEXT_PROCESS = { leads: "opportunities", opportunities: "proposals", proposals: "orders" };
const FINAL_STATUS = { leads: "em_qualificacao", opportunities: "em_analise", proposals: "ganha" };
const PROCESS_STATUSES = {
  leads: ["nova", "em_qualificacao"],
  opportunities: ["aberta", "em_analise"],
  proposals: ["em_elaboracao", "enviada", "em_negociacao", "ganha"],
  orders: ["aberta", "em_planeamento"],
};
const ADVANCE_LABEL = {
  leads: "converter esta lead numa oportunidade",
  opportunities: "converter esta oportunidade numa proposta",
  proposals: "criar uma encomenda a partir desta proposta ganha",
};

function kindForProcess(processKey) {
  return { leads: "lead", opportunities: "opportunity", proposals: "proposal", orders: "order" }[processKey];
}

function statusLabel(item) {
  const labels = { lead: LEAD_STATUS, opportunity: OPP_STATUS, proposal: PROP_STATUS, order: ORDER_STATUS };
  return labels[item.kind]?.[item.status] || item.status;
}

function groupsForProcess(process) {
  return (PROCESS_STATUSES[process.key] || []).map((status) => ({ status, items: process.items.filter((item) => item.status === status) }));
}

export default function Workboard() {
  const { user } = useAuth();
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [owners, setOwners] = useState([]);
  const [ownerId, setOwnerId] = useState("");
  const [selected, setSelected] = useState(null);
  const [dragged, setDragged] = useState(null);
  const [pendingAdvance, setPendingAdvance] = useState(null);
  const [pendingStatusMove, setPendingStatusMove] = useState(null);
  const [advancing, setAdvancing] = useState(false);
  const [expandedProcesses, setExpandedProcesses] = useState({});
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discardReason, setDiscardReason] = useState("");
  const [loseOpen, setLoseOpen] = useState(false);
  const [loseReason, setLoseReason] = useState("");
  const [proposalAction, setProposalAction] = useState(null);
  const [proposalActionReason, setProposalActionReason] = useState("");
  const [sendFile, setSendFile] = useState(null);
  const [sentAt, setSentAt] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [statusMoveReason, setStatusMoveReason] = useState("");
  const isManager = ["admin", "ceo"].includes(user?.role);

  const load = (selectedOwner = ownerId) => {
    setLoading(true);
    api.get("/workboard", { params: selectedOwner ? { owner_id: selectedOwner } : {} })
      .then((response) => setBoard(response.data))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);
  useEffect(() => {
    if (isManager) api.get("/users").then((response) => setOwners((response.data || []).filter((item) => item.active)));
  }, [isManager]);

  const canAdvance = (item, processKey) => Boolean(NEXT_PROCESS[processKey]) && FINAL_STATUS[processKey] === item.status;
  const canMoveWithinProcess = (item, processKey, targetStatus) => {
    if (processKey === "leads") return (item.status === "nova" && targetStatus === "em_qualificacao") || (item.status === "em_qualificacao" && targetStatus === "nova");
    if (processKey === "opportunities") return (item.status === "aberta" && targetStatus === "em_analise") || (item.status === "em_analise" && targetStatus === "aberta");
    if (processKey === "proposals") {
      const flow = PROCESS_STATUSES.proposals;
      const from = flow.indexOf(item.status);
      const to = flow.indexOf(targetStatus);
      return from >= 0 && to >= 0 && from !== to && (to === from + 1 || to < from);
    }
    if (processKey === "orders") return (item.status === "aberta" && targetStatus === "em_planeamento") || (item.status === "em_planeamento" && targetStatus === "aberta");
    return false;
  };
  const canDrag = (item, processKey) => canAdvance(item, processKey) || (processKey === "leads" && ["nova", "em_qualificacao"].includes(item.status)) || (processKey === "opportunities" && ["aberta", "em_analise"].includes(item.status)) || (processKey === "proposals" && PROCESS_STATUSES.proposals.includes(item.status)) || (processKey === "orders" && PROCESS_STATUSES.orders.includes(item.status));

  const requestAdvance = (targetProcess) => {
    if (!dragged || NEXT_PROCESS[dragged.processKey] !== targetProcess || !canAdvance(dragged.item, dragged.processKey)) return;
    setPendingAdvance(dragged);
    setDragged(null);
  };

  const requestStatusMove = (targetStatus) => {
    if (!dragged || !canMoveWithinProcess(dragged.item, dragged.processKey, targetStatus)) return;
    if (dragged.processKey === "proposals" && targetStatus === "enviada" && !dragged.item.has_valid_lines) {
      toast.error("Adicione pelo menos uma linha válida antes de enviar a proposta.");
      setDragged(null);
      return;
    }
    setStatusMoveReason("");
    setSendFile(null);
    setSentAt(new Date().toISOString().slice(0, 10));
    setSentTo("");
    setExpectedCloseDate((dragged.item.due_date || "").slice(0, 10));
    setPendingStatusMove({ ...dragged, targetStatus });
    setDragged(null);
  };

  const confirmStatusMove = async () => {
    if (!pendingStatusMove) return;
    setAdvancing(true);
    try {
      const { processKey, item, targetStatus } = pendingStatusMove;
      const resource = processKey === "leads" ? "leads" : processKey === "opportunities" ? "opportunities" : processKey === "orders" ? "orders" : "proposals";
      const payload = { status: targetStatus };
      if (processKey === "proposals") {
        const flow = PROCESS_STATUSES.proposals;
        if (flow.indexOf(targetStatus) < flow.indexOf(item.status)) {
          if (!statusMoveReason.trim()) { toast.error("Indique a justificação para retroceder."); return; }
          payload.status_change_reason = statusMoveReason.trim();
        }
        if (targetStatus === "enviada") {
          if (!sendFile) { toast.error("Anexe o ficheiro da proposta."); return; }
          if (!sentAt || !sentTo.trim() || !expectedCloseDate) { toast.error("Preencha os dados de envio e a data prevista de fecho."); return; }
          const formData = new FormData();
          formData.append("file", sendFile);
          await api.post(`/proposals/${item.id}/attachment`, formData, { headers: { "Content-Type": "multipart/form-data" } });
          payload.sent_at = sentAt;
          payload.sent_to = sentTo.trim();
          payload.next_follow_up_date = expectedCloseDate;
        }
      }
      if (processKey === "orders" && item.status === "em_planeamento" && targetStatus === "aberta") {
        if (!statusMoveReason.trim()) { toast.error("Indique a justificação para retroceder."); return; }
        payload.status_change_reason = statusMoveReason.trim();
      }
      await api.patch(`/${resource}/${item.id}`, payload);
      toast.success(`${KIND_LABEL[pendingStatusMove.item.kind]} movida para ${statusLabel({ kind: pendingStatusMove.item.kind, status: pendingStatusMove.targetStatus })}.`);
      setPendingStatusMove(null);
      setSelected(null);
      load();
    } catch (error) {
      toast.error(formatApiErrorDetail(error.response?.data?.detail) || "Não foi possível alterar o estado da lead.");
    } finally {
      setAdvancing(false);
    }
  };

  const confirmAdvance = async () => {
    if (!pendingAdvance) return;
    const { item, processKey } = pendingAdvance;
    setAdvancing(true);
    try {
      if (processKey === "leads") await api.post(`/leads/${item.id}/convert`);
      if (processKey === "opportunities") await api.post(`/opportunities/${item.id}/convert`);
      if (processKey === "proposals") await api.post(`/proposals/${item.id}/convert`);
      toast.success("Etapa comercial atualizada.");
      setPendingAdvance(null);
      setSelected(null);
      load();
    } catch (error) {
      toast.error(formatApiErrorDetail(error.response?.data?.detail) || "Não foi possível avançar este registo.");
    } finally {
      setAdvancing(false);
    }
  };

  const toggleProcess = (processKey) => setExpandedProcesses((current) => ({ ...current, [processKey]: !current[processKey] }));

  const discardLead = async () => {
    if (!selected || !discardReason.trim()) { toast.error("Indique o motivo do descarte."); return; }
    try {
      await api.patch(`/leads/${selected.id}`, { status: "descartada", lost_reason: discardReason.trim() });
      toast.success("Lead descartada.");
      setDiscardOpen(false);
      setSelected(null);
      load();
    } catch (error) {
      toast.error(formatApiErrorDetail(error.response?.data?.detail) || "Não foi possível descartar a lead.");
    }
  };

  const loseOpportunity = async () => {
    if (!selected || !loseReason.trim()) { toast.error("Indique o motivo da perda."); return; }
    try {
      await api.patch(`/opportunities/${selected.id}`, { status: "perdida", lost_reason: loseReason.trim() });
      toast.success("Oportunidade marcada como perdida.");
      setLoseOpen(false);
      setSelected(null);
      load();
    } catch (error) {
      toast.error(formatApiErrorDetail(error.response?.data?.detail) || "Não foi possível marcar a oportunidade como perdida.");
    }
  };

  const executeProposalAction = async () => {
    if (!selected || !proposalAction) return;
    if (!proposalActionReason.trim()) { toast.error("Indique a justificação."); return; }
    setAdvancing(true);
    try {
      if (proposalAction === "substituida") {
        const { data } = await api.post(`/opportunities/${selected.opportunity_id}/proposals`, { replacement_reason: proposalActionReason.trim() });
        toast.success(`Nova proposta ${data.number} criada.`);
      } else {
        const payload = proposalAction === "perdida"
          ? { status: "perdida", lost_reason: proposalActionReason.trim() }
          : { status: "expirada", status_change_reason: proposalActionReason.trim() };
        await api.patch(`/proposals/${selected.id}`, payload);
        toast.success(`Proposta marcada como ${proposalAction === "perdida" ? "perdida" : "expirada"}.`);
      }
      setProposalAction(null);
      setSelected(null);
      load();
    } catch (error) {
      toast.error(formatApiErrorDetail(error.response?.data?.detail) || "Não foi possível concluir a ação na proposta.");
    } finally {
      setAdvancing(false);
    }
  };

  return (
    <div>
      <PageHeader
        kicker="Execução comercial"
        title="Quadro comercial"
        actions={<>
          {isManager && <select value={ownerId} onChange={(event) => { setOwnerId(event.target.value); load(event.target.value); }} className="h-9 rounded-lg border border-[var(--wc-border)] bg-white px-3 text-xs text-slate-700 outline-none focus:border-[#14E0E0] focus:ring-4 focus:ring-[#14E0E0]/15"><option value="">Toda a equipa</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select>}
          <button onClick={() => load()} className="flex items-center gap-2 rounded-lg border border-[#14E0E0] bg-[#14E0E0] px-3 py-2 text-xs font-semibold text-[#14181F] shadow-[0_0_14px_rgba(20,224,224,.22)] hover:bg-[#0B8E8E] hover:text-white"><RefreshCw size={14} /> Atualizar</button>
        </>}
      />
      <div className="p-7">
        <div className="mb-5 rounded-[14px] border border-[var(--wc-border)] bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">Os processos ficam lado a lado. Pode expandir vários grupos; quando necessário, use a barra horizontal para navegar. Estados de encerramento só podem ser definidos pelas ações do registo, nunca por arrasto.</div>
        {loading && <div className="py-10 text-center text-sm text-neutral-500">A carregar quadro comercial…</div>}
        <div className="overflow-x-auto pb-4">
          <div className="flex min-w-max items-start gap-4">
            {board?.columns?.map((process) => {
              const expanded = Boolean(expandedProcesses[process.key]);
              const groups = groupsForProcess(process);
              const visibleGroups = ["leads", "opportunities", "proposals", "orders"].includes(process.key) && !expanded ? groups.slice(0, 1) : groups;
              const isDropTarget = dragged && canAdvance(dragged.item, dragged.processKey) && NEXT_PROCESS[dragged.processKey] === process.key;
              return <section key={process.key} onDragOver={(event) => { if (isDropTarget) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); requestAdvance(process.key); }} className={`shrink-0 overflow-hidden rounded-[14px] border bg-[var(--wc-surface-2)] shadow-sm ${expanded ? "w-auto" : "w-72"} ${isDropTarget ? "border-[#14E0E0] ring-2 ring-[#14E0E0]/30" : "border-[var(--wc-border)]"}`}>
                <div className="flex items-center justify-between gap-5 border-b border-[var(--wc-border)] bg-white px-4 py-3"><div><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Processo</div><div className="mt-1 text-sm font-semibold">{process.label}</div><div className="mt-2 font-mono text-xs text-slate-600">{process.count} registo(s) · {eur(process.value)}</div></div><button type="button" onClick={() => toggleProcess(process.key)} className="flex items-center gap-1 rounded-lg border border-[var(--wc-border)] px-2.5 py-2 text-xs text-slate-600 hover:border-[#14E0E0] hover:bg-[#ECFEFF]">{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}{expanded ? "Recolher" : "Expandir"}</button></div>
                {(expanded || ["leads", "opportunities", "proposals", "orders"].includes(process.key)) && <div className="p-3"><div className="flex min-w-max gap-3">
                  {visibleGroups.map((group) => <div key={group.status} onDragOver={(event) => { if (dragged && canMoveWithinProcess(dragged.item, dragged.processKey, group.status)) event.preventDefault(); }} onDrop={(event) => { if (dragged && canMoveWithinProcess(dragged.item, dragged.processKey, group.status)) { event.preventDefault(); event.stopPropagation(); requestStatusMove(group.status); } }} className={`w-64 shrink-0 overflow-hidden rounded-xl border bg-white ${dragged && canMoveWithinProcess(dragged.item, dragged.processKey, group.status) ? "border-[#14E0E0] ring-2 ring-[#14E0E0]/30" : "border-[var(--wc-border)]"}`}>
                    <div className="flex items-center justify-between border-b border-[var(--wc-border)] bg-[var(--wc-surface-2)] px-3 py-2"><div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{statusLabel({ kind: kindForProcess(process.key), status: group.status })}</div><div className="flex items-center gap-1 font-mono text-xs text-[var(--wc-cyan-700)]"><span>{group.items.length}</span>{FINAL_STATUS[process.key] === group.status && <ArrowRight size={12} title="Pronto para avançar" />}</div></div>
                    <div className="min-h-24 space-y-3 p-3">{group.items.length === 0 && <div className="py-4 text-center text-xs text-neutral-400">Sem registos.</div>}{group.items.map((item) => {
                      const itemCanAdvance = canAdvance(item, process.key);
                      const itemCanDrag = canDrag(item, process.key);
                      const dragTitle = itemCanAdvance ? "Arraste para o processo seguinte" : process.key === "proposals" && itemCanDrag ? "Arraste entre estados; ao retroceder será pedida justificação" : itemCanDrag ? "Arraste para alterar o estado" : NEXT_PROCESS[process.key] ? "Altere para o estado final antes de avançar" : "Consultar registo";
                      return <button key={item.id} type="button" draggable={itemCanDrag} onDragStart={() => itemCanDrag && setDragged({ item, processKey: process.key })} onDragEnd={() => setDragged(null)} onClick={() => setSelected(item)} className={`block w-full rounded-lg border bg-white p-3 text-left shadow-sm transition-colors hover:border-[#14E0E0] hover:bg-[#ECFEFF] ${dragged?.item.id === item.id ? "opacity-40" : "border-[var(--wc-border)]"} ${itemCanDrag ? "cursor-grab" : "cursor-pointer"}`} title={dragTitle}>
                        <div className="text-[10px] uppercase tracking-widest text-neutral-500">{statusLabel(item)}</div><div className="mt-1 line-clamp-2 text-sm font-medium">{item.title}</div><div className="mt-2 truncate text-xs text-neutral-600">{item.client}</div>{item.due_date && <div className="mt-3 flex items-center gap-1 text-[11px] text-neutral-500"><CalendarClock size={12} /> {dateShort(item.due_date)}</div>}<div className="mt-3 flex items-center justify-between font-mono text-xs"><span>{eur(item.value)}</span>{itemCanDrag && <ArrowRight size={13} className="text-[#002FA7]" />}</div>
                      </button>;
                    })}</div>
                  </div>)}
                </div></div>}
              </section>;
            })}
          </div>
        </div>
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-xl rounded-none">
{selected && <><DialogHeader><div className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">{KIND_LABEL[selected.kind]}</div><DialogTitle>{selected.title}</DialogTitle></DialogHeader><div className="grid grid-cols-1 gap-4 py-2 text-sm sm:grid-cols-2"><div><div className="text-[10px] uppercase tracking-widest text-neutral-500">Cliente</div><div className="mt-1 font-medium">{selected.client}</div></div><div><div className="text-[10px] uppercase tracking-widest text-neutral-500">Estado</div><div className="mt-1 font-medium">{statusLabel(selected)}</div></div><div><div className="text-[10px] uppercase tracking-widest text-neutral-500">Valor</div><div className="mt-1 font-mono">{eur(selected.value)}</div></div>{selected.due_date && <div><div className="text-[10px] uppercase tracking-widest text-neutral-500">Data prevista</div><div className="mt-1 font-mono">{dateShort(selected.due_date)}</div></div>}{selected.description && <div className="sm:col-span-2"><div className="text-[10px] uppercase tracking-widest text-neutral-500">Descrição</div><div className="mt-1 whitespace-pre-wrap border border-neutral-200 bg-neutral-50 p-3 text-neutral-700">{selected.description}</div></div>}</div><DialogFooter>{selected.kind === "lead" && <button type="button" onClick={() => { setDiscardReason(""); setDiscardOpen(true); }} className="mr-auto border border-[#FF2A00] px-3 py-2 text-xs text-[#FF2A00] hover:bg-[#FFF1F0]">Descartar lead</button>}{selected.kind === "opportunity" && <button type="button" onClick={() => { setLoseReason(""); setLoseOpen(true); }} className="mr-auto border border-[#FF2A00] px-3 py-2 text-xs text-[#FF2A00] hover:bg-[#FFF1F0]">Marcar como perdida</button>}{selected.kind === "proposal" && <div className="mr-auto flex flex-wrap gap-2"><button type="button" onClick={() => { setProposalAction("perdida"); setProposalActionReason(""); }} className="border border-[#FF2A00] px-3 py-2 text-xs text-[#FF2A00] hover:bg-[#FFF1F0]">Marcar perdida</button><button type="button" onClick={() => { setProposalAction("expirada"); setProposalActionReason(""); }} className="border border-neutral-500 px-3 py-2 text-xs text-neutral-700 hover:bg-neutral-50">Expirar</button><button type="button" onClick={() => { setProposalAction("substituida"); setProposalActionReason(""); }} className="border border-neutral-500 px-3 py-2 text-xs text-neutral-700 hover:bg-neutral-50">Substituir</button></div>}<DialogClose className="border border-neutral-300 px-3 py-2 text-xs hover:bg-neutral-50">Fechar</DialogClose><Link to={selected.href} className="border border-[#002FA7] bg-[#002FA7] px-3 py-2 text-xs text-white hover:bg-[#002480]">Abrir registo completo</Link></DialogFooter></>}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(proposalAction)} onOpenChange={(open) => !open && setProposalAction(null)}>
        <DialogContent className="max-w-md rounded-none"><DialogHeader><DialogTitle>{proposalAction === "substituida" ? "Substituir proposta" : proposalAction === "perdida" ? "Marcar proposta como perdida" : "Expirar proposta"}</DialogTitle></DialogHeader><label className="text-sm font-medium">{proposalAction === "perdida" ? "Motivo da perda" : "Justificação"}</label><textarea value={proposalActionReason} onChange={(event) => setProposalActionReason(event.target.value)} rows={3} placeholder="Indique o motivo" className="w-full border border-neutral-300 p-3 text-sm outline-none focus:border-[#002FA7]" /><p className="text-xs text-neutral-500">{proposalAction === "substituida" ? "Será criada uma nova versão da proposta; a atual deixará de aparecer no quadro." : "Este é um estado de encerramento e não pode ser aplicado por arrasto."}</p><DialogFooter><button type="button" onClick={() => setProposalAction(null)} className="border border-neutral-300 px-3 py-2 text-xs hover:bg-neutral-50">Cancelar</button><button type="button" disabled={advancing} onClick={executeProposalAction} className="border border-[#FF2A00] bg-[#FF2A00] px-3 py-2 text-xs text-white hover:bg-[#CC2200]">Confirmar</button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent className="max-w-md rounded-none"><DialogHeader><DialogTitle>Descartar lead</DialogTitle></DialogHeader><label className="text-sm font-medium">Motivo do descarte</label><textarea value={discardReason} onChange={(event) => setDiscardReason(event.target.value)} rows={3} placeholder="Indique o motivo" className="w-full border border-neutral-300 p-3 text-sm outline-none focus:border-[#002FA7]" /><DialogFooter><button type="button" onClick={() => setDiscardOpen(false)} className="border border-neutral-300 px-3 py-2 text-xs hover:bg-neutral-50">Cancelar</button><button type="button" onClick={discardLead} className="border border-[#FF2A00] bg-[#FF2A00] px-3 py-2 text-xs text-white hover:bg-[#CC2200]">Confirmar descarte</button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={loseOpen} onOpenChange={setLoseOpen}>
        <DialogContent className="max-w-md rounded-none"><DialogHeader><DialogTitle>Marcar oportunidade como perdida</DialogTitle></DialogHeader><label className="text-sm font-medium">Motivo da perda</label><textarea value={loseReason} onChange={(event) => setLoseReason(event.target.value)} rows={3} placeholder="Indique o motivo" className="w-full border border-neutral-300 p-3 text-sm outline-none focus:border-[#002FA7]" /><DialogFooter><button type="button" onClick={() => setLoseOpen(false)} className="border border-neutral-300 px-3 py-2 text-xs hover:bg-neutral-50">Cancelar</button><button type="button" onClick={loseOpportunity} className="border border-[#FF2A00] bg-[#FF2A00] px-3 py-2 text-xs text-white hover:bg-[#CC2200]">Confirmar perda</button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingAdvance)} onOpenChange={(open) => !open && !advancing && setPendingAdvance(null)}>
        <DialogContent className="max-w-md rounded-none">
          {pendingAdvance && <><DialogHeader><div className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Confirmar avanço</div><DialogTitle>Confirmar alteração de processo</DialogTitle></DialogHeader><p className="text-sm text-neutral-700">Pretende {ADVANCE_LABEL[pendingAdvance.processKey]}?</p><div className="border border-neutral-200 bg-neutral-50 p-3 text-sm"><div className="font-medium">{pendingAdvance.item.title}</div><div className="mt-1 text-xs text-neutral-500">{pendingAdvance.item.client}</div></div><p className="text-xs text-neutral-500">Serão aplicadas as mesmas regras e validações usadas nas páginas de gestão.</p><DialogFooter><button type="button" disabled={advancing} onClick={() => setPendingAdvance(null)} className="border border-neutral-300 px-3 py-2 text-xs hover:bg-neutral-50 disabled:opacity-50">Cancelar</button><button type="button" disabled={advancing} onClick={confirmAdvance} className="border border-[#002FA7] bg-[#002FA7] px-3 py-2 text-xs text-white hover:bg-[#002480] disabled:opacity-50">{advancing ? "A avançar…" : "Confirmar avanço"}</button></DialogFooter></>}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingStatusMove && pendingStatusMove.processKey === "proposals")} onOpenChange={(open) => !open && !advancing && setPendingStatusMove(null)}>
        <DialogContent className="max-w-md rounded-none">
          {pendingStatusMove && <><DialogHeader><div className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Confirmar alteração</div><DialogTitle>Mover para {statusLabel({ kind: "proposal", status: pendingStatusMove.targetStatus })}</DialogTitle></DialogHeader><div className="border border-neutral-200 bg-neutral-50 p-3 text-sm"><div className="font-medium">{pendingStatusMove.item.title}</div><div className="mt-1 text-xs text-neutral-500">{pendingStatusMove.item.client}</div></div>{pendingStatusMove.targetStatus === "enviada" && <div className="space-y-3"><p className="text-sm text-neutral-700">Para enviar, anexe o ficheiro final e registe os dados de envio.</p><input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx" onChange={(event) => setSendFile(event.target.files?.[0] || null)} className="block w-full border border-neutral-300 p-2 text-sm" /><input type="date" value={sentAt} onChange={(event) => setSentAt(event.target.value)} className="w-full border border-neutral-300 p-2 text-sm" /><input value={sentTo} onChange={(event) => setSentTo(event.target.value)} placeholder="Enviada para" className="w-full border border-neutral-300 p-2 text-sm" /><input type="date" value={expectedCloseDate} onChange={(event) => setExpectedCloseDate(event.target.value)} className="w-full border border-neutral-300 p-2 text-sm" /></div>}{PROCESS_STATUSES.proposals.indexOf(pendingStatusMove.targetStatus) < PROCESS_STATUSES.proposals.indexOf(pendingStatusMove.item.status) && <textarea value={statusMoveReason} onChange={(event) => setStatusMoveReason(event.target.value)} rows={3} placeholder="Justificação obrigatória para retroceder" className="w-full border border-neutral-300 p-3 text-sm" />}<DialogFooter><button type="button" disabled={advancing} onClick={() => setPendingStatusMove(null)} className="border border-neutral-300 px-3 py-2 text-xs hover:bg-neutral-50">Cancelar</button><button type="button" disabled={advancing} onClick={confirmStatusMove} className="border border-[#002FA7] bg-[#002FA7] px-3 py-2 text-xs text-white hover:bg-[#002480]">{advancing ? "A guardar…" : "Confirmar"}</button></DialogFooter></>}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingStatusMove && pendingStatusMove.processKey === "orders")} onOpenChange={(open) => !open && !advancing && setPendingStatusMove(null)}>
        <DialogContent className="max-w-md rounded-none">
          {pendingStatusMove && <><DialogHeader><div className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Confirmar alteração</div><DialogTitle>Mover para {statusLabel({ kind: "order", status: pendingStatusMove.targetStatus })}</DialogTitle></DialogHeader><p className="text-sm text-neutral-700">Pretende alterar o estado desta encomenda?</p><div className="border border-neutral-200 bg-neutral-50 p-3 text-sm"><div className="font-medium">{pendingStatusMove.item.title}</div><div className="mt-1 text-xs text-neutral-500">{pendingStatusMove.item.client}</div></div>{pendingStatusMove.item.status === "em_planeamento" && pendingStatusMove.targetStatus === "aberta" && <textarea value={statusMoveReason} onChange={(event) => setStatusMoveReason(event.target.value)} rows={3} placeholder="Justificação obrigatória para retroceder" className="w-full border border-neutral-300 p-3 text-sm" />}<DialogFooter><button type="button" disabled={advancing} onClick={() => setPendingStatusMove(null)} className="border border-neutral-300 px-3 py-2 text-xs hover:bg-neutral-50">Cancelar</button><button type="button" disabled={advancing} onClick={confirmStatusMove} className="border border-[#002FA7] bg-[#002FA7] px-3 py-2 text-xs text-white hover:bg-[#002480]">{advancing ? "A guardar…" : "Confirmar"}</button></DialogFooter></>}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingStatusMove && !["proposals", "orders"].includes(pendingStatusMove.processKey))} onOpenChange={(open) => !open && !advancing && setPendingStatusMove(null)}>
        <DialogContent className="max-w-md rounded-none">{pendingStatusMove && <><DialogHeader><div className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">Confirmar alteração</div><DialogTitle>Mover para {statusLabel({ kind: pendingStatusMove.item.kind, status: pendingStatusMove.targetStatus })}</DialogTitle></DialogHeader><p className="text-sm text-neutral-700">Pretende alterar o estado deste registo?</p><div className="border border-neutral-200 bg-neutral-50 p-3 text-sm"><div className="font-medium">{pendingStatusMove.item.title}</div><div className="mt-1 text-xs text-neutral-500">{pendingStatusMove.item.client}</div></div><DialogFooter><button type="button" disabled={advancing} onClick={() => setPendingStatusMove(null)} className="border border-neutral-300 px-3 py-2 text-xs hover:bg-neutral-50">Cancelar</button><button type="button" disabled={advancing} onClick={confirmStatusMove} className="border border-[#002FA7] bg-[#002FA7] px-3 py-2 text-xs text-white hover:bg-[#002480]">{advancing ? "A guardar…" : "Confirmar"}</button></DialogFooter></>}</DialogContent>
      </Dialog>
    </div>
  );
}
