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
        actions={<><>{isManager && <select value={ownerId} onChange={(event) => { setOwnerId(event.target.value); load(event.target.value); }} className="h-9 border border-neutral-300 bg-white px-2 text-xs"><option value="">Toda a equipa</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select>}</><button onClick={() => load()} className="flex items-center gap-2 border border-[#002FA7] px-3 py-2 text-xs text-[#002FA7] hover:bg-[#002FA7] hover:text-white"><RefreshCw size={14} /> Atualizar</button></>}
      />
      <div className="space-y-6 p-8">
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            ["Em atraso", workday?.summary?.overdue ?? "-", "Replanear ou concluir primeiro", "overdue"],
            ["Para hoje", workday?.summary?.today ?? "-", "Negociações e propostas com ação hoje", "today"],
            ["Próximos 7 dias", workday?.summary?.upcoming ?? "-", "Prepare os próximos contactos", "upcoming"],
          ].map(([label, value, sub, key]) => {
            const Icon = SECTION_STYLE[key].icon;
            return <div key={key} className={`border border-neutral-200 border-l-4 ${SECTION_STYLE[key].accent} bg-white p-5`}>
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-neutral-500"><span>{label}</span><Icon size={16} className={SECTION_STYLE[key].iconClass} /></div>
              <div className="mt-3 font-mono text-3xl font-medium">{value}</div>
              <div className="mt-1 text-xs text-neutral-500">{sub}</div>
            </div>;
          })}
        </section>

        {loading && <div className="py-10 text-center text-sm text-neutral-500">A carregar trabalho comercial…</div>}
        {!loading && workday?.sections?.map((section) => {
          const style = SECTION_STYLE[section.key];
          const Icon = style.icon;
          return (
            <section key={section.key} className="border border-neutral-200 bg-white">
              <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
                <div className="flex items-center gap-3"><Icon size={16} className={style.iconClass} /><div><div className="text-sm font-medium">{section.label}</div><div className="text-xs text-neutral-500">{section.items.length} ação(ões)</div></div></div>
              </div>
              {section.items.length === 0 ? <div className="px-5 py-6 text-sm text-neutral-500">Sem ações nesta secção.</div> : (
                <div className="divide-y divide-neutral-100">
                  {section.items.map((item) => <Link key={`${item.kind}-${item.id}`} to={item.href} className="flex items-center gap-4 px-5 py-4 hover:bg-neutral-50">
                    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-[10px] uppercase tracking-widest text-neutral-500">{item.kind_label}</span><span className="border border-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-600">{statusLabel(item)}</span></div><div className="mt-1 truncate text-sm font-medium">{item.title}</div><div className="mt-1 truncate text-xs text-neutral-500">{item.client}{item.description ? ` · ${item.description}` : ""}</div></div>
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
