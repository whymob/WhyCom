# Observabilidade

O backend exporta traces OpenTelemetry para o Jaeger quando `OTEL_ENABLED=true`.
O Docker Compose inicia o Jaeger em `http://localhost:16686`.

Selecione o serviço `whymob-backend` para consultar a duração dos pedidos HTTP e
das operações MongoDB. Os spans não incluem cabeçalhos, corpos HTTP, filtros de
consulta MongoDB ou dados comerciais.

No desenvolvimento, o Compose usa armazenamento em memória; os traces são
removidos ao reiniciar o contentor. Na simulação de produção com
`docker-compose.production.yml`, o Jaeger usa Badger no volume persistente
`jaeger_data`, com retenção configurada de 14 dias. O contentor de inicialização
ajusta as permissões do diretório de dados para o utilizador não-root do Jaeger.

O volume mantém os traces entre reinícios e recriações dos contentores na mesma
máquina. Não substitui uma estratégia de backup. Em produção, exponha a UI
apenas numa rede protegida e valide backup e recuperação antes de depender da
retenção histórica.
