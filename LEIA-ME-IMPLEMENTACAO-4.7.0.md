# Yolanda CRM | Performance mobile e WebP/R2 — preparação 4.7.0 (Preview)

## Contexto do projeto analisado

Stack atual: Cloudflare Pages + Pages Functions + D1 + R2 + HTML/JS vanilla. A versão-base dos arquivos de API disponível no arquivo enviado `02_desenvolvimento.zip` está identificada como 4.5.3, mas o sistema evoluiu depois para 4.6.x. **O arquivo da vitrine foi preparado a partir do `vitrine-app.js` fornecido mais recentemente**. Para evitar regressões, **aplique por diff e revise**, e **não copie todos os arquivos por cima da branch atual sem conferência**. O script de SSR modifica o arquivo real da sua branch atual apenas quando o padrão esperado coincide. Nenhum arquivo deste pacote foi implantado remotamente.

### Diagnóstico do código atual

- `public/js/crm-properties.js` **já** tinha `optimizePropertyPhoto` com canvas, maior dimensão até 1600 px e WebP 82% (mas permitia fallback JPEG). Portanto não era necessário reescrever o CRUD.
- As imagens eram armazenadas como uma única versão em `property_images`. Cards usavam a foto grande, sem miniatura separada nem `srcset`.
- A rota de mídia já autenticava operações de escrita, controlava limite de dez fotos e retornava cache `immutable` apenas para fotografias publicadas. Mantivemos esse contrato.
- Na home, há Tailwind via CDN como script síncrono e Lucide no `<head>`. Migrar Tailwind para CSS compilado pode ter impacto importante no tempo de renderização, mas demanda teste de regressão visual separado.
- A página de detalhes SSR foi modificada em versões posteriores à cópia-base. Por isso oferecemos **patch conservador** (`tools/aplicar_ssr_responsivo.py`) e não substituímos `property-seo.js` inteiro por uma versão antiga.

## Arquitetura escolhida

```text
CRC: seleção de foto JPEG/PNG/WebP
   ↓ (canvas no próprio navegador: orientação EXIF quando suportada)
WebP principal: maior lado <= 1600px / qualidade 82%
WebP miniatura: maior lado <= 480px / qualidade 80%
   ↓ Multipart PUT existente /api/media/properties/:code/images
Pages Function: JWT Access + origem + tamanho + assinatura WebP + dimensões plausíveis
   ↓ R2: properties/:id/:uuid.webp e :uuid-thumb.webp (chaves distintas)
   ↓ D1: property_images (object_key, thumb_key, width, height, thumb_width, thumb_height)
API de leitura: cover, thumbUrl, width/height + autorização ao status do imóvel
   ↓ cards usam srcset/sizes; galeria SSR tem srcset + preload da imagem principal
```

### Por que esses números

- **1600 px** na maior dimensão é suficiente para uma galeria desktop em modal de largura moderada; não amplia fotos pequenas, conserva orientação/proporção e reduz bytes transferidos.
- **480 px** na maior dimensão é uma miniatura prática para cards. Um celular de tela maior/DPR alto ainda pode selecionar a versão de 1600 px quando necessário via `srcset`.
- **WebP 82% / 80%** oferece boa relação entre nitidez e tamanho, mas não é garantia de menor arquivo para toda imagem: teste visualmente detalhes finos, textos e plantas.
- `width` e `height` refletem dimensões reais dos arquivos, permitindo ao navegador reservar espaço e reduzir **CLS**.
- Chaves diferentes preservam cache imutável e permitem rollback. O upload antigo em JPEG/WebP continua aceito pela Function para compatibilidade, embora o CRM novo passe a enviar WebP.
- **Segurança:** PNG/JPEG é decodificado no navegador. O servidor valida apenas os containers WebP e limites do upload, não executa decodificação de pixels; para validação total no servidor seria necessário serviço dedicado de imagens ou Cloudflare Images binding. Não trate informação de dimensão enviada pelo cliente como controle de segurança.

## ETAPA 1 — Preparar branch e backup

No VS Code, na raiz do repositório:

```powershell
git fetch origin --prune
git switch dev
git pull --ff-only origin dev
git status
git switch -c perf/imagens-webp-mobile-470
```

Faça backup do D1 Preview antes de aplicar a migration. Use pasta **fora do Git**:

```powershell
$backupDir = Join-Path $env:USERPROFILE ("Documents\Yolanda_Backups\Perf_470_" + (Get-Date -Format 'yyyyMMdd_HHmmss'))
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
npx wrangler d1 export yolanda-crm-dev --env preview --remote --output "$backupDir\preview_antes.sql"
if ($LASTEXITCODE -ne 0) { throw 'Falha no backup Preview' }
```

Não faça upload deste backup para o Git; contém dados de clientes e leads.

## ETAPA 2 — Aplicar código e migration apenas no Preview

1. Descompacte o ZIP fora da pasta do projeto.
2. Aplique `HOTFIX-IMAGENS-4.7.0.patch` no projeto pelo terminal. O patch é melhor que copiar JS inteiros, pois interrompe caso o código tenha divergido:

```powershell
git apply --check --ignore-whitespace "C:\CAMINHO_DO_ZIP\HOTFIX-IMAGENS-4.7.0.patch"
git apply --ignore-whitespace "C:\CAMINHO_DO_ZIP\HOTFIX-IMAGENS-4.7.0.patch"
```

Se `git apply --check` falhar, **não use `--reject` nem force**. Compare os arquivos completos incluídos no ZIP com os atuais e transporte somente os trechos desejados.

3. Copie os **arquivos novos** do ZIP (migration `0011`, `tools`, `performance`, `tests`), sem substituir configurações de Cloudflare.
4. Verifique se a migration `0010` de SEO do projeto atual também está presente. A `0011` é **incremental**, não edita migration anterior.
5. Rode localmente:

```powershell
node --check functions/api/media/'[[path]].js'
node --check public/js/crm-properties.js
node --check public/js/vitrine-app.js
node --experimental-sqlite tests/media-variants-4.7.test.mjs
py tools/test_migrar_r2_webp.py
git diff --check
npm test
```

6. Em Cloudflare D1 Preview:

```powershell
npx wrangler d1 migrations list yolanda-crm-dev --env preview --remote
npx wrangler d1 migrations apply yolanda-crm-dev --env preview --remote
```

**Não rode em `yolanda-crm` Production** nesta etapa. Quando a migration estiver aplicada, publique a branch de homologação pelo fluxo `dev` → `teste`; faça testes de cadastro de novos imóveis, capa, reordenação, exclusão e comportamento sem fotos.

### Segurança dos bindings

Os bindings `DB`, `MEDIA_BUCKET` e `MEDIA_ENV` são preservados. Preview deve continuar apontando para `yolanda-crm-dev` e `yolanda-imoveis-dev`. Não copie o acervo Preview sobre Production. Teste a proteção de imagens de imóveis inativos e vendidos e a autenticação do CRC.

## ETAPA 3 — Atualizar SSR das páginas de imóveis sem perder SEO da 4.6.x

No projeto atual (com `functions/_shared/property-seo.js` presente) copie e execute:

```powershell
py tools/aplicar_ssr_responsivo.py
py tools/aplicar_ssr_responsivo.py --apply
node --check functions/_shared/property-seo.js
git diff -- functions/_shared/property-seo.js
```

O modo padrão apenas verifica a compatibilidade; `--apply` cria um backup na pasta temporária do Windows. Se o arquivo SSR mudou, o script **interrompe sem alterações**: faça revisão manual.

O patch coloca `srcset`, `sizes` e `width`/`height` diretamente no HTML inicial do SSR, mantém a principal com `loading="eager" fetchpriority="high"`, deixa as demais como lazy e evita pré-carregar sem necessidade as fotos do carrossel. URLs canônicas, Schema.org, metatag de indexação e conteúdo permanecem preservados.

## ETAPA 4 — Migrar acervo R2 existente, sem quebrar URLs

O script `tools/migrar_r2_webp.py` funciona num computador com Python. Instale bibliotecas:

```powershell
py -m pip install boto3 Pillow
```

Configure **somente credenciais S3 de acesso ao bucket Preview** obtidas no Cloudflare R2, sem salvar tokens no Git:

```powershell
$env:R2_ENDPOINT_URL = 'https://SEU_ACCOUNT_ID.r2.cloudflarestorage.com'
$env:AWS_ACCESS_KEY_ID = 'SEU_ACCESS_KEY_ID'
$sec = Read-Host 'R2 Secret Access Key' -AsSecureString
$env:AWS_SECRET_ACCESS_KEY = [System.Net.NetworkCredential]::new('', $sec).Password
```

Depois da migration 0011, exporte novamente D1 Preview:

```powershell
npx wrangler d1 export yolanda-crm-dev --env preview --remote --output "$backupDir\preview_schema_470.sql"
```

**Atenção: esta etapa grava objetos no bucket R2 Preview**, mas **não modifica D1 remoto**, nem apaga objetos:

```powershell
py tools/migrar_r2_webp.py convert `
  --bucket yolanda-imoveis-dev `
  --d1-export "$backupDir\preview_schema_470.sql" `
  --output "$backupDir\webp_convertidos"
```

O script:

1. Lê somente registros que ainda não possuem `thumb_key`.
2. Busca cada objeto pelo `object_key` do export D1.
3. Converte com Pillow, respeita EXIF, aplica qualidade e dimensões.
4. Cria novas chaves determinísticas por SHA-256 do arquivo original, sem sobrescrever a origem.
5. Usa `HEAD` para validar tamanho, `Content-Type` e hash em metadata da versão otimizada. Reexecutar não cria chaves duplicadas.
6. Gera SQL com `INSERT OR IGNORE` em `image_url_aliases` e `UPDATE ... WHERE id = ... AND object_key = antiga AND thumb_key IS NULL`. A tabela de aliases permite que links antigos de imagem sigam funcionando durante a migração.

Revise o manifesto (`manifesto_r2_webp.json`), principalmente IDs e contagens. Aplique **somente o SQL gerado para Preview**:

```powershell
$sqlFile = Join-Path $backupDir 'webp_convertidos\APLICAR_SOMENTE_APOS_VALIDACAO_D1.sql'
npx wrangler d1 execute yolanda-crm-dev --env preview --remote --file "$sqlFile"
```

Interrompa se houver erro ou contagens inesperadas. Um erro do Wrangler durante execução de múltiplos comandos pode deixar parte do lote aplicada. **Não apague os originais; use o backup e a execução idempotente para reconciliar**.

Exporte o D1 atualizado e verifique se todos os novos objetos existem:

```powershell
npx wrangler d1 export yolanda-crm-dev --env preview --remote --output "$backupDir\preview_depois_webp.sql"
py tools/migrar_r2_webp.py verify `
  --bucket yolanda-imoveis-dev `
  --d1-export "$backupDir\preview_depois_webp.sql" `
  --manifest "$backupDir\webp_convertidos\manifesto_r2_webp.json"
```

O modo `verify` é somente leitura, confirma novos objetos e aliases. Além disso, abra os quatro anúncios reais no Preview e verifique fotos, miniaturas, `srcset`, galeria, compartilhamento, social cards e fluxo do CRC.

### Limpeza R2: somente após sete dias, fora da janela de rollback

Não execute até concluir homologação funcional, conferência de URL antiga e nova, e política de retenção de backups. Para uso posterior, o script exige `--delete-old` e uma confirmação vinculada ao bucket. A limpeza de imagens antigas deixará URLs antigas indisponíveis; um SQL de exclusão de aliases é gerado para execução **posterior e opcional**. A prática mais conservadora é reter antigos por mais tempo.

Para migração futura em Production, faça **novo export de Production**, use **credenciais do bucket Production**, passe `--confirm-production SIM-PRODUCTION` e somente depois de realizar rollout pelo PR e aprovar as verificações do Preview. NUNCA execute o SQL de Preview em Production.

## ETAPA 5 — Performance mobile e diagnóstico PageSpeed

Teste separadamente **a homepage** e **a URL SSR de um imóvel** no https://pagespeed.web.dev/; use perfil **Dispositivos móveis**. O pacote também inclui `tools/auditar_pagespeed.py` para capturar dados PSI em JSON local:

```powershell
py tools/auditar_pagespeed.py https://yolandaimoveis.com.br/ --output "$backupDir\psi-home-antes.json"
py tools/auditar_pagespeed.py https://yolandaimoveis.com.br/imoveis/casa-4-quartos-jardim-brasilia-resende-rj-yti-0008 --output "$backupDir\psi-imovel-antes.json"
```

O serviço pode impor limites de uso/solicitar chave de API. **Não há medição real de PSI reproduzida neste pacote:** não afirmamos LCP/INP/CLS atuais nem ganhos em segundos sem execução comparável.

| Métrica | Meta Google (p75 campo) | Ações recomendadas |
|---|---|---|
| LCP | até 2,5 segundos | hero SSR na resposta HTML inicial, `fetchpriority=high`, mídia WebP otimizada, `preload` com `imagesrcset`/`imagesizes`; reduzir JS síncrono |
| INP | até 200 ms | remover Tailwind CDN em runtime, reduzir JS e handlers pesados, evitar renderizações síncronas grandes, otimizar imagens antes de enviar em UI responsiva |
| CLS | até 0,1 | `width/height` e `aspect-ratio` coerentes em imagens e cards; reservar espaço para fontes/badges e mensagens dinâmicas |

### LCP / TTFB / fonte principal

Na página pública SSR, **a foto de capa deve estar em `<img>` no HTML inicial**, não criada depois de um `fetch` JS. Nosso patch SSR monta `srcset` a partir de `thumb_key` e metadados D1; o navegador escolhe a versão compatível. A homepage tem uma fotografia institucional original 960×640 JPEG (~204 KB). Incluímos arquivos WebP opcionais (`public/img/resende-hero.webp` e `...-480.webp`) para testar sem alterar texto, crédito ou layout. A versão WebP principal ocupa cerca de 151 KB neste conjunto; a miniatura 34 KB. **Não substitua automaticamente o JPEG até avaliar qual elemento é LCP em mobile.**

### INP / CSS que bloqueia renderização

A homepage atual carrega o CDN Tailwind 3.4.17 por `<script>` síncrono e Lucide via `unpkg` no head. Isso tende a aumentar JS e trabalho antes da renderização. Para substituir o Tailwind por CSS estático:

```powershell
npm install --save-dev tailwindcss@3.4.17
npx tailwindcss -c performance/tailwind.config.cjs -i performance/tailwind-input.css -o public/css/tailwind-optimized.css --minify
```

**Segundo PR opcional:** compare os elementos desktop/mobile e classes montadas dinamicamente antes de remover `<script src="https://cdn.tailwindcss.com/3.4.17">` e o bloco `tailwind.config` embutido do HTML. A troca requer adicionar `<link rel="stylesheet" href="/css/tailwind-optimized.css">` no lugar desses scripts. Não remova Lucide sem garantir a ordem correta de `createIcons()` e dos scripts inline. O pacote deixa essa troca **não ativada** para evitar quebra de layout.

### CLS

Nos cards, a caixa já usa `aspect-[16/10]`; incluímos atributos intrínsecos para fotos novas. No SSR, o contêiner mantém `aspect-[16/9]`. Testar mudanças de slide, carregamento de fonte, render de cards após API e abertura do modal em 360 px e 390 px de largura. Use DevTools → Performance → Layout Shifts para encontrar origens reais.

### Cache em borda e privacidade

`httpMetadata.cacheControl` no R2 e `Cache-Control` na resposta da Function habilitam **cache do navegador**. Não presumimos que `Cache-Control` sozinho force **edge caching** da Function: isso deve ser medido via cabeçalhos e, se necessário, configurado via Cache Rules/Workers Cache API. Atenção: uma URL de imagem pública com `immutable, max-age=31536000` pode permanecer no navegador mesmo após o imóvel se tornar inativo; se exigir revogação rápida por privacidade, adote TTL mais curto e política de invalidação. R2 continua privado pelo binding; não exponha domínio público direto do bucket se quiser manter checagem de publicação/autenticação.

## Checklist UAT após aplicação no Preview

- [ ] Novo upload JPEG/PNG/WebP gera dois objetos WebP; nenhum arquivo aumenta resolução.
- [ ] R2 confirma `Content-Type: image/webp`, metadata de cache e UUIDs distintos.
- [ ] D1 registra `object_key`, `thumb_key` e largura/altura reais; capa funciona.
- [ ] Imóveis existentes sem miniatura continuam mostrando fotos normalmente.
- [ ] Cards entregam `srcset`/`sizes` e dimensões, sem quebrar responsividade.
- [ ] SSR entrega a capa no HTML inicial, com `fetchpriority=high`; galeria abaixo é lazy.
- [ ] Imagens de imóveis inativos/sold não aparecem anonimamente, inclusive thumbs e aliases.
- [ ] Migração gerou SQL somente depois de copiar e verificar R2; rollback e originais intactos.
- [ ] URL de imagem antiga funciona via `image_url_aliases` durante transição.
- [ ] `PRAGMA foreign_key_check;` não retorna linhas no D1.
- [ ] PageSpeed Mobile comparado antes/depois: homepage e YTI-0008 com pelo menos três execuções por cenário.
- [ ] Medir LCP, INP (se houver dados reais de campo), CLS, peso transferido e requisições no DevTools.
- [ ] Verificar imagens em 360 px, 390 px, 768 px e desktop com rede limitada.
- [ ] `git diff --check`, testes de CRM, vitrine e SEO aprovados antes de qualquer PR para `main`.

## Testes realmente executados neste preparo

- `node --check` das Functions e dos JS de vitrine/CRM modificados: OK.
- `node --experimental-sqlite tests/media-variants-4.7.test.mjs`: OK (multipart principal/miniatura, metadata, ACL e chave inválida).
- `node --experimental-sqlite tests/r2-media.test.mjs`: OK, 166 verificações da mídia legada.
- `py tools/test_migrar_r2_webp.py`: OK (WebP, hash/HEAD, reexecução, UPDATE condicional, alias D1 e verificação sem exclusão).
- Verificação sintática do patch SSR em fixture equivalente: OK.
- A suíte `npm test` do snapshot fornecido **não conclui** porque o `package.json` referencia `tests/access-release-4.4.0.test.mjs` ausente nesse ZIP. Não estamos afirmando que a suíte da branch real foi validada.

## Fontes oficiais para confirmação técnica

- Cloudflare R2 Workers API: https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
- Cloudflare Images/Transformations: https://developers.cloudflare.com/images/optimization/transformations/overview/
- Performance do LCP: https://web.dev/articles/optimize-lcp
- Core Web Vitals: https://developers.google.com/search/docs/appearance/core-web-vitals
- PSI e diferenças laboratório/campo: https://developers.google.com/speed/docs/insights/v5/about
