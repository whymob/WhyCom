# Requisitos Não Funcionais e Estado Técnico

Este documento regista características técnicas observáveis e requisitos operacionais ainda por fechar. “Implementado” descreve comportamento encontrado no repositório; “Parcial” indica dependência de configuração ou cobertura incompleta. As recomendações não devem ser interpretadas como garantias do ambiente em produção.

## Segurança e controlo de acesso

| ID | Requisito/característica | Estado observado |
| --- | --- | --- |
| RNF-01 | Autenticação de API | Implementado com JWT Bearer; o segredo é fornecido por `JWT_SECRET`. |
| RNF-02 | Autorização por perfil | Implementada em rotas e operações específicas. Deve ser revista ao adicionar novos endpoints. |
| RNF-03 | Separação de segredos por ambiente | Suportada por ficheiros/variáveis de ambiente; a gestão segura depende do operador. Não commitar ficheiros `.env` reais. |
| RNF-04 | CORS | Configurável com `CORS_ORIGINS`; o código usa `*` como fallback quando a variável não está definida. Em ambientes expostos, definir origens explícitas. |
| RNF-05 | Auditoria | Há registo de alterações críticas em várias operações; não há evidência de auditoria universal para todas as alterações. |

## Disponibilidade e recuperação

| ID | Requisito/característica | Estado observado |
| --- | --- | --- |
| RNF-06 | Health check | `/api/health` verifica a aplicação e a ligação Mongo; pode reportar degradação. |
| RNF-07 | Persistência | MongoDB é a persistência principal. Docker local oferece volume de dados; isso, por si só, não constitui backup. |
| RNF-08 | Backups e recuperação | Estratégia, frequência, retenção e testes de restauro continuam por definir no ambiente real. |
| RNF-09 | Notificações | Envio via Resend é opcional e depende de chave, remetente, destinatários e configuração externa. |

## Desempenho e observabilidade

| ID | Requisito/característica | Estado observado |
| --- | --- | --- |
| RNF-10 | Observabilidade de pedidos | OpenTelemetry para Jaeger é opcional (`OTEL_ENABLED`); configuração Docker e retenção variam por compose. |
| RNF-11 | Logging | Backend emite logs de aplicação e scheduler; níveis, agregação central e alertas dependem do ambiente. |
| RNF-12 | Desempenho e escalabilidade | Não foram encontrados objetivos/SLOs de latência, volume ou concorrência formalizados. Scheduler executado no processo da aplicação requer decisão explícita ao escalar réplicas. |

## Compatibilidade e manutenção

| ID | Requisito/característica | Estado observado |
| --- | --- | --- |
| RNF-13 | Idioma e moeda | Interface orientada a PT-PT e valores em EUR; detalhes de localização devem continuar consistentes nas exportações. |
| RNF-14 | Execução local | Há guias para execução nativa e Docker. Variáveis obrigatórias incluem `MONGO_URL`, `DB_NAME`, `JWT_SECRET` e `REACT_APP_BACKEND_URL`. |
| RNF-15 | Verificações automatizadas | Existem testes backend, smoke de leitura e scaffold Playwright. A cobertura e a execução contínua dependem de ambiente e CI. |
| RNF-16 | Suporte de browsers e acessibilidade | Não foi encontrada matriz suportada de browsers nem meta de conformidade WCAG formal. |

## Decisões em aberto para produção

- Definir metas mensuráveis de disponibilidade, latência e recuperação (RPO/RTO).
- Documentar responsável, política e prova periódica de restauro das bases.
- Definir gestão de secrets, rotação de `JWT_SECRET`, domínios/TLS e origens CORS.
- Decidir estratégia para o scheduler em múltiplas réplicas e para persistência do job store.
- Definir retenção de auditoria, anexos, logs e traces, bem como perfis de acesso.
- Estabelecer pipeline de CI/CD, gates de release e smoke pós-deploy.
- Escolher browsers suportados e nível de acessibilidade esperado.

## Configuração relacionada

Consultar [Ambientes e Variáveis](AMBIENTES_E_VARIAVEIS.md), [Deploy e Operação](DEPLOY_E_OPERACAO.md), [Observabilidade](observability.md), [Setup Local](SETUP_LOCAL.md) e [Docker Local](DOCKER_LOCAL.md).
