import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiErrorDetail } from "@/lib/api";
import { eur, dateShort } from "@/lib/fmt";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export default function Projects() {
  const [items, setItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ order_id: "", name: "", hours_forecast: 0, hourly_billable: 0 });

  const load = async () => {
    const [p, o] = await Promise.all([api.get("/projects"), api.get("/orders")]);
    setItems(p.data); setOrders(o.data);
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    try {
      if (!form.order_id) { toast.error("Selecione uma encomenda"); return; }
      await api.post("/projects", form);
      toast.success("Projeto criado");
      setOpen(false); load();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const orderNum = (id) => orders.find((o) => o.id === id)?.number || "—";

  return (
    <div>
      <PageHeader kicker="Fase 4 · Técnico" title="Projetos"
        actions={<Button onClick={() => setOpen(true)} data-testid="new-project-btn" className="rounded-none bg-[#002FA7] hover:bg-[#002277] text-white"><Plus size={16} className="mr-1" /> Novo projeto</Button>} />
      <div className="p-8">
        <div className="border border-neutral-200">
          <div className="grid grid-cols-12 text-[10px] uppercase tracking-widest text-neutral-500 border-b border-neutral-200 px-4 py-2">
            <div className="col-span-4">Nome</div><div className="col-span-2">Encomenda</div>
            <div className="col-span-2 text-right">Horas prev.</div><div className="col-span-2 text-right">€/h faturável</div>
            <div className="col-span-2 text-right">Estado</div>
          </div>
          {items.length === 0 && <div className="p-6 text-sm text-neutral-500" data-testid="projects-empty">Sem projetos. Crie um a partir de uma encomenda existente.</div>}
          {items.map((p) => (
            <div key={p.id} className="grid grid-cols-12 items-center px-4 py-3 border-b border-neutral-100 text-sm hover:bg-neutral-50" data-testid={`project-row-${p.id}`}>
              <div className="col-span-4"><Link to={`/projetos/${p.id}`} className="font-medium text-[#002FA7] hover:underline" data-testid={`project-link-${p.id}`}>{p.name}</Link><div className="text-[10px] text-neutral-500">{dateShort(p.created_at)}</div></div>
              <div className="col-span-2 font-mono text-xs">{orderNum(p.order_id)}</div>
              <div className="col-span-2 text-right font-mono">{p.hours_forecast}h</div>
              <div className="col-span-2 text-right font-mono">{eur(p.hourly_billable)}</div>
              <div className="col-span-2 text-right text-xs">{p.status}</div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md rounded-none">
          <DialogHeader><DialogTitle className="font-display">Novo projeto</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Encomenda</Label>
              <Select value={form.order_id} onValueChange={(v) => setForm({ ...form, order_id: v })}>
                <SelectTrigger className="rounded-none" data-testid="project-order-select"><SelectValue placeholder="Selecionar encomenda" /></SelectTrigger>
                <SelectContent>{orders.map((o) => <SelectItem key={o.id} value={o.id}>{o.number} · {eur(o.total_net)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Nome do projeto</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-none" data-testid="project-name-input" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Horas previstas</Label><Input type="number" value={form.hours_forecast} onChange={(e) => setForm({ ...form, hours_forecast: e.target.value })} className="rounded-none font-mono" /></div>
              <div><Label>€/h faturável</Label><Input type="number" value={form.hourly_billable} onChange={(e) => setForm({ ...form, hourly_billable: e.target.value })} className="rounded-none font-mono" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} className="rounded-none">Cancelar</Button>
            <Button onClick={submit} data-testid="project-save-btn" className="rounded-none bg-[#002FA7] hover:bg-[#002277] text-white">Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
