# Histórico de alterações

Todas as mudanças relevantes deste projeto são documentadas neste arquivo.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); versões segundo [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [Unreleased]

## [4.4.0] - 2026-11-21

### Security
- Removido o caminho de autenticação privilegiada por `DEV_BYPASS=1` das Pages Functions. Uma variável legada remanescente no painel não concede acesso à API.
- Centralizada e endurecida a verificação do JWT Cloudflare Access: assinatura RS256, algoritmo esperado, emissor, audience, expiração, `nbf`, `iat`, identidade por e-mail e cache JWKS separado por domínio de equipe.
- O middleware `/app/` agora exige token Access validado para os aliases Preview (`*.yolanda-site.pages.dev`) e para o domínio CRC, sem mudar o acesso público da vitrine de produção.
- Bloqueadas requisições de escrita com `Origin` divergente ou `Sec-Fetch-Site: cross-site`; adicionado limite de tamanho e validação de JSON na entrada.
- Endurecidas as verificações de MIME/magic bytes JPEG/WebP, integridade básica do container WebP, limite de 6 MB e validação das chaves de objeto.
- As fotos de imóveis não publicados requerem sessão administrativa válida, com resposta 404 para usuários não autenticados e cache privado para imagens internas.
- As URLs de imagem passam exclusivamente por `/api/media/file/...`, impedindo que uma configuração de domínio público no aplicativo contorne a autorização de leitura.
- Restringidos os identificadores de rota aos formatos `LD-*`, `CRC-*`, `YTI-*`; reforçada a validação de datas e o uso de identificadores SQL previamente definidos.
- Adicionados `Permissions-Policy` e diretrizes CSP seguras compatíveis com os scripts inline legados (`base-uri`, `object-src`, `frame-ancestors`).
- Removido da pasta pública o arquivo binário Windows não referenciado `Microsoft.Services.Store.winmd`. Sua presença não comprova comportamento malicioso.
- Sanitizadas as respostas HTTP de falhas internas; os detalhes ficam nos registros do Worker, não no JSON devolvido ao usuário.

### Refactored
- O roteador legado `/api/[[route]]` foi dividido em módulos internos de autenticação, validações, modelos/serialização, leads, clientes, imóveis, contatos públicos, exportação CSV e despacho de rotas.
- Preservado o endpoint dedicado de mídia `/api/media/[[path]]`, sem misturar upload binário com o CRUD JSON.
- As variantes de nomes `[[route]].js` e `%5B%5Broute%5D%5D.js` encaminham para o mesmo roteador, eliminando cópias divergentes.
- Extraídos os scripts do CRM em arquivos clássicos independentes e carregados na mesma ordem para manter IDs, eventos inline e variáveis compartilhadas.
- Extraído o script da vitrine do HTML para `/js/vitrine-app.js`, mantendo seu escopo original de função autoexecutável.
- Criadas fixtures de autenticação JWT assinada exclusivamente no processo de testes, sem backdoor de produção.

### Changed
- A versão da API de diagnóstico e dos metadados de resolução de disputa passa a `4.4.0`, mantendo a estrutura das respostas.
- Versão do pacote Node sincronizada com a release (`4.4.0`).
- O conteúdo estático do projeto passa a conter os scripts extraídos com cache-busting `?v=4.4.0`.
- As imagens de imóveis indisponíveis ou excluídos continuam visíveis aos usuários internos autenticados, mas não publicamente.

### Fixed
- Corrigido o acesso ao CRM nos aliases Preview quando o usuário já passou pelo Cloudflare Access, eliminando a antiga dependência do bypass.
- Corrigido o cache de chaves JWT para não reutilizar chaves de diferentes domínios de equipe.
- Impedida a aceitação de containers WebP incompletos ou com tamanho RIFF inconsistente.
- Evitada a publicação indevida de fotos de imóveis retirados do catálogo.

### Compatibility
- Não foram alterados os bindings do `wrangler.toml`, as oito migrations existentes nem os nomes das rotas de API.
- As regras de disputa e associação Lead ↔ Imóvel da versão 4.3.8 permanecem iguais nos ambientes Preview e Production.
- **Pré-requisito:** configurar `ACCESS_TEAM_DOMAIN` e `ACCESS_AUD` também no Preview antes de publicar; sem essas variáveis, o acesso administrativo falhará de forma segura (503).
- Não há nova migration para esta versão.

## [4.3.8] - 2026-11-21

### Changed
- Unificadas as regras de disputa de leads e a integração de mídia R2 entre Preview e Production, preservando os recursos separados de D1 e R2.
