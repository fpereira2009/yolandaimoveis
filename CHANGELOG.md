# Release 4.8.0

## [4.8.0]
### Added
- Página 404 e testes SEO.
- Descrição pública automática quando não houver texto personalizado.
- Migration 0012: novos slugs sem 0-quartos; URLs existentes preservadas e redirecionamento 301 após edição.
### Changed
- Metadados da home e schema de imóveis; suíte Node consolidada.
### Fixed
- Singular/plural, atributos zero e breadcrumb; vagas de garagem permanecem explícitas inclusive quando zero.
- Descrições sem conteúdo visível usam o fallback compartilhado entre vitrine e ficha. Descrições personalizadas e o valor administrativo são preservados.
- Card e modal distinguem zero vagas de um valor ausente, exibido como “Consultar”.
- O `BreadcrumbList` usa a origem canônica da ficha em Preview e produção. O diagnóstico autenticado acompanha a versão `4.8.0`.
- Documentadas as verificações, a recuperação e a pendência de atomicidade remota da migration `0012` em Preview.

Histórico recuperado do commit e70e189; releases intermediárias possuem documentos próprios.

# Histórico de alterações

Todas as mudanças relevantes deste projeto são documentadas neste arquivo.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); versões segundo [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [Unreleased]

Nenhuma alteração pendente registrada.

## [4.5.3-hotfix-1] - 2026-11-22

### Fixed
- O campo **Tipo** no modal de **Novo Imóvel** e **Editar Imóvel** agora é um dropdown nativo (`select`), com as opções: Casa, Apartamento, Terreno, Comercial, Chácara/Sítio e Cobertura. O controle substitui o antigo `input` com `datalist`, preservando `id="prop-type"`, estilos, responsividade e o mesmo contrato de gravação.
- Ao editar imóvel antigo com tipo personalizado, o sistema preserva esse valor como opção temporária do dropdown, sem sobrescrever o cadastro. Ao abrir Novo Imóvel, a opção legada é removida e o tipo retorna para Casa.
- Atualizada somente a referência de cache do script `crm-properties.js` para `?v=4.5.3-hf1`.

### Compatibility
- Nenhuma alteração em banco D1, migrations, bindings R2, rotas da API, regras de leads, autenticação, fotos, valores monetários ou identidade visual.
- Correção destinada à homologação na branch `dev`, sem deploy remoto neste pacote. O pacote permanece na linha de versão 4.5.3.

## [4.5.3] - 2026-11-21

### Fixed
- O campo **Valor (R$)** do formulário de **Novo Imóvel** e **Editar Imóvel** (`prop-price`) passa a usar máscara monetária reativa com milhar brasileiro (por exemplo, `150.000`, `1.250.000`), sem centavos, com cursor estável durante digitação/edição e suporte a Backspace/Delete sobre pontos.
- Valores pré-carregados ao editar um imóvel são apresentados já formatados; na gravação de cadastro e edição, `prop-price` é convertido explicitamente para apenas dígitos (`1.250.000` → `1250000`) antes do POST/PATCH de `/api/properties`, mantendo a validação numérica no servidor e os prepared statements `.bind()`.
- O mesmo `input` é preservado, alterando apenas `type="number"` para `type="text"` com `inputmode="numeric"`, validação `pattern` e limite de comprimento necessários para permitir pontos de milhar; os estilos e a estrutura do formulário permanecem os mesmos.

### Compatibility
- Reutilizado `crm-input-masks.js`, sem novos endpoints, migrations, bindings, campos ou botões. Preservados autenticação Cloudflare Access, R2, D1, WhatsApp com textos da 4.5.1, filtros da 4.5.2, deep linking e vínculo Lead–Imóvel.
- Atualizados metadados do pacote e API, cache-busting dos scripts para `?v=4.5.3` e testes de regressão. Nenhuma mudança nas políticas e termos legais. Publicação remota não realizada.

## [4.5.2] - 2026-11-21

### Fixed
- Máscara telefônica reativa para todos os campos de telefone existentes dos formulários de Leads, Clientes CRC e contatos públicos: DDD + 8 dígitos `(24) 3333-4444` e DDD + 9 dígitos `(24) 99999-9999`. A máscara mantém o cursor lógico ao digitar no meio do número e permite Backspace/Delete sobre parênteses, espaços e hífen sem travar o campo.
- Na edição de Leads/Clientes ou ao criar atendimento a partir de um cliente CRC, números normalizados com DDI `55` são apresentados já mascarados sem remover por engano um DDD regional `55`.
- Formatação progressiva de valores inteiros em reais, como `150.000` e `1.250.000`, mantida em `lead-value`; o envio para a API retém somente os dígitos. O campo `crc-budget` permanece texto descritivo livre (`Até R$ ...`), sem alterar o contrato da API.

### Changed
- Painel do CRC organizado em duas linhas sem alterar o mecanismo de seleção: linha 1 com busca, **Todos / Compra / Venda / Aluguel / Follow-ups**; linha 2 com **Recentes / Ativos / Inativos Recentes (+30d) / Inativos Antigos (+1 ano) / Aniversariantes** (quatro botões de grupos).
- Removidos apenas os controles de intervalo de datas do próximo follow-up (`crc-followup-start`, `crc-followup-end` e **Limpar datas**) e a condição correspondente no front-end. O filtro rápido **Follow-ups** continua disponível na primeira linha.
- Botões de grupos do CRC usam duas colunas no celular e quatro no desktop. A troca de filtro altera somente as classes de ênfase e `aria-pressed`, preservando as classes responsivas de dimensionamento.
- Atualizados número de versão do pacote, diagnóstico de API e resultado de resolução de disputa para `4.5.2`, além do versionamento dos scripts (`?v=4.5.2`). Adicionados testes de regressão próprios para máscara, cursor, payload do lead e filtros.

### Compatibility
- **Nenhuma nova rota, migration, binding, mudança de regra comercial ou atualização jurídica nesta release.** A versão legal vigente continua sendo a revisão de 21/11/2026 (4.4.0).
- Mantidos WhatsApp com texto (4.5.1), deep linking, vínculo Lead–Imóvel, cache R2, validação JWT Cloudflare Access e segregação dos ambientes D1/R2. Os IDs removidos são exclusivamente os dois campos de data explicitamente excluídos do CRC.
- Testes locais concluídos; Preview/Production não publicados por este pacote. Homologação visual ainda necessária no Preview.

## [4.5.1] - 2026-11-21

### Changed
- Restaurados os textos originais dos botões de contato via WhatsApp na vitrine pública e no CRM, mantendo os ícones e os atributos de acessibilidade: "WhatsApp", "Falar diretamente no WhatsApp", "Falar com Iêda", "Enviar pelo WhatsApp", "Tenho Interesse", "Enviar e chamar no WhatsApp" e "Chamar no WhatsApp".
- No card do imóvel, "Tenho Interesse" volta a exibir seu rótulo ao lado do ícone, mas **mantém a correção de conversão**: abre diretamente o WhatsApp com código, título e link `?imovel=...`, sem abrir o modal. "Ver Detalhes" permanece independente.
- Botões de Leads e Clientes no CRC recuperam o texto, preservando o atalho de chamada telefônica `tel:` ao lado no mobile.
- Atualizados número da versão do pacote Node, metadados de API/diagnóstico e parâmetro de cache dos scripts `?v=4.5.1` para evitar o carregamento da interface anterior.

### Compatibility
- Todas as nove melhorias funcionais entregues na 4.4.0 são mantidas: deep linking, associação Lead–Imóvel, máscaras, filtros, tratamento R2 e controle de acesso.
- Nenhuma migration D1, binding do `wrangler.toml`, rota de API, política de autenticação Cloudflare Access, cor institucional ou texto legal foi modificado neste ajuste.
- Os documentos legais continuam identificando sua última revisão em 21/11/2026 (versão 4.4.0), pois **o conteúdo legal não foi revisado** na versão 4.5.1.
- Versão preparada para teste na branch `dev`. Publicação em Production não realizada.

## [4.4.0] - 2026-11-21

### Fixed — correção de autenticação e homologação
- Corrigida definitivamente a busca de chaves JWT Cloudflare Access: `fetch()` para `/cdn-cgi/access/certs` utiliza `redirect: 'manual'`, compatível com Cloudflare Workers, em vez de `redirect: 'error'` (não implementado pelo runtime).
- Respostas de redirecionamento (3xx) e respostas HTTP não bem-sucedidas permanecem bloqueadas; validação de assinatura RS256, emissor, AUD e expiração permanece obrigatória.
- Retirados códigos HTTP temporários de diagnóstico (`ACCESS_CONFIG_INVALID`, `ACCESS_VERIFICATION_UNAVAILABLE`) das respostas ao navegador e logs temporários `[preview-access]` / `[access-jwks]`. Mantidos eventos operacionais restritos a códigos fixos e status HTTP, sem dados sensíveis.
- Confirmado por verificação estática que D1/R2 Preview (`yolanda-crm-dev`, `yolanda-imoveis-dev`) continuam separados dos recursos Production (`yolanda-crm`, `yolanda-imoveis-prod`). Sem alteração de migrations ou bindings.
- Preparado checklist de promoção em `CHECKLIST-PRODUCAO-4.4.0.md`; nenhuma publicação ou alteração remota foi executada nesta consolidação.


### Added — experiência imobiliária pública / CRC
- Deep linking de anúncios por `?imovel=YTI-####` com `history.pushState`, sincronização `popstate` e abertura automática pelo catálogo público; URLs compartilhadas no WhatsApp levam ao imóvel exato.
- Máscaras reativas de telefone nos formulários de leads, CRC e contatos da vitrine pública, e de valor inteiro em leads, usando os próprios inputs e sanitização numérica antes da API.
- Filtros do CRC organizados em duas linhas, com intervalo de datas do próximo follow-up do cliente.
- Atalho telefônico `tel:` responsivo ao lado do WhatsApp nas fichas e cartões de leads/clientes.

### Fixed — conversão e automação
- O CTA “Tenho Interesse” dos cards abre diretamente a conversa da corretora com código, título e link do anúncio, sem abrir o modal.
- Formulário de interesse no detalhe mantém envio de `property_code`; o contato público cria atendimentos distintos para imóveis distintos sem sobrescrever outro lead em negociação; o vínculo usa `leads.property_id` existente no D1 e `bind()`.

### Changed — performance, acessibilidade e textos legais
- Cache HTTP `public, max-age=31536000, immutable` somente para fotos R2 de imóveis publicamente publicados; fotos não públicas mantêm `private, no-store`. **Atenção operacional**: clientes que já armazenaram uma foto pública podem mantê-la em cache após a despublicação; fotos sensíveis devem ser excluídas do R2 e nunca publicadas.
- Prefetch da capa e fotos vizinhas no carrossel, `fetchpriority="high"` na imagem principal, `decoding="async"` e `loading="lazy"` nos cards. Listagem já consulta galerias em lote (2 consultas, sem N+1).
- Ações WhatsApp icon-only com `aria-label`/`title`; layouts, cores e IDs originais preservados.
- Política de Privacidade e Termos vigentes em 21/11/2026: transparência sobre vínculo lead–imóvel, WhatsApp, URLs compartilháveis, cache e LGPD.
- Não foram modificados `wrangler.toml`, migrations D1 nem bindings Preview/Production.



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
