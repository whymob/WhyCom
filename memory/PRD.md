# PRD WhyMob CRM

## Propósito

O WhyMob CRM apoia a gestão comercial B2B da identificação de uma lead ao acompanhamento de encomendas, faturação, recebimentos e execução técnica. O produto serve equipas comerciais, gestão e equipa técnica, com interface em português e valores apresentados em EUR.

Este PRD descreve o âmbito que existe no código consultado em 13/10/2026. Não constitui confirmação de que todos os módulos estejam ativos ou validados em produção.

## Utilizadores e necessidades

| Perfil | Necessidade principal |
| --- | --- |
| Admin | Administrar utilizadores e operações reservadas, consultar auditoria e gerir dados. |
| CEO | Acompanhar indicadores globais e atividade. |
| Comercial | Gerir leads, oportunidades, propostas, follow-ups e encomendas da sua carteira. |
| Diretor técnico | Acompanhar projetos e informação de execução técnica. |
| Developer | Consultar alocações e registar horas nos projetos atribuídos. |

As permissões são aplicadas por endpoint e operação; não se deve inferir acesso irrestrito apenas pelo nome do perfil.

## Âmbito implementado

### Ciclo comercial

- Clientes, fabricantes, produtos e utilizadores.
- Leads e oportunidades com estados, responsáveis e campos comerciais.
- Conversões Lead → Oportunidade → Proposta → Encomenda, com estados e validações próprios.
- Propostas com linhas, preço, desconto, IVA, custo/VAB, validade, anexos e substituição por nova proposta.
- Quadro comercial, página de trabalho diário e histórico/próxima ação.
- Funil de vendas com vistas por origem e por movimentação, filtros temporais e de fabricante.

### Ciclo financeiro

- Plano de faturação associado a encomendas.
- Faturas com faturação parcial e agregação de linhas de plano.
- Recebimentos individuais e importação com pré-conciliação.
- Anulação controlada de faturas/pagamentos, reconciliação da encomenda e cálculo do estado financeiro.
- Correção auditada do VAB faturado.

### Execução, reporting e suporte

- Projetos ligados a encomendas, alocações e timesheet.
- Dashboard, reporting por comercial/cliente/fabricante, previsões e análise de VAB.
- Exportações em CSV, XLSX e PDF conforme a operação.
- Pesquisa global, auditoria, alertas e notificações por email, incluindo digest programado.

Os estados e regras detalhados estão em [Análise Funcional e Regras de Negócio](../docs/ANALISE_FUNCIONAL_E_REGRAS_NEGOCIO.md).

## Requisitos do produto

1. O sistema deve manter a relação entre lead, oportunidade, proposta e encomenda nas conversões.
2. Deve impedir conversões que não atendam aos estados ou dados mínimos requeridos.
3. Deve separar valor líquido, IVA, valor bruto e VAB, mantendo as regras consistentes nas operações financeiras.
4. Deve permitir consulta de indicadores por período sem confundir data de criação, data de movimento, data prevista e data real de emissão.
5. Deve restringir dados e ações conforme autenticação, perfil e carteira comercial aplicáveis.
6. Deve registar operações críticas e exigir motivos nas alterações em que a regra de negócio o determina.
7. Deve permitir acompanhar planeamento, faturação e recebimentos até à reconciliação da encomenda.
8. Deve permitir acompanhar custo técnico e horas no contexto do projeto.

## Restrições técnicas atuais

- Frontend: React, React Router, Tailwind, Radix/Shadcn, Axios, Recharts e CRACO.
- Backend: FastAPI, Pydantic, MongoDB via Motor/PyMongo, JWT, APScheduler e integração opcional Resend.
- Configuração por variáveis de ambiente; o modo local e a simulação Docker estão descritos em `docs/`.
- OpenTelemetry/Jaeger é opcional, conforme configuração.

Requisitos não funcionais e lacunas operacionais estão em [Requisitos Não Funcionais](../docs/REQUISITOS_NAO_FUNCIONAIS.md).

## Backlog e decisões pendentes

Este backlog contém apenas itens que não estão integralmente resolvidos como capacidade de produto ou operação. Não repetir aqui módulos já implementados.

- Definir se o estado de encomenda `em_faturacao` será atribuído, removido ou substituído por um estado derivado.
- Formalizar transições permitidas e regras de reabertura para leads e oportunidades convertidas.
- Definir fluxo e limite de aprovação interna de propostas com VAB baixo, se necessário ao processo comercial.
- Definir metas não funcionais de disponibilidade, desempenho, recuperação e acessibilidade.
- Fechar estratégia de backups/restauro, CI/CD e escalabilidade do scheduler para produção.
- Decidir evolução da stack frontend e cobertura automatizada de UI.

## Critérios de aceite para alterações futuras

- Regras novas ou alteradas devem ser documentadas na análise funcional e verificadas contra backend e frontend.
- Regras de faturação devem manter coerência entre valor líquido, IVA, bruto, recebimento e VAB.
- Alterações de permissões devem ser verificadas nos endpoints e na interface.
- Documentação operacional deve corresponder à configuração dos compose files e exemplos de ambiente.
- A execução dos testes deve ser registada como evidência separada; a existência de testes não prova que passaram nesta revisão.
