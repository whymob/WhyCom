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

## Implemented (Melhorias P2/P3 — 02/2026) ✅
- ✅ **Event hooks (fire-and-forget)**: email automático quando proposta transita para `ganha` (via `notify_proposal_won`) e quando encomenda transita para `fulfilled` (via `notify_order_fulfilled` em `helpers.recalc_order_status`). Recipients via `NOTIFY_EVENT_RECIPIENTS`.
- ✅ **Pydantic `AlertsDigestRequest`** em `/notifications/send-alerts-digest` (validação 422 se email inválido).
- ✅ **Redact Resend errors**: 502 com mensagem genérica; detalhes técnicos apenas no log.
- ✅ **`GET /api/health`**: ping ao Mongo, sem auth, devolve `{status, mongo, checked_at}`.
- ✅ **MongoDB jobstore** opcional no APScheduler via `JOBSTORE=mongodb` (default: memory).
- ✅ **Testes**: 13 novos + 56 regressão = 69/69 pass (iteration_5).

## Implemented (Refactor + Scheduler — 02/2026) ✅
- ✅ **Split de `server.py`** (1797 → 70 linhas) em módulos por responsabilidade:
  - `deps.py`: mongo, JWT, security, constantes
  - `models.py`: todas as Pydantic classes
  - `helpers.py`: audit_log, get_order_or_404, recalc_order_status, compute_alerts, csv_response, send_email_async
  - `seed.py`, `scheduler.py`, `server.py` (thin bootstrap)
  - `routers/`: 8 sub-routers (auth_users, master_data, pipeline, finance, analytics, technical, exports_audit, notifications)
- ✅ **APScheduler** — job diário `alerts_digest` via CronTrigger (default: 09:00 Europe/Lisbon, mon-fri). Configurável via env: `SCHEDULER_ENABLED`, `SCHEDULER_TZ`, `ALERTS_DIGEST_CRON_HOUR/MINUTE/DOW`, `ALERTS_DIGEST_RECIPIENTS`.
- ✅ **Lint**: 45 → 0 issues.
- ✅ **Testes**: 43/43 regressão + 13/13 notificações (iteration_4). Zero regressões.

## Implemented (Notifications — Resend — 02/2026) ✅
- ✅ **Integração Resend refatorada** conforme playbook oficial: SDK `resend>=2.0.0`, chamada não-bloqueante via `asyncio.to_thread(resend.Emails.send, params)`.
- ✅ `POST /api/notifications/test-email` (admin/ceo) — envia email de teste com HTML custom (validado com email_id retornado pela Resend).
- ✅ `POST /api/notifications/send-alerts-digest` (admin/ceo) — digest HTML dos alertas ativos (propostas expiradas, faturas em atraso, etc.). Retorna `sent:false` quando não há alertas.
- ✅ RBAC: 401 sem token, 403 para role comercial, 422 para payload inválido.
- ✅ Testes backend em `/app/backend/tests/test_notifications_resend.py` (13/13 pass — iteration_3).


## Implemented (P1 Backlog — 01/07/2026) ✅
- ✅ **Auditoria** — collection `audit_log` + helper `_audit()` integrado em transições de estado (leads, oportunidades, propostas, anulação de faturas). Endpoint `/api/audit?entity=&entity_id=&limit=` + página `/auditoria` (Admin).
- ✅ **Exportação CSV** (compatível Excel) — `/api/exports/invoices.csv`, `/api/exports/timesheet.csv`, `/api/exports/reporting-commercial.csv`. Botões de download no Reporting e no Timesheet.
- ✅ **Timesheet self-service** — `/api/me/time-entries` e `/api/me/allocations` filtradas pelo utilizador autenticado. Página `/timesheet` com 3 KPIs (total horas, faturáveis, projetos) + registo rápido + download CSV.

## Implemented (Fase 4 — Módulo Técnico — 01/07/2026) ✅
- ✅ Modelo Projetos ligados a Encomendas (`/api/projects` CRUD)
- ✅ Alocação de developers com €/hora custo e horas previstas por developer
- ✅ Registo de horas reais (time entries) com data, descrição e flag "faturável"
- ✅ Cálculo automático de **custo técnico real** (Σ horas × €/hora custo)
- ✅ Cálculo automático de **VAB real** (Valor Encomenda − custo técnico real) + Δ vs VAB planeado
- ✅ Integração com plano de faturação: linhas tipo `consumo_horas` são cross-referenciadas com horas faturáveis
- ✅ Sumário por developer (horas, custo, horas faturáveis)
- ✅ Endpoint `/api/projects/{id}/summary` — sumário completo (horas prev/real/faturáveis + custos + VAB real + by_developer)
- ✅ Página `/projetos` (lista) e `/projetos/:id` (workspace com 4 KPI cards + tabela alocações + registo horas)

## Implemented (Fase 3 — 01/07/2026) ✅
- ✅ Endpoint `/api/analytics/by-commercial` (leads, opps, props, ganhas, taxa conversão, valor, VAB por comercial)
- ✅ Endpoint `/api/analytics/by-client` (propostas, encomendas, valor, VAB por cliente + segmento)
- ✅ Endpoint `/api/analytics/by-manufacturer` (opps + propostas por fabricante via produtos)
- ✅ Endpoint `/api/analytics/forecast/invoicing` (previsão por mês com planeado + por faturar)
- ✅ Endpoint `/api/analytics/forecast/receiving` (aging buckets: 0-30/31-60/61-90/>90/em atraso)
- ✅ Endpoint `/api/analytics/vab` (VAB pipeline + won + planned + invoiced + margem mensal)
- ✅ Endpoint `/api/analytics/executive` (agregação)
- ✅ Página `/reporting` com 6 tabs (Executivo, Por Comercial, Por Cliente, Por Fabricante, Previsões, Análise VAB) usando Recharts
- ✅ Gráficos: bar chart previsão de faturação, aging de recebimentos, line chart margem VAB mensal

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
