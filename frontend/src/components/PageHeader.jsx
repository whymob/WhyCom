import React from "react";

export default function PageHeader({ title, kicker, actions }) {
  return (
    <div className="border-b border-neutral-200 px-8 py-6 flex items-end justify-between gap-4 bg-white sticky top-0 z-10">
      <div>
        {kicker && (
          <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 mb-1" data-testid="page-kicker">
            {kicker}
          </div>
        )}
        <h1 className="font-display font-black text-3xl tracking-tight" data-testid="page-title">
          {title}
        </h1>
      </div>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  );
}
