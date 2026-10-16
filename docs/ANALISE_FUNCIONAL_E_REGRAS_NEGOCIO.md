# Análise Funcional e Regras de Negócio

Este documento descreve os fluxos funcionais observáveis no WhyMob CRM e as regras aplicadas pelo backend. Serve como referência para utilizadores, análise e manutenção. As regras devem ser revistas quando os modelos ou as rotas de `backend/routers/` forem alterados.

## Âmbito funcional

O sistema suporta autenticação e perfis de acesso, dados mestre, gestão do pipeline comercial, planeamento/faturação/recebimentos, reporting, execução técnica, auditoria, pesquisa e notificações.

O percurso central é:

`Lead → Oportunidade → Proposta → Encomenda → Plano de faturação → Fatura → Recebimento`

Projetos e timesheet acompanham a execução técnica ligada a encomendas, mas não são uma transição obrigatória para todos os negócios.

## Requisitos funcionais observados

| ID | Capacidade | Comportamento disponível |
| --- | --- | --- |
| RF-01 | Autenticação | Login, sessão com token e consulta do utilizador autenticado. |
| RF-02 | Acesso por perfil | Restringe operações conforme perfil; utilizadores e ações administrativas têm verificações próprias no backend. |
| RF-03 | Dados mestre | Gerir clientes, fabricantes, produtos e utilizadores. |
| RF-04 | Pipeline | Criar e acompanhar leads, oportunidades e propostas; converter entre as entidades com condições específicas. |
| RF-05 | Encomendas | Criar encomenda a partir de proposta ganha e acompanhar o respetivo estado operacional e financeiro. |
| RF-06 | Faturação e recebimentos | Manter plano por encomenda, emitir faturas, registar/importar recebimentos e reconciliar valores. |
| RF-07 | Reporting | Consultar dashboard, funil e análises por comercial, cliente, fabricante, previsão e VAB. |
| RF-08 | Execução técnica | Criar projetos ligados a encomendas, alocar developers e registar horas. |
| RF-09 | Auditoria | Consultar alterações relevantes e respetivos motivos quando registados. |
| RF-10 | Exportação | Exportar dados operacionais e relatórios em CSV, XLSX ou PDF, conforme o relatório. |
| RF-11 | Trabalho comercial | Consultar quadro de trabalho, próximas ações e histórico de follow-up. |
| RF-12 | Notificações | Enviar notificações de eventos e digest de alertas quando a configuração de email está ativa. |

## Regras de negócio

### Leads

| Estado | Significado e entrada |
| --- | --- |
| `nova` | Estado inicial. |
| `em_qualificacao` | Lead em avaliação comercial. A conversão exige este estado. |
| `convertida` | Aplicado quando se converte a lead; o sistema cria oportunidade ligada e regista a referência/data de conversão. |
| `descartada` | Encerrada sem avançar; requer motivo. |

### Oportunidades

| Estado | Significado e entrada |
| --- | --- |
| `aberta` | Estado inicial, incluindo oportunidade criada a partir de lead convertida. |
| `em_analise` | Avaliação da oportunidade. A conversão para proposta exige este estado. |
| `convertida` | Aplicado ao criar proposta a partir da oportunidade; guarda a referência da proposta. |
| `perdida` | Encerrada sem proposta; requer motivo. |

### Propostas

| Estado | Significado e entrada |
| --- | --- |
| `em_elaboracao` | Estado inicial, inclusive quando criada a partir de oportunidade. |
| `enviada` | Proposta enviada. Requer linhas válidas, anexo e informação de envio e acompanhamento exigida pela validação. |
| `em_negociacao` | Discussão comercial posterior ao envio. O avanço normal percorre uma etapa de cada vez. |
| `ganha` | Aceite comercial; no fluxo normal só pode ser atingido a partir de `em_negociacao`. Permite gerar encomenda. |
| `perdida` | Negócio encerrado sem aceite; requer motivo. |
| `expirada` | Proposta vencida/encerrada; requer justificação da alteração. |
| `substituida` | Versão anterior substituída ao criar outra proposta para a oportunidade. A proposta substituída fica bloqueada para edição. |

Uma regressão de etapa requer justificação. Uma proposta ligada a encomenda não permite alterar estado nem linhas. A reabertura é restrita a administrador e depende de encomenda cancelada e de faturas/recebimentos anulados.

### Encomendas

Uma encomenda é criada a partir de proposta `ganha`, começa em `aberta` e fica ligada à proposta, oportunidade e cliente.

| Estado | Regra observada |
| --- | --- |
| `aberta` | Estado inicial ou resultado do recálculo quando não há faturação e não existe plano ativo. |
| `em_planeamento` | Há pelo menos uma linha de plano ativa, mas ainda não existe valor faturado. |
| `em_faturacao` | Estado declarado no modelo e considerado em algumas listas de trabalho. Não foi encontrada regra de recálculo financeiro que o atribua automaticamente. |
| `parcialmente_faturada` | O valor líquido faturado é maior que zero e inferior ao valor líquido total da encomenda. |
| `faturada` | O total líquido faturado cobre o total líquido da encomenda, mas os recebimentos ainda não cobrem o total bruto das faturas. |
| `recebida` | O total bruto recebido cobre o total bruto faturado. |
| `fulfilled` | Reconciliação completa: valor líquido da encomenda = plano ativo = faturação líquida, e recebimentos = faturação bruta. A tolerância é de 0,01 €. |
| `cancelada` | Cancelamento com motivo, permitido após anulação de faturas e recebimentos ativos; exige perfil administrativo. |

O recálculo ocorre em operações financeiras relevantes. O plano e a faturação são comparados sem IVA; recebimentos são comparados com o bruto faturado. Os estados financeiros são, portanto, derivados dos dados associados, não simplesmente etapas comerciais manuais.

### Faturas e recebimentos

- O plano de faturação é associado à encomenda e as linhas podem ser faturadas parcialmente ou agregadas.
- Faturas têm estados próprios (`emitida`, `parcialmente_recebida`, `recebida`, `anulada`), separados do estado da encomenda.
- O recebimento total de uma fatura é avaliado pelo valor bruto com IVA.
- Anular fatura exige motivo e reverte os valores faturados correspondentes.
- A importação de recebimentos tem pré-conciliação antes da confirmação; a confirmação volta a validar o saldo em aberto.
- Correção de VAB faturado não altera o valor da fatura, exige motivo e fica auditada.

### Projetos e horas

- Projeto é ligado a uma encomenda.
- Alocações guardam custo/hora e horas previstas; registos de tempo suportam data, descrição e indicação de faturável.
- Custo técnico real é calculado a partir de horas registadas e custo/hora. O VAB real é derivado do valor da encomenda menos esse custo.

### Reporting e períodos

- A vista **Por origem** acompanha leads criadas no período selecionado, mesmo que avancem de fase noutro período.
- A vista **Por movimentação** mede atividade/movimentação ocorrida no período selecionado, conforme a lógica do funil.
- Indicadores anuais de faturação usam a data efetiva de emissão da fatura; valores faturados são apresentados sem IVA.
- O VAB faturado é proporcional às linhas faturadas no período, recorrendo ao valor de VAB guardado na linha quando disponível.
- Planeamento e valor por faturar usam a data prevista da linha do plano, que não substitui a data de emissão.
- Faturas anuladas e encomendas canceladas são excluídas dos indicadores aplicáveis.

## Pontos que exigem decisão de produto

1. Definir se `em_faturacao` deve ser removido, aplicado manualmente ou atribuído por um evento específico.
2. Formalizar no produto quais transições de leads e oportunidades podem ser alteradas manualmente e quais devem ser bloqueadas depois de conversão.
3. Definir política de retenção e acesso a anexos e dados pessoais.
4. Rever as regras desta página contra o comportamento desejado sempre que houver divergência entre UI, API e processo comercial.

## Fontes de implementação

- `backend/models.py`
- `backend/routers/pipeline.py`
- `backend/routers/finance.py`
- `backend/helpers.py`
- `backend/routers/analytics.py`
- `frontend/src/pages/Funnel.jsx`
