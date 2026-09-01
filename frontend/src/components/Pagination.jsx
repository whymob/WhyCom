import React from "react";
import { Button } from "@/components/ui/button";

export default function Pagination({ page, pages, total, pageSize, onPageChange }) {
  if (!total) return null;
  const firstPages = Array.from({ length: Math.min(4, pages) }, (_, index) => index + 1);
  const showCurrent = page > 4 && page < pages;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 px-4 py-3 text-xs text-neutral-500">
      <span>{total} registos · página {page} de {pages}</span>
      <div className="flex flex-wrap items-center gap-1">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="rounded-none">Anterior</Button>
        {firstPages.map((number) => (
          <Button key={number} variant={number === page ? "default" : "outline"} size="sm" onClick={() => onPageChange(number)} className="min-w-8 rounded-none px-2">{number}</Button>
        ))}
        {pages > 4 && page > 5 && <span className="px-1">…</span>}
        {showCurrent && !firstPages.includes(page) && <Button variant="default" size="sm" className="min-w-8 rounded-none px-2">{page}</Button>}
        {pages > 5 && page < pages - 1 && <span className="px-1">…</span>}
        {pages > 4 && <Button variant={page === pages ? "default" : "outline"} size="sm" onClick={() => onPageChange(pages)} className="min-w-8 rounded-none px-2">{pages}</Button>}
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPageChange(page + 1)} className="rounded-none">Seguinte</Button>
      </div>
    </div>
  );
}
