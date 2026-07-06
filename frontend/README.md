# Frontend WhyMob CRM

Aplicação React do WhyMob CRM, responsável pela experiência de utilizador do ciclo comercial, financeiro e técnico.

## Stack

- React 19
- React Router 7
- Tailwind CSS
- Shadcn UI / Radix UI
- Axios
- Recharts
- CRACO

## Arranque local

Criar `.env`:

```powershell
Copy-Item .env.example .env
```

Instalar dependências:

```powershell
npm.cmd install
```

Executar em desenvolvimento:

```powershell
npm.cmd start
```

Gerar build:

```powershell
npm.cmd run build
```

## Variáveis de ambiente

- `REACT_APP_BACKEND_URL`
- `ENABLE_HEALTH_CHECK` opcional

## Estrutura principal

```text
src/pages/         Ecrãs principais
src/components/    Layout e componentes reutilizáveis
src/components/ui/ Primitivas UI
src/context/       Contextos de aplicação
src/lib/           API, formatação e utilitários
```

## Notas

- O frontend assume que a API está disponível em `REACT_APP_BACKEND_URL`.
- A plataforma original de exportação incluía dependências e artefactos extra; este frontend já foi limpo para instalação local mais previsível.
