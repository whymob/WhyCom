# Smoke Check Read-Only

## Objetivo

Validar rapidamente que a API responde, autentica e serve os principais endpoints de leitura sem criar, editar ou apagar dados.

## O que verifica

- `GET /api/health`
- `POST /api/auth/login`
- `GET /api/auth/me`
- endpoints principais de leitura de master data, pipeline, dashboards, analytics, projetos e auditoria

## Como executar

Com backend acessivel:

```powershell
python scripts/smoke_readonly.py
```

Alternativa com pytest:

```powershell
cd backend
pytest tests/test_readonly_smoke.py -q -n 0
```

Se precisares de apontar para outro host:

```powershell
$env:WHYCOM_BACKEND_URL="http://localhost:8000"
python scripts/smoke_readonly.py
```

Se precisares de usar outras credenciais:

```powershell
$env:WHYCOM_SMOKE_EMAIL="admin@whymob.pt"
$env:WHYCOM_SMOKE_PASSWORD="admin123"
python scripts/smoke_readonly.py
```

## Notas

- este smoke check nao faz `POST`, `PATCH` ou `DELETE` nos fluxos de negocio;
- e seguro para ambientes com dados ja existentes;
- o teste `backend/tests/test_readonly_smoke.py` segue a mesma regra e pode ser usado em CI local;
- serve como validacao minima apos merge, rebuild de container ou troca de configuracao.
