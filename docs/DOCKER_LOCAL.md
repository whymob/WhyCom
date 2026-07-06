# Docker Local

## Objetivo

Este setup suporta dois modos:

- desenvolvimento com MongoDB Atlas definido em `backend/.env`;
- simulacao de producao com MongoDB em container e `backend/.env.production`.

## Pre-requisitos

- Docker Desktop ativo
- `backend/.env` configurado com a `MONGO_URL` do Atlas para desenvolvimento
- `backend/.env.production` criado a partir de `backend/.env.production.example` para simulacao de producao

## Desenvolvimento com Atlas

Na raiz do projeto:

```powershell
docker compose up --build
```

## Enderecos

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`
- Health API: `http://localhost:8000/api/health`

## Como funciona

- o container `backend` le as variaveis de `backend/.env`;
- o container `frontend` arranca em modo desenvolvimento com `npm start`;
- o frontend usa `REACT_APP_BACKEND_URL=http://localhost:8000` para que o browser fale com a API publicada no host.

## Simulacao de producao com Mongo local em container

Criar o ficheiro de ambiente:

```powershell
Copy-Item backend\.env.production.example backend\.env.production
```

Subir os containers com o override de producao:

```powershell
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile production up --build
```

Neste modo:

- o `backend` usa `backend/.env.production`;
- o `MONGO_URL` deve apontar para `mongodb://mongo:27017`;
- o service `mongo` sobe dentro do mesmo compose;
- o volume `mongo_data` guarda os dados do Mongo containerizado.

## Parar

```powershell
docker compose down
```

Para o modo de simulacao de producao:

```powershell
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile production down
```

## Notas

- em desenvolvimento, o service `mongo` nao arranca por omissao;
- em desenvolvimento, a ligacao a base depende totalmente da `MONGO_URL` configurada no `backend/.env`;
- em simulacao de producao, o `backend` deve usar `backend/.env.production`;
- se o Atlas continuar inacessivel a partir do Docker ou host, o backend vai arrancar mas o `health` devera indicar `degraded`.
