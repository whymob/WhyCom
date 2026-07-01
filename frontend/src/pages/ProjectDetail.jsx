import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, formatApiErrorDetail } from "@/lib/api";
import { eur, dateShort } from "@/lib/fmt";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ChevronLeft, Plus, Trash2 } from "lucide-react";

function Card({ label, value, sub, testid, tone = "" }) {
  return (
    <div className="border border-neutral-200 p-4" data-testid={testid}>
      <div className="text-[10px] uppercase tracking-widest text-neutral-500">{label}</div>
      <div className={`mt-2 font-mono text-xl ${tone}`}>{value}</div>
      {sub && <div className="text-xs text-neutral-500 mt-1">{sub}</div>}
    </div>
  );
}

export default function ProjectDetail() {
  const { id } = useParams();
  const [summary, setSummary] = useState(null);
  const [allocs, setAllocs] = useState([]);
  const [entries, setEntries] = useState([]);
  const [users, setUsers] = useState([]);
  const [allocOpen, setAllocOpen] = useState(false);
  const [allocForm, setAllocForm] = useState({ user_id: "", hourly_cost: 0, hours_forecast: 0 });
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryForm, setEntryForm] = useState({ allocation_id: "", hours: 0, date: new Date().toISOString().slice(0, 10), billable: true, description: "" });

  const load = async () => {
    const [s, a, e, u] = await Promise.all([
      api.get(`/projects/${id}/summary`),
      api.get(`/projects/${id}/allocations`),
      api.get(`/projects/${id}/time-entries`),
      api.get(`/users`),
    ]);
    setSummary(s.data); setAllocs(a.data); setEntries(e.data); setUsers(u.data);
  };
  useEffect(() => { load(); }, [id]);

  if (!summary) return <div className="p-8 text-sm text-neutral-500">A carregar…</div>;

  const submitAlloc = async () => {
    try {
      if (!allocForm.user_id) { toast.error("Selecione utilizador"); return; }
      await api.post(`/projects/${id}/allocations`, allocForm);
      toast.success("Developer alocado"); setAllocOpen(false);
      setAllocForm({ user_id: "", hourly_cost: 0, hours_forecast: 0 });
      load();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };
  const removeAlloc = async (aid) => {
    try { await api.delete(`/projects/${id}/allocations/${aid}`); toast.success("Alocação removida"); load(); }
    catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };
  const submitEntry = async () => {
    try {
      if (!entryForm.allocation_id) { toast.error("Selecione alocação"); return; }
      await api.post(`/projects/${id}/time-entries`, entryForm);
      toast.success("Horas registadas"); setEntryOpen(false);
      setEntryForm({ ...entryForm, hours: 0, description: "" });
      load();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const vabDeltaTone = summary.vab.delta >= 0 ? "text-[#00A859]" : "text-[#FF2A00]";
  const hoursDeltaTone = summary.hours.delta > 0 ? "text-[#FF2A00]" : "text-[#00A859]";

  return (
    <div>
      <PageHeader
        kicker={`Projeto · Encomenda ${summary.order.number}`}
        title={summary.project.name}
        actions={<Link to="/projetos"><Button variant="ghost" className="rounded-none"><ChevronLeft size={14} className="mr-1" /> Voltar</Button></Link>}
      />
      <div className="p-8 space-y-8">
        {/* Summary */}
        <section>
          <div className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-3">Sumário técnico</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card testid="sum-hours" label="Horas Real / Prev." value={`${summary.hours.actual}h / ${summary.hours.forecast}h`} sub={<span className={hoursDeltaTone}>Δ {summary.hours.delta}h</span>} />
            <Card testid="sum-cost" label="Custo Técnico Real" value={eur(summary.cost.actual)} sub={`Previsto ${eur(summary.cost.forecast)}`} />
            <Card testid="sum-vab-real" label="VAB Real" value={eur(summary.vab.real)} sub={<span className={vabDeltaTone}>Δ vs planeado {eur(summary.vab.delta)}</span>} tone={vabDeltaTone} />
            <Card testid="sum-billable" label="Horas Faturáveis" value={`${summary.hours.billable}h`} sub={`Consumo plano: ${eur(summary.billable.consumo_planeado)} · faturado ${eur(summary.billable.consumo_faturado)}`} />
          </div>
        </section>

        {/* Allocations */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">Alocações de Developers</div>
            <Button size="sm" onClick={() => setAllocOpen(true)} data-testid="add-alloc-btn" className="rounded-none bg-[#002FA7] hover:bg-[#002277] text-white"><Plus size={14} className="mr-1" /> Alocar developer</Button>
          </div>
          <div className="border border-neutral-200">
            <div className="grid grid-cols-12 text-[10px] uppercase tracking-widest text-neutral-500 border-b border-neutral-200 px-4 py-2">
              <div className="col-span-4">Developer</div><div className="col-span-2 text-right">€/hora custo</div>
              <div className="col-span-2 text-right">Horas prev.</div><div className="col-span-2 text-right">Horas real</div><div className="col-span-1 text-right">Custo real</div><div className="col-span-1"></div>
            </div>
            {allocs.length === 0 && <div className="p-4 text-sm text-neutral-500" data-testid="allocs-empty">Sem alocações.</div>}
            {allocs.map((a) => {
              const dev = summary.by_developer.find((d) => d.user_id === a.user_id);
              return (
                <div key={a.id} className="grid grid-cols-12 items-center px-4 py-2.5 border-b border-neutral-100 text-sm" data-testid={`alloc-row-${a.id}`}>
                  <div className="col-span-4 font-medium">{a.user_name}</div>
                  <div className="col-span-2 text-right font-mono">{eur(a.hourly_cost)}</div>
                  <div className="col-span-2 text-right font-mono">{a.hours_forecast}h</div>
                  <div className="col-span-2 text-right font-mono">{dev?.hours || 0}h</div>
                  <div className="col-span-1 text-right font-mono text-xs">{eur(dev?.cost || 0)}</div>
                  <div className="col-span-1 text-right"><Button size="sm" variant="ghost" onClick={() => removeAlloc(a.id)} className="rounded-none text-[#FF2A00] h-7"><Trash2 size={12} /></Button></div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Time entries */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">Registo de Horas</div>
            <Button size="sm" onClick={() => setEntryOpen(true)} data-testid="add-entry-btn" disabled={allocs.length === 0} className="rounded-none bg-[#00A859] hover:bg-[#008C4A] text-white"><Plus size={14} className="mr-1" /> Registar horas</Button>
          </div>
          <div className="border border-neutral-200">
            <div className="grid grid-cols-12 text-[10px] uppercase tracking-widest text-neutral-500 border-b border-neutral-200 px-4 py-2">
              <div className="col-span-2">Data</div><div className="col-span-3">Developer</div>
              <div className="col-span-4">Descrição</div><div className="col-span-1 text-right">Horas</div>
              <div className="col-span-1 text-right">Custo</div><div className="col-span-1 text-center">Faturável</div>
            </div>
            {entries.length === 0 && <div className="p-4 text-sm text-neutral-500" data-testid="entries-empty">Sem registos de horas.</div>}
            {entries.map((e) => (
              <div key={e.id} className="grid grid-cols-12 items-center px-4 py-2 border-b border-neutral-100 text-sm">
                <div className="col-span-2 font-mono text-xs">{dateShort(e.date)}</div>
                <div className="col-span-3 text-xs">{e.user_name}</div>
                <div className="col-span-4 text-xs text-neutral-600 truncate">{e.description || "—"}</div>
                <div className="col-span-1 text-right font-mono">{e.hours}h</div>
                <div className="col-span-1 text-right font-mono text-xs">{eur(e.cost)}</div>
                <div className="col-span-1 text-center text-xs">{e.billable ? "✓" : "—"}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Alloc dialog */}
      <Dialog open={allocOpen} onOpenChange={setAllocOpen}>
        <DialogContent className="max-w-md rounded-none">
          <DialogHeader><DialogTitle className="font-display">Alocar developer</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Utilizador</Label>
              <Select value={allocForm.user_id} onValueChange={(v) => setAllocForm({ ...allocForm, user_id: v })}>
                <SelectTrigger className="rounded-none" data-testid="alloc-user-select"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name} · {u.role}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>€/hora custo</Label><Input type="number" value={allocForm.hourly_cost} onChange={(e) => setAllocForm({ ...allocForm, hourly_cost: e.target.value })} className="rounded-none font-mono" data-testid="alloc-cost-input" /></div>
              <div><Label>Horas previstas</Label><Input type="number" value={allocForm.hours_forecast} onChange={(e) => setAllocForm({ ...allocForm, hours_forecast: e.target.value })} className="rounded-none font-mono" data-testid="alloc-hours-input" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAllocOpen(false)} className="rounded-none">Cancelar</Button>
            <Button onClick={submitAlloc} data-testid="alloc-save-btn" className="rounded-none bg-[#002FA7] hover:bg-[#002277] text-white">Alocar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Entry dialog */}
      <Dialog open={entryOpen} onOpenChange={setEntryOpen}>
        <DialogContent className="max-w-md rounded-none">
          <DialogHeader><DialogTitle className="font-display">Registar horas</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Alocação</Label>
              <Select value={entryForm.allocation_id} onValueChange={(v) => setEntryForm({ ...entryForm, allocation_id: v })}>
                <SelectTrigger className="rounded-none" data-testid="entry-alloc-select"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>{allocs.map((a) => <SelectItem key={a.id} value={a.id}>{a.user_name} · {eur(a.hourly_cost)}/h</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Data</Label><Input type="date" value={entryForm.date} onChange={(e) => setEntryForm({ ...entryForm, date: e.target.value })} className="rounded-none font-mono" /></div>
              <div><Label>Horas</Label><Input type="number" step="0.25" value={entryForm.hours} onChange={(e) => setEntryForm({ ...entryForm, hours: e.target.value })} className="rounded-none font-mono" data-testid="entry-hours-input" /></div>
            </div>
            <div><Label>Descrição</Label><Input value={entryForm.description} onChange={(e) => setEntryForm({ ...entryForm, description: e.target.value })} className="rounded-none" /></div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={entryForm.billable} onChange={(e) => setEntryForm({ ...entryForm, billable: e.target.checked })} data-testid="entry-billable-check" />
              Horas faturáveis
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEntryOpen(false)} className="rounded-none">Cancelar</Button>
            <Button onClick={submitEntry} data-testid="entry-save-btn" className="rounded-none bg-[#00A859] hover:bg-[#008C4A] text-white">Registar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
