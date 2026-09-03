import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { api, formatApiErrorDetail } from "@/lib/api";
import { eur, ORDER_STATUS, dateShort } from "@/lib/fmt";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import StatusMultiSelect from "@/components/StatusMultiSelect";
import ListFilterSettings from "@/components/ListFilterSettings";
import { useListFilters } from "@/lib/listPreferences";
import Pagination from "@/components/Pagination";

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

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]);
  const { filters, setFilters, saveFilters, clearSavedFilters } = useListFilters("orders", { search: "", statuses: [], pageSize: 30 });
  const [sort, setSort] = useState({ key: "number", direction: "desc" });
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, page_size: 30 });

  const load = async (page = pagination.page) => {
    const [orderResponse, clientResponse] = await Promise.all([
      api.get("/orders", { params: { page, page_size: filters.pageSize || 30, search: filters.search, status: filters.statuses.join(","), sort_by: sort.key === "value" ? "total_net" : sort.key, sort_dir: sort.direction } }),
      api.get("/clients"),
    ]);
    setOrders(orderResponse.data.items || []);
    setPagination({ page: orderResponse.data.page, pages: orderResponse.data.pages, total: orderResponse.data.total, page_size: orderResponse.data.page_size });
    setClients(clientResponse.data);
  };

  useEffect(() => {
    load(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search, filters.statuses, filters.pageSize, sort]);

  const clientName = useCallback((id) => clients.find((client) => client.id === id)?.name || "-", [clients]);

  const patchOrder = async (id, patch) => {
    try {
      await api.patch(`/orders/${id}`, patch);
      load();
      toast.success("Encomenda atualizada");
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

  const visibleOrders = useMemo(() => {
    const search = filters.search.trim().toLowerCase();

    const filtered = orders.filter((order) => {
      const matchesSearch = !search || [
        order.number || "",
        clientName(order.client_id),
        ORDER_STATUS[order.status] || "",
        order.po_number || "",
      ].some((value) => String(value).toLowerCase().includes(search));
      const matchesStatus = filters.statuses.length === 0 || filters.statuses.includes(order.status);
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
        left = ORDER_STATUS[a.status] || a.status;
        right = ORDER_STATUS[b.status] || b.status;
      }

      const result = typeof left === "number"
        ? left - right
        : String(left).localeCompare(String(right), "pt");

      return sort.direction === "asc" ? result : -result;
    });
  }, [clientName, filters.search, filters.statuses, orders, sort]);

  return (
    <div>
      <PageHeader kicker="Fase 4" title="Encomendas" actions={<ListFilterSettings filters={filters} statusOptions={Object.entries(ORDER_STATUS).map(([value, label]) => ({ value, label }))} onSave={saveFilters} onClear={clearSavedFilters} />} />
      <div className="p-8">
        <div className="wc-list-panel">
          <div className="wc-filter-bar flex flex-wrap items-end gap-3 px-4 py-3">
            <div className="min-w-[260px] flex-1">
              <Label className="text-[10px] uppercase tracking-widest text-neutral-500">Pesquisar</Label>
              <Input
                value={filters.search}
                onChange={(e) => setFilters((current) => ({ ...current, search: e.target.value }))}
                placeholder="Numero, cliente, PO ou estado"
                className="mt-1 rounded-none"
              />
            </div>
            <div className="w-[220px]">
              <Label className="text-[10px] uppercase tracking-widest text-neutral-500">Estado</Label>
              <div className="mt-1"><StatusMultiSelect options={Object.entries(ORDER_STATUS).map(([value, label]) => ({ value, label }))} value={filters.statuses} onChange={(statuses) => setFilters((current) => ({ ...current, statuses }))} testId="order-status-filter" /></div>
            </div>
            <Button variant="ghost" onClick={() => setFilters((current) => ({ ...current, search: "", statuses: [] }))} className="rounded-none">
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
            <div className="col-span-2">PO</div>
            <div className="col-span-1 text-right">
              <SortButton label="Valor" sortKey="value" sort={sort} onClick={toggleSort} align="right" />
            </div>
            <div className="col-span-1 pr-6 text-right">VAB</div>
            <div className="col-span-2 text-center">
              <SortButton label="Estado" sortKey="status" sort={sort} onClick={toggleSort} align="center" />
            </div>
            <div className="col-span-1 text-right">Data</div>
          </div>

          {visibleOrders.length === 0 && <div className="p-6 text-sm text-neutral-500" data-testid="orders-empty">Sem encomendas para os filtros atuais.</div>}

          {visibleOrders.map((order) => (
            <div key={order.id} className={`wc-table-row grid grid-cols-12 items-center border-b px-4 py-3 text-sm ${order.status === "cancelada" ? "bg-[#FFF7F7]" : ""}`} data-testid={`order-row-${order.id}`}>
              <div className="col-span-2 font-mono">
                <Link to={`/encomendas/${order.id}`} className="text-[#002FA7] hover:underline" data-testid={`order-link-${order.id}`}>{order.number}</Link>
              </div>
              <div className="col-span-3 font-medium">{clientName(order.client_id)}</div>
              <div className="col-span-2">
                <Input
                  defaultValue={order.po_number || ""}
                  disabled={order.status === "cancelada"}
                  onBlur={(e) => e.target.value !== order.po_number && patchOrder(order.id, { po_number: e.target.value })}
                  placeholder="PO / Ordem compra"
                  className="h-8 rounded-none text-xs font-mono"
                  data-testid={`po-input-${order.id}`}
                />
              </div>
              <div className="col-span-1 text-right font-mono">{eur(order.total_net)}</div>
              <div className="col-span-1 pr-6 text-right font-mono">{eur(order.total_vab)}</div>
              <div className="col-span-2 flex justify-center">
                {order.status === "cancelada" ? (
                  <div className="text-center">
                    <Badge className="rounded-none bg-[#FEE2E2] font-normal text-[#B91C1C]">{ORDER_STATUS[order.status]}</Badge>
                    {order.cancel_reason && <div className="mt-1 max-w-[180px] truncate text-[10px] text-[#B91C1C]" title={order.cancel_reason}>{order.cancel_reason}</div>}
                  </div>
                ) : order.status === "fulfilled" ? (
                  <Badge className="rounded-none bg-[#DCFCE7] font-normal text-[#15803D]" data-testid={`order-status-${order.id}`}>
                    {ORDER_STATUS[order.status]}
                  </Badge>
                ) : (
                  <Select value={order.status} onValueChange={(value) => patchOrder(order.id, { status: value })}>
                    <SelectTrigger className="h-8 w-full max-w-[180px] rounded-none text-xs" data-testid={`order-status-${order.id}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(ORDER_STATUS).filter(([key]) => key !== "cancelada").map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="col-span-1 text-right font-mono text-xs text-neutral-500">{dateShort(order.order_date)}</div>
            </div>
          ))}
          <Pagination {...pagination} onPageChange={(nextPage) => load(nextPage)} />
        </div>
      </div>
    </div>
  );
}
