# Setup Local

## Objetivo

Este guia existe para tornar o arranque local do projeto repetivel, sem depender do contexto da plataforma de origem.

## Backend

### Preparar ambiente

```powershell
cd backend
Copy-Item .env.example .env
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

### Arrancar API

```powershell
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

### Confirmar funcionamento

Abrir:

```text
http://localhost:8000/api/health
```

Resposta esperada:

- `status: ok` ou `status: degraded`
- `mongo: ok` quando a ligacao a Mongo estiver operacional

## Frontend

### Preparar ambiente

```powershell
cd frontend
Copy-Item .env.example .env
npm.cmd install
```

### Arrancar app

```powershell
npm.cmd start
```

### Confirmar funcionamento

Abrir:

```text
http://localhost:3000
```

## Credenciais seed

- `admin@whymob.pt / admin123`
- `comercial@whymob.pt / comercial123`
- `diretor@whymob.pt / diretor123`
- `ceo@whymob.pt / ceo123`

## Problemas comuns

### Frontend sem API

Verificar:

- se `frontend/.env` contem `REACT_APP_BACKEND_URL=http://localhost:8000`;
- se o backend esta realmente a correr;
- se `CORS_ORIGINS` no backend permite `http://localhost:3000`.

### Health degradado

Se `/api/health` devolver `degraded`, o mais provavel e:

- `MONGO_URL` incorreto;
- MongoDB desligado;
- `DB_NAME` apontar para uma base inacessivel;
- ou a ligacao externa ao Atlas estar bloqueada por DNS/rede/firewall.

### Notificacoes nao enviam

Verificar:

- `RESEND_API_KEY`;
- `SENDER_EMAIL` ou `RESEND_FROM`;
- destinatarios definidos em `NOTIFY_EVENT_RECIPIENTS` ou `ALERTS_DIGEST_RECIPIENTS`.

## Nota importante

Os principais problemas de encoding visiveis no codigo e nas paginas centrais ja foram tratados. Se aparecer texto corrompido depois de um merge, vale revisar o ficheiro alterado antes de assumir que o problema voltou ao projeto todo.
