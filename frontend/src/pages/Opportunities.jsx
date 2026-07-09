import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, Plus } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import PageHeader from "@/components/PageHeader";
import { api, formatApiErrorDetail } from "@/lib/api";
import { eur, OPP_STATUS } from "@/lib/fmt";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SearchableSelect from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

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
  const [searchParams, setSearchParams] = useSearchParams();
  const [opps, setOpps] = useState([]);
  const [clients, setClients] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultForm());
  const [lostOpen, setLostOpen] = useState(null);
  const [lostReason, setLostReason] = useState("");
  const [convertOpen, setConvertOpen] = useState(null);
  const [filters, setFilters] = useState({
    search: searchParams.get("search") || "",
    status: searchParams.get("status_scope") === "open" ? "__open__" : (searchParams.get("status") || "__all__"),
  });
  const [sort, setSort] = useState({ key: "value", direction: "desc" });

  const load = async () => {
    const [opportunityResponse, clientResponse] = await Promise.all([api.get("/opportunities"), api.get("/clients")]);
    setOpps(opportunityResponse.data);
    setClients(clientResponse.data);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const next = new URLSearchParams();
    if (filters.search) next.set("search", filters.search);
    if (filters.status === "__open__") next.set("status_scope", "open");
    else if (filters.status !== "__all__") next.set("status", filters.status);
    setSearchParams(next, { replace: true });
  }, [filters, setSearchParams]);

  const clientName = useCallback((id) => clients.find((client) => client.id === id)?.name || "-", [clients]);

  const openCreate = () => {
    setEditing(null);
    setForm(defaultForm());
    setOpen(true);
  };

  const openEdit = (opportunity) => {
    setEditing(opportunity);
    setForm({
      client_id: opportunity.client_id,
      description: opportunity.description,
      estimated_value: opportunity.estimated_value,
      estimated_vab: opportunity.estimated_vab,
      probability: opportunity.probability,
      priority: opportunity.priority,
      competitor: opportunity.competitor || "",
      notes: opportunity.notes || "",
      status: opportunity.status,
    });
    setOpen(true);
  };

  const submit = async () => {
    try {
      const payload = {
        ...form,
        estimated_value: Number(form.estimated_value) || 0,
        estimated_vab: Number(form.estimated_vab) || 0,
        probability: Number(form.probability) || 0,
      };
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
      const matchesStatus = filters.status === "__all__"
        || (filters.status === "__open__" && ["aberta", "em_analise"].includes(opportunity.status))
        || opportunity.status === filters.status;
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
  }, [clientName, filters.search, filters.status, opps, sort]);

  const convertOpp = useMemo(
    () => opps.find((opportunity) => opportunity.id === convertOpen) || null,
    [convertOpen, opps],
  );

  return (
    <div>
      <PageHeader
        kicker="Fase 2"
        title="Oportunidades"
        actions={<Button onClick={openCreate} data-testid="new-opp-btn" className="rounded-none bg-[#002FA7] text-white hover:bg-[#002277]"><Plus size={16} className="mr-1" /> Nova oportunidade</Button>}
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
              <Select value={filters.status} onValueChange={(value) => setFilters((current) => ({ ...current, status: value }))}>
                <SelectTrigger className="mt-1 rounded-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos os estados</SelectItem>
                  <SelectItem value="__open__">Abertas</SelectItem>
                  {Object.entries(OPP_STATUS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="ghost" onClick={() => setFilters({ search: "", status: "__all__" })} className="rounded-none">
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
              <div className="col-span-3 truncate text-neutral-700">{opportunity.description}</div>
              <div className="col-span-2 pr-4 text-right font-mono">
                {eur(opportunity.estimated_value)}
                <div className="text-[10px] text-neutral-500">VAB {eur(opportunity.estimated_vab)}</div>
              </div>
              <div className="col-span-1 text-right font-mono">{opportunity.probability}%</div>
              <div className="col-span-2 flex justify-center">
                <Badge className={`${STATUS_STYLE[opportunity.status]} rounded-none font-normal`}>{OPP_STATUS[opportunity.status]}</Badge>
              </div>
              <div className="col-span-1 flex justify-end gap-1">
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
        </div>
      </div>

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
