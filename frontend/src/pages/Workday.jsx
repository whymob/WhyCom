import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronRight, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { dateShort, eur, OPP_STATUS, PROP_STATUS } from "@/lib/fmt";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/context/AuthContext";

const SECTION_STYLE = {
  overdue: { icon: AlertTriangle, accent: "border-[#FF2A00]", iconClass: "text-[#FF2A00]" },
  today: { icon: CalendarDays, accent: "border-[#FFC800]", iconClass: "text-[#7C5A00]" },
  upcoming: { icon: CheckCircle2, accent: "border-[#002FA7]", iconClass: "text-[#002FA7]" },
};

function statusLabel(item) {
  return item.kind === "proposal" ? (PROP_STATUS[item.status] || item.status) : (OPP_STATUS[item.status] || item.status);
}

export default function Workday() {
  const { user } = useAuth();
  const [workday, setWorkday] = useState(null);
  const [loading, setLoading] = useState(true);
  const [owners, setOwners] = useState([]);
  const [ownerId, setOwnerId] = useState("");
  const isManager = ["admin", "ceo"].includes(user?.role);

  const load = (selectedOwner = ownerId) => {
    setLoading(true);
    api.get("/workday", { params: selectedOwner ? { owner_id: selectedOwner } : {} }).then((response) => setWorkday(response.data)).finally(() => setLoading(false));
  };

  useEffect(load, []);
  useEffect(() => { if (isManager) api.get("/users").then((response) => setOwners((response.data || []).filter((item) => item.active))); }, [isManager]);

  return (
    <div>
      <PageHeader
        kicker="Execução comercial"
        title="O meu dia"
        actions={<><>{isManager && <select value={ownerId} onChange={(event) => { setOwnerId(event.target.value); load(event.target.value); }} className="h-9 rounded-lg border border-[var(--wc-border)] bg-white px-3 text-xs text-slate-700 outline-none focus:border-[#14E0E0] focus:ring-4 focus:ring-[#14E0E0]/15"><option value="">Toda a equipa</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select>}</><button onClick={() => load()} className="flex items-center gap-2 rounded-lg border border-[#14E0E0] bg-[#14E0E0] px-3 py-2 text-xs font-semibold text-[#14181F] shadow-[0_0_14px_rgba(20,224,224,.22)] hover:bg-[#0B8E8E] hover:text-white"><RefreshCw size={14} /> Atualizar</button></>}
      />
      <div className="space-y-6 p-7">
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            ["Em atraso", workday?.summary?.overdue ?? "-", "Replanear ou concluir primeiro", "overdue"],
            ["Para hoje", workday?.summary?.today ?? "-", "Negociações e propostas com ação hoje", "today"],
            ["Próximos 7 dias", workday?.summary?.upcoming ?? "-", "Prepare os próximos contactos", "upcoming"],
          ].map(([label, value, sub, key]) => {
            const Icon = SECTION_STYLE[key].icon;
            return <div key={key} className="rounded-[14px] border border-[var(--wc-border)] bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400"><span>{label}</span><Icon size={16} className={SECTION_STYLE[key].iconClass} /></div>
              <div className="mt-3 font-mono text-3xl font-semibold">{value}</div>
              <div className="mt-1 text-xs text-slate-500">{sub}</div>
            </div>;
          })}
        </section>

        {loading && <div className="py-10 text-center text-sm text-neutral-500">A carregar trabalho comercial…</div>}
        {!loading && workday?.sections?.map((section) => {
          const style = SECTION_STYLE[section.key];
          const Icon = style.icon;
          return (
            <section key={section.key} className="overflow-hidden rounded-[14px] border border-[var(--wc-border)] bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-[var(--wc-border)] px-5 py-4">
                <div className="flex items-center gap-3"><Icon size={16} className={style.iconClass} /><div><div className="text-sm font-medium">{section.label}</div><div className="text-xs text-neutral-500">{section.items.length} ação(ões)</div></div></div>
              </div>
              {section.items.length === 0 ? <div className="px-5 py-6 text-sm text-neutral-500">Sem ações nesta secção.</div> : (
                <div className="divide-y divide-neutral-100">
                  {section.items.map((item) => <Link key={`${item.kind}-${item.id}`} to={item.href} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-[#ECFEFF]">
                    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{item.kind_label}</span><span className="rounded-full border border-[var(--wc-border)] bg-[var(--wc-surface-2)] px-2 py-0.5 text-[10px] text-slate-600">{statusLabel(item)}</span></div><div className="mt-1 truncate text-sm font-medium">{item.title}</div><div className="mt-1 truncate text-xs text-slate-500">{item.client}{item.description ? ` · ${item.description}` : ""}</div></div>
                    <div className="hidden text-right text-xs text-neutral-500 md:block"><div>{dateShort(item.due_date)}</div><div className="mt-1 font-mono text-neutral-800">{eur(item.value)}</div></div><ChevronRight size={16} className="text-neutral-400" />
                  </Link>)}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
