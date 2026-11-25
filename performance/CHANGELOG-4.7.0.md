# Performance 4.7.0 — Preview (proposta de release)

## Adicionado
- Variantes de fotos WebP principal até 1600 px, miniatura até 480 px.
- Persistência D1 de `thumb_key` e dimensões reais para `srcset` e CLS.
- Upload multipart validado no Worker, com compatibilidade binária legada.
- Chaves UUID imutáveis, Cache-Control explícito no R2 e autorização dos dois formatos pelo D1.
- Migração local R2->WebP com hash, HEAD, idempotência e geração offline de SQL CAS.
- Verificação de acervo após o update e limpeza adiada por sete dias com confirmação explícita.
- Patch SSR opcional, fail-closed, preservando o código SEO da branch de desenvolvimento atual.
- Testes locais de mídia e conversão, e ferramenta para baseline PageSpeed mobile.

## Não alterado
- Rotas de API atuais, bindings DB/MEDIA_BUCKET e políticas de autenticação.
- Paleta, tipografia, estrutura HTML, conteúdo de anúncios e fluxo de edição do CRM.

## Pendências obrigatórias de homologação
- Conferir contra o projeto atual 4.6.3 em dev/teste; o snapshot de API do pacote é 4.5.3.
- Aplicar migration 0011 apenas no Preview antes do deploy do novo código de mídia.
- Repetir testes no Cloudflare Preview e testar URLs SSR e imagem no smartphone.
- Compilar Tailwind e remover CDN somente em segundo PR com regressão visual aprovada.
