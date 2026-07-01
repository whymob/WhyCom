import React, { useEffect, useState } from "react";
import { api, formatApiErrorDetail } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export default function Manufacturers() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  const load = async () => setItems((await api.get("/manufacturers")).data);
  useEffect(() => { load(); }, []);

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
        actions={<Button onClick={openCreate} data-testid="new-manuf-btn" className="rounded-none bg-[#002FA7] hover:bg-[#002277] text-white"><Plus size={16} className="mr-1" /> Novo fabricante</Button>} />
      <div className="p-8">
        <div className="border border-neutral-200">
          <div className="grid grid-cols-12 text-[10px] uppercase tracking-widest text-neutral-500 border-b border-neutral-200 px-4 py-2">
            <div className="col-span-6">Nome</div><div className="col-span-4">Tipo de parceria</div><div className="col-span-2 text-right">Ações</div>
          </div>
          {items.map((m) => (
            <div key={m.id} className="grid grid-cols-12 items-center px-4 py-3 border-b border-neutral-100 text-sm">
              <div className="col-span-6 font-medium">{m.name}</div>
              <div className="col-span-4 text-xs text-neutral-700">{m.partnership_type}</div>
              <div className="col-span-2 text-right"><Button size="sm" variant="ghost" onClick={() => openEdit(m)} className="rounded-none text-xs">Editar</Button></div>
            </div>
          ))}
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
