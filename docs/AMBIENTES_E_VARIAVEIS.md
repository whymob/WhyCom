# Ambientes e Variaveis

## Objetivo

Definir uma convencao clara para `local`, `staging` e `producao`, reduzindo risco de configuracao manual incorreta.

## Ambientes recomendados

### Local

Uso:

- desenvolvimento individual;
- containers locais;
- ligacao a Mongo remoto ou local.

Ficheiros base:

- `backend/.env`
- `frontend/.env`

Exemplos:

- `backend/.env.example`
- `frontend/.env.example`

### Staging

Uso:

- validacao integrada antes de producao;
- smoke tests de deploy;
- verificacao de autenticacao, scheduler e notificacoes.

Exemplos:

- `backend/.env.staging.example`
- `frontend/.env.staging.example`

### Producao

Uso:

- ambiente real da aplicacao;
- configuracao controlada por secrets do provedor;
- sem credenciais seed publicas nem segredos em ficheiros versionados;
- opcionalmente com Mongo em container quando a stack for corrida via compose.

Exemplos:

- `backend/.env.production.example`
- `frontend/.env.production.example`

## Variaveis backend

### Obrigatorias

- `MONGO_URL`: string de ligacao MongoDB, Atlas ou container local conforme o ambiente.
- `DB_NAME`: base de dados alvo por ambiente.
- `JWT_SECRET`: segredo forte e exclusivo por ambiente.

### Recomendadas

- `CORS_ORIGINS`: dominios permitidos, separados por virgula.
- `ENABLE_STARTUP_SEED`: controla a seed automatica no arranque.
- `RESEND_API_KEY`: chave real em staging/producao se notificacoes estiverem ativas.
- `SENDER_EMAIL`: remetente principal.
- `RESEND_FROM`: fallback de remetente.
- `ADMIN_EMAIL`: contacto administrativo padrao.
- `NOTIFY_EVENT_RECIPIENTS`: lista de destinatarios operacionais.

### Scheduler

- `SCHEDULER_ENABLED`
- `SCHEDULER_TZ`
- `ALERTS_DIGEST_CRON_HOUR`
- `ALERTS_DIGEST_CRON_MINUTE`
- `ALERTS_DIGEST_CRON_DOW`
- `ALERTS_DIGEST_RECIPIENTS`
- `JOBSTORE`
- `SCHEDULER_COLLECTION`

Recomendacao:

- `local`: `ENABLE_STARTUP_SEED=true`
- `staging`: `ENABLE_STARTUP_SEED=false`
- `producao`: `ENABLE_STARTUP_SEED=false`
- `local`: `JOBSTORE=memory`
- `staging`: `JOBSTORE=memory` ou `mongodb` conforme necessidade de persistencia
- `producao`: `JOBSTORE=mongodb` se o scheduler local da app continuar a ser a abordagem escolhida

## Variaveis frontend

### Obrigatoria

- `REACT_APP_BACKEND_URL`: URL publica da API consumida pelo browser.

### Opcional

- `ENABLE_HEALTH_CHECK`: ativa plugin de health check do frontend.

## Regras operacionais

- nao commitar `.env` reais;
- usar segredos diferentes entre `staging` e `producao`;
- manter `DB_NAME` exclusivo por ambiente;
- nunca reutilizar `JWT_SECRET` entre ambientes;
- manter `ENABLE_STARTUP_SEED=true` apenas em desenvolvimento;
- validar `CORS_ORIGINS` com dominios exatos, evitando `*` fora de desenvolvimento.

## Checklist por ambiente

### Local

- API responde em `/api/health`
- frontend aponta para a URL correta do backend
- credenciais de desenvolvimento conhecidas

### Staging

- dominio publico funcional
- Mongo dedicado ou isolado logicamente
- Resend configurado
- smoke tests read-only executados apos deploy

### Producao

- segredos injetados por plataforma
- backups do Mongo ativos
- dominio e TLS configurados
- logs e health checks observados apos deploy
- se usar compose local de producao, `MONGO_URL=mongodb://mongo:27017`
