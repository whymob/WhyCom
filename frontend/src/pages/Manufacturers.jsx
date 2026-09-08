import React, { useEffect, useMemo, useState } from "react";
import { api, formatApiErrorDetail } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ArrowUpDown, Plus } from "lucide-react";
import { useListFilters } from "@/lib/listPreferences";
import ListFilterSettings from "@/components/ListFilterSettings";
import Pagination from "@/components/Pagination";
import StatusMultiSelect from "@/components/StatusMultiSelect";

const STATES = [{ value: "active", label: "Ativos" }, { value: "inactive", label: "Inativos" }];
function SortButton({ label, sortKey, sort, onClick }) { const active = sort.key === sortKey; const Icon = !active ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown; return <button type="button" onClick={() => onClick(sortKey)} className="flex w-full items-center gap-1"><span>{label}</span><Icon size={12} /></button>; }

export default function Manufacturers() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: "name", direction: "asc" });
  const { filters, setFilters, saveFilters, clearSavedFilters } = useListFilters("manufacturers", { search: "", statuses: [], pageSize: 30 });

  const load = async () => setItems((await api.get("/manufacturers")).data);
  useEffect(() => { load(); }, []);
  useEffect(() => { setPage(1); }, [filters.search, filters.statuses, filters.pageSize, sort]);
  const rows = useMemo(() => { const term = filters.search.trim().toLowerCase(); const matched = items.filter((item) => (!term || [item.name, item.partnership_type].some((value) => String(value || "").toLowerCase().includes(term))) && (!filters.statuses.length || filters.statuses.includes(item.active ? "active" : "inactive"))); return [...matched].sort((a, b) => { const result = String(a[sort.key] || "").localeCompare(String(b[sort.key] || ""), "pt"); return sort.direction === "asc" ? result : -result; }); }, [filters.search, filters.statuses, items, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / filters.pageSize)); const visible = rows.slice((page - 1) * filters.pageSize, page * filters.pageSize);
  const toggleSort = (key) => setSort((current) => current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" });

  const openCreate = () => { setEditing(null); setForm({ name: "", partnership_type: "Revenda", active: true }); setOpen(true); };
  const openEdit = (m) => { setEditing(m); setForm(m); setOpen(true); };

  const submit = async () => {
    try {
      if (editing) await api.patch(`/manufacturers/${editing.id}`, form);
      else await api.post("/manufacturers", form);
      toast.success("Guardado");
      setOpen(false); load();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  return (
    <div>
      <PageHeader kicker="Master Data" title="Fabricantes"
        actions={<div className="flex items-center gap-2"><ListFilterSettings filters={filters} statusOptions={STATES} filterLabel="Estado predefinido" onSave={saveFilters} onClear={clearSavedFilters} /><Button onClick={openCreate} data-testid="new-manuf-btn" className="rounded-none bg-[#002FA7] hover:bg-[#002277] text-white"><Plus size={16} className="mr-1" /> Novo fabricante</Button></div>} />
      <div className="p-8">
        <div className="wc-list-panel">
          <div className="wc-filter-bar flex flex-wrap items-end gap-3 px-4 py-3"><div className="min-w-[260px] flex-1"><Label className="text-[10px] uppercase tracking-widest text-neutral-500">Pesquisar</Label><Input value={filters.search} onChange={(e) => setFilters((current) => ({ ...current, search: e.target.value }))} placeholder="Nome ou tipo de parceria" className="mt-1 rounded-none" /></div><div className="w-[220px]"><Label className="text-[10px] uppercase tracking-widest text-neutral-500">Estado</Label><div className="mt-1"><StatusMultiSelect options={STATES} value={filters.statuses} onChange={(statuses) => setFilters((current) => ({ ...current, statuses }))} testId="manufacturer-status-filter" /></div></div><button type="button" onClick={() => setFilters((current) => ({ ...current, search: "", statuses: [] }))} className="h-9 px-2 text-xs font-medium text-slate-600 hover:text-[var(--wc-cyan-700)]">Limpar filtros</button></div>
          <div className="wc-table-head grid grid-cols-12 text-[10px] uppercase tracking-widest border-b border-[var(--wc-border)] px-4 py-2">
            <div className="col-span-6"><SortButton label="Nome" sortKey="name" sort={sort} onClick={toggleSort} /></div><div className="col-span-4"><SortButton label="Tipo de parceria" sortKey="partnership_type" sort={sort} onClick={toggleSort} /></div><div className="col-span-2 text-right">Ações</div>
          </div>
          {visible.map((m) => (
            <div key={m.id} className="wc-table-row grid grid-cols-12 items-center px-4 py-3 border-b text-sm">
              <div className="col-span-6 font-medium">{m.name}</div>
              <div className="col-span-4 text-xs text-neutral-700">{m.partnership_type}</div>
              <div className="col-span-2 text-right"><Button size="sm" variant="ghost" onClick={() => openEdit(m)} className="rounded-none text-xs">Editar</Button></div>
            </div>
          ))}
          {!visible.length && <div className="px-4 py-8 text-sm text-neutral-500">Sem fabricantes para os critérios atuais.</div>}
          <Pagination page={page} pages={pages} total={rows.length} pageSize={filters.pageSize} onPageChange={setPage} />
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md rounded-none">
          <DialogHeader><DialogTitle className="font-display">{editing ? "Editar" : "Novo"} fabricante</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-none" data-testid="manuf-name-input" /></div>
            <div><Label>Tipo de parceria</Label><Input value={form.partnership_type || ""} onChange={(e) => setForm({ ...form, partnership_type: e.target.value })} className="rounded-none" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} className="rounded-none">Cancelar</Button>
            <Button onClick={submit} data-testid="manuf-save-btn" className="rounded-none bg-[#002FA7] hover:bg-[#002277] text-white">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
