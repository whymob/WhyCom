import React, { useEffect, useState } from "react";
import { api, formatApiErrorDetail } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/fmt";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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

  const changeRole = async (uid, role) => {
    try {
      await api.patch(`/users/${uid}`, { role });
      toast.success("Cargo atualizado");
      load();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const toggleActive = async (u) => {
    const next = !u.active;
    if (!next && !window.confirm(`Inativar ${u.name}? O utilizador deixa de conseguir aceder.`)) return;
    try {
      await api.patch(`/users/${u.id}`, { active: next });
      toast.success(next ? "Utilizador ativado" : "Utilizador inativado");
      load();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const isAdmin = me?.role === "admin";

  return (
    <div>
      <PageHeader kicker="Master Data" title="Utilizadores"
        actions={isAdmin && <Button onClick={() => { setForm({ email: "", password: "", name: "", role: "comercial" }); setOpen(true); }} data-testid="new-user-btn" className="rounded-none bg-[#002FA7] hover:bg-[#002277] text-white"><Plus size={16} className="mr-1" /> Novo utilizador</Button>} />
      <div className="p-8">
        {!isAdmin && <div className="text-sm text-neutral-500 mb-4">Apenas Admin pode criar ou editar utilizadores.</div>}
        <div className="border border-neutral-200">
          <div className="grid grid-cols-12 text-[10px] uppercase tracking-widest text-neutral-500 border-b border-neutral-200 px-4 py-2">
            <div className="col-span-3">Nome</div>
            <div className="col-span-3">Email</div>
            <div className="col-span-3">Cargo</div>
            <div className="col-span-1">Estado</div>
            <div className="col-span-2 text-right">Ações</div>
          </div>
          {items.map((u) => {
            const isSelf = u.id === me?.id;
            return (
              <div key={u.id} className="grid grid-cols-12 items-center px-4 py-3 border-b border-neutral-100 text-sm gap-2" data-testid={`user-row-${u.id}`}>
                <div className="col-span-3 font-medium">
                  {u.name}
                  {isSelf && <span className="ml-2 text-[10px] uppercase tracking-widest text-neutral-400">(você)</span>}
                </div>
                <div className="col-span-3 font-mono text-xs truncate">{u.email}</div>
                <div className="col-span-3">
                  {isAdmin && !isSelf ? (
                    <Select value={u.role} onValueChange={(v) => changeRole(u.id, v)}>
                      <SelectTrigger className="rounded-none h-8 text-xs" data-testid={`user-role-select-${u.id}`}><SelectValue /></SelectTrigger>
                      <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : (
                    <span className="text-xs">{ROLE_LABEL[u.role] || u.role}</span>
                  )}
                </div>
                <div className="col-span-1">
                  <Badge className={`rounded-none font-normal ${u.active ? "bg-[#DCFCE7] text-[#00A859]" : "bg-[#FEE2E2] text-[#B91C1C]"}`} data-testid={`user-status-${u.id}`}>
                    {u.active ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
                <div className="col-span-2 text-right">
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isSelf}
                      onClick={() => toggleActive(u)}
                      data-testid={`user-toggle-${u.id}`}
                      className={`rounded-none text-xs h-7 ${u.active ? "text-[#B91C1C] hover:bg-[#FEE2E2]" : "text-[#00A859] hover:bg-[#DCFCE7]"}`}
                      title={isSelf ? "Não pode inativar o próprio utilizador" : ""}
                    >
                      {u.active ? "Inativar" : "Ativar"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
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
