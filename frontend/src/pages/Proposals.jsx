import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpDown } from "lucide-react";
import { api, formatApiErrorDetail } from "@/lib/api";
import { eur, PROP_STATUS, dateShort } from "@/lib/fmt";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const STATUS_STYLE = {
  em_elaboracao: "bg-neutral-100 text-neutral-800",
  enviada: "bg-[#E0E7FF] text-[#002FA7]",
  em_negociacao: "bg-[#FEF08A] text-[#854D0E]",
  ganha: "bg-[#DCFCE7] text-[#00A859]",
  perdida: "bg-[#FEE2E2] text-[#B91C1C]",
  expirada: "bg-neutral-200 text-neutral-600",
};

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

export default function Proposals() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [props, setProps] = useState([]);
  const [clients, setClients] = useState([]);
  const [convertOpen, setConvertOpen] = useState(null);
  const [filters, setFilters] = useState({
    search: searchParams.get("search") || "",
    status: searchParams.get("status_scope") === "in_progress" ? "__in_progress__" : (searchParams.get("status") || "__all__"),
  });
  const [sort, setSort] = useState({ key: "number", direction: "desc" });

  const load = async () => {
    const [proposalResponse, clientResponse] = await Promise.all([api.get("/proposals"), api.get("/clients")]);
    setProps(proposalResponse.data);
    setClients(clientResponse.data);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const next = new URLSearchParams();
    if (filters.search) next.set("search", filters.search);
    if (filters.status === "__in_progress__") next.set("status_scope", "in_progress");
    else if (filters.status !== "__all__") next.set("status", filters.status);
    setSearchParams(next, { replace: true });
  }, [filters, setSearchParams]);

  const clientName = useCallback((id) => clients.find((client) => client.id === id)?.name || "-", [clients]);

  const confirmConvert = async () => {
    if (!convertOpen) return;
    try {
      await api.post(`/proposals/${convertOpen}/convert`);
      toast.success("Encomenda criada");
      setConvertOpen(null);
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const toggleSort = (key) => {
    setSort((current) => (
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "number" || key === "value" ? "desc" : "asc" }
    ));
  };

  const visibleProps = useMemo(() => {
    const search = filters.search.trim().toLowerCase();

    const filtered = props.filter((proposal) => {
      const matchesSearch = !search || [
        proposal.number || "",
        clientName(proposal.client_id),
        PROP_STATUS[proposal.status] || "",
      ].some((value) => String(value).toLowerCase().includes(search));
      const matchesStatus = filters.status === "__all__"
        || (filters.status === "__in_progress__" && ["enviada", "em_negociacao"].includes(proposal.status))
        || proposal.status === filters.status;
      return matchesSearch && matchesStatus;
    });

    return [...filtered].sort((a, b) => {
      let left = "";
      let right = "";

      if (sort.key === "number") {
        left = a.number || "";
        right = b.number || "";
      } else if (sort.key === "client") {
        left = clientName(a.client_id);
        right = clientName(b.client_id);
      } else if (sort.key === "value") {
        left = Number(a.total_net) || 0;
        right = Number(b.total_net) || 0;
      } else if (sort.key === "status") {
        left = PROP_STATUS[a.status] || a.status;
        right = PROP_STATUS[b.status] || b.status;
      }

      const result = typeof left === "number"
        ? left - right
        : String(left).localeCompare(String(right), "pt");

      return sort.direction === "asc" ? result : -result;
    });
  }, [clientName, filters.search, filters.status, props, sort]);

  return (
    <div>
      <PageHeader kicker="Fase 3" title="Propostas" />
      <div className="p-8">
        <div className="border border-neutral-200">
          <div className="flex flex-wrap items-end gap-3 border-b border-neutral-200 bg-neutral-50 px-4 py-3">
            <div className="min-w-[260px] flex-1">
              <Label className="text-[10px] uppercase tracking-widest text-neutral-500">Pesquisar</Label>
              <Input
                value={filters.search}
                onChange={(e) => setFilters((current) => ({ ...current, search: e.target.value }))}
                placeholder="Numero, cliente ou estado"
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
                  <SelectItem value="__in_progress__">Em curso</SelectItem>
                  {Object.entries(PROP_STATUS).map(([key, label]) => (
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
            <div className="col-span-2">
              <SortButton label="Numero" sortKey="number" sort={sort} onClick={toggleSort} />
            </div>
            <div className="col-span-3">
              <SortButton label="Cliente" sortKey="client" sort={sort} onClick={toggleSort} />
            </div>
            <div className="col-span-2 text-right">Total s/ IVA</div>
            <div className="col-span-2 pr-6 text-right">
              <SortButton label="VAB" sortKey="value" sort={sort} onClick={toggleSort} align="right" />
            </div>
            <div className="col-span-2 text-center">
              <SortButton label="Estado" sortKey="status" sort={sort} onClick={toggleSort} align="center" />
            </div>
            <div className="col-span-1 text-right">Acoes</div>
          </div>

          {visibleProps.length === 0 && <div className="p-6 text-sm text-neutral-500" data-testid="props-empty">Sem propostas para os filtros atuais.</div>}

          {visibleProps.map((proposal) => (
            <div key={proposal.id} className="grid grid-cols-12 items-center border-b border-neutral-100 px-4 py-3 text-sm hover:bg-neutral-50" data-testid={`prop-row-${proposal.id}`}>
              <div className="col-span-2">
                <Link to={`/propostas/${proposal.id}`} className="font-mono text-[#002FA7] hover:underline" data-testid={`prop-link-${proposal.id}`}>
                  {proposal.number}
                </Link>
                <div className="text-[10px] text-neutral-500">v{proposal.version} · {dateShort(proposal.created_at)}</div>
              </div>
              <div className="col-span-3 font-medium">{clientName(proposal.client_id)}</div>
              <div className="col-span-2 text-right font-mono">{eur(proposal.total_net)}</div>
              <div className="col-span-2 pr-6 text-right font-mono">{eur(proposal.total_vab)}</div>
              <div className="col-span-2 flex justify-center">
                <Badge className={`${STATUS_STYLE[proposal.status]} rounded-none font-normal`}>{PROP_STATUS[proposal.status]}</Badge>
              </div>
              <div className="col-span-1 flex justify-end">
                {proposal.status === "ganha" && !proposal.converted_order_id && (
                  <Button size="sm" onClick={() => setConvertOpen(proposal.id)} data-testid={`convert-prop-${proposal.id}`} className="h-8 rounded-none bg-[#00A859] text-white hover:bg-[#008C4A]"><ArrowRight size={12} /></Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={!!convertOpen} onOpenChange={(nextOpen) => !nextOpen && setConvertOpen(null)}>
        <DialogContent className="max-w-md rounded-none">
          <DialogHeader><DialogTitle className="font-display">Confirmar conversao</DialogTitle></DialogHeader>
          <div className="text-sm text-neutral-700">
            Esta proposta sera convertida em encomenda. Pode cancelar agora caso precise corrigir alguma informacao antes de avancar.
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConvertOpen(null)} className="rounded-none">Cancelar</Button>
            <Button onClick={confirmConvert} className="rounded-none bg-[#00A859] text-white hover:bg-[#008C4A]">Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
