# Yolanda CRM 4.4.0 — Nove melhorias funcionais

**Preparação:** 21/11/2026  
**Base:** pacote final da 4.4.0 já homologado no Preview, incluindo validação JWT Cloudflare Access e `fetch(..., { redirect: 'manual' })`.  
**Escopo:** implementação local, sem modificações remotas na Cloudflare ou no GitHub.

## 1. Decisão arquitetural antes da implementação

Inspecionamos `wrangler.toml`, as oito migrations existentes, `leads.property_id`, `property_images`, a API do site, o roteador modular do CRM, a rota R2 e os scripts JavaScript. **Decisão: preservar e alterar os módulos/rotas existentes, em vez de criar endpoints novos.**

| Responsabilidade | Implementação existente | Ajuste efetuado |
| --- | --- | --- |
| Vitrine e contato | `/api/public/properties`, `/api/public/contact`; `functions/_shared/api/public.js` | Vínculo por imóvel e deduplicação segura por imóvel |
| CRM de leads e clientes | API CRUD existente e scripts `public/js/crm-*.js` | Máscaras, filtros e botões sem mudar contratos |
| Upload e entrega de fotos | `/api/media/[[path]].js`, R2 | Cache somente para mídia publicamente autorizada |
| Apresentação pública | `public/js/vitrine-app.js` | WhatsApp direto, URL compartilhável, antecipação seletiva de imagens |

**Motivo:** os serviços já são particionados por responsabilidade; novos caminhos duplicariam autorização, validação de payload e roteamento sem melhorar os limites de CPU dos Workers. Uploads binários de até 6 MB permanecem segregados do CRUD JSON e sua validação MIME/bytes é preservada. A listagem de fotos usa `propertyImageMap` em lote, evitando consultas N+1 por anúncio. O projeto mantém prepared statements D1 com `.bind()` e escaping HTML no front-end. Não há migração nova: `leads.property_id` já consta no schema.

## 2. Implementação dos requisitos

1. **Tenho Interesse nos cards:** `openCardInterestWhatsApp(event, codigo)` cancela o evento e sua propagação e abre diretamente `wa.me` com título, código e link do imóvel. O botão **Ver Detalhes** continua abrindo o modal.
2. **Fotos R2:** imagens de imóveis públicos recebem `Cache-Control: public, max-age=31536000, immutable`; imagens restritas continuam `private, no-store`. O cliente inclui `loading="lazy"` na grade, `decoding="async"`, `fetchpriority="high"` no hero, preload da principal e prefetch da próxima/anterior foto, sem baixar toda a galeria antecipadamente. A listagem usa leitura em lote das galerias. **Não há comprovação de tempo inferior a 1 segundo ainda**: medir com DevTools (aba Network, cenários cache frio/quente, TTFB, download e decode) em Preview/Production e dispositivos reais. O cabeçalho da Function não depende de `_headers`, que não controla respostas geradas por Pages Functions.
3. **Deep link:** a URL utiliza `?imovel=YTI-0001`; `history.pushState` evita reload, `popstate` mantém Voltar/Avançar coerente, e o catálogo executa `syncPropertyModalWithUrl()` quando termina de carregar. URLs do WhatsApp usam esse mesmo destino.
4. **Lead vinculado ao imóvel:** o formulário de detalhe envia `property_code` para `/api/public/contact`; o servidor usa `.bind()` e grava o `property_id` no lead. Um mesmo telefone pode ter um atendimento aberto por imóvel, associado ao cadastro do cliente, sem substituir a associação de outra negociação. Repetições no mesmo imóvel acrescentam nota ao lead ativo. O botão direto do card abre WhatsApp e **não cadastra lead**, conforme informado nos textos legais.
5. **Máscaras:** módulo `public/js/crm-input-masks.js` com evento delegado `input` aplica `(DD) #########` ou `(DD) ########`, inclusive no site público; nos leads do CRM, valores inteiros recebem pontos de milhar. Trata Backspace e cursor. O valor segue para a API como apenas dígitos.
6. **WhatsApp e ligação:** botões de ação WhatsApp compactos com apenas ícone, `title` e `aria-label` mantidos; no celular, cards de Leads e Clientes e detalhes do Lead incluem `tel:+55...` ao lado do WhatsApp.
7. **Filtros CRC:** a primeira linha conserva busca e opções de status/categoria. A segunda contém intervalo inicial/final do próximo follow-up, com ação para limpar. Os cartões são filtrados por data ISO, sem novas rotas.
8. **Privacidade e Termos:** páginas existentes atualizadas para vigência 21/11/2026 (4.4.0), detalhando dados pessoais de interesse em imóvel, registro no CRC, WhatsApp, links compartilhados, cache de imagens e práticas relacionadas à LGPD. **Os textos merecem revisão jurídica antes da publicação final.**
9. **CHANGELOG:** versão `4.4.0` documentada em `CHANGELOG.md` no formato Keep a Changelog, inclusive correção de autenticação anteriormente homologada.

## 3. Atenções de segurança e desempenho

- A política de cache `immutable` aplica-se apenas às respostas da rota R2 quando o imóvel estiver publicado como `Disponível` ou `Reservado`. **Foto pública já armazenada no cache do navegador de um visitante poderá continuar acessível naquele navegador mesmo após o imóvel ser retirado do catálogo.** Para mídia sensível, não publique a imagem e remova-a do R2 se necessário. Se a operação exigir revogação visual imediata, substitua a estratégia de cache longa por TTL curto/URLs versionadas; essa é uma decisão de produto e segurança.
- O código da API consulta o status no D1 antes de servir cada imagem de origem. Cache HTTP no navegador não significa que o edge cache do Workers está habilitado. Não foi aplicada `caches.default` porque o projeto protege ambientes Preview com Cloudflare Access e a compatibilidade do cache em Workers exige avaliação adicional.
- A validação JWT, emissor, audience, assinatura RS256 e `redirect: 'manual'` continuam inalterados. Nenhum bypass é ativado.
- Não foram modificados `wrangler.toml`, as migrations nem as assinaturas das rotas existentes. Todos os IDs HTML existentes foram preservados; adicionaram-se apenas os IDs dos dois novos filtros de data.

## 4. Instruções de publicação

1. Salvar backup da branch `dev` e manter snapshot do estado anterior.
2. Aplicar o ZIP de **arquivos modificados**, respeitando o mesmo caminho relativo dentro do projeto. Para ter uma cópia independente, usar o ZIP de **projeto completo**.
3. Na branch `dev`, executar `npm test` em Node compatível com `node --experimental-sqlite` e fazer `git diff` para revisar as alterações.
4. Fazer push para `dev` e conferir o deployment Preview. Não há migration nova para aplicar.
5. Testar card WhatsApp (não abre modal), botão Ver Detalhes, cópia de URL e abertura em janela privada, Voltar/Avançar, envio do formulário e vínculo no CRC, interesse por segundo imóvel do mesmo cliente, máscaras e correção do Backspace, filtros do CRC, ícones em dispositivos móveis e R2 com cache frio/quente.
6. Em **Production**, conferir o checklist existente `CHECKLIST-PRODUCAO-4.4.0.md`, bindings D1/R2, `MEDIA_ENV`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, Access App, migrations existentes, backup e rollback; somente então promover `dev` para `main`.
7. Depois da promoção, testar vitrine pública e acesso CRC em Production. Não reutilizar AUD do Preview em Production sem confirmar que corresponde à aplicação adequada.

### Matriz de recursos isolados (arquivo verificado)

| Recurso | Preview | Production |
| --- | --- | --- |
| Banco D1 | `yolanda-crm-dev` | `yolanda-crm` |
| R2 | `yolanda-imoveis-dev` | `yolanda-imoveis-prod` |
| `MEDIA_ENV` | `preview` | `production` |

## 5. Testes locais

`npm test` cobre a integração do CRM/D1, regras de disputa, mídia R2, vitrine legada, paridade de ambientes, segurança negativa, Cloudflare Access e funcionalidades novas. Os testes funcionais usam fixtures locais e **não substituem** um teste de rede real nem homologação visual do site em celular e desktop.

### Arquivos completos modificados/criados nesta entrega

- `CHANGELOG.md`
- `functions/_shared/api/public.js`
- `functions/api/media/[[path]].js`
- `package.json`
- `public/app/index.html`
- `public/index.html`
- `public/js/crm-input-masks.js` (novo)
- `public/js/crm-clients.js`
- `public/js/crm-funnel.js`
- `public/js/crm-lead-actions.js`
- `public/js/crm-lead-detail.js`
- `public/js/vitrine-app.js`
- `public/privacidade.html`
- `public/termos.html`
- `tests/features-release-4.4.0.test.mjs` (novo)
- `tests/preview-crm.test.mjs`
- `tests/r2-media.test.mjs`
- `LEIA-ME-NOVE-MELHORIAS-4.4.0.md` (este documento)

**Nenhum segredo, token ou configuração de ambiente Production foi incluído ou modificado.**
