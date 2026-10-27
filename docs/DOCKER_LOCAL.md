# Docker Local

## Objetivo

Este repositório tem três configurações distintas. Para desenvolvimento isolado e validação local, use `docker-compose.workspace.yml`, que inicia uma base MongoDB própria. O Compose principal liga à base especificada em `backend/.env`; o override `docker-compose.production.yml` é apenas uma simulação local e não deve ser apontado a dados de produção.

## Pre-requisitos

- Docker Desktop ativo
- `backend/.env` configurado com a `MONGO_URL` do Atlas para desenvolvimento
- `backend/.env.workspace` configurado para a stack local isolada
- `backend/.env.production` criado a partir de `backend/.env.production.example` para simulacao de producao

## Stack de desenvolvimento isolada

Na raiz do projeto:

```powershell
docker compose -f docker-compose.workspace.yml up --build
```

Endereços:

- Frontend: `http://localhost:3010`
- Backend: `http://localhost:8010`
- Health API: `http://localhost:8010/api/health`
- MongoDB publicado no host: `localhost:27018`

Esta stack usa a base `whycom_workspace_dev` no volume `mongo_workspace_data`, ativa seed de desenvolvimento e desativa o envio externo de emails. Os dados persistem após `down`; `down -v` remove os volumes e apaga os dados locais dessa stack.

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
- o container `frontend` serve o build estático com Nginx;
- o frontend usa `REACT_APP_BACKEND_URL=http://localhost:8000` em runtime para que o browser fale com a API publicada no host;

## Simulacao de producao com Mongo local em container

Criar o ficheiro de ambiente:

```powershell
Copy-Item backend\.env.production.example backend\.env.production
```

Subir os containers com o override de simulação local:

```powershell
docker compose -f docker-compose.yml -f docker-compose.production.yml up --build
```

Neste modo:

- o `backend` usa `backend/.env.production`;
- o `MONGO_URL` deve apontar para `mongodb://mongo:27017`;
- a seed automatica deve ficar desligada com `ENABLE_STARTUP_SEED=false`;
- o service `mongo` sobe dentro do mesmo compose;
- o volume `mongo_data` guarda os dados do Mongo containerizado.
- o Jaeger usa Badger no volume `jaeger_data`, com retencao de traces de 14 dias;
- um contentor de inicializacao prepara as permissoes do volume para o utilizador nao-root do Jaeger;
- o volume `jaeger_data` sobrevive a reinicios e a `docker compose down` (nao usar `down -v` se quiser manter os traces).

## Parar

```powershell
docker compose down
```

Para a stack de desenvolvimento isolada:

```powershell
docker compose -f docker-compose.workspace.yml down
```

Para a simulação local com Mongo:

```powershell
docker compose -f docker-compose.yml -f docker-compose.production.yml down
```

## Notas

- em desenvolvimento, o service `mongo` nao arranca por omissao;
- `docker-compose.workspace.yml` usa Mongo local e portas próprias (3010, 8010 e 27018), separados do Compose principal;
- em desenvolvimento, a ligacao a base depende totalmente da `MONGO_URL` configurada no `backend/.env`;
- em simulação local, o `backend` usa `backend/.env.production`; confirme sempre o `DB_NAME` e o destino de `MONGO_URL` antes de iniciar;
- esta configuração chamada “produção” no nome é apenas uma simulação em máquina local. Nunca a use para ligar a uma base de produção sem o processo de release aprovado;
- se o Atlas continuar inacessivel a partir do Docker ou host, o backend vai arrancar mas o `health` devera indicar `degraded`.
