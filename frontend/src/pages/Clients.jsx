import React, { useEffect, useState } from "react";
import { api, formatApiErrorDetail } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export default function Clients() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  const load = async () => setItems((await api.get("/clients")).data);
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm({ name: "", nif: "", address: "", contact_email: "", contact_phone: "", contact_person: "", segment: "PME", active: true }); setOpen(true); };
  const openEdit = (c) => { setEditing(c); setForm(c); setOpen(true); };

  const submit = async () => {
    try {
      if (editing) await api.patch(`/clients/${editing.id}`, form);
      else await api.post("/clients", form);
      toast.success("Guardado");
      setOpen(false); load();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  return (
    <div>
      <PageHeader
        kicker="Master Data" title="Clientes"
        actions={<Button onClick={openCreate} data-testid="new-client-btn" className="rounded-none bg-[#002FA7] hover:bg-[#002277] text-white"><Plus size={16} className="mr-1" /> Novo cliente</Button>}
      />
      <div className="p-8">
        <div className="border border-neutral-200">
          <div className="grid grid-cols-12 text-[10px] uppercase tracking-widest text-neutral-500 border-b border-neutral-200 px-4 py-2">
            <div className="col-span-3">Nome</div><div className="col-span-2">NIF</div><div className="col-span-3">Contacto</div><div className="col-span-2">Segmento</div><div className="col-span-2 text-right">Ações</div>
          </div>
          {items.map((c) => (
            <div key={c.id} className="grid grid-cols-12 items-center px-4 py-3 border-b border-neutral-100 text-sm">
              <div className="col-span-3 font-medium">{c.name}</div>
              <div className="col-span-2 font-mono text-xs">{c.nif}</div>
              <div className="col-span-3 text-neutral-700 text-xs">{c.contact_person} · {c.contact_email}</div>
              <div className="col-span-2 text-xs">{c.segment}</div>
              <div className="col-span-2 text-right">
                <Button size="sm" variant="ghost" onClick={() => openEdit(c)} className="rounded-none text-xs" data-testid={`edit-client-${c.id}`}>Editar</Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg rounded-none">
          <DialogHeader><DialogTitle className="font-display">{editing ? "Editar cliente" : "Novo cliente"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Nome</Label><Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-none" data-testid="client-name-input" /></div>
            <div><Label>NIF</Label><Input value={form.nif || ""} onChange={(e) => setForm({ ...form, nif: e.target.value })} className="rounded-none font-mono" data-testid="client-nif-input" /></div>
            <div><Label>Segmento</Label><Input value={form.segment || ""} onChange={(e) => setForm({ ...form, segment: e.target.value })} className="rounded-none" /></div>
            <div className="col-span-2"><Label>Morada</Label><Input value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} className="rounded-none" /></div>
            <div><Label>Pessoa de contacto</Label><Input value={form.contact_person || ""} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} className="rounded-none" /></div>
            <div><Label>Email</Label><Input value={form.contact_email || ""} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} className="rounded-none" /></div>
            <div className="col-span-2"><Label>Telefone</Label><Input value={form.contact_phone || ""} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} className="rounded-none font-mono" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} className="rounded-none">Cancelar</Button>
            <Button onClick={submit} data-testid="client-save-btn" className="rounded-none bg-[#002FA7] hover:bg-[#002277] text-white">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
