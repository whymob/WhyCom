# Análise do Projeto e Plano de Evolução

## Objetivo e conclusão

O WhyMob CRM é uma aplicação web de gestão comercial B2B. O repositório contém uma aplicação integrada, com gestão do pipeline, faturação e recebimentos, reporting e um módulo de execução técnica. A implementação é consideravelmente mais ampla do que o PRD original, mas há decisões de negócio e operação ainda por formalizar. A presença de código e testes não demonstra, por si só, que todos os fluxos foram validados em produção.

Esta análise foi revista em 13/10/2026 a partir do código e da documentação presentes no repositório. Não houve acesso a uma base de dados de produção nem foi executada uma validação funcional nesta revisão.

Atualização de dependências em 26/10/2026: o frontend passou de CRA/CRACO para Vite 8 com build estático servido por Nginx; o backend passou de Motor para PyMongo Async; os locks Python e a auditoria automatizada foram adicionados. Os apontamentos históricos abaixo sobre essas dependências já foram substituídos.

## Produto e arquitetura

Fluxo principal: `Lead → Oportunidade → Proposta → Encomenda → Plano/Fatura/Recebimento`. Projetos técnicos podem acompanhar a execução de encomendas quando aplicável.

- **Frontend:** React, React Router, Tailwind, Radix/Shadcn, Axios, Recharts e Vite; Nginx serve os artefactos estáticos nos containers.
- **Backend:** FastAPI, Pydantic, MongoDB com PyMongo Async/PyMongo, autenticação JWT, APScheduler e integração de email Resend.
- **Observabilidade:** integração OpenTelemetry/Jaeger opcional por configuração.
- **Organização:** routers separados por domínio (pipeline, financeiro, analytics, técnico, utilizadores/dados mestre, notificações e auditoria/exportações).

## Capacidades identificadas

- Autenticação, perfis, preferências de listagem e administração de utilizadores.
- Gestão de clientes, fabricantes e produtos.
- Leads, oportunidades, propostas versionadas/anexadas e conversões ligadas.
- Funil comercial por origem, movimentação e pipeline atual.
- Plano de faturação, faturação parcial, recebimentos, importação com pré-conciliação e reconciliação de encomendas.
- Dashboard, previsões e análise por comercial, cliente, fabricante e VAB.
- Projetos, alocações, timesheet e indicadores de execução.
- Pesquisa global, quadro comercial, follow-ups, auditoria e exportações.
- Alertas e notificações de eventos/digest quando os serviços e as variáveis correspondentes estão configurados.

Detalhes dos comportamentos e transições estão em [Análise Funcional e Regras de Negócio](ANALISE_FUNCIONAL_E_REGRAS_NEGOCIO.md). Requisitos de qualidade e operação estão em [Requisitos Não Funcionais](REQUISITOS_NAO_FUNCIONAIS.md).

## Estado documental

- README, guias de execução e manual de uso existem.
- O PRD original tinha backlog que já estava implementado; foi atualizado para refletir o âmbito observado e separar decisões em aberto.
- Regras de negócio estavam dispersas. Agora existe uma referência funcional única, ligada a modelos e routers.
- Requisitos não funcionais ainda não estão definidos como metas mensuráveis; o documento correspondente separa capacidades presentes de decisões pendentes.
- O Markdown do manual é a fonte editável. Os PDF/DOCX devem ser regenerados depois de alterações ao Markdown.

## Riscos e lacunas técnicas

1. **Produção:** destino real, pipeline de release, backups/restauro, RPO/RTO e verificações pós-deploy precisam de confirmação operacional.
2. **Segurança:** `JWT_SECRET` e CORS dependem da configuração; o backend tem fallback CORS `*` se `CORS_ORIGINS` não estiver definido. Rever configuração por ambiente e controlo de acesso em novos endpoints.
3. **Scheduler:** corre dentro do processo da aplicação. Definir comportamento ao operar várias réplicas para evitar execução duplicada de tarefas.
4. **Estados de encomenda:** `em_faturacao` existe no modelo e em listas de trabalho, mas não foi localizada atribuição pelo recálculo financeiro.
5. **Qualidade:** há testes backend, smoke read-only e scaffold Playwright; esta revisão não executou testes. A cobertura de frontend e os gates de CI devem ser avaliados no pipeline real.
6. **Manutenção frontend:** o frontend usa Vite 8; manter a versão Node da imagem e os lockfiles alinhados com o CI.

## Plano recomendado

### Prioridade 1: decisões de negócio e dados

- Resolver a semântica de `em_faturacao` e as transições pós-conversão de lead/oportunidade.
- Confirmar as regras do funil com utilizadores comerciais e documentar exemplos de período.
- Definir retenção e permissões para anexos, auditoria e dados pessoais.

### Prioridade 2: operação de produção

- Definir staging e produção, gestão de segredos, backup/restauro e objetivos RPO/RTO.
- Definir execução do scheduler em réplicas e política de observabilidade/alertas.
- Automatizar build, verificações e smoke pós-deploy no CI/CD escolhido.

### Prioridade 3: qualidade e evolução

- Aumentar testes de interface para fluxos de conversão, faturação e recebimento.
- Definir suporte de browsers, acessibilidade e metas de desempenho.
- Avaliar modernização do frontend e aprovações de propostas por VAB conforme necessidade do negócio.

## Documentos relacionados

- [README](../README.md)
- [PRD](../memory/PRD.md)
- [Manual de utilização](MANUAL_USO_WHYMOB.md)
- [Setup local](SETUP_LOCAL.md) e [Docker local](DOCKER_LOCAL.md)
- [Ambientes e variáveis](AMBIENTES_E_VARIAVEIS.md)
- [Deploy e operação](DEPLOY_E_OPERACAO.md)
- [Observabilidade](observability.md)
- [Smoke read-only](SMOKE_READONLY.md) e [Smoke E2E](SMOKE_E2E_MINIMO.md)
