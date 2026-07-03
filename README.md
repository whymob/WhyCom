# WhyMob CRM

WhyMob CRM e uma aplicacao web de gestao comercial B2B orientada ao ciclo completo:

`Lead -> Oportunidade -> Proposta -> Encomenda -> Faturacao -> Recebimento -> Projeto -> Reporting`

O projeto foi exportado de uma plataforma de desenvolvimento com AI e ja inclui uma base funcional relevante:

- frontend React;
- backend FastAPI;
- MongoDB;
- autenticacao JWT com perfis;
- analytics e reporting;
- modulo tecnico com projetos e timesheet;
- notificacoes por email;
- testes backend e dados seed.

Este README foi criado para consolidar o projeto como base de trabalho de equipa.

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

## Modulos funcionais identificados

- autenticacao e RBAC;
- utilizadores;
- clientes;
- fabricantes;
- produtos;
- leads;
- oportunidades;
- propostas;
- encomendas;
- plano de faturacao;
- faturas;
- recebimentos;
- auditoria;
- exportacoes CSV;
- dashboards e analytics;
- projetos tecnicos;
- alocacoes e time entries;
- notificacoes e digest de alertas.

## Requisitos locais

- Node.js 20+ recomendado
- Yarn 1.x recomendado
- Python 3.11+ recomendado
- MongoDB acessivel localmente ou remotamente

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
pip install -r requirements.txt
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
yarn install
```

Arrancar a aplicacao:

```powershell
yarn start
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
- alguns testes historicos referem um URL de preview se `REACT_APP_BACKEND_URL` nao estiver definido.

### Frontend

No diretorio `frontend/`:

```powershell
yarn test
```

## Estado atual

O projeto esta numa fase boa para consolidacao tecnica:

- ha bastante funcionalidade implementada;
- a modelacao de negocio esta acima da media para um projeto exportado;
- ainda faltam endurecimento de engenharia, melhor documentacao e limpeza de detalhes herdados da exportacao.

Analise completa e roadmap:

- [Analise do Projeto e Plano](docs/ANALISE_PROJETO_E_PLANO.md)
- [Setup Docker Local](docs/DOCKER_LOCAL.md)

## Proximas prioridades recomendadas

1. corrigir problemas de encoding PT-PT;
2. validar o setup local fim a fim;
3. criar `.env` reais para cada ambiente;
4. reforcar testes frontend e E2E;
5. preparar pipeline de CI/CD.
