# Preenchimento assistido de clientes

O formulário de criação/edição de clientes permite procurar dados a partir de um email profissional ou NIF português. O endpoint continua a aceitar website HTTPS para integrações. A pesquisa é explícita: não acontece ao escrever ou ao abrir o formulário. Nenhum cliente é guardado durante a pesquisa.

## Configuração

Copiar as variáveis de `backend/client_enrichment.env.example` para o ficheiro de ambiente efetivamente usado pelo backend. Por exemplo, `.env` em execução local, `.env.workspace` no compose workspace e `.env.production` no compose de produção.

```dotenv
NIF_PT_API_KEY=colocar-a-chave-real-apenas-no-ambiente
CLIENT_ENRICHMENT_AI_MODEL=
CLIENT_ENRICHMENT_AI_URL=http://127.0.0.1:11434
```

A chave é usada apenas pelo backend, por HTTPS, e nunca aparece nas sugestões, no frontend ou nos links das fontes. Não colocar a URL com chave no repositório. Reiniciar o backend depois da alteração; em Docker, recriar o serviço para recarregar o `env_file`.

Sem chave, a extração do website continua disponível. A API NIF.pt não foi validada com uma chave real durante a implementação.

## Funcionamento e fontes

1. Preencher o email corporativo ou NIF no formulário e selecionar **Enriquecimento de dados**. O botão tem um ícone e fica disponível quando um desses campos é preenchido.
2. O domínio do email é apenas um candidato a website. Para emails pessoais ou sites diferentes do domínio, usar o NIF. O formulário compacto não pede um website adicional.
3. São consultadas até três URLs de conteúdo, incluindo redirecionamentos, e os `robots.txt` necessários. Apenas HTTPS, no domínio indicado e na sua variante com/sem `www`. Não há pesquisa na internet nem navegação em sites terceiros.
4. Os dados são extraídos de JSON-LD de organizações, nome público Open Graph, links `tel:`/`mailto:` e NIF explicitamente identificado no texto. Não é deduzido o nome da pessoa a partir do email.
5. Se houver campos gerais em falta e existir um NIF válido, o NIF.pt é consultado por esse NIF. Não é feita pesquisa ambígua por nome ou email. A resposta deve corresponder exatamente ao NIF. Uma divergência entre NIF indicado e NIF do site descarta as sugestões do site.
6. Os resultados preenchem automaticamente os campos vazios, preservando valores já introduzidos, incluindo alterações feitas durante a consulta. As fontes e avisos ficam numa secção recolhida. O utilizador revê e pode editar os campos antes de guardar; nenhum cliente é guardado automaticamente. Se o email ou NIF mudar durante a pesquisa, a resposta é descartada para evitar aplicar dados de outra empresa.

Nome público e nome legal podem ser diferentes. Telefones/emails extraídos são candidatos a contacto geral, não contactos pessoais verificados. Moradas podem ser de uma instalação em vez da sede. Rever sempre as fontes. Ausência de resultados não impede o preenchimento manual.

## IA local opcional

O processamento inicial funciona sem IA e sem fornecedores de enriquecimento pagos. Para interpretar o texto das páginas com um modelo local, instalar/configurar Ollama separadamente e definir `CLIENT_ENRICHMENT_AI_MODEL` com o nome de um modelo já disponível. Este projeto não descarrega nem inicia modelos automaticamente.

O backend envia apenas os excertos recolhidos ao endpoint Ollama configurado. Em Docker Desktop, se Ollama estiver no host, usar `http://host.docker.internal:11434`, com configuração de rede adequada. O endpoint é configuração administrativa e deve apontar para a instalação de confiança.

O modelo não recebe ferramentas nem executa ações. As respostas são JSON e só se aceitam campos permitidos com valores literalmente presentes no texto da URL citada. Isto reduz invenções, mas não verifica se a frase foi atribuída à entidade certa: a revisão humana continua necessária. O modelo apenas complementa a extração; se falhar, são mantidos os resultados do site. Setor, pessoa de contacto e dados ausentes não são inventados.

## Limites e operação

- `POST /api/clients/enrich` exige a autenticação existente.
- Dez pesquisas por utilizador/minuto; no máximo uma nova recolha por domínio/minuto.
- Cache de resultados de website e de NIF durante 24 horas em MongoDB; não guarda o texto integral recolhido. Índices TTL removem os documentos expirados de cache e quotas, com a latência normal da limpeza MongoDB.
- Os limites do NIF.pt são reservados atomicamente em MongoDB: 1/minuto, 10/hora, 100/dia e 1.000/30 dias. Cache e quotas são partilhados entre réplicas. Pedidos falhados também contam. Outros programas que usem a mesma chave não entram nestes contadores.
- No mínimo um segundo entre pedidos do crawler. Respeita `Crawl-delay` e `Request-rate` reconhecidos; intervalos superiores a dez segundos fazem suspender a consulta.
- `robots.txt` inacessível/ambíguo suspende a recolha. Respostas 401/403/429 e verificações de acesso reconhecidas interrompem a consulta. Não há autenticação em sites, execução de JavaScript, contorno de CAPTCHA nem recolha periódica.
- URLs privadas, IPs internos, portas especiais e redirecionamentos externos são rejeitados. A ligação fixa o IP público validado e mantém a verificação TLS do domínio para evitar DNS rebinding.
- Tamanho máximo de 512 KB por resposta, três URLs de conteúdo e timeouts de rede. Sites que exigem JavaScript ou não publicam dados podem não produzir sugestões.
- A recolha automática não determina autorização jurídica de reutilização. Confirmar as condições dos sites e o enquadramento dos dados usados. `robots.txt` não substitui essa avaliação. A interface não apresenta qualquer garantia de conformidade legal.

Fontes de referência: [NIF.pt API](https://www.nif.pt/api/), [limites NIF.pt](https://www.nif.pt/contactos/api/) e [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309.html).

## Validação

Os testes de `backend/tests/test_client_enrichment.py` usam respostas simuladas, sem consultar sites reais nem consumir créditos. Cobrem bloqueios de rede, robots, extração, fontes, fallback, limites e integração autenticada do endpoint.

No ambiente de desenvolvimento, validar também o fluxo: pesquisar uma empresa autorizada, verificar o preenchimento automático, rever fontes e guardar. Confirmar que campos já preenchidos são preservados. O endpoint e o formulário não mudam as regras de criação do cliente, incluindo o NIF obrigatório.
