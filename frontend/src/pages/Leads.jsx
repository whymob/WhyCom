import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, Plus } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import PageHeader from "@/components/PageHeader";
import { api, formatApiErrorDetail } from "@/lib/api";
import { eur, LEAD_STATUS } from "@/lib/fmt";
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

const STATUS_STYLE = {
  nova: "bg-neutral-100 text-neutral-800",
  em_qualificacao: "bg-[#E0E7FF] text-[#002FA7]",
  convertida: "bg-[#DCFCE7] text-[#00A859]",
  descartada: "bg-[#FEE2E2] text-[#B91C1C]",
};

function defaultForm() {
  return { client_id: "", client_name_raw: "", description: "", estimated_value: 0, status: "nova" };
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

export default function Leads() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [leads, setLeads] = useState([]);
  const [clients, setClients] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultForm());
  const [lostOpen, setLostOpen] = useState(null);
  const [lostReason, setLostReason] = useState("");
  const [convertOpen, setConvertOpen] = useState(null);
  const { filters, setFilters, saveFilters, clearSavedFilters } = useListFilters("leads", {
    search: searchParams.get("search") || "",
    statuses: searchParams.get("status_scope") === "open" ? ["nova", "em_qualificacao"] : (searchParams.get("status") || "").split(",").filter(Boolean),
  });
  const [sort, setSort] = useState({ key: "client", direction: "asc" });

  const load = async () => {
    const [leadResponse, clientResponse] = await Promise.all([api.get("/leads"), api.get("/clients")]);
    setLeads(leadResponse.data);
    setClients(clientResponse.data);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const next = new URLSearchParams();
    if (filters.search) next.set("search", filters.search);
    if (filters.statuses.length) next.set("status", filters.statuses.join(","));
    setSearchParams(next, { replace: true });
  }, [filters, setSearchParams]);

  const clientName = useCallback((id) => clients.find((client) => client.id === id)?.name || "-", [clients]);

  const openCreate = () => {
    setEditing(null);
    setForm(defaultForm());
    setOpen(true);
  };

  const openEdit = (lead) => {
    setEditing(lead);
    setForm({
      client_id: lead.client_id || "",
      client_name_raw: lead.client_name_raw || "",
      description: lead.description,
      estimated_value: lead.estimated_value,
      status: lead.status,
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

  const confirmConvert = async () => {
    if (!convertOpen) return;
    try {
      await api.post(`/leads/${convertOpen}/convert`);
      toast.success("Lead convertida em oportunidade");
      setConvertOpen(null);
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

  const toggleSort = (key) => {
    setSort((current) => (
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "value" ? "desc" : "asc" }
    ));
  };

  const visibleLeads = useMemo(() => {
    const search = filters.search.trim().toLowerCase();

    const filtered = leads.filter((lead) => {
      const name = lead.client_id ? clientName(lead.client_id) : (lead.client_name_raw || "");
      const matchesSearch = !search || [
        name,
        lead.description || "",
        LEAD_STATUS[lead.status] || "",
      ].some((value) => String(value).toLowerCase().includes(search));
      const matchesStatus = filters.statuses.length === 0 || filters.statuses.includes(lead.status);
      return matchesSearch && matchesStatus;
    });

    return [...filtered].sort((a, b) => {
      let left = "";
      let right = "";

      if (sort.key === "client") {
        left = a.client_id ? clientName(a.client_id) : (a.client_name_raw || "");
        right = b.client_id ? clientName(b.client_id) : (b.client_name_raw || "");
      } else if (sort.key === "value") {
        left = Number(a.estimated_value) || 0;
        right = Number(b.estimated_value) || 0;
      } else if (sort.key === "status") {
        left = LEAD_STATUS[a.status] || a.status;
        right = LEAD_STATUS[b.status] || b.status;
      }

      const result = typeof left === "number"
        ? left - right
        : String(left).localeCompare(String(right), "pt");

      return sort.direction === "asc" ? result : -result;
    });
  }, [clientName, filters.search, filters.statuses, leads, sort]);

  const convertLead = useMemo(
    () => leads.find((lead) => lead.id === convertOpen) || null,
    [convertOpen, leads],
  );

  return (
    <div>
      <PageHeader
        kicker="Fase 1"
        title="Leads"
        actions={(
          <><ListFilterSettings filters={filters} statusOptions={Object.entries(LEAD_STATUS).map(([value, label]) => ({ value, label }))} onSave={saveFilters} onClear={clearSavedFilters} /><Button data-testid="new-lead-btn" onClick={openCreate} className="rounded-none bg-[#002FA7] text-white hover:bg-[#002277]">
            <Plus size={16} className="mr-1" /> Nova lead
          </Button></>
        )}
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
              <div className="mt-1"><StatusMultiSelect options={Object.entries(LEAD_STATUS).map(([value, label]) => ({ value, label }))} value={filters.statuses} onChange={(statuses) => setFilters((current) => ({ ...current, statuses }))} testId="lead-status-filter" /></div>
            </div>
            <Button variant="ghost" onClick={() => setFilters({ search: "", statuses: [] })} className="rounded-none">
              Limpar filtros
            </Button>
          </div>

          <div className="grid grid-cols-12 text-[10px] uppercase tracking-widest text-neutral-500 border-b border-neutral-200 px-4 py-2">
            <div className="col-span-3">
              <SortButton label="Cliente" sortKey="client" sort={sort} onClick={toggleSort} />
            </div>
            <div className="col-span-4">Descricao</div>
            <div className="col-span-2 pr-4 text-right">
              <SortButton label="Valor estimado" sortKey="value" sort={sort} onClick={toggleSort} align="right" />
            </div>
            <div className="col-span-2 text-center">
              <SortButton label="Estado" sortKey="status" sort={sort} onClick={toggleSort} align="center" />
            </div>
            <div className="col-span-1 text-right">Acoes</div>
          </div>

          {visibleLeads.length === 0 && (
            <div className="p-6 text-sm text-neutral-500" data-testid="leads-empty">Sem leads registadas para os filtros atuais.</div>
          )}

          {visibleLeads.map((lead) => (
            <div key={lead.id} className="grid grid-cols-12 items-center border-b border-neutral-100 px-4 py-3 text-sm hover:bg-neutral-50" data-testid={`lead-row-${lead.id}`}>
              <div className="col-span-3 font-medium">{lead.client_id ? clientName(lead.client_id) : (lead.client_name_raw || "-")}</div>
              <div className="col-span-4 truncate text-neutral-700">{lead.description}</div>
              <div className="col-span-2 pr-4 text-right font-mono">{eur(lead.estimated_value)}</div>
              <div className="col-span-2 flex justify-center">
                <Badge className={`${STATUS_STYLE[lead.status]} rounded-none font-normal`}>{LEAD_STATUS[lead.status]}</Badge>
              </div>
              <div className="col-span-1 flex justify-end gap-1">
                {lead.status !== "convertida" && lead.status !== "descartada" && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(lead)} data-testid={`edit-lead-${lead.id}`} className="rounded-none text-xs">Editar</Button>
                    <Button size="sm" onClick={() => setConvertOpen(lead.id)} data-testid={`convert-lead-${lead.id}`} className="h-8 rounded-none bg-[#002FA7] text-white hover:bg-[#002277]">
                      <ArrowRight size={12} />
                    </Button>
                  </>
                )}
                {lead.status !== "convertida" && lead.status !== "descartada" && (
                  <Button size="sm" variant="ghost" onClick={() => { setLostOpen(lead.id); setLostReason(""); }} data-testid={`discard-lead-${lead.id}`} className="rounded-none text-xs text-[#FF2A00]">x</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg rounded-none">
          <DialogHeader>
            <DialogTitle className="font-display">{editing ? "Editar lead" : "Nova lead"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
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
                testId="lead-client-select"
                triggerClassName="h-10"
              />
              <div className="mt-1 text-xs text-neutral-500">Ou indicar prospect (cliente ainda nao registado):</div>
              <Input
                placeholder="Nome do prospect"
                value={form.client_name_raw}
                onChange={(e) => setForm({ ...form, client_name_raw: e.target.value })}
                className="mt-1 rounded-none"
                data-testid="lead-prospect-input"
              />
            </div>
            <div>
              <Label>Descricao da necessidade</Label>
              <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="lead-description-input" className="rounded-none" />
            </div>
            <div>
              <Label>Valor estimado (EUR)</Label>
              <Input type="number" value={form.estimated_value} onChange={(e) => setForm({ ...form, estimated_value: e.target.value })} data-testid="lead-value-input" className="rounded-none font-mono" />
            </div>
            <div>
              <Label>Estado</Label>
              <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value })}>
                <SelectTrigger className="rounded-none" data-testid="lead-status-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nova">Nova</SelectItem>
                  <SelectItem value="em_qualificacao">Em qualificacao</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} className="rounded-none">Cancelar</Button>
            <Button onClick={submit} data-testid="lead-save-btn" className="rounded-none bg-[#002FA7] text-white hover:bg-[#002277]">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!convertOpen} onOpenChange={(nextOpen) => !nextOpen && setConvertOpen(null)}>
        <DialogContent className="max-w-md rounded-none">
          <DialogHeader>
            <DialogTitle className="font-display">Confirmar conversao</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-neutral-700">
            <div>Esta lead sera convertida em oportunidade. Pode cancelar agora caso precise corrigir alguma informacao antes de avancar.</div>
            {convertLead && (
              <div className="border border-neutral-200 bg-neutral-50 p-3 text-xs">
                <div><span className="uppercase tracking-widest text-neutral-500">Cliente:</span> <span className="text-neutral-900">{convertLead.client_id ? clientName(convertLead.client_id) : (convertLead.client_name_raw || "-")}</span></div>
                <div className="mt-2"><span className="uppercase tracking-widest text-neutral-500">Descricao:</span> <span className="text-neutral-900">{convertLead.description || "-"}</span></div>
                <div className="mt-2"><span className="uppercase tracking-widest text-neutral-500">Valor:</span> <span className="font-mono text-neutral-900">{eur(convertLead.estimated_value)}</span></div>
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
          <DialogHeader><DialogTitle className="font-display">Descartar lead</DialogTitle></DialogHeader>
          <Label>Motivo</Label>
          <Textarea rows={3} value={lostReason} onChange={(e) => setLostReason(e.target.value)} data-testid="lead-discard-reason" className="rounded-none" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLostOpen(null)} className="rounded-none">Cancelar</Button>
            <Button onClick={discard} className="rounded-none bg-[#FF2A00] text-white hover:bg-[#D62200]" data-testid="lead-discard-confirm">Descartar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
