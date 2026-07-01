import React, { useEffect, useState } from "react";
import { api, formatApiErrorDetail } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/fmt";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Plus } from "lucide-react";

const ROLES = ["admin", "ceo", "diretor_tecnico", "comercial", "developer"];

export default function Users() {
  const { user: me } = useAuth();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", name: "", role: "comercial" });

  const load = async () => setItems((await api.get("/users")).data);
  useEffect(() => { load(); }, []);

  const submit = async () => {
    try {
      await api.post("/users", form);
      toast.success("Utilizador criado");
      setOpen(false); load();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const isAdmin = me?.role === "admin";

  return (
    <div>
      <PageHeader kicker="Master Data" title="Utilizadores"
        actions={isAdmin && <Button onClick={() => { setForm({ email: "", password: "", name: "", role: "comercial" }); setOpen(true); }} data-testid="new-user-btn" className="rounded-none bg-[#002FA7] hover:bg-[#002277] text-white"><Plus size={16} className="mr-1" /> Novo utilizador</Button>} />
      <div className="p-8">
        {!isAdmin && <div className="text-sm text-neutral-500 mb-4">Apenas Admin pode criar utilizadores.</div>}
        <div className="border border-neutral-200">
          <div className="grid grid-cols-12 text-[10px] uppercase tracking-widest text-neutral-500 border-b border-neutral-200 px-4 py-2">
            <div className="col-span-4">Nome</div><div className="col-span-4">Email</div><div className="col-span-2">Cargo</div><div className="col-span-2">Estado</div>
          </div>
          {items.map((u) => (
            <div key={u.id} className="grid grid-cols-12 items-center px-4 py-3 border-b border-neutral-100 text-sm">
              <div className="col-span-4 font-medium">{u.name}</div>
              <div className="col-span-4 font-mono text-xs">{u.email}</div>
              <div className="col-span-2 text-xs">{ROLE_LABEL[u.role] || u.role}</div>
              <div className="col-span-2 text-xs">{u.active ? "Ativo" : "Inativo"}</div>
            </div>
          ))}
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md rounded-none">
          <DialogHeader><DialogTitle className="font-display">Novo utilizador</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-none" data-testid="user-name-input" /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded-none" data-testid="user-email-input" /></div>
            <div><Label>Palavra-passe</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="rounded-none" data-testid="user-password-input" /></div>
            <div>
              <Label>Cargo</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger className="rounded-none" data-testid="user-role-select"><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} className="rounded-none">Cancelar</Button>
            <Button onClick={submit} data-testid="user-save-btn" className="rounded-none bg-[#002FA7] hover:bg-[#002277] text-white">Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
