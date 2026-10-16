import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export default function ClientMultiSelect({ options, value, onChange, disabled }) {
  const [search, setSearch] = useState("");
  const visible = options.filter((option) => option.name.toLocaleLowerCase("pt").includes(search.trim().toLocaleLowerCase("pt")));
  const label = !value.length ? "Todos os clientes" : value.length === 1 ? options.find((option) => option.id === value[0])?.name : `${value.length} clientes selecionados`;
  return <Popover>
    <PopoverTrigger asChild><Button type="button" variant="outline" disabled={disabled} className="w-full justify-between font-normal" data-testid="annual-billing-clients"><span className="truncate">{label}</span><ChevronDown className="ml-2 h-4 w-4 shrink-0" /></Button></PopoverTrigger>
    <PopoverContent align="start" className="w-80 max-w-[calc(100vw-3rem)] p-2">
      <Input aria-label="Pesquisar clientes com faturação" placeholder="Pesquisar cliente…" value={search} onChange={(event) => setSearch(event.target.value)} />
      <button type="button" onClick={() => onChange([])} className="my-1 w-full rounded px-2 py-2 text-left text-sm hover:bg-slate-100">Todos os clientes</button>
      <div className="max-h-56 overflow-y-auto">
        {visible.map((option) => <label key={option.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm hover:bg-slate-100"><input type="checkbox" checked={value.includes(option.id)} onChange={() => onChange(value.includes(option.id) ? value.filter((id) => id !== option.id) : [...value, option.id])} /><span>{option.name}</span></label>)}
        {!visible.length && <p className="p-2 text-sm text-neutral-500">Sem clientes encontrados.</p>}
      </div>
    </PopoverContent>
  </Popover>;
}
