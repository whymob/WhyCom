# CI desativado temporariamente

O workflow geral do GitHub Actions continua desativado nesta fase do projeto. O workflow independente `dependency-audit.yml` executa auditorias de dependencias, lint/build do frontend e testes unitarios isolados do backend, sem depender de segredos ou de uma base de dados. Os testes de integracao que apontam a servicos externos nao sao executados neste workflow.

Quando voltarmos a ativar CI, a recomendacao e restaurar:

- build do frontend;
- validacao de integridade do backend;
- validacao do `docker-compose`;
- smoke checks read-only em ambiente apropriado.
