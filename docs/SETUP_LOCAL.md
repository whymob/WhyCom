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
pip install -r requirements.txt
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
yarn install
```

### Arrancar app

```powershell
yarn start
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
- `DB_NAME` apontar para uma base inacessivel.

### Notificacoes nao enviam

Verificar:

- `RESEND_API_KEY`;
- `SENDER_EMAIL` ou `RESEND_FROM`;
- destinatarios definidos em `NOTIFY_EVENT_RECIPIENTS` ou `ALERTS_DIGEST_RECIPIENTS`.

## Nota importante

O projeto ainda contem alguns artefatos da exportacao original, incluindo problemas de encoding em textos PT-PT. Isso nao impede o arranque local, mas deve ser tratado como prioridade de consolidacao tecnica.
