import "@/App.css";
import React, { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Layout from "@/components/Layout";
const Login = lazy(() => import("@/pages/Login"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Workday = lazy(() => import("@/pages/Workday"));
const Workboard = lazy(() => import("@/pages/Workboard"));
const Funnel = lazy(() => import("@/pages/Funnel"));
const Leads = lazy(() => import("@/pages/Leads"));
const LeadDetail = lazy(() => import("@/pages/LeadDetail"));
const Opportunities = lazy(() => import("@/pages/Opportunities"));
const OpportunityDetail = lazy(() => import("@/pages/OpportunityDetail"));
const Proposals = lazy(() => import("@/pages/Proposals"));
const ProposalDetail = lazy(() => import("@/pages/ProposalDetail"));
const Orders = lazy(() => import("@/pages/Orders"));
const OrderDetail = lazy(() => import("@/pages/OrderDetail"));
const Reporting = lazy(() => import("@/pages/Reporting"));
const Projects = lazy(() => import("@/pages/Projects"));
const ProjectDetail = lazy(() => import("@/pages/ProjectDetail"));
const Audit = lazy(() => import("@/pages/Audit"));
const Timesheet = lazy(() => import("@/pages/Timesheet"));
const Clients = lazy(() => import("@/pages/Clients"));
const Manufacturers = lazy(() => import("@/pages/Manufacturers"));
const Products = lazy(() => import("@/pages/Products"));
const Users = lazy(() => import("@/pages/Users"));
const Invoices = lazy(() => import("@/pages/Invoices"));

function Protected({ children }) {
  const { user } = useAuth();
  if (user === null) return <div className="p-8 text-sm text-neutral-500">A carregar…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<div className="p-8 text-sm text-neutral-500" role="status">A carregar...</div>}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <Protected>
                  <Layout />
                </Protected>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="meu-dia" element={<Workday />} />
              <Route path="quadro-comercial" element={<Workboard />} />
              <Route path="funil" element={<Funnel />} />
              <Route path="leads" element={<Leads />} />
              <Route path="leads/:id" element={<LeadDetail />} />
              <Route path="oportunidades" element={<Opportunities />} />
              <Route path="oportunidades/:id" element={<OpportunityDetail />} />
              <Route path="propostas" element={<Proposals />} />
              <Route path="propostas/:id" element={<ProposalDetail />} />
              <Route path="encomendas" element={<Orders />} />
              <Route path="encomendas/:id" element={<OrderDetail />} />
              <Route path="faturas" element={<Invoices />} />
              <Route path="reporting" element={<Reporting />} />
              <Route path="projetos" element={<Projects />} />
              <Route path="projetos/:id" element={<ProjectDetail />} />
              <Route path="timesheet" element={<Timesheet />} />
              <Route path="auditoria" element={<Audit />} />
              <Route path="clientes" element={<Clients />} />
              <Route path="fabricantes" element={<Manufacturers />} />
              <Route path="produtos" element={<Products />} />
              <Route path="utilizadores" element={<Users />} />
            </Route>
          </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </div>
  );
}

export default App;
