import React from "react";
import { Check, Circle, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { eur, dateShort } from "@/lib/fmt";

function eventDate(value) {
  return value ? dateShort(value) : "Sem data";
}

export default function DocumentTimeline({ events = [] }) {
  const lastCompletedIndex = events.reduce((lastIndex, event, index) => (event.complete ? index : lastIndex), -1);

  return (
    <section className="border border-neutral-200 bg-white" data-testid="document-timeline">
      <div className="border-b border-neutral-200 px-5 py-3">
        <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Percurso do documento</div>
        <div className="mt-1 text-sm text-neutral-600">Origem, evolução comercial e fecho financeiro</div>
      </div>

      <div className="overflow-x-auto px-5 py-5">
        <div className="flex min-w-[760px] items-start">
          {events.map((event, index) => {
            const complete = event.complete;
            const isCurrent = complete && index === lastCompletedIndex;
            const tone = isCurrent
              ? "border-[#00A859] bg-[#00A859] text-white"
              : complete
                ? "border-[#002FA7] bg-[#002FA7] text-white"
                : "border-[#CA8A04] bg-[#FEF3C7] text-[#CA8A04]";
            const isLast = index === events.length - 1;
            return (
              <React.Fragment key={event.key}>
                <div className="w-[145px] shrink-0 text-center">
                  <div className={`mx-auto flex h-8 w-8 items-center justify-center border ${tone}`}>
                    {complete ? <Check size={14} /> : <Circle size={12} />}
                  </div>
                  <div className={`mt-2 text-xs font-medium ${isCurrent ? "text-[#00A859]" : complete ? "text-neutral-900" : "text-[#A16207]"}`}>{event.label}</div>
                  <div className="mt-1 text-[10px] text-neutral-500">{eventDate(event.date)}</div>
                  {event.description && <div className="mt-1 line-clamp-2 text-[10px] text-neutral-500" title={event.description}>{event.description}</div>}
                  {event.value !== undefined && <div className="mt-1 font-mono text-[10px] text-neutral-700">{eur(event.value)}</div>}
                  {event.href && complete && (
                    <Link to={event.href} className="mt-2 inline-flex items-center gap-1 text-[10px] text-[#002FA7] hover:underline">
                      Ver detalhe <ExternalLink size={10} />
                    </Link>
                  )}
                </div>
                {!isLast && <div className={`mt-4 h-px min-w-[34px] flex-1 ${complete && events[index + 1]?.complete ? "bg-[#002FA7]" : "bg-[#E5E7EB]"}`} />}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </section>
  );
}
