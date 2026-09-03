# Deploy e Operacao

## Objetivo

Definir uma base minima de deploy para staging/producao sem reinventar a stack atual do projeto.

## Arquitetura recomendada

### Frontend

- build estatico do React;
- servido por plataforma de frontend estatico ou container Node apenas se necessario.

### Backend

- FastAPI em container;
- exposicao HTTP atras de reverse proxy ou plataforma gerida;
- acesso a MongoDB por `MONGO_URL`, usando Atlas em desenvolvimento ou o service `mongo` no compose de producao.

### Base de dados

- MongoDB Atlas externo no fluxo de desenvolvimento;
- MongoDB em container no compose de simulacao de producao;
- bases separadas para `staging` e `producao`.

## Estrategia de deploy sugerida

### Staging

- deploy automatico em branch de integracao ou manual apos merge;
- aplicar variaveis de `staging`;
- executar smoke checks read-only apos subida.

### Producao

- deploy controlado a partir de branch principal;
- segredos injetados pelo provedor;
- se a stack correr por compose, usar `backend/.env.production` com `MONGO_URL=mongodb://mongo:27017`;
- validacao de `/api/health` e paginas chave apos release.

## Checklist de pre-deploy

- `frontend` compila com `npm.cmd run build`;
- `docker compose config` resolve sem erro;
- exemplos de ambiente estao atualizados;
- `JWT_SECRET` e `MONGO_URL` corretos no ambiente alvo;
- `CORS_ORIGINS` coincide com os dominios reais;
- notificacoes por email revistas antes de ativar envio real.

## Checklist de pos-deploy

- `GET /api/health` retorna `200`;
- login funcional com conta administrativa;
- dashboard abre sem erro;
- logs de arranque nao mostram erro de configuracao;
- scheduler inicia apenas quando desejado.

## Observabilidade minima

### Backend

- usar `/api/health` como endpoint primario de verificacao;
- observar logs de arranque do Uvicorn e do scheduler;
- tratar estado `degraded` como alerta operacional.

### Frontend

- validar carregamento da aplicacao;
- confirmar `REACT_APP_BACKEND_URL` correta;
- opcionalmente manter `ENABLE_HEALTH_CHECK=true` em staging/producao.

## Riscos atuais conhecidos

- os testes backend completos ainda assumem escrita em base de dados;
- o frontend ainda corre em CRA/CRACO, o que aumenta custo de manutencao futura;
- o scheduler corre no processo da app, o que exige cuidado em ambientes com multiplas replicas.

## Proxima evolucao recomendada

- separar pipeline de `staging` e `producao`;
- adicionar smoke automatizado pos-deploy;
- definir estrategia explicita para replicas do backend e scheduler.
- reativar CI apenas quando os ambientes estiverem consolidados.
