# WhyMob CRM — PRD

## Original Problem Statement
App de Gestão Comercial WhyMob — aplicação web multiutilizador em Português (PT-PT) para gestão do ciclo comercial completo: Lead → Oportunidade → Proposta → Encomenda → Plano de Faturação → Fatura → Recebimento. Foco em rastreabilidade, VAB (Valor Acrescentado Bruto) em paralelo com valor de venda, IVA por linha, moeda EUR, controlo de acessos por perfil (Admin/CEO/Diretor Técnico/Comercial/Developer), auditoria e dashboards.

## User Choices (Fase 1)
- Âmbito MVP: **MVP Comercial** (Clientes, Fabricantes, Produtos, Utilizadores, Leads, Oportunidades, Propostas, Encomendas + Funil)
- Autenticação: **JWT custom** (email/password + role)
- Idioma: **PT-PT**
- Dados: **Seed data** para demo end-to-end
- Design: **Design agent** (Swiss high-contrast, Cabinet Grotesk + IBM Plex)

## Personas
- **Admin** — gestão global, utilizadores, master data
- **CEO** — visão global, dashboards
- **Diretor Técnico** — validação técnica, VAB
- **Comercial** — leads, oportunidades, propostas
- **Developer** — consulta limitada (fase posterior)

## Architecture
- **Backend**: FastAPI + Motor (MongoDB), JWT (PyJWT + bcrypt), UUID string IDs, ISO datetime storage
- **Frontend**: React 19 + React Router 7 + Tailwind + Shadcn UI + Sonner (toasts) + Lucide icons
- **Auth**: JWT Bearer token em `localStorage.whymob_token`, interceptor axios

## Implemented (Fase 2 — 01/07/2026) ✅
- ✅ Plano de Faturação (tipo, data prevista, valor, VAB, estado por linha)
- ✅ Faturas com linhas ligadas ao plano; suporta faturação parcial e agregação
- ✅ Recebimentos (parciais, métodos: transferência/cartão/mbway/cheque/numerário/outro)
- ✅ Anulação de fatura com motivo obrigatório (Admin/CEO); reverte invoiced_amount
- ✅ Endpoint `/api/orders/{id}/reconcile` com valores + VAB + deltas
- ✅ **Cálculo automático do estado Fulfilled** (Encomenda = Plano = Faturado = Recebido em valor e VAB, tolerância 0.01€)
- ✅ Transições automáticas: aberta → em_planeamento → parcialmente_faturada → faturada → recebida → fulfilled
- ✅ Dashboard de reconciliação por encomenda (OrderDetail)
- ✅ Widget de alertas na Dashboard (encomenda sem plano, desvio plano, plano em atraso, fatura em atraso, proposta ganha sem encomenda)

## Implemented (Fase 1 — 01/07/2026)
- ✅ Auth JWT + admin seed + 3 test users (comercial/diretor/ceo)
- ✅ CRUD Clientes, Fabricantes, Produtos, Utilizadores (Admin only)
- ✅ CRUD Leads com estados (nova/em_qualificacao/convertida/descartada) + motivo obrigatório
- ✅ CRUD Oportunidades com probabilidade, prioridade, concorrente, VAB estimado
- ✅ Propostas com linhas (qty × preço × desconto × IVA + custo/VAB) + versão + validade + estados
- ✅ Encomendas geradas de propostas ganhas (PO, ENC-YYYY-NNNN)
- ✅ Conversões: Lead→Oportunidade, Oportunidade→Proposta, Proposta→Encomenda
- ✅ Dashboard Comercial (KPIs: leads/opps/propostas/conversão/ganho/VAB/encomendas)
- ✅ Funil de Vendas visual (4 fases com quantidade, valor, VAB, % conversão)
- ✅ Seed automático: 4 clientes, 4 fabricantes, 5 produtos, 3 leads

## Deferred / Backlog

### P0 (Fase 2 — Ciclo Financeiro)
- Módulo Plano de Faturação (linhas por tipo: setup/mensal/trimestral/anual/x avos/consumo)
- Módulo Faturas (com linhas ligadas ao plano, faturação parcial)
- Módulo Recebimentos (parciais, métodos de pagamento)
- Cálculo automático do estado **Fulfilled** (Encomenda = Plano = Faturado = Recebido, valor + VAB, com tolerância)
- Dashboard Financeiro / Provisões
- Indicadores de desvio (plano vs encomenda, faturado vs plano, recebido vs faturado)

### P1
- Alertas e notificações (leads sem update, propostas expiradas, faturas em atraso)
- Auditoria — histórico de alterações críticas (quem, quando, valor anterior/novo)
- Exportação Excel/PDF
- Filtros avançados (comercial, cliente, fabricante, produto, período)
- Cmd+K global search
- Anexos em propostas
- Aprovação interna de VAB abaixo de threshold

### P2
- Módulo técnico — alocação de developers
- Multi-versão de propostas (histórico completo)
- Parametrização de motivos de perda e categorias

## Test Credentials
Ver `/app/memory/test_credentials.md`.
