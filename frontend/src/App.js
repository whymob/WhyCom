import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Workday from "@/pages/Workday";
import Workboard from "@/pages/Workboard";
import Funnel from "@/pages/Funnel";
import Leads from "@/pages/Leads";
import LeadDetail from "@/pages/LeadDetail";
import Opportunities from "@/pages/Opportunities";
import OpportunityDetail from "@/pages/OpportunityDetail";
import Proposals from "@/pages/Proposals";
import ProposalDetail from "@/pages/ProposalDetail";
import Orders from "@/pages/Orders";
import OrderDetail from "@/pages/OrderDetail";
import Reporting from "@/pages/Reporting";
import Projects from "@/pages/Projects";
import ProjectDetail from "@/pages/ProjectDetail";
import Audit from "@/pages/Audit";
import Timesheet from "@/pages/Timesheet";
import Clients from "@/pages/Clients";
import Manufacturers from "@/pages/Manufacturers";
import Products from "@/pages/Products";
import Users from "@/pages/Users";
import Invoices from "@/pages/Invoices";

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
        </BrowserRouter>
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </div>
  );
}

export default App;
