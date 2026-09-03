# Frontend WhyMob CRM

Aplicacao React do WhyMob CRM, responsavel pela experiencia de utilizador do ciclo comercial, financeiro e tecnico.

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

Instalar dependencias:

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

## Variaveis de ambiente

- `REACT_APP_BACKEND_URL`
- `ENABLE_HEALTH_CHECK` opcional

## Estrutura principal

```text
src/pages/         Ecras principais
src/components/    Layout e componentes reutilizaveis
src/components/ui/ Primitivas UI
src/context/       Contextos de aplicacao
src/lib/           API, formatacao e utilitarios
```

## Notas

- o frontend assume que a API esta disponivel em `REACT_APP_BACKEND_URL`;
- o frontend ja foi ajustado para instalar corretamente com `npm.cmd install`;
- se um merge reintroduzir conflitos em paginas complexas, o build do frontend costuma acusar isso imediatamente.
