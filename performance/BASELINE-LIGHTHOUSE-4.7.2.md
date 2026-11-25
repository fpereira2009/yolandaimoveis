# 4.7.2 — Baseline e hipóteses mensuráveis

Relatório fonte: Lighthouse 13.5.0, URL `https://dev.yolanda-site.pages.dev/`, `fetchTime` 2026-11-25T01:45:04Z. Resultado 4.7.1 em um ensaio mobile.

| Performance | FCP | LCP | TBT | CLS | Speed Index |
|---:|---:|---:|---:|---:|---:|
| 78/100 | 1.644 ms | 2.968 ms | 620 ms | 0,065 | 2.036 ms |

Amostra da auditoria: Lucide servido por unpkg, tarefa longa associada de ~328 ms; 11 long tasks; trabalho da thread principal ~3,8 s; imagem do logotipo original ainda requisitada como ícone. O Tailwind CSS estático **já estava** publicado na 4.7.1. 

A 4.7.2 substitui a biblioteca Lucide exclusivamente na homepage por um renderer local limitado aos 16 ícones referenciados (inclui dinâmicos). Também substitui `favicon` e `apple-touch-icon`, e utiliza avatar já convertido para WebP no modal.

**Não foi medida pontuação pós-4.7.2** neste ambiente. TBT/largura de banda devem ser reavaliados com Lighthouse Mobile (três execuções comparáveis). Não prometer 90 pontos apenas por diminuir um bundle.

Dependências deliberadamente fora do escopo: Google Fonts externa, geração de variante WebP 960 px no R2, consultas D1 e HTML SSR por Pages Functions.
