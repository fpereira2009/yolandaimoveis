# Changelog 4.6.0 | integração sobre a base nomeada 4.5.5

## Preservado sem alterações

- `public/index.html`: todo o layout, textos institucionais, paleta, fontes e seção de Resende.
- `public/app/index.html` e `public/js/crm-properties.js`: hotfix do dropdown Tipo, seis opções e preservação de valores antigos.
- `public/js/vitrine-app.js`: cards com links existentes, modais, galeria e CTA WhatsApp.
- `functions/_shared/api/`: contratos de imóveis, leads, clientes, serialização, contatos e API de vitrine.
- `functions/_shared/access-auth.js` e `wrangler.toml`: Access/JWT e segregação de ambientes D1/R2.
- `migrations/0001_init.sql` ... `0009_public_url.sql`: histórico intacto.

## Atualizado ou adicionado

- `0010_seo_slug_4_6_0.sql`: coluna `slug` única, backfill e triggers; Comerciais e Terrenos usam m².
- SSR de detalhes mais completo, mantendo identidade visual, sem reconstruir home ou CRM.
- OG/canonical/JSON-LD e galeria R2 no HTML inicial.
- Páginas de imóvel com resposta 200/301/404/503, Preview noindex e robots.
- Sitemap dinâmico do Preview; links cards usam a API já existente da 4.5.5.
- Scripts offline de clonagem D1 Production (somente leitura) → Preview e transferência de fotos R2.
- Testes de regressão. Corrigido apenas o *teste* de hotfix que tinha regex incompatível com CRLF do Windows; arquivos funcionais do hotfix mantidos.

## Pendências deliberadas

- Nenhuma aplicação remota de migrations, limpeza de Preview ou cópia de fotos foi executada.
- Antes da futura promoção para `main`, decidir a ativação do SSR e das regras de indexação em Production e aplicar migração correspondente no D1 de Production com plano de rollback.
