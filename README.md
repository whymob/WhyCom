# WhyMob CRM

O WhyMob CRM é uma aplicação web B2B para gerir o ciclo comercial e acompanhar a execução e a faturação dos negócios. O fluxo principal é `Lead → Oportunidade → Proposta → Encomenda`; a encomenda pode seguir para planeamento financeiro, faturação, recebimentos e, quando aplicável, projeto técnico e timesheet.

Esta documentação descreve o estado observado no código do repositório. Requisitos e regras de negócio estão detalhados em [Análise Funcional e Regras de Negócio](docs/ANALISE_FUNCIONAL_E_REGRAS_NEGOCIO.md) e [Requisitos Não Funcionais](docs/REQUISITOS_NAO_FUNCIONAIS.md).

## Estrutura

```text
backend/         API FastAPI, regras de negocio, auth, finance, analytics
frontend/        Aplicacao React
memory/          PRD e memoria exportada da plataforma de origem
test_reports/    Relatorios de testes por iteracao
tests/           Estrutura adicional de testes
docs/            Documentacao consolidada do projeto
```

## Stack

### Frontend

- React 19
- React Router 7
- Tailwind CSS
- Shadcn UI / Radix UI
- Axios
- Recharts
- CRACO

### Backend

- FastAPI
- Motor / PyMongo
- MongoDB
- Pydantic
- JWT custom
- APScheduler
- Resend

## Módulos disponíveis no código

- autenticação JWT e controlo de acesso por perfil;
- utilizadores;
- clientes;
- fabricantes;
- produtos;
- leads;
- oportunidades;
- propostas;
- encomendas;
- plano de faturação;
- faturas;
- recebimentos;
- auditoria;
- exportacoes CSV e PDF;
- dashboards, funil e analytics;
- projetos tecnicos;
- alocacoes e time entries;
- notificações por email e digest de alertas;
- pesquisa global, quadro comercial e agenda de trabalho.

## Documentação

- [Manual de utilização](docs/MANUAL_USO_WHYMOB.md): operação das páginas e fluxos.
- [Análise funcional e regras de negócio](docs/ANALISE_FUNCIONAL_E_REGRAS_NEGOCIO.md): requisitos observáveis, estados e condições de transição.
- [Requisitos não funcionais](docs/REQUISITOS_NAO_FUNCIONAIS.md): características implementadas e decisões operacionais pendentes.
- [Análise do projeto e plano](docs/ANALISE_PROJETO_E_PLANO.md): arquitetura, estado técnico e prioridades.
- [Setup local](docs/SETUP_LOCAL.md) · [Docker local](docs/DOCKER_LOCAL.md) · [Ambientes](docs/AMBIENTES_E_VARIAVEIS.md) · [Deploy e operação](docs/DEPLOY_E_OPERACAO.md) · [Observabilidade](docs/observability.md).
- [PRD atual](memory/PRD.md): âmbito do produto, capacidades presentes e backlog ainda em aberto.

O Markdown do manual é a fonte editável. Os ficheiros PDF e DOCX são cópias exportadas e devem ser regenerados sempre que o manual for alterado.

## Requisitos locais

- Node.js 20+ recomendado
- npm 11+ recomendado
- Python 3.11+ recomendado
- MongoDB acessivel localmente ou remotamente
- Docker Desktop opcional para subir frontend/backend em containers

## Setup rapido

### 1. Backend

Criar o ficheiro de ambiente a partir do exemplo:

```powershell
Copy-Item backend\.env.example backend\.env
```

Instalar dependencias:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Arrancar a API:

```powershell
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

Health check:

```text
http://localhost:8000/api/health
```

### 2. Frontend

Criar o ficheiro de ambiente a partir do exemplo:

```powershell
Copy-Item frontend\.env.example frontend\.env
```

Instalar dependencias:

```powershell
cd frontend
npm.cmd install
```

Arrancar a aplicacao:

```powershell
npm.cmd start
```

Aplicacao:

```text
http://localhost:3000
```

## Variaveis de ambiente

### Backend obrigatorias

- `MONGO_URL`
- `DB_NAME`
- `JWT_SECRET`

### Backend opcionais

- `CORS_ORIGINS`
- `RESEND_API_KEY`
- `SENDER_EMAIL`
- `RESEND_FROM`
- `ADMIN_EMAIL`
- `NOTIFY_EVENT_RECIPIENTS`
- `SCHEDULER_ENABLED`
- `SCHEDULER_TZ`
- `ALERTS_DIGEST_CRON_HOUR`
- `ALERTS_DIGEST_CRON_MINUTE`
- `ALERTS_DIGEST_CRON_DOW`
- `ALERTS_DIGEST_RECIPIENTS`
- `JOBSTORE`
- `SCHEDULER_COLLECTION`

### Frontend obrigatorias

- `REACT_APP_BACKEND_URL`

### Frontend opcionais

- `ENABLE_HEALTH_CHECK`

## Credenciais seed

O backend cria utilizadores seed no arranque, se ainda nao existirem:

- `admin@whymob.pt / admin123`
- `comercial@whymob.pt / comercial123`
- `diretor@whymob.pt / diretor123`
- `ceo@whymob.pt / ceo123`

Estas credenciais sao uteis para demo e desenvolvimento. Nao devem ser usadas em producao.

## Testes

### Backend

No diretorio `backend/`:

```powershell
pytest
```

Notas:

- o `pytest.ini` ja define `-n 2 --dist loadscope`;
- os testes existentes assumem backend acessivel e, em varios casos, um ambiente seed funcional;
- a execução recente da suite completa não foi confirmada nesta revisão.

### Frontend

No diretorio `frontend/`:

```powershell
npm.cmd run build
```

O comando de build está disponível; esta revisão documental não executou o build.

## Docker

Documentacao de containers:

- [Setup Docker Local](docs/DOCKER_LOCAL.md)

### Referencia rapida

| Cenario | Comando | Backend `.env` | Base de dados |
| --- | --- | --- | --- |
| Desenvolvimento isolado | `docker compose -f docker-compose.workspace.yml up --build` | `backend/.env.workspace` | Mongo local, base `whycom_workspace_dev` |
| Desenvolvimento com configuração principal | `docker compose up --build` | `backend/.env` | destino definido por `MONGO_URL` |
| Simulação financeira local | `docker compose -f docker-compose.yml -f docker-compose.production.yml up --build` | `backend/.env.production` | container `mongo`; nunca apontar a dados reais |

## Ambientes e deploy

- [Ambientes e Variaveis](docs/AMBIENTES_E_VARIAVEIS.md)
- [Deploy e Operacao](docs/DEPLOY_E_OPERACAO.md)

## Validação

Os testes backend e o smoke E2E estão descritos nos próprios documentos. A existência de testes ou de documentação de deploy não significa que uma execução recente tenha sido validada neste ambiente; consultar [Análise do Projeto e Plano](docs/ANALISE_PROJETO_E_PLANO.md) para limitações e decisões pendentes.

- [Smoke de leitura](docs/SMOKE_READONLY.md)
- [Smoke E2E mínimo](docs/SMOKE_E2E_MINIMO.md)
