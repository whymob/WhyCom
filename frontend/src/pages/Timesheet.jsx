import React, { useEffect, useState } from "react";
import { api, formatApiErrorDetail, API } from "@/lib/api";
import { eur, dateShort } from "@/lib/fmt";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Download } from "lucide-react";

export default function Timesheet() {
  const [data, setData] = useState(null);
  const [allocs, setAllocs] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ allocation_id: "", hours: 0, date: new Date().toISOString().slice(0, 10), billable: true, description: "" });

  const load = async () => {
    const [me, my] = await Promise.all([api.get("/me/time-entries"), api.get("/me/allocations")]);
    setData(me.data); setAllocs(my.data.allocations);
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    try {
      const alloc = allocs.find((a) => a.id === form.allocation_id);
      if (!alloc) { toast.error("Selecione um projeto"); return; }
      await api.post(`/projects/${alloc.project_id}/time-entries`, form);
      toast.success("Horas registadas");
      setForm({ ...form, hours: 0, description: "" }); setOpen(false); load();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const download = async () => {
    const token = localStorage.getItem("whymob_token");
    const res = await fetch(`${API}/exports/timesheet.csv`, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "timesheet.csv"; a.click();
  };

  return (
    <div>
      <PageHeader kicker="Self-service" title="A minha timesheet"
        actions={<div className="flex gap-2">
          <Button variant="ghost" onClick={download} data-testid="download-timesheet-btn" className="rounded-none"><Download size={14} className="mr-1" /> CSV</Button>
          <Button onClick={() => setOpen(true)} data-testid="ts-add-btn" disabled={allocs.length === 0} className="rounded-none bg-[#00A859] hover:bg-[#008C4A] text-white"><Plus size={14} className="mr-1" /> Registar</Button>
        </div>} />
      <div className="p-8 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-[14px] border border-[var(--wc-border)] bg-white p-4 shadow-sm" data-testid="ts-total-hours"><div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Total horas</div><div className="mt-2 font-mono text-2xl">{data?.total_hours ?? 0}h</div></div>
          <div className="rounded-[14px] border border-[var(--wc-border)] bg-white p-4 shadow-sm" data-testid="ts-billable-hours"><div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Horas faturáveis</div><div className="mt-2 font-mono text-2xl text-[#00A859]">{data?.total_billable ?? 0}h</div></div>
          <div className="rounded-[14px] border border-[var(--wc-border)] bg-white p-4 shadow-sm" data-testid="ts-allocations"><div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Projetos alocados</div><div className="mt-2 font-mono text-2xl">{allocs.length}</div></div>
        </div>

        <div className="wc-list-panel">
          <div className="wc-table-head grid grid-cols-12 text-[10px] uppercase tracking-widest border-b border-[var(--wc-border)] px-4 py-2">
            <div className="col-span-2">Data</div><div className="col-span-4">Projeto</div>
            <div className="col-span-4">Descrição</div><div className="col-span-1 text-right">Horas</div><div className="col-span-1 text-center">Faturável</div>
          </div>
          {(data?.entries || []).length === 0 && <div className="p-4 text-sm text-neutral-500" data-testid="ts-empty">Sem registos.</div>}
          {(data?.entries || []).map((e) => (
            <div key={e.id} className="wc-table-row grid grid-cols-12 items-center px-4 py-2 border-b text-sm">
              <div className="col-span-2 font-mono text-xs">{dateShort(e.date)}</div>
              <div className="col-span-4 text-xs">{e.project_name}</div>
              <div className="col-span-4 text-xs text-neutral-600 truncate">{e.description || "—"}</div>
              <div className="col-span-1 text-right font-mono">{e.hours}h</div>
              <div className="col-span-1 text-center text-xs">{e.billable ? "✓" : "—"}</div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md rounded-none">
          <DialogHeader><DialogTitle className="font-display">Registar horas</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Projeto</Label>
              <Select value={form.allocation_id} onValueChange={(v) => setForm({ ...form, allocation_id: v })}>
                <SelectTrigger className="rounded-none" data-testid="ts-project-select"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>{allocs.map((a) => <SelectItem key={a.id} value={a.id}>{a.project_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Data</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="rounded-none font-mono" /></div>
              <div><Label>Horas</Label><Input type="number" step="0.25" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} className="rounded-none font-mono" data-testid="ts-hours-input" /></div>
            </div>
            <div><Label>Descrição</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-none" /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.billable} onChange={(e) => setForm({ ...form, billable: e.target.checked })} /> Faturável</label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} className="rounded-none">Cancelar</Button>
            <Button onClick={submit} data-testid="ts-save-btn" className="rounded-none bg-[#00A859] hover:bg-[#008C4A] text-white">Registar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
