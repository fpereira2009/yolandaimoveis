# Diagnóstico de origem da 4.7.1 — Lighthouse Mobile

Fonte: relatório `dev.yolanda-site.pages.dev-20261124T220152.json`, Chrome Lighthouse 13.5.0, data 2026-11-25T01:01:52Z, URL `https://dev.yolanda-site.pages.dev/` (sessão autenticada no Cloudflare Access).

| Indicador | Medição JSON |
|---|---:|
| Performance JSON | 41/100 |
| FCP | 4,4 s |
| LCP | 5,9 s |
| TBT | 1.740 ms |
| CLS | 0 |
| Trabalho da thread principal | 5,3 s |
| TTFB do documento | 17 ms |
| Oportunidade de recursos bloqueantes | ~2.320 ms estimados |
| Oportunidade estimada de entrega de imagens | ~962 KiB |

**Nota:** uma captura de tela da mesma conversa mostra Performance 87, Acessibilidade 94, Boas práticas 100, SEO 100. Como o JSON informa 41, não presumimos que esses dados sejam da mesma execução. Para aferir a mudança, repetir três Lighthouse Mobile usando a mesma URL/configuração e comparar as medianas.

**Elemento LCP da homepage:** o `<h1>` textual ("Encontre o imóvel ideal em Resende e região..."). Portanto, converter uma imagem não resolve, por si só, o LCP desta tela.

### Bloqueios priorizados

- Tailwind CDN síncrono: `cdn.tailwindcss.com/3.4.17`, oportunidade individual estimada ~2.002 ms no relatório (valores de oportunidade **não são aditivos**).
- Lucide síncrono: `unpkg.com/lucide@0.469.0`, oportunidade estimada ~839 ms.
- Google Fonts: participa da cadeia de renderização; preservar até medir impacto da troca de CSS e dos scripts.

### Por que 4.7.1 é conservadora

- CSS Tailwind compilado localmente com a configuração de cores e tipografia existente, substituindo o runtime CDN apenas após sucesso do build.
- `defer` na biblioteca Lucide **e** nos scripts dependentes da vitrine na ordem correta.
- Fotos institucionais WebP responsivas e logotipo visual WebP; não altera fotografias do imóvel em R2 nem a página SSR.
- Cloudflare Access mantido. Os testes Lighthouse ficam no Chrome autenticado.

### Critério de aprovação

- Nenhuma regressão funcional/visual: home responsiva, filtros, cards, galeria, WhatsApp, componentes Lucide, SEO/JSON-LD.
- `public/css/tailwind.min.css` retorna HTTP 200; Tailwind CDN **não** aparece no Network.
- FCP, LCP e TBT melhoram de maneira repetível na mediana; CLS permanece <= 0,1.
- Não alterar D1, R2, bindings de Production e segurança do Preview.
