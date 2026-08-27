import React from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export default function StatusMultiSelect({ options, value, onChange, testId }) {
  const selected = value || [];
  const label = selected.length === 0
    ? "Todos os estados"
    : selected.length === 1
      ? options.find((option) => option.value === selected[0])?.label || selected[0]
      : `${selected.length} estados selecionados`;

  const toggle = (status) => {
    onChange(selected.includes(status) ? selected.filter((item) => item !== status) : [...selected, status]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="h-9 w-full justify-between rounded-none font-normal" data-testid={testId}>
          <span className="truncate">{label}</span><ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 rounded-none p-2">
        <button type="button" onClick={() => onChange([])} className="mb-1 w-full px-2 py-1.5 text-left text-xs text-neutral-500 hover:bg-neutral-100">Todos os estados</button>
        {options.map((option) => (
          <label key={option.value} className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm hover:bg-neutral-100">
            <Checkbox checked={selected.includes(option.value)} onCheckedChange={() => toggle(option.value)} />
            <span>{option.label}</span>
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}
