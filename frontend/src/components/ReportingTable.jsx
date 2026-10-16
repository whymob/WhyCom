import React, { useMemo, useState } from "react";

export default function ReportingTable({ columns, rows, testid, footer, minWidth, sortable = false }) {
  const [sort, setSort] = useState(null);
  const sortedRows = useMemo(() => sort ? [...rows].sort((a, b) => {
    const column = columns.find((item) => item.key === sort.key);
    const left = column?.sortValue ? column.sortValue(a) : a[sort.key];
    const right = column?.sortValue ? column.sortValue(b) : b[sort.key];
    const result = typeof left === "number" && typeof right === "number" ? left - right : String(left ?? "").localeCompare(String(right ?? ""), "pt", { numeric: true, sensitivity: "base" });
    return sort.direction === "asc" ? result : -result;
  }) : rows, [rows, columns, sort]);
  return (
    <div className={`wc-list-panel !overflow-auto ${sortable ? "max-h-[55vh]" : ""}`} data-testid={testid}>
      <div style={{ minWidth }}>
      <div className="wc-table-head sticky top-0 z-10 grid gap-3 border-b border-[var(--wc-border)] px-4 py-2 text-[10px] uppercase tracking-widest" style={{ gridTemplateColumns: columns.map((column) => column.w || "1fr").join(" ") }}>
        {columns.map((column) => <div key={column.key} role="columnheader" aria-sort={sort?.key === column.key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"} className={column.align === "right" ? "text-right" : ""}>
          {sortable ? <button type="button" className={`flex w-full items-center gap-1 ${column.align === "right" ? "justify-end" : ""}`} onClick={() => setSort((current) => ({ key: column.key, direction: current?.key === column.key && current.direction === "asc" ? "desc" : "asc" }))}>
            {column.label}<span aria-hidden="true">{sort?.key === column.key ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}</span>
          </button> : column.label}
        </div>)}
      </div>
      {rows.length === 0 && <div className="p-4 text-sm text-neutral-500">Sem dados.</div>}
      {sortedRows.map((row, index) => (
        <div key={index} className="wc-table-row grid gap-3 border-b px-4 py-2.5 text-sm" style={{ gridTemplateColumns: columns.map((column) => column.w || "1fr").join(" ") }}>
          {columns.map((column) => (
            <div key={column.key} className={`${column.align === "right" ? "text-right font-mono" : ""} ${column.mono ? "font-mono" : ""} ${column.wrap ? "min-w-0 break-words leading-5" : ""} ${column.noWrap ? "whitespace-nowrap" : ""}`}>
              {column.render ? column.render(row) : row[column.key]}
            </div>
          ))}
        </div>
      ))}
      {footer && (
        <div className="grid gap-3 bg-neutral-50 px-4 py-2.5 text-sm font-medium" style={{ gridTemplateColumns: columns.map((column) => column.w || "1fr").join(" ") }}>
          {columns.map((column) => (
            <div key={column.key} className={`${column.align === "right" ? "text-right font-mono" : ""} ${column.mono ? "font-mono" : ""}`}>
              {column.render ? column.render(footer) : footer[column.key] || ""}
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}

