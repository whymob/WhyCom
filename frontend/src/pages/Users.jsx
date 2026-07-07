import React, { useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/context/AuthContext";
import { api, formatApiErrorDetail } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/fmt";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ROLES = ["admin", "ceo", "diretor_tecnico", "comercial", "developer"];
const EMPTY_FORM = { email: "", password: "", name: "", role: "comercial", active: true };

export default function Users() {
  const { user: me } = useAuth();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = async () => setItems((await api.get("/users")).data);

  useEffect(() => {
    load();
  }, []);

  const isAdmin = me?.role === "admin";

  const resetForm = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpen(false);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      email: item.email,
      password: "",
      name: item.name,
      role: item.role,
      active: item.active,
    });
    setOpen(true);
  };

  const submit = async () => {
    try {
      if (editing) {
        const payload = {
          email: form.email,
          name: form.name,
          role: form.role,
          active: form.active,
        };
        if (form.password.trim()) {
          payload.password = form.password;
        }
        await api.patch(`/users/${editing.id}`, payload);
        toast.success("Utilizador atualizado");
      } else {
        await api.post("/users", form);
        toast.success("Utilizador criado");
      }
      resetForm();
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const changeRole = async (uid, role) => {
    try {
      await api.patch(`/users/${uid}`, { role });
      toast.success("Cargo atualizado");
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const toggleActive = async (item) => {
    const next = !item.active;
    if (!next && !window.confirm(`Inativar ${item.name}? O utilizador deixa de conseguir aceder.`)) {
      return;
    }

    try {
      await api.patch(`/users/${item.id}`, { active: next });
      toast.success(next ? "Utilizador ativado" : "Utilizador inativado");
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  return (
    <div>
      <PageHeader
        kicker="Master Data"
        title="Utilizadores"
        actions={
          isAdmin && (
            <Button
              onClick={openCreate}
              data-testid="new-user-btn"
              className="rounded-none bg-[#002FA7] hover:bg-[#002277] text-white"
            >
              <Plus size={16} className="mr-1" /> Novo utilizador
            </Button>
          )
        }
      />

      <div className="p-8">
        {!isAdmin && <div className="mb-4 text-sm text-neutral-500">Apenas Admin pode criar ou editar utilizadores.</div>}

        <div className="border border-neutral-200">
          <div className="grid grid-cols-12 border-b border-neutral-200 px-4 py-2 text-[10px] uppercase tracking-widest text-neutral-500">
            <div className="col-span-3">Nome</div>
            <div className="col-span-3">Email</div>
            <div className="col-span-3">Cargo</div>
            <div className="col-span-1">Estado</div>
            <div className="col-span-2 text-right">Acoes</div>
          </div>

          {items.map((item) => {
            const isSelf = item.id === me?.id;

            return (
              <div key={item.id} className="grid grid-cols-12 items-center gap-2 border-b border-neutral-100 px-4 py-3 text-sm" data-testid={`user-row-${item.id}`}>
                <div className="col-span-3 font-medium">
                  {item.name}
                  {isSelf && <span className="ml-2 text-[10px] uppercase tracking-widest text-neutral-400">(voce)</span>}
                </div>

                <div className="col-span-3 truncate font-mono text-xs">{item.email}</div>

                <div className="col-span-3">
                  {isAdmin && !isSelf ? (
                    <Select value={item.role} onValueChange={(value) => changeRole(item.id, value)}>
                      <SelectTrigger className="h-8 rounded-none text-xs" data-testid={`user-role-select-${item.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((role) => (
                          <SelectItem key={role} value={role}>
                            {ROLE_LABEL[role]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-xs">{ROLE_LABEL[item.role] || item.role}</span>
                  )}
                </div>

                <div className="col-span-1">
                  <Badge className={`rounded-none font-normal ${item.active ? "bg-[#DCFCE7] text-[#00A859]" : "bg-[#FEE2E2] text-[#B91C1C]"}`} data-testid={`user-status-${item.id}`}>
                    {item.active ? "Ativo" : "Inativo"}
                  </Badge>
                </div>

                <div className="col-span-2 text-right">
                  {isAdmin && (
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEdit(item)}
                        data-testid={`user-edit-${item.id}`}
                        className="h-7 rounded-none text-xs"
                      >
                        <Pencil size={14} className="mr-1" /> Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isSelf}
                        onClick={() => toggleActive(item)}
                        data-testid={`user-toggle-${item.id}`}
                        className={`h-7 rounded-none text-xs ${item.active ? "text-[#B91C1C] hover:bg-[#FEE2E2]" : "text-[#00A859] hover:bg-[#DCFCE7]"}`}
                        title={isSelf ? "Nao pode inativar o proprio utilizador" : ""}
                      >
                        {item.active ? "Inativar" : "Ativar"}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={open} onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          resetForm();
          return;
        }
        setOpen(true);
      }}>
        <DialogContent className="max-w-md rounded-none">
          <DialogHeader>
            <DialogTitle className="font-display">{editing ? "Editar utilizador" : "Novo utilizador"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-none" data-testid="user-name-input" />
            </div>

            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded-none" data-testid="user-email-input" />
            </div>

            <div>
              <Label>{editing ? "Nova palavra-passe" : "Palavra-passe"}</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="rounded-none" data-testid="user-password-input" />
              {editing && <div className="mt-1 text-xs text-neutral-500">Deixe em branco para manter a palavra-passe atual.</div>}
            </div>

            <div>
              <Label>Cargo</Label>
              <Select value={form.role} onValueChange={(value) => setForm({ ...form, role: value })} disabled={editing?.id === me?.id}>
                <SelectTrigger className="rounded-none" data-testid="user-role-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {ROLE_LABEL[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editing?.id === me?.id && <div className="mt-1 text-xs text-neutral-500">Nao pode alterar o proprio cargo.</div>}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={resetForm} className="rounded-none">Cancelar</Button>
            <Button onClick={submit} data-testid="user-save-btn" className="rounded-none bg-[#002FA7] hover:bg-[#002277] text-white">
              {editing ? "Guardar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
