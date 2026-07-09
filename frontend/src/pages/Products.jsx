import React, { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import PageHeader from "@/components/PageHeader";
import { api, formatApiErrorDetail } from "@/lib/api";
import { eur } from "@/lib/fmt";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SearchableSelect from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CATEGORIES = ["setup", "recorrente", "projeto", "horas", "licenciamento", "suporte"];
const UNITS = ["unidade", "mes", "hora", "dia", "projeto"];

export default function Products() {
  const [items, setItems] = useState([]);
  const [manuf, setManuf] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  const load = async () => {
    const [productResponse, manufacturerResponse] = await Promise.all([api.get("/products"), api.get("/manufacturers")]);
    setItems(productResponse.data);
    setManuf(manufacturerResponse.data);
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", category: "projeto", unit: "unidade", base_price: 0, base_cost: 0, active: true, manufacturer_id: "" });
    setOpen(true);
  };

  const openEdit = (product) => {
    setEditing(product);
    setForm({ ...product, manufacturer_id: product.manufacturer_id || "" });
    setOpen(true);
  };

  const manufacturerName = (id) => manuf.find((manufacturer) => manufacturer.id === id)?.name || "—";

  const submit = async () => {
    try {
      const payload = {
        ...form,
        base_price: Number(form.base_price) || 0,
        base_cost: Number(form.base_cost) || 0,
        manufacturer_id: form.manufacturer_id || null,
      };
      if (editing) await api.patch(`/products/${editing.id}`, payload);
      else await api.post("/products", payload);
      toast.success("Guardado");
      setOpen(false);
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  return (
    <div>
      <PageHeader
        kicker="Master Data"
        title="Produtos & Servicos"
        actions={<Button onClick={openCreate} data-testid="new-product-btn" className="rounded-none bg-[#002FA7] hover:bg-[#002277] text-white"><Plus size={16} className="mr-1" /> Novo produto</Button>}
      />
      <div className="p-8">
        <div className="border border-neutral-200">
          <div className="grid grid-cols-12 text-[10px] uppercase tracking-widest text-neutral-500 border-b border-neutral-200 px-4 py-2">
            <div className="col-span-3">Nome</div><div className="col-span-2">Fabricante</div><div className="col-span-2">Categoria</div><div className="col-span-1">Un.</div><div className="col-span-2 text-right">Preco base</div><div className="col-span-1 text-right">Custo</div><div className="col-span-1 text-right">Acoes</div>
          </div>
          {items.map((product) => (
            <div key={product.id} className="grid grid-cols-12 items-center px-4 py-3 border-b border-neutral-100 text-sm">
              <div className="col-span-3 font-medium">{product.name}</div>
              <div className="col-span-2 text-xs text-neutral-700" data-testid={`product-manufacturer-${product.id}`}>{manufacturerName(product.manufacturer_id)}</div>
              <div className="col-span-2 text-xs">{product.category}</div>
              <div className="col-span-1 text-xs">{product.unit}</div>
              <div className="col-span-2 text-right font-mono">{eur(product.base_price)}</div>
              <div className="col-span-1 text-right font-mono text-neutral-600">{eur(product.base_cost)}</div>
              <div className="col-span-1 text-right"><Button size="sm" variant="ghost" onClick={() => openEdit(product)} className="rounded-none text-xs">Editar</Button></div>
            </div>
          ))}
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg rounded-none">
          <DialogHeader><DialogTitle className="font-display">{editing ? "Editar" : "Novo"} produto</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Nome</Label><Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-none" data-testid="product-name-input" /></div>
            <div>
              <Label>Categoria</Label>
              <Select value={form.category} onValueChange={(value) => setForm({ ...form, category: value })}>
                <SelectTrigger className="rounded-none" data-testid="product-category-select"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unidade</Label>
              <Select value={form.unit} onValueChange={(value) => setForm({ ...form, unit: value })}>
                <SelectTrigger className="rounded-none"><SelectValue /></SelectTrigger>
                <SelectContent>{UNITS.map((unit) => <SelectItem key={unit} value={unit}>{unit}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Preco base</Label><Input type="number" value={form.base_price ?? 0} onChange={(e) => setForm({ ...form, base_price: e.target.value })} className="rounded-none font-mono" /></div>
            <div><Label>Custo base</Label><Input type="number" value={form.base_cost ?? 0} onChange={(e) => setForm({ ...form, base_cost: e.target.value })} className="rounded-none font-mono" /></div>
            <div className="col-span-2">
              <Label>Fabricante</Label>
              <SearchableSelect
                value={form.manufacturer_id || "__none__"}
                onValueChange={(value) => setForm({ ...form, manufacturer_id: value === "__none__" ? "" : value })}
                options={[
                  { value: "__none__", label: "— Sem fabricante —" },
                  ...manuf.map((manufacturer) => ({
                    value: manufacturer.id,
                    label: manufacturer.name,
                    keywords: manufacturer.partnership_type || "",
                  })),
                ]}
                placeholder="Sem fabricante"
                searchPlaceholder="Pesquisar fabricante..."
                emptyText="Sem fabricantes."
                testId="product-manufacturer-select"
                triggerClassName="h-10"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} className="rounded-none">Cancelar</Button>
            <Button onClick={submit} data-testid="product-save-btn" className="rounded-none bg-[#002FA7] hover:bg-[#002277] text-white">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
