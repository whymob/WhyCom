# Smoke E2E Minimo

## Objetivo

Definir um fluxo minimo de validacao frontend end-to-end sem escrita desnecessaria na base.

## Fluxo recomendado

1. Abrir a aplicacao em `http://localhost:3000`
2. Fazer login com utilizador valido
3. Confirmar redirecionamento para dashboard
4. Navegar para paginas principais sem erro:
   - Dashboard
   - Leads
   - Oportunidades
   - Propostas
   - Encomendas
   - Reporting
   - Projetos
   - Timesheet
5. Confirmar logout

## Seletores estaveis atuais

### Login

- email: `login-email-input`
- password: `login-password-input`
- submit: `login-submit-button`

### Logout

- botao: `logout-button`

### Navegacao principal

- dashboard: `nav-dashboard`
- funnel: `nav-funnel`
- leads: `nav-leads`
- opportunities: `nav-opportunities`
- proposals: `nav-proposals`
- orders: `nav-orders`
- reporting: `nav-reporting`
- projects: `nav-projects`
- timesheet: `nav-timesheet`

## Credenciais

Por omissao:

- `admin@whymob.pt / admin123`

## Observacoes

- este smoke E2E pode ser feito com Playwright no futuro;
- o fluxo acima evita criacao, edicao e remocao de dados;
- serve como validacao segura apos merge, rebuild de container ou alteracao de autenticacao/layout.

## Estado atual

O scaffold minimo de Playwright ja existe no frontend:

- config: `frontend/playwright.config.js`
- teste: `frontend/tests/e2e/smoke-readonly.spec.js`

## Como executar

Com frontend e backend ja a correr:

```powershell
cd frontend
npm.cmd run test:e2e
```

Modo com browser visivel:

```powershell
cd frontend
npm.cmd run test:e2e:headed
```

Se precisares de usar outras credenciais:

```powershell
$env:PLAYWRIGHT_SMOKE_EMAIL="admin@whymob.pt"
$env:PLAYWRIGHT_SMOKE_PASSWORD="admin123"
npm.cmd run test:e2e
```

Nota:

- a instalacao dos browsers do Playwright pode ser necessaria no primeiro uso, dependendo do ambiente.
