import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, Eye, Plus } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import PageHeader from "@/components/PageHeader";
import { api, formatApiErrorDetail } from "@/lib/api";
import { dateShort, eur, OPP_STATUS } from "@/lib/fmt";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SearchableSelect from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import StatusMultiSelect from "@/components/StatusMultiSelect";
import ListFilterSettings from "@/components/ListFilterSettings";
import { useListFilters } from "@/lib/listPreferences";
import Pagination from "@/components/Pagination";
import { useAuth } from "@/context/AuthContext";

const STATUS_STYLE = {
  aberta: "bg-neutral-100 text-neutral-800",
  em_analise: "bg-[#FEF08A] text-[#854D0E]",
  convertida: "bg-[#DCFCE7] text-[#00A859]",
  perdida: "bg-[#FEE2E2] text-[#B91C1C]",
};

function defaultForm() {
  return {
    client_id: "",
    description: "",
    estimated_value: 0,
    estimated_vab: 0,
    probability: 50,
    expected_close_date: "",
    priority: "media",
    competitor: "",
    notes: "",
    status: "aberta",
  };
}

function SortButton({ label, sortKey, sort, onClick, align = "left" }) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
  const justifyClass = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";

  return (
    <button type="button" onClick={() => onClick(sortKey)} className={`flex w-full items-center gap-1 ${justifyClass}`}>
      <span>{label}</span>
      <Icon className="h-3 w-3" />
    </button>
  );
}

export default function Opportunities() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [opps, setOpps] = useState([]);
  const [clients, setClients] = useState([]);
  const [open, setOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultForm());
  const [lostOpen, setLostOpen] = useState(null);
  const [lostReason, setLostReason] = useState("");
  const [convertOpen, setConvertOpen] = useState(null);
  const [newProposalOpen, setNewProposalOpen] = useState(false);
  const [replacementReason, setReplacementReason] = useState("");
  const [descriptionChangeReason, setDescriptionChangeReason] = useState("");
  const [descriptionEditOpen, setDescriptionEditOpen] = useState(false);
  const [descriptionEditValue, setDescriptionEditValue] = useState("");
  const [descriptionEditReason, setDescriptionEditReason] = useState("");
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, page_size: 30 });
  const navigate = useNavigate();
  const { filters, setFilters, saveFilters, clearSavedFilters } = useListFilters("opportunities", {
    search: searchParams.get("search") || "",
    statuses: searchParams.get("status_scope") === "open" ? ["aberta", "em_analise"] : (searchParams.get("status") || "").split(",").filter(Boolean),
    pageSize: 30,
  });
  const [sort, setSort] = useState({ key: "value", direction: "desc" });
  const handledOpenId = useRef("");
  const canEditDescription = ["admin", "comercial"].includes(user?.role);

  const load = async (page = pagination.page) => {
    const [opportunityResponse, clientResponse] = await Promise.all([
      api.get("/opportunities", { params: { page, page_size: filters.pageSize || 30, search: filters.search, status: filters.statuses.join(","), sort_by: sort.key === "value" ? "estimated_value" : sort.key, sort_dir: sort.direction } }),
      api.get("/clients"),
    ]);
    setOpps(opportunityResponse.data.items || []);
    setPagination({ page: opportunityResponse.data.page, pages: opportunityResponse.data.pages, total: opportunityResponse.data.total, page_size: opportunityResponse.data.page_size });
    setClients(clientResponse.data);
  };

  useEffect(() => {
    load(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search, filters.statuses, filters.pageSize, sort]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (filters.search) next.set("search", filters.search);
    if (filters.statuses.length) next.set("status", filters.statuses.join(","));
    if (searchParams.get("open")) next.set("open", searchParams.get("open"));
    setSearchParams(next, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, setSearchParams]);

  const clientName = useCallback((id) => clients.find((client) => client.id === id)?.name || "-", [clients]);

  const openCreate = () => {
    setEditing(null);
    setForm(defaultForm());
    setDescriptionChangeReason("");
    setOpen(true);
  };

  const openEdit = (opportunity) => {
    setEditing(opportunity);
    setDescriptionChangeReason("");
    setForm({
      client_id: opportunity.client_id,
      description: opportunity.description,
      estimated_value: opportunity.estimated_value,
      estimated_vab: opportunity.estimated_vab,
      probability: opportunity.probability,
      expected_close_date: (opportunity.expected_close_date || "").slice(0, 10),
      priority: opportunity.priority,
      competitor: opportunity.competitor || "",
      notes: opportunity.notes || "",
      status: opportunity.status,
    });
    setOpen(true);
  };

  const openView = (opportunity) => {
    setViewing(opportunity);
    setViewOpen(true);
  };

  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId || handledOpenId.current === openId) return;
    handledOpenId.current = openId;
    api.get("/opportunities", { params: { page: 1, page_size: 1, search: openId } }).then((response) => {
      const opportunity = (response.data.items || []).find((item) => item.id === openId);
      if (opportunity) openView(opportunity);
      else toast.error("Oportunidade não encontrada.");
      const next = new URLSearchParams(searchParams);
      next.delete("open");
      setSearchParams(next, { replace: true });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, setSearchParams]);

  const openDescriptionEdit = () => {
    if (!viewing) return;
    setDescriptionEditValue(viewing.description || "");
    setDescriptionEditReason("");
    setDescriptionEditOpen(true);
  };

  const saveDescriptionEdit = async () => {
    if (!viewing) return;
    if (descriptionEditValue.trim() === (viewing.description || "").trim()) {
      toast.error("Altere a descrição antes de guardar");
      return;
    }
    if (!descriptionEditReason.trim()) {
      toast.error("Indique a justificação para alterar a descrição");
      return;
    }
    try {
      const response = await api.patch(`/opportunities/${viewing.id}`, {
        description: descriptionEditValue,
        description_change_reason: descriptionEditReason.trim(),
      });
      setViewing(response.data);
      setDescriptionEditOpen(false);
      toast.success("Descrição da oportunidade atualizada");
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const submit = async () => {
    const descriptionChanged = editing && form.description.trim() !== (editing.description || "").trim();
    if (descriptionChanged && !canEditDescription) {
      toast.error("A descrição só pode ser alterada por admin ou comercial");
      return;
    }
    if (descriptionChanged && !descriptionChangeReason.trim()) {
      toast.error("Indique a justificação para alterar a descrição");
      return;
    }
    try {
      const payload = {
        ...form,
        estimated_value: Number(form.estimated_value) || 0,
        estimated_vab: Number(form.estimated_vab) || 0,
        probability: Number(form.probability) || 0,
      };
      if (descriptionChanged) payload.description_change_reason = descriptionChangeReason.trim();
      if (editing) {
        await api.patch(`/opportunities/${editing.id}`, payload);
        toast.success("Oportunidade atualizada");
      } else {
        await api.post("/opportunities", { ...payload, owner_id: "" });
        toast.success("Oportunidade criada");
      }
      setOpen(false);
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const confirmConvert = async () => {
    if (!convertOpen) return;
    try {
      await api.post(`/opportunities/${convertOpen}/convert`);
      toast.success("Proposta criada a partir da oportunidade");
      setConvertOpen(null);
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const createNewProposal = async () => {
    if (!viewing || !replacementReason.trim()) {
      toast.error("Indique o motivo da substituição");
      return;
    }
    try {
      const response = await api.post(`/opportunities/${viewing.id}/proposals`, { replacement_reason: replacementReason.trim() });
      toast.success("Nova proposta criada; a anterior foi substituída");
      setNewProposalOpen(false);
      setViewOpen(false);
      setReplacementReason("");
      load();
      navigate(`/propostas/${response.data.id}`);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const markLost = async () => {
    if (!lostReason.trim()) {
      toast.error("Indique o motivo");
      return;
    }
    try {
      await api.patch(`/opportunities/${lostOpen}`, { status: "perdida", lost_reason: lostReason });
      toast.success("Oportunidade marcada como perdida");
      setLostOpen(null);
      setLostReason("");
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const toggleSort = (key) => {
    setSort((current) => (
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "value" ? "desc" : "asc" }
    ));
  };

  const visibleOpps = useMemo(() => {
    const search = filters.search.trim().toLowerCase();

    const filtered = opps.filter((opportunity) => {
      const matchesSearch = !search || [
        clientName(opportunity.client_id),
        opportunity.description || "",
        OPP_STATUS[opportunity.status] || "",
      ].some((value) => String(value).toLowerCase().includes(search));
      const matchesStatus = filters.statuses.length === 0 || filters.statuses.includes(opportunity.status);
      return matchesSearch && matchesStatus;
    });

    return [...filtered].sort((a, b) => {
      let left = "";
      let right = "";

      if (sort.key === "client") {
        left = clientName(a.client_id);
        right = clientName(b.client_id);
      } else if (sort.key === "value") {
        left = Number(a.estimated_value) || 0;
        right = Number(b.estimated_value) || 0;
      } else if (sort.key === "status") {
        left = OPP_STATUS[a.status] || a.status;
        right = OPP_STATUS[b.status] || b.status;
      }

      const result = typeof left === "number"
        ? left - right
        : String(left).localeCompare(String(right), "pt");

      return sort.direction === "asc" ? result : -result;
    });
  }, [clientName, filters.search, filters.statuses, opps, sort]);

  const convertOpp = useMemo(
    () => opps.find((opportunity) => opportunity.id === convertOpen) || null,
    [convertOpen, opps],
  );

  return (
    <div>
      <PageHeader
        kicker="Fase 2"
        title="Oportunidades"
        actions={<><ListFilterSettings filters={filters} statusOptions={Object.entries(OPP_STATUS).map(([value, label]) => ({ value, label }))} onSave={saveFilters} onClear={clearSavedFilters} /><Button onClick={openCreate} data-testid="new-opp-btn" className="rounded-none bg-[#002FA7] text-white hover:bg-[#002277]"><Plus size={16} className="mr-1" /> Nova oportunidade</Button></>}
      />
      <div className="p-8">
        <div className="border border-neutral-200">
          <div className="flex flex-wrap items-end gap-3 border-b border-neutral-200 bg-neutral-50 px-4 py-3">
            <div className="min-w-[260px] flex-1">
              <Label className="text-[10px] uppercase tracking-widest text-neutral-500">Pesquisar</Label>
              <Input
                value={filters.search}
                onChange={(e) => setFilters((current) => ({ ...current, search: e.target.value }))}
                placeholder="Cliente ou descricao"
                className="mt-1 rounded-none"
              />
            </div>
            <div className="w-[220px]">
              <Label className="text-[10px] uppercase tracking-widest text-neutral-500">Estado</Label>
              <div className="mt-1"><StatusMultiSelect options={Object.entries(OPP_STATUS).map(([value, label]) => ({ value, label }))} value={filters.statuses} onChange={(statuses) => setFilters((current) => ({ ...current, statuses }))} testId="opportunity-status-filter" /></div>
            </div>
            <Button variant="ghost" onClick={() => setFilters((current) => ({ ...current, search: "", statuses: [] }))} className="rounded-none">
              Limpar filtros
            </Button>
          </div>

          <div className="grid grid-cols-12 border-b border-neutral-200 px-4 py-2 text-[10px] uppercase tracking-widest text-neutral-500">
            <div className="col-span-3">
              <SortButton label="Cliente" sortKey="client" sort={sort} onClick={toggleSort} />
            </div>
            <div className="col-span-3">Descricao</div>
            <div className="col-span-2 pr-4 text-right">
              <SortButton label="Valor" sortKey="value" sort={sort} onClick={toggleSort} align="right" />
            </div>
            <div className="col-span-1 text-right">Prob.</div>
            <div className="col-span-2 text-center">
              <SortButton label="Estado" sortKey="status" sort={sort} onClick={toggleSort} align="center" />
            </div>
            <div className="col-span-1 text-right">Acoes</div>
          </div>

          {visibleOpps.length === 0 && <div className="p-6 text-sm text-neutral-500" data-testid="opps-empty">Sem oportunidades para os filtros atuais.</div>}

          {visibleOpps.map((opportunity) => (
            <div key={opportunity.id} className="grid grid-cols-12 items-center border-b border-neutral-100 px-4 py-3 text-sm hover:bg-neutral-50" data-testid={`opp-row-${opportunity.id}`}>
              <div className="col-span-3 font-medium">{clientName(opportunity.client_id)}</div>
              <div className="col-span-3 truncate text-neutral-700">
                {opportunity.description}
              </div>
              <div className="col-span-2 pr-4 text-right font-mono">
                {eur(opportunity.estimated_value)}
                <div className="text-[10px] text-neutral-500">VAB {eur(opportunity.estimated_vab)}</div>
              </div>
              <div className="col-span-1 text-right font-mono">{opportunity.probability}%</div>
              <div className="col-span-2 flex justify-center">
                <Badge className={`${STATUS_STYLE[opportunity.status]} rounded-none font-normal`}>{OPP_STATUS[opportunity.status]}</Badge>
              </div>
              <div className="col-span-1 flex justify-end gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => openView(opportunity)}
                  data-testid={`view-opp-${opportunity.id}`}
                  title="Visualizar oportunidade"
                  aria-label={`Visualizar oportunidade ${opportunity.description}`}
                  className="h-8 w-8 rounded-none p-0 text-neutral-700"
                >
                  <Eye size={14} />
                </Button>
                {opportunity.status !== "convertida" && opportunity.status !== "perdida" && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(opportunity)} data-testid={`edit-opp-${opportunity.id}`} className="rounded-none text-xs">Editar</Button>
                    <Button size="sm" onClick={() => setConvertOpen(opportunity.id)} data-testid={`convert-opp-${opportunity.id}`} className="h-8 rounded-none bg-[#002FA7] text-white hover:bg-[#002277]"><ArrowRight size={12} /></Button>
                    <Button size="sm" variant="ghost" onClick={() => { setLostOpen(opportunity.id); setLostReason(""); }} data-testid={`lose-opp-${opportunity.id}`} className="rounded-none text-xs text-[#FF2A00]">x</Button>
                  </>
                )}
              </div>
            </div>
          ))}
          <Pagination {...pagination} onPageChange={(nextPage) => load(nextPage)} />
        </div>
      </div>

      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-hidden rounded-none">
          <DialogHeader>
            <DialogTitle className="font-display">Visualizar oportunidade</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4 overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>Cliente</Label>
                  <div className="mt-1 border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">{clientName(viewing.client_id)}</div>
                </div>
                <div className="col-span-2">
                  <Label>Descrição</Label>
                  <div className="mt-1 min-h-10 whitespace-pre-wrap border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">{viewing.description || "-"}</div>
                </div>
                <div>
                  <Label>Valor estimado</Label>
                  <div className="mt-1 border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-sm">{eur(viewing.estimated_value)}</div>
                </div>
                <div>
                  <Label>VAB estimado</Label>
                  <div className="mt-1 border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-sm">{eur(viewing.estimated_vab)}</div>
                </div>
                <div>
                  <Label>Probabilidade</Label>
                  <div className="mt-1 border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-sm">{viewing.probability}%</div>
                </div>
                <div>
                  <Label>Data prevista de fecho</Label>
                  <div className="mt-1 border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-sm">{dateShort(viewing.expected_close_date)}</div>
                </div>
                <div>
                  <Label>Prioridade</Label>
                  <div className="mt-1 border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">{viewing.priority || "-"}</div>
                </div>
                <div>
                  <Label>Concorrente</Label>
                  <div className="mt-1 border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">{viewing.competitor || "-"}</div>
                </div>
                <div>
                  <Label>Estado</Label>
                  <div className="mt-1"><Badge className={`${STATUS_STYLE[viewing.status]} rounded-none font-normal`}>{OPP_STATUS[viewing.status]}</Badge></div>
                </div>
                <div className="col-span-2">
                  <Label>Notas</Label>
                  <div className="mt-1 min-h-10 whitespace-pre-wrap border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">{viewing.notes || "-"}</div>
                </div>
              </div>
              {viewing.converted_proposal_id && (
                <div className="flex flex-wrap gap-3 border-t border-neutral-200 pt-3 text-xs">
                  {viewing.converted_proposal_id && <Link to={`/propostas/${viewing.converted_proposal_id}`} className="text-[#002FA7] hover:underline">Ver proposta gerada</Link>}
                  <Button size="sm" variant="outline" onClick={() => { setReplacementReason(""); setNewProposalOpen(true); }} className="rounded-none text-xs">Criar nova proposta</Button>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setViewOpen(false)} className="rounded-none">Fechar</Button>
            {viewing && canEditDescription && <Button variant="outline" onClick={openDescriptionEdit} className="rounded-none">Alterar descrição</Button>}
            {viewing && viewing.status !== "convertida" && viewing.status !== "perdida" && (
              <Button onClick={() => { setViewOpen(false); openEdit(viewing); }} className="rounded-none bg-[#002FA7] text-white hover:bg-[#002277]">Editar</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={descriptionEditOpen} onOpenChange={setDescriptionEditOpen}>
        <DialogContent className="max-w-lg rounded-none">
          <DialogHeader><DialogTitle className="font-display">Alterar descrição</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nova descrição</Label>
              <Textarea rows={3} value={descriptionEditValue} onChange={(e) => setDescriptionEditValue(e.target.value)} className="mt-1 rounded-none" data-testid="converted-opp-description-input" />
            </div>
            <div>
              <Label>Justificação da alteração</Label>
              <Textarea rows={3} value={descriptionEditReason} onChange={(e) => setDescriptionEditReason(e.target.value)} placeholder="Indique o motivo desta alteração" className="mt-1 rounded-none" data-testid="converted-opp-description-reason" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDescriptionEditOpen(false)} className="rounded-none">Cancelar</Button>
            <Button onClick={saveDescriptionEdit} className="rounded-none bg-[#002FA7] text-white hover:bg-[#002277]">Guardar descrição</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newProposalOpen} onOpenChange={setNewProposalOpen}>
        <DialogContent className="max-w-lg rounded-none">
          <DialogHeader><DialogTitle className="font-display">Criar nova proposta</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-neutral-600">A descrição será herdada da oportunidade. A proposta atual será marcada como Substituída e a nova ficará ligada à mesma oportunidade.</div>
            <div>
              <Label>Motivo da substituição</Label>
              <Textarea rows={3} value={replacementReason} onChange={(e) => setReplacementReason(e.target.value)} placeholder="Indique por que motivo a proposta anterior será substituída" className="mt-1 rounded-none" data-testid="proposal-replacement-reason" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewProposalOpen(false)} className="rounded-none">Cancelar</Button>
            <Button onClick={createNewProposal} className="rounded-none bg-[#002FA7] text-white hover:bg-[#002277]" data-testid="create-new-proposal-btn">Criar proposta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl rounded-none">
          <DialogHeader><DialogTitle className="font-display">{editing ? "Editar oportunidade" : "Nova oportunidade"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Cliente</Label>
              <SearchableSelect
                value={form.client_id}
                onValueChange={(value) => setForm({ ...form, client_id: value })}
                options={clients.map((client) => ({
                  value: client.id,
                  label: client.name,
                  keywords: `${client.nif || ""} ${client.contact_person || ""}`,
                }))}
                placeholder="Selecionar cliente"
                searchPlaceholder="Pesquisar cliente..."
                emptyText="Sem clientes."
                testId="opp-client-select"
                triggerClassName="h-10"
              />
            </div>
            <div className="col-span-2">
              <Label>Descricao</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} disabled={Boolean(editing) && !canEditDescription} data-testid="opp-description-input" className="rounded-none" />
              {editing && !canEditDescription && <div className="mt-1 text-xs text-neutral-500">A descrição só pode ser alterada por admin ou comercial.</div>}
            </div>
            {editing && canEditDescription && form.description.trim() !== (editing.description || "").trim() && (
              <div className="col-span-2">
                <Label>Justificação da alteração da descrição</Label>
                <Textarea rows={2} value={descriptionChangeReason} onChange={(e) => setDescriptionChangeReason(e.target.value)} placeholder="Indique o motivo desta alteração" data-testid="opp-description-change-reason" className="mt-1 rounded-none" />
              </div>
            )}
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
              <Label>Data prevista de fecho</Label>
              <Input type="date" value={form.expected_close_date} onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })} data-testid="opp-expected-close-date-input" className="rounded-none font-mono" />
            </div>
            <div>
              <Label>Prioridade</Label>
              <Select value={form.priority} onValueChange={(value) => setForm({ ...form, priority: value })}>
                <SelectTrigger className="rounded-none"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Media</SelectItem>
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
              <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value })}>
                <SelectTrigger className="rounded-none" data-testid="opp-status-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aberta">Aberta</SelectItem>
                  <SelectItem value="em_analise">Em analise</SelectItem>
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
            <Button onClick={submit} data-testid="opp-save-btn" className="rounded-none bg-[#002FA7] text-white hover:bg-[#002277]">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!convertOpen} onOpenChange={(nextOpen) => !nextOpen && setConvertOpen(null)}>
        <DialogContent className="max-w-md rounded-none">
          <DialogHeader><DialogTitle className="font-display">Confirmar conversao</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm text-neutral-700">
            <div>Esta oportunidade sera convertida em proposta. Pode cancelar agora caso precise corrigir alguma informacao antes de avancar.</div>
            {convertOpp && (
              <div className="border border-neutral-200 bg-neutral-50 p-3 text-xs">
                <div><span className="uppercase tracking-widest text-neutral-500">Cliente:</span> <span className="text-neutral-900">{clientName(convertOpp.client_id)}</span></div>
                <div className="mt-2"><span className="uppercase tracking-widest text-neutral-500">Descricao:</span> <span className="text-neutral-900">{convertOpp.description || "-"}</span></div>
                <div className="mt-2"><span className="uppercase tracking-widest text-neutral-500">Valor:</span> <span className="font-mono text-neutral-900">{eur(convertOpp.estimated_value)}</span></div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConvertOpen(null)} className="rounded-none">Cancelar</Button>
            <Button onClick={confirmConvert} className="rounded-none bg-[#002FA7] text-white hover:bg-[#002277]">Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!lostOpen} onOpenChange={(nextOpen) => !nextOpen && setLostOpen(null)}>
        <DialogContent className="max-w-md rounded-none">
          <DialogHeader><DialogTitle className="font-display">Marcar como perdida</DialogTitle></DialogHeader>
          <Label>Motivo de perda</Label>
          <Textarea rows={3} value={lostReason} onChange={(e) => setLostReason(e.target.value)} data-testid="opp-lost-reason" className="rounded-none" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLostOpen(null)} className="rounded-none">Cancelar</Button>
            <Button onClick={markLost} className="rounded-none bg-[#FF2A00] text-white hover:bg-[#D62200]" data-testid="opp-lost-confirm">Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
