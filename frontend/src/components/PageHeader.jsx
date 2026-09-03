import React from "react";

export default function PageHeader({ title, kicker, actions }) {
  return (
    <div className="border-b border-[var(--wc-border)] px-7 py-5 flex items-end justify-between gap-4 bg-white">
      <div>
        {kicker && (
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 mb-1" data-testid="page-kicker">
            {kicker}
          </div>
        )}
        <h1 className="font-display font-extrabold text-[26px] tracking-tight text-slate-900" data-testid="page-title">
          {title}
        </h1>
      </div>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  );
}
