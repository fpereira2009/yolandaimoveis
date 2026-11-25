# Yolanda CRM 4.7.1 — Core Web Vitals | Preview

**Objetivo:** reduzir bloqueio de renderização do Tailwind CDN e Lucide na página inicial, sem alterar identidade visual, regras de negócio, D1, R2, Cloudflare Access ou SEO/Schema.org.

## Base e compatibilidade

Este kit usa como referência o `public/index.html` do arquivo-base `02_desenvolvimento.zip` (versão anterior), o Tailwind config da implementação 4.7.0 e o relatório Lighthouse do seu Preview. A `dev` evoluiu para 4.6.x/4.7.0: **não substitua `public/index.html` por uma cópia antiga!** O script `tools/aplicar_performance_471.py` edita somente trechos reconhecidos do HTML atual e recusa alterações quando divergem. Não altera SSR, CRM, APIs nem migrations.

O ambiente de criação deste kit não possui acesso ao registry.npmjs.org para baixar Tailwind 3.4.17. **CSS minificado não acompanha o ZIP:** você precisa compilá-lo no seu projeto usando a versão fixada. O script se recusa a trocar o CDN antes desse build.

## Etapa 1 — Branch e cópia de arquivos novos

No PowerShell na raiz do projeto, após fazer merge da 4.7.0 em `dev`:

```powershell
git switch dev
git pull --ff-only origin dev
git switch -c perf/core-web-vitals-471
```

Extraia este ZIP em uma pasta temporária e copie somente:

- `performance/tailwind-input.css`, `performance/tailwind.config.cjs`, `performance/compilar_css_471.ps1`
- `public/img/logo-128.webp`, `fotocorretora-160.webp`, `fotocorretora-480.webp`, `fotocorretora-800.webp`
- `tools/aplicar_performance_471.py`, `tools/resumir_lighthouse_471.py`
- `tests/test_performance_471.py`

Os arquivos `public/img/resende-hero.webp` e `resende-hero-480.webp` **já vieram com a 4.7.0**; caso estejam ausentes, não aplique e confira o merge da 4.7.0.

## Etapa 2 — Gerar o CSS local

```powershell
.\performance\compilar_css_471.ps1
```

O script instala `tailwindcss@3.4.17` em devDependencies quando necessário, atualizando `package.json` e `package-lock.json` da branch. Ele compila todas as classes literais em `public/` e `functions/` (inclusive HTML das Functions) usando a paleta existente. O arquivo resultante é `public/css/tailwind.min.css` e deve ser **versionado no Git**, pois o Pages precisa servi-lo sem depender de um build automático novo.

Confira a saída, o tamanho e as classes geradas. Classes construídas por concatenação de strings JavaScript podem necessitar de `safelist` específico. Não aceite diferenças no design em mobile/desktop.

## Etapa 3 — Aplicar somente à homepage

```powershell
py tools/aplicar_performance_471.py --check
py tools/aplicar_performance_471.py --apply
py tests/test_performance_471.py
node --check public/js/vitrine-app.js
npm test
git diff --check
git diff --stat
```

O script faz backup do `public/index.html` na pasta temporária do Windows e:

1. substitui a tag **Tailwind CDN** por `/css/tailwind.min.css`;
2. remove o objeto `tailwind.config` inline, pois as mesmas cores/fontes foram compiladas;
3. aplica `defer` ao Lucide e aos **três scripts da vitrine na ordem original**, evitando que a vitrine tente inicializar ícones antes da biblioteca;
4. usa WebP de 128 px no logotipo visível (PNG original continua como favicon);
5. ativa versões responsivas e dimensões explícitas nas quatro fotos da corretora e na foto de Resende, preservando o comportamento `onerror`, classes e textos.

Se o HTML atual tiver alterações incompatíveis, o programa aborta **antes** de salvar. Não tente copiar um `index.html` antigo para contornar.

## Etapa 4 — Homologação

- No Preview protegido por Cloudflare Access, abra a homepage em celular e desktop; compare visualmente com o baseline da 4.7.0, incluindo menus, modais, filtros, WhatsApp e zoom.
- F12 → Network: **não deve** aparecer `cdn.tailwindcss.com`; `/css/tailwind.min.css` HTTP 200; Lucide deve carregar com defer; fotos locais WebP HTTP 200.
- F12 → Console: nenhum `tailwind is not defined`, `lucide is not defined`, erros de parse, nem TypeError na vitrine.
- Confirme Schema.org/SEO e navegação em uma URL de imóvel. O SSR não foi alterado nesta entrega.
- No Chrome Lighthouse, Mobile, Navigation, autenticado: faça 3 medições na mesma página/condições e compare as medianas. Para métricas do JSON:

```powershell
py tools/resumir_lighthouse_471.py "C:\CAMINHO\relatorio-lighthouse.json"
```

- Compare FCP, LCP, TBT, CLS, imagem transferida e requisições bloqueadoras. **INP real não é medido pelo teste de navegação do Lighthouse.**
- Não altere configurações ou bindings de Production. Faça PR da branch de performance para `dev` e siga `dev → teste → main` somente após homologação.

## Decisões deliberadas

- **Não altera o SSR de imóvel:** sua Function foi alterada desde a versão-base e continua exigindo análise sobre a branch atual; trocar isso junto criaria regressão de SEO.
- **Não mexe no D1/R2:** migration WebP e migração do acervo foram tratadas na 4.7.0.
- **Não remove Google Fonts agora:** a fonte influencia o título LCP; primeiro se mede o impacto de tirar Tailwind e Lucide síncronos mantendo tipografia e CLS.
- **Não cria a versão 960px de foto de imóvel neste hotfix:** primeiro medir após ganho de CSS e fotos institucionais.
- **Não copia fontes nem credenciais.**

## Rollback

Na branch da 4.7.1, reveja o diff com `git diff -- public/index.html`. Caso seja necessário restaurar a homepage sem perder outras mudanças, use o backup gerado no Windows Temp ou reverta o commit da 4.7.1. Preserve a 4.7.0 já homologada.
