# Recuperar visual da 4.5.5 na página individual SSR 4.6.0

**Origem:** arquivo `functions/_shared/property-seo.js` da versão 4.6.0 sobre a 4.5.5, com migration 0010 corrigida.

## O que muda

Apenas a composição do HTML em `makeHtml()`:

- Apresentação de detalhes em cartão centralizado, largura compacta `max-w-2xl`, como o modal da 4.5.5.
- Galeria 16:9 com navegação de fotos, contador, selos de finalidade e código sobre a imagem.
- Tipo/bairro, título, preço, quatro quadros, descrição, formulário e barra da corretora na ordem da 4.5.5.
- Melhor ajuste para smartphones: características em 2 colunas no celular, 4 no desktop.
- Botão de compartilhamento, formulário de interesse e galeria usam os IDs originais do JavaScript SSR 4.6.0.

## O que fica idêntico

- Migration 0010 corrigida, triggers, D1 e armazenamento R2.
- Rota `functions/imoveis/[slug].js`, política Preview e códigos 200/301/404/503.
- Canonical, OpenGraph, JSON-LD, meta robots no Preview.
- CRM e hotfix 4.5.5, `public/index.html`, `public/js/vitrine-app.js` e CSS da vitrine.
- API `/api/public/contact`, associação pelo `property_code` e fluxo WhatsApp.

## Aplicação na branch experimental

1. Confirme `git branch --show-current` = `exp/urls-amigaveis-imoveis`.
2. Substitua **somente** `functions/_shared/property-seo.js` pelo arquivo deste pacote, preservando a estrutura de pastas.
3. Confira `git diff -- functions/_shared/property-seo.js`.
4. Execute `npm test` (e, caso disponível, `node tests/seo-4.6.0-integration.test.mjs`).
5. Reinicie o `wrangler pages dev` local (não é necessário recriar o D1).
6. Confira a URL `http://localhost:8788/imoveis/casa-3-quartos-manejo-resende-rj-yti-9001` nas larguras 360, 390, 768 e 1440 pixels.

**Atenção:** o pacote é apenas front-end SSR e não executa deploy remoto. Como há alterações de composição do HTML, validar também envio do formulário, compartilhamento e galerias antes de promover para Preview.
