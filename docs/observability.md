# Observabilidade

O backend exporta traces OpenTelemetry para o Jaeger quando `OTEL_ENABLED=true`.
O Docker Compose inicia o Jaeger em `http://localhost:16686`.

Selecione o serviço `whymob-backend` para consultar a duração dos pedidos HTTP e
das operações MongoDB. Os spans não incluem cabeçalhos, corpos HTTP, filtros de
consulta MongoDB ou dados comerciais.

O Jaeger all-in-one usa armazenamento em memória; os traces são removidos ao
reiniciar o contentor. É indicado para diagnóstico local ou de baixo volume. Em
produção, exponha a UI apenas numa rede protegida e substitua o armazenamento
por um backend persistente antes de depender de retenção histórica.
