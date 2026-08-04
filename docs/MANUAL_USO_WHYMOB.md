# Manual de Uso WhyMob CRM

## 1. Objetivo da ferramenta

O WhyMob CRM é uma plataforma de gestão comercial B2B desenhada para acompanhar o ciclo completo de relacionamento com o cliente, desde a identificação da oportunidade até ao controlo técnico, faturação, recebimentos e reporting.

O fluxo principal da operação segue esta lógica:

- Lead
- Oportunidade
- Proposta
- Encomenda
- Projeto
- Faturação
- Recebimento
- Reporting

## 2. Perfis de utilização

Os utilizadores da plataforma podem ter perfis diferentes, com permissões adaptadas à sua função.

- `admin`: administração geral, utilizadores e configuração operacional
- `ceo`: visão executiva e acesso transversal
- `diretor_tecnico`: acompanhamento técnico e projetos
- `comercial`: gestão diária do pipeline comercial
- `developer`: registo técnico e timesheet

Nota:

- algumas ações, como criar ou editar utilizadores, estão reservadas ao perfil `admin`

## 3. Acesso à aplicação

### 3.1 Login

Ao entrar no sistema, o utilizador deve autenticar-se com email e palavra-passe.

No ecrã de login:

- introduza o email
- introduza a palavra-passe
- clique em `Aceder`

Após autenticação com sucesso, o sistema redireciona para o `Dashboard Comercial`.

### 3.2 Encerrar sessão

Para terminar a sessão:

- use a opção `Terminar sessão` no menu lateral

## 4. Navegação principal

O menu lateral organiza a aplicação em dois grandes blocos.

### 4.1 Ciclo Comercial

- Dashboard
- Funil de Vendas
- Leads
- Oportunidades
- Propostas
- Encomendas
- Reporting
- Projetos
- Timesheet

### 4.2 Master Data

- Clientes
- Fabricantes
- Produtos
- Utilizadores
- Auditoria

## 5. Dashboard Comercial

O dashboard é a vista inicial da operação. Serve para leitura rápida do estado do negócio.

Principais elementos:

- KPIs de leads abertas
- KPIs de oportunidades em aberto
- propostas em curso
- taxa de conversão
- valor ganho
- VAB ganho
- encomendas criadas
- top fabricantes por VAB
- alertas e desvios

Utilização recomendada:

- usar no arranque do dia para perceber o estado do pipeline
- acompanhar alertas que precisem de intervenção
- validar se o volume ganho e o VAB estão alinhados com a meta

## 6. Funil de Vendas

O módulo de funil oferece uma leitura agregada do pipeline por fase e pode ser usado para análise comercial.

Recomendações:

- acompanhar a progressão entre leads, oportunidades e propostas
- usar filtros por fabricante sempre que necessário
- apoiar reuniões comerciais com esta vista

## 7. Gestão de Leads

As leads representam necessidades identificadas no início do ciclo comercial.

### 7.1 Criar uma lead

Na página `Leads`:

- clique em `Nova lead`
- selecione o cliente já existente ou indique o nome do prospect
- preencha a descrição da necessidade
- indique o valor estimado
- defina o estado inicial
- clique em `Guardar`

### 7.2 Editar uma lead

Enquanto a lead não estiver convertida nem descartada, é possível:

- editar dados
- rever descrição
- ajustar valor estimado
- atualizar estado operacional

### 7.3 Converter lead em oportunidade

Quando a necessidade estiver qualificada:

- clique no botão de conversão da lead

Resultado:

- a lead passa para `convertida`
- é criada uma oportunidade no sistema

### 7.4 Descartar uma lead

Quando a lead não avança:

- clique na ação de descarte
- preencha o motivo
- confirme

## 8. Gestão de Oportunidades

As oportunidades representam negócios em análise ou negociação.

### 8.1 Criar uma oportunidade

Na página `Oportunidades`:

- clique em `Nova oportunidade`
- associe o cliente
- descreva a oportunidade
- indique valor estimado
- indique VAB estimado
- defina probabilidade
- escolha prioridade
- registe concorrente, se aplicável
- adicione notas de contexto
- guarde

### 8.2 Evoluir a oportunidade

O sistema permite:

- editar a oportunidade
- rever prioridade e probabilidade
- ajustar valor e VAB
- atualizar notas comerciais

### 8.3 Converter oportunidade em proposta

Quando a solução já está estruturada:

- use a ação de conversão

Resultado:

- a oportunidade passa para `convertida`
- é criada uma proposta

### 8.4 Marcar oportunidade como perdida

Se o negócio for perdido:

- selecione a ação correspondente
- registe o motivo
- confirme

## 9. Gestão de Propostas

As propostas consolidam a oferta comercial enviada ao cliente.

Na listagem de propostas, o utilizador pode acompanhar:

- número da proposta
- cliente
- total sem IVA
- VAB
- estado
- data e versão

### 9.1 Estados principais

- `em_elaboracao`
- `enviada`
- `em_negociacao`
- `ganha`
- `perdida`
- `expirada`

### 9.2 Converter proposta ganha em encomenda

Quando a proposta for ganha:

- entre no detalhe ou utilize a ação disponível
- converta em encomenda

Resultado:

- a proposta fica associada à encomenda criada

## 10. Gestão de Encomendas

As encomendas representam o compromisso formal após aceitação da proposta.

Na página `Encomendas`, o utilizador pode:

- consultar número da encomenda
- associar ou rever PO do cliente
- acompanhar valor e VAB
- atualizar o estado operacional

### 10.1 Atualizar PO

Na coluna `PO`:

- introduza o número da ordem de compra
- a atualização é aplicada quando o campo perde foco

### 10.2 Estados de encomenda

- `aberta`
- `em_planeamento`
- `em_faturacao`
- `parcialmente_faturada`
- `faturada`
- `recebida`
- `fulfilled`
- `cancelada`

### 10.3 Regra Fulfilled

Uma encomenda só deve atingir o estado `fulfilled` quando houver reconciliação total entre:

- valor da encomenda
- valor planeado
- valor faturado
- valor recebido

## 11. Reporting

O módulo de reporting reúne dashboards analíticos e exportações.

Abas principais:

- Executivo
- Por Comercial
- Por Cliente
- Por Fabricante
- Previsões
- Análise VAB

### 11.1 Vista Executiva

Permite acompanhar:

- valor ganho
- VAB ganho
- encomendas
- total em aberto para receber
- previsão de faturação
- aging de recebimentos

### 11.2 Exportações disponíveis

No reporting, o utilizador pode exportar:

- dashboard em PDF
- ordem de faturação por mês
- faturas em CSV
- reporting comercial em CSV
- timesheet em CSV

### 11.3 Ordem de faturação

Para gerar:

- abra a ação `Ordem faturação`
- indique o mês no formato `AAAA-MM`
- escolha `CSV` ou `PDF`
- descarregue

## 12. Projetos

O módulo técnico liga a execução à encomenda.

### 12.1 Criar projeto

Na página `Projetos`:

- clique em `Novo projeto`
- selecione a encomenda
- indique nome do projeto
- defina horas previstas
- indique o valor faturável por hora
- guarde

### 12.2 Consulta de projetos

Na listagem, é possível acompanhar:

- nome do projeto
- encomenda associada
- horas previstas
- valor faturável por hora
- estado técnico

## 13. Timesheet

O módulo `A minha timesheet` serve para registo de horas do utilizador nas alocações atribuídas.

### 13.1 Indicadores principais

- total de horas
- horas faturáveis
- número de projetos alocados

### 13.2 Registar horas

Para registar:

- clique em `Registar`
- selecione o projeto
- indique a data
- indique o número de horas
- adicione a descrição
- marque se o registo é faturável
- confirme

### 13.3 Exportar timesheet

O utilizador pode descarregar a sua timesheet em CSV.

## 14. Clientes, Fabricantes e Produtos

Os módulos de `Master Data` garantem consistência operacional.

### 14.1 Clientes

Usar para:

- criar clientes
- editar dados comerciais e de contacto
- manter informação de segmento

### 14.2 Fabricantes

Usar para:

- registar fabricantes
- classificar o tipo de parceria

### 14.3 Produtos

Usar para:

- manter catálogo comercial
- associar fabricante
- definir categoria, unidade, preço base e custo base

## 15. Utilizadores

O módulo de utilizadores permite administração da equipa.

### 15.1 Criar utilizador

Disponível para `admin`:

- nome
- email
- palavra-passe
- cargo

### 15.2 Editar utilizador

Disponível para `admin`:

- atualizar nome
- atualizar email
- atualizar cargo
- alterar estado ativo ou inativo
- definir nova palavra-passe

Notas operacionais:

- deixar o campo da nova palavra-passe em branco mantém a palavra-passe atual
- o próprio utilizador não pode alterar o próprio cargo
- o próprio utilizador não pode inativar a própria conta

## 16. Auditoria

O módulo `Auditoria` permite rastrear alterações relevantes no sistema.

Cada registo apresenta:

- data e hora
- utilizador
- ação
- entidade
- detalhe da alteração
- motivo, quando aplicável

É recomendado para:

- controlo interno
- análise de histórico
- validação de alterações críticas

## 17. Boas práticas de utilização

- manter clientes, produtos e fabricantes atualizados antes de avançar no pipeline
- registar sempre motivos de perda em leads e oportunidades
- rever VAB estimado e valor estimado antes de converter oportunidades
- corrigir VAB faturado apenas com perfil administrador e motivo registado
- confirmar a PO do cliente nas encomendas
- usar reporting para acompanhamento semanal e mensal
- manter a timesheet atualizada diariamente
- usar auditoria para verificação de mudanças críticas

## 18. Resumo do fluxo recomendado

- criar ou qualificar lead
- converter lead em oportunidade
- estruturar e converter oportunidade em proposta
- marcar proposta ganha e gerar encomenda
- abrir projeto quando existir componente técnica
- planear, faturar e reconciliar recebimentos
- acompanhar resultados em dashboard e reporting

## 14. Regras de reporting e exportacao

O seletor de ano do Dashboard e do Reporting e aplicado aos indicadores e aos graficos.

- `Faturado no ano`: soma faturas ativas pela data real de emissao (`invoices.issued_at`), sem IVA.
- `VAB faturado no ano`: calcula o VAB proporcional ao valor sem IVA efetivamente faturado no ano.
- Faturas anuladas e encomendas canceladas/anuladas nao entram nos indicadores.
- O grafico mensal usa a data real de emissao da fatura.
- O PDF anual usa a data de emissao para os totais faturados. A data prevista do plano fica no detalhe e nao exclui uma fatura emitida no ano.
- Planeado e por faturar continuam agrupados pela data prevista (`plan_lines.expected_date`).

Os botoes `Faturacao anual PDF` e `Faturacao anual Excel/CSV` permitem exportar o ano completo ou um periodo de meses dentro do ano selecionado. O PDF e agrupado por mes e mostra planeado, faturado, VAB faturado, por faturar e VAB por faturar, incluindo o total mensal, sem a coluna de item/fatura. O CSV abre diretamente no Excel e contem uma linha por item/fatura, com valores em EUR, separador decimal por virgula e meses em formato portugues.

Exportacoes principais: Dashboard PDF por ano; ordem de faturacao por mes; faturas CSV; reporting comercial CSV; encomendas com propostas; propostas CSV; e faturacao anual PDF/CSV.

## 19. Suporte interno

Em caso de erro operacional ou dúvida de processo:

- validar primeiro se os dados base estão corretamente preenchidos
- confirmar se o perfil do utilizador tem permissões suficientes
- rever o histórico em auditoria
- escalar para administração da plataforma quando o bloqueio for de acesso, dados ou configuração
