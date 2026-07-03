# Docker Local

## Objetivo

Este setup sobe `frontend` e `backend` em containers, mantendo a base de dados externa definida em `backend/.env`.

## Pré-requisitos

- Docker Desktop ativo
- `backend/.env` configurado com a `MONGO_URL` real

## Arranque

Na raiz do projeto:

```powershell
docker compose up --build
```

## Endereços

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`
- Health API: `http://localhost:8000/api/health`

## Como funciona

- o container `backend` lê as variáveis de `backend/.env`;
- o container `frontend` arranca em modo desenvolvimento com `npm start`;
- o frontend usa `REACT_APP_BACKEND_URL=http://localhost:8000` para que o browser fale com a API publicada no host.

## Parar

```powershell
docker compose down
```

## Notas

- este compose não sobe MongoDB local;
- a ligação à base depende totalmente da `MONGO_URL` configurada no `backend/.env`;
- se o Atlas continuar inacessível a partir do Docker/host, o backend vai arrancar mas o `health` deverá indicar `degraded`.
