import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LOGOUT } from "@/constants/testIds";
import { ROLE_LABEL } from "@/lib/fmt";
import {
  LayoutDashboard,
  ListTodo,
  Columns3,
  Filter,
  Sparkles,
  Target,
  FileText,
  Package,
  BarChart3,
  Wrench,
  Clock,
  ShieldCheck,
  Building2,
  Factory,
  Boxes,
  Users as UsersIcon,
  LogOut,
} from "lucide-react";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true, testid: "nav-dashboard" },
  { to: "/meu-dia", label: "O meu dia", icon: ListTodo, testid: "nav-workday" },
  { to: "/funil", label: "Funil de Vendas", icon: Filter, testid: "nav-funnel" },
  { to: "/quadro-comercial", label: "Quadro comercial", icon: Columns3, testid: "nav-workboard" },
  { to: "/leads", label: "Leads", icon: Sparkles, testid: "nav-leads" },
  { to: "/oportunidades", label: "Oportunidades", icon: Target, testid: "nav-opportunities" },
  { to: "/propostas", label: "Propostas", icon: FileText, testid: "nav-proposals" },
  { to: "/encomendas", label: "Encomendas", icon: Package, testid: "nav-orders" },
  { to: "/reporting", label: "Reporting", icon: BarChart3, testid: "nav-reporting" },
  { to: "/projetos", label: "Projetos", icon: Wrench, testid: "nav-projects" },
  { to: "/timesheet", label: "Timesheet", icon: Clock, testid: "nav-timesheet" },
];
const NAV_MD = [
  { to: "/clientes", label: "Clientes", icon: Building2, testid: "nav-clients" },
  { to: "/fabricantes", label: "Fabricantes", icon: Factory, testid: "nav-manufacturers" },
  { to: "/produtos", label: "Produtos", icon: Boxes, testid: "nav-products" },
  { to: "/utilizadores", label: "Utilizadores", icon: UsersIcon, testid: "nav-users" },
  { to: "/auditoria", label: "Auditoria", icon: ShieldCheck, testid: "nav-audit" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  const linkCls = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors border-l-2 ${
      isActive
        ? "border-[#002FA7] bg-[#002FA7]/5 text-[#002FA7] font-medium"
        : "border-transparent text-neutral-700 hover:bg-neutral-50"
    }`;

  return (
    <div className="min-h-screen flex bg-white">
      <aside className="w-64 border-r border-neutral-200 flex flex-col shrink-0">
        <div className="p-5 border-b border-neutral-200">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#002FA7]" aria-hidden />
            <div>
              <div className="font-display font-black text-lg tracking-tight">WhyMob</div>
              <div className="text-[10px] uppercase tracking-widest text-neutral-500">Gestão Comercial</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-3 overflow-y-auto">
          <div className="px-4 pb-1 pt-2 text-[10px] uppercase tracking-widest text-neutral-400">Ciclo Comercial</div>
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={linkCls} data-testid={item.testid}>
              <item.icon size={16} strokeWidth={1.5} /> {item.label}
            </NavLink>
          ))}
          <div className="px-4 pb-1 pt-4 text-[10px] uppercase tracking-widest text-neutral-400">Master Data</div>
          {NAV_MD.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkCls} data-testid={item.testid}>
              <item.icon size={16} strokeWidth={1.5} /> {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-neutral-200 p-4">
          <div className="text-xs text-neutral-500 mb-1">{ROLE_LABEL[user?.role] || user?.role}</div>
          <div className="text-sm font-medium truncate" data-testid="current-user-name">{user?.name}</div>
          <div className="text-xs text-neutral-500 truncate">{user?.email}</div>
          <button
            data-testid={LOGOUT.button}
            onClick={() => { logout(); nav("/login"); }}
            className="mt-3 flex items-center gap-2 text-xs text-neutral-700 hover:text-[#FF2A00]"
          >
            <LogOut size={14} /> Terminar sessão
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
