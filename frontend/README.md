# Frontend WhyMob CRM

Aplicacao React do WhyMob CRM, responsavel pela experiencia de utilizador do ciclo comercial, financeiro e tecnico.

## Stack

- React 19
- React Router 7
- Tailwind CSS
- Shadcn UI / Radix UI
- Axios
- Recharts
- Vite 8

## Arranque local

Criar `.env`:

```powershell
Copy-Item .env.example .env
```

Instalar dependencias:

```powershell
npm.cmd ci
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

- `VITE_BACKEND_URL`
- `VITE_ALLOW_PROPOSAL_ATTACHMENT_AFTER_ORDER`
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

- o frontend usa `VITE_BACKEND_URL` em desenvolvimento local; os containers leem `REACT_APP_BACKEND_URL` em runtime para manter a mesma imagem em varios ambientes;
- o frontend usa `package-lock.json`; instalar com `npm.cmd ci` para reproduzir o ambiente travado;
- se um merge reintroduzir conflitos em paginas complexas, o build do frontend costuma acusar isso imediatamente.
