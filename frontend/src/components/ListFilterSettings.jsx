import React, { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import StatusMultiSelect from "@/components/StatusMultiSelect";

export default function ListFilterSettings({ filters, statusOptions = [], filterLabel = "Estados predefinidos", onSave, onClear }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filters);

  useEffect(() => setDraft(filters), [filters]);

  const save = async () => {
    try {
      await onSave(draft);
      setOpen(false);
      toast.success("Filtros guardados para este utilizador");
    } catch (error) {
      toast.error("Não foi possível guardar os filtros");
    }
  };

  const clear = async () => {
    try {
      await onClear();
      setOpen(false);
      toast.success("Filtros repostos para todos");
    } catch (error) {
      toast.error("Não foi possível repor os filtros");
    }
  };

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} title="Configurar filtros" aria-label="Configurar filtros" data-testid="list-filter-settings">
        <Settings size={16} />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="font-display">Filtros da listagem</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Pesquisa predefinida</Label>
              <Input className="mt-1" value={draft.search || ""} onChange={(e) => setDraft((current) => ({ ...current, search: e.target.value }))} placeholder="Deixe vazio para listar todos" />
            </div>
            {statusOptions.length > 0 && <div>
              <Label>{filterLabel}</Label>
              <div className="mt-1"><StatusMultiSelect options={statusOptions} value={draft.statuses || []} onChange={(statuses) => setDraft((current) => ({ ...current, statuses }))} /></div>
            </div>}
            <div>
              <Label>Itens por página</Label>
              <select
                value={draft.pageSize || 30}
                onChange={(e) => setDraft((current) => ({ ...current, pageSize: Number(e.target.value) }))}
                className="mt-1 h-10 w-full rounded-lg border border-[var(--wc-border)] bg-white px-3 text-sm outline-none focus:border-[#14E0E0] focus:ring-4 focus:ring-[#14E0E0]/15"
              >
                {[10, 30, 50, 100].map((size) => <option key={size} value={size}>{size} itens</option>)}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={clear}>Listar todos</Button>
            <Button onClick={save}>Guardar filtros</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
