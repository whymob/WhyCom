# Analise do Projeto e Plano de Desenvolvimento

## 1. Resumo executivo

O projeto aberto e uma aplicacao web de gestao comercial chamada **WhyMob CRM**, focada em acompanhar o ciclo comercial completo:

`Lead -> Oportunidade -> Proposta -> Encomenda -> Faturacao -> Recebimento -> Analise`

Pelo que existe no repositorio, o sistema foi exportado de uma plataforma de desenvolvimento com AI e saiu com um nivel de maturidade acima de um prototipo visual. Ha frontend, backend, testes de regressao, seed de dados, scheduler, notificacoes e documentacao de produto.

Ao mesmo tempo, a exportacao trouxe sinais claros de geracao automatica:

- `README.md` raiz originalmente vazio;
- `frontend/README.md` originalmente padrao do Create React App;
- pasta `memory/` com PRD e memoria operacional da geracao;
- pasta `test_reports/` com iteracoes automatizadas;
- arquivo `.emergent/emergent.yml` com metadados da plataforma de origem.

Conclusao: **o projeto parece funcional e relativamente completo para uma base MVP/MMP, mas ainda precisa de consolidacao de engenharia para virar produto sustentavel em ambiente produtivo.**

## 2. O que o produto faz hoje

Com base em `memory/PRD.md`, nas rotas do frontend e na organizacao do backend, o sistema ja cobre:

- autenticacao JWT com perfis de acesso;
- gestao de clientes, fabricantes, produtos e utilizadores;
- leads, oportunidades, propostas e encomendas;
- pipeline comercial e funil de vendas;
- plano de faturacao, faturas e recebimentos;
- auditoria e exportacoes CSV/PDF;
- modulo tecnico com projetos, alocacoes e timesheet;
- reporting executivo e analitico;
- notificacoes por email com Resend;
- scheduler para digest de alertas.

## 3. Stack e arquitetura identificadas

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
- MongoDB com Motor / PyMongo
- JWT custom
- APScheduler
- Resend
- Pydantic

## 4. Estrutura do repositorio

```text
backend/         API FastAPI, regras de negocio, auth, analytics, notifications
frontend/        Aplicacao React
memory/          PRD e memoria do processo de geracao
tests/           Estrutura adicional de testes
test_reports/    Relatorios de execucao por iteracao
.emergent/       Metadados da plataforma de origem
docs/            Documentacao consolidada do projeto
```

## 5. Estado atual de maturidade

### Pontos fortes

- dominio de negocio relativamente bem modelado;
- backend modularizado;
- frontend com muitas telas ja ligadas ao negocio;
- presenca de autenticacao e RBAC;
- cobertura de testes backend reportada como forte nas iteracoes anteriores;
- seed de dados para demonstracao;
- notificacoes e scheduler ja pensados;
- setup local e Docker basicos ja documentados.

### Pontos de atencao

- documentacao de setup e arquitetura melhorou, mas ainda exige manutencao apos merges;
- frontend ainda preso a CRA/CRACO;
- relatorios apontam mais cobertura de backend do que de frontend;
- CI/CD ainda nao esta ativo nesta fase;
- validacao funcional completa ainda depende de acesso estavel a MongoDB.

## 6. Estado das fases iniciais

### Fase 0 - Consolidacao imediata

Estado: **quase concluida**

Ja feito:

- README principal criado;
- guias de setup local e Docker criados;
- `.env.example` criados;
- grande parte do encoding problematico corrigido;
- dependencias quebradas ou herdadas da exportacao removidas;
- documentacao do frontend reescrita.

Ainda pede manutencao leve:

- manter docs alinhadas depois de merges;
- fazer uma ultima passada de higiene documental quando a base funcional estiver estabilizada.

### Fase 1 - Estabilizacao tecnica

Estado: **parcial**

Ja feito:

- setup local validado;
- frontend compila com sucesso;
- backend arranca e expoe `health`;
- camada Docker criada para frontend/backend;
- problemas de merge recentes corrigidos no frontend;
- smoke check read-only por script Python e por pytest adicionados;
- smoke E2E minimo com Playwright preparado para login, navegacao e logout.

Ainda falta:

- executar os smokes read-only e E2E contra um ambiente local realmente em execucao;
- correr testes backend completos num ambiente onde escrita em BD esteja autorizada;
- formalizar melhor lint, seguranca e verificacoes automatizadas.

## 7. Plano de desenvolvimento recomendado

### Fase 0 - Consolidacao imediata

Objetivo: tornar o projeto compreensivel e operavel pela equipa.

Entregas:

- manter README e docs alinhados com o estado real;
- rever dependencias apos merges relevantes;
- estabilizar convencoes minimas de setup e release.

### Fase 1 - Estabilizacao tecnica

Objetivo: reduzir risco tecnico antes de novas funcionalidades.

Entregas:

- validar execucao real dos testes backend no ambiente atual;
- introduzir testes de frontend para fluxos criticos;
- criar smoke tests E2E para login, pipeline comercial e faturacao;
- melhorar logs operacionais e health checks;
- revisar seguranca basica: CORS, secrets, expiracao JWT, roles e validacoes.

### Fase 2 - Preparacao para producao

Objetivo: preparar deploy e operacao confiavel.

Estado: **iniciada**

Ja feito:

- configuracao separada para desenvolvimento com Atlas e simulacao de producao com Mongo em container;
- documentacao inicial de ambientes, deploy e operacao;
- CI automatico do GitHub temporariamente desativado.

Ainda falta:

- definir o destino real de staging/producao;
- automatizar verificacoes pos-deploy;
- decidir quando reativar CI/CD.

Entregas:

- documentar arquitetura de deploy;
- criar pipeline de CI/CD;
- separar configs por ambiente: local, staging, producao;
- definir estrategia de backups do MongoDB;
- reforcar observabilidade e operacao.

### Fase 3 - Evolucao funcional orientada a negocio

Sugestoes de prioridade:

- aprovacao interna de propostas com VAB baixo;
- anexos e documentos em propostas;
- filtros avancados e pesquisa global;
- exportacao PDF/Excel mais rica;
- melhorias no dashboard executivo.

### Fase 4 - Modernizacao da stack frontend

Opcional, mas recomendada:

- migrar de CRA/CRACO para Vite;
- reorganizar frontend por dominios;
- padronizar estrategia de fetch e estado;
- simplificar estrutura para manutencao de medio prazo.

## 8. Regras de reporting e exportacao (atualizacao 29/07/2026)

Esta secao registra as regras consolidadas nas ultimas alteracoes, para evitar divergencias futuras entre Dashboard, Reporting e exportacoes.

### 8.1 Filtros temporais

- Dashboard e Reporting usam um seletor de ano.
- Indicadores de faturacao usam `invoices.issued_at` como data real de emissao.
- Linhas anuladas e encomendas com estado `cancelada` ou `anulada` sao ignoradas.
- O plano e o valor por faturar usam `plan_lines.expected_date`; esta data representa a previsao, nao substitui a data de emissao.

### 8.2 VAB faturado

O VAB faturado do ano nao e o VAB total da encomenda. As novas linhas de fatura guardam o campo `vab_amount`, calculado no momento da emissao. Assim, varias faturas podem receber parcelas diferentes do VAB sem perder a rastreabilidade.

Para faturas antigas que ainda nao possuem esse campo, o sistema mantem o fallback historico:

`VAB da encomenda x (valor sem IVA faturado / valor sem IVA da encomenda)`

Quando uma encomenda e faturada em varios anos, cada ano recebe somente a parcela proporcional faturada nesse ano.

Um administrador pode corrigir o VAB por linha em `PATCH /api/invoices/{id}/vab`. O valor da fatura nao e alterado, o motivo e obrigatorio e a mudanca fica registada em `audit_log` com a acao `vab_correction`. Faturas anuladas nao podem ser corrigidas.

### 8.3 Relatorios e exportacoes

- `GET /api/dashboard/kpis?year=AAAA`: KPIs, faturado anual, VAB faturado e faturacao mensal.
- `GET /api/exports/dashboard.pdf?year=AAAA`: snapshot do Dashboard no ano selecionado.
- `GET /api/exports/billing-annual.pdf?year=AAAA`: PDF horizontal agrupado por mes, com planeado, faturado, VAB faturado, por faturar e VAB por faturar.
- `GET /api/exports/billing-annual.csv?year=AAAA`: exportacao compativel com Excel, uma linha por item/fatura.
- `GET /api/exports/billing-orders.csv?month=AAAA-MM` e `.pdf`: ordem de faturacao de um mes especifico.
- `GET /api/exports/invoices.csv`: faturas ativas em CSV.
- `GET /api/exports/orders.csv`: encomendas ativas com cliente, valor sem IVA, data de conversao e proposta.
- `GET /api/exports/proposals.csv`: propostas com oportunidade, notas, estado, valores e conversao.

O PDF anual usa duas referencias: faturado e VAB faturado pela data de emissao; planeado e por faturar pela data prevista do plano. Linhas planeadas noutro ano, mas faturadas no ano selecionado, aparecem no mes de emissao com planeado zero, para que o total faturado coincida com o Dashboard.
