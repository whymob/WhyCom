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

Este README foi consolidado para refletir o estado atual real do repositorio.

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
- exportacoes CSV e PDF;
- dashboards e analytics;
- projetos tecnicos;
- alocacoes e time entries;
- notificacoes e digest de alertas.

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
- ainda falta uma rodada final de execucao completa de testes com uma base de dados acessivel de forma repetivel.

### Frontend

No diretorio `frontend/`:

```powershell
npm.cmd run build
```

O build do frontend ja foi validado com sucesso no ambiente local.

## Docker

Documentacao de containers:

- [Setup Docker Local](docs/DOCKER_LOCAL.md)

### Referencia rapida

| Cenario | Comando | Backend `.env` | Base de dados |
| --- | --- | --- | --- |
| Desenvolvimento / teste | `docker compose up --build` | `backend/.env` | Atlas via `MONGO_URL` |
| Producao / simulacao local | `docker compose -f docker-compose.yml -f docker-compose.production.yml up --build` | `backend/.env.production` | container `mongo` |

## Ambientes e deploy

- [Ambientes e Variaveis](docs/AMBIENTES_E_VARIAVEIS.md)
- [Deploy e Operacao](docs/DEPLOY_E_OPERACAO.md)

## Estado atual

O projeto esta numa fase boa de consolidacao tecnica:

- documentacao principal criada;
- setup local e Docker basicos definidos;
- frontend compila com sucesso;
- backend arranca e expoe `health`;
- ainda faltam validacao funcional completa com base acessivel e endurecimento de engenharia.

Analise completa e roadmap:

- [Analise do Projeto e Plano](docs/ANALISE_PROJETO_E_PLANO.md)
- [Setup Local](docs/SETUP_LOCAL.md)
- [Setup Docker Local](docs/DOCKER_LOCAL.md)
- [Ambientes e Variaveis](docs/AMBIENTES_E_VARIAVEIS.md)
- [Deploy e Operacao](docs/DEPLOY_E_OPERACAO.md)
- [Smoke Check Read-Only](docs/SMOKE_READONLY.md)
- [Smoke E2E Minimo](docs/SMOKE_E2E_MINIMO.md)

## Proximas prioridades recomendadas

1. fechar a validacao funcional com base de dados acessivel;
2. correr testes backend completos no ambiente atual;
3. introduzir testes frontend e smoke tests E2E;
4. reativar CI apenas quando o fluxo de deploy estiver estabilizado;
5. continuar o endurecimento para staging/producao.
