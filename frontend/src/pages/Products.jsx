import React, { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Plus } from "lucide-react";
import { toast } from "sonner";

import PageHeader from "@/components/PageHeader";
import { api, formatApiErrorDetail } from "@/lib/api";
import { eur } from "@/lib/fmt";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SearchableSelect from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useListFilters } from "@/lib/listPreferences";
import ListFilterSettings from "@/components/ListFilterSettings";
import Pagination from "@/components/Pagination";
import StatusMultiSelect from "@/components/StatusMultiSelect";

const CATEGORIES = ["setup", "recorrente", "projeto", "horas", "licenciamento", "suporte"];
const UNITS = ["unidade", "mes", "hora", "dia", "projeto"];
const CATEGORY_OPTIONS = CATEGORIES.map((value) => ({ value, label: value }));
function SortButton({ label, sortKey, sort, onClick, align = "left" }) { const active = sort.key === sortKey; const Icon = !active ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown; return <button type="button" onClick={() => onClick(sortKey)} className={`flex w-full items-center gap-1 ${align === "right" ? "justify-end" : ""}`}><span>{label}</span><Icon size={12} /></button>; }

export default function Products() {
  const [items, setItems] = useState([]);
  const [manuf, setManuf] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: "name", direction: "asc" });
  const { filters, setFilters, saveFilters, clearSavedFilters } = useListFilters("products", { search: "", statuses: [], pageSize: 30 });

  const load = async () => {
    const [productResponse, manufacturerResponse] = await Promise.all([api.get("/products"), api.get("/manufacturers")]);
    setItems(productResponse.data);
    setManuf(manufacturerResponse.data);
  };

  useEffect(() => {
    load();
  }, []);
  useEffect(() => { setPage(1); }, [filters.search, filters.statuses, filters.pageSize, sort]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", category: "projeto", unit: "unidade", base_price: 0, base_cost: 0, active: true, manufacturer_id: "" });
    setOpen(true);
  };

  const openEdit = (product) => {
    setEditing(product);
    setForm({ ...product, manufacturer_id: product.manufacturer_id || "" });
    setOpen(true);
  };

  const manufacturerName = (id) => manuf.find((manufacturer) => manufacturer.id === id)?.name || "—";
  const rows = useMemo(() => { const term = filters.search.trim().toLowerCase(); const enriched = items.map((item) => ({ ...item, manufacturer_name: manufacturerName(item.manufacturer_id) })); const matched = enriched.filter((item) => (!term || [item.name, item.category, item.unit, item.manufacturer_name].some((value) => String(value || "").toLowerCase().includes(term))) && (!filters.statuses.length || filters.statuses.includes(item.category))); return [...matched].sort((a, b) => { const left = a[sort.key] ?? ""; const right = b[sort.key] ?? ""; const result = typeof left === "number" ? left - right : String(left).localeCompare(String(right), "pt"); return sort.direction === "asc" ? result : -result; }); }, [filters.search, filters.statuses, items, manuf, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / filters.pageSize)); const visible = rows.slice((page - 1) * filters.pageSize, page * filters.pageSize);
  const toggleSort = (key) => setSort((current) => current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: ["base_price", "base_cost"].includes(key) ? "desc" : "asc" });

  const submit = async () => {
    try {
      const payload = {
        ...form,
        base_price: Number(form.base_price) || 0,
        base_cost: Number(form.base_cost) || 0,
        manufacturer_id: form.manufacturer_id || null,
      };
      if (editing) await api.patch(`/products/${editing.id}`, payload);
      else await api.post("/products", payload);
      toast.success("Guardado");
      setOpen(false);
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  return (
    <div>
      <PageHeader
        kicker="Master Data"
        title="Produtos & Servicos"
        actions={<div className="flex items-center gap-2"><ListFilterSettings filters={filters} statusOptions={CATEGORY_OPTIONS} filterLabel="Categorias predefinidas" onSave={saveFilters} onClear={clearSavedFilters} /><Button onClick={openCreate} data-testid="new-product-btn" className="rounded-none bg-[#002FA7] hover:bg-[#002277] text-white"><Plus size={16} className="mr-1" /> Novo produto</Button></div>}
      />
      <div className="p-8">
        <div className="wc-list-panel">
          <div className="wc-filter-bar flex flex-wrap items-end gap-3 px-4 py-3"><div className="min-w-[260px] flex-1"><Label className="text-[10px] uppercase tracking-widest text-neutral-500">Pesquisar</Label><Input value={filters.search} onChange={(e) => setFilters((current) => ({ ...current, search: e.target.value }))} placeholder="Produto, fabricante ou categoria" className="mt-1 rounded-none" /></div><div className="w-[240px]"><Label className="text-[10px] uppercase tracking-widest text-neutral-500">Categoria</Label><div className="mt-1"><StatusMultiSelect options={CATEGORY_OPTIONS} value={filters.statuses} onChange={(statuses) => setFilters((current) => ({ ...current, statuses }))} testId="product-category-filter" /></div></div><button type="button" onClick={() => setFilters((current) => ({ ...current, search: "", statuses: [] }))} className="h-9 px-2 text-xs font-medium text-slate-600 hover:text-[var(--wc-cyan-700)]">Limpar filtros</button></div>
          <div className="wc-table-head grid grid-cols-12 text-[10px] uppercase tracking-widest border-b border-[var(--wc-border)] px-4 py-2">
            <div className="col-span-3"><SortButton label="Nome" sortKey="name" sort={sort} onClick={toggleSort} /></div><div className="col-span-2"><SortButton label="Fabricante" sortKey="manufacturer_name" sort={sort} onClick={toggleSort} /></div><div className="col-span-2"><SortButton label="Categoria" sortKey="category" sort={sort} onClick={toggleSort} /></div><div className="col-span-1"><SortButton label="Un." sortKey="unit" sort={sort} onClick={toggleSort} /></div><div className="col-span-2 text-right"><SortButton label="Preco base" sortKey="base_price" sort={sort} onClick={toggleSort} align="right" /></div><div className="col-span-1 text-right"><SortButton label="Custo" sortKey="base_cost" sort={sort} onClick={toggleSort} align="right" /></div><div className="col-span-1 text-right">Acoes</div>
          </div>
          {visible.map((product) => (
            <div key={product.id} className="wc-table-row grid grid-cols-12 items-center px-4 py-3 border-b text-sm">
              <div className="col-span-3 font-medium">{product.name}</div>
              <div className="col-span-2 text-xs text-neutral-700" data-testid={`product-manufacturer-${product.id}`}>{manufacturerName(product.manufacturer_id)}</div>
              <div className="col-span-2 text-xs">{product.category}</div>
              <div className="col-span-1 text-xs">{product.unit}</div>
              <div className="col-span-2 text-right font-mono">{eur(product.base_price)}</div>
              <div className="col-span-1 text-right font-mono text-neutral-600">{eur(product.base_cost)}</div>
              <div className="col-span-1 text-right"><Button size="sm" variant="ghost" onClick={() => openEdit(product)} className="rounded-none text-xs">Editar</Button></div>
            </div>
          ))}
          {!visible.length && <div className="px-4 py-8 text-sm text-neutral-500">Sem produtos para os critérios atuais.</div>}
          <Pagination page={page} pages={pages} total={rows.length} pageSize={filters.pageSize} onPageChange={setPage} />
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg rounded-none">
          <DialogHeader><DialogTitle className="font-display">{editing ? "Editar" : "Novo"} produto</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Nome</Label><Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-none" data-testid="product-name-input" /></div>
            <div>
              <Label>Categoria</Label>
              <Select value={form.category} onValueChange={(value) => setForm({ ...form, category: value })}>
                <SelectTrigger className="rounded-none" data-testid="product-category-select"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unidade</Label>
              <Select value={form.unit} onValueChange={(value) => setForm({ ...form, unit: value })}>
                <SelectTrigger className="rounded-none"><SelectValue /></SelectTrigger>
                <SelectContent>{UNITS.map((unit) => <SelectItem key={unit} value={unit}>{unit}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Preco base</Label><Input type="number" value={form.base_price ?? 0} onChange={(e) => setForm({ ...form, base_price: e.target.value })} className="rounded-none font-mono" /></div>
            <div><Label>Custo base</Label><Input type="number" value={form.base_cost ?? 0} onChange={(e) => setForm({ ...form, base_cost: e.target.value })} className="rounded-none font-mono" /></div>
            <div className="col-span-2">
              <Label>Fabricante</Label>
              <SearchableSelect
                value={form.manufacturer_id || "__none__"}
                onValueChange={(value) => setForm({ ...form, manufacturer_id: value === "__none__" ? "" : value })}
                options={[
                  { value: "__none__", label: "— Sem fabricante —" },
                  ...manuf.map((manufacturer) => ({
                    value: manufacturer.id,
                    label: manufacturer.name,
                    keywords: manufacturer.partnership_type || "",
                  })),
                ]}
                placeholder="Sem fabricante"
                searchPlaceholder="Pesquisar fabricante..."
                emptyText="Sem fabricantes."
                testId="product-manufacturer-select"
                triggerClassName="h-10"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} className="rounded-none">Cancelar</Button>
            <Button onClick={submit} data-testid="product-save-btn" className="rounded-none bg-[#002FA7] hover:bg-[#002277] text-white">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
