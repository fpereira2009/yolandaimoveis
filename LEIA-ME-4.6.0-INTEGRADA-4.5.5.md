# Yolanda CRM 4.6.0 SEO/SSR, integrada sobre o ZIP 4.5.5

**Data:** 22/11/2026. **Status:** arquivos preparados e testes locais executados. **Nenhum deploy ou escrita remota executados.**

## 1. Base exata e achado que mudou o plano

A versão que o usuário chamou de **4.5.5** já contém uma implementação preliminar de URLs amigáveis:

- `migrations/0009_public_url.sql` contém `public_url_terms` (sem campo `slug`);
- `functions/_shared/property-url.js` define `propertyPath()`;
- `functions/imoveis/[slug].js` e `functions/sitemap.xml.js` já existem;
- `functions/_middleware.js` redireciona links `?imovel=YTI-####`;
- `public/js/vitrine-app.js` já tem `<a href="...">Ver Detalhes</a>` e prioriza `prop.url`;
- `public/_routes.json` já permite `/imoveis/*` e `/sitemap.xml`.

Portanto, **não aplicar a antiga `0009_vitrine_slug_imoveis.sql`** do pacote 4.6 anterior: o número `0009` pertence à migration `0009_public_url.sql` desta base. Criamos somente `0010_seo_slug_4_6_0.sql`.

O ZIP da base contém o hotfix de Tipo (dropdown) em `public/app/index.html` e `public/js/crm-properties.js`. Estes arquivos foram mantidos **idênticos**, assim como `public/index.html`, `public/js/vitrine-app.js`, `wrangler.toml`, o código de API comercial e as migrations 0001–0009.

## 2. Alterações realizadas

- `migrations/0010_seo_slug_4_6_0.sql`: coluna `slug`, índice único, view de normalização de acentos, backfill e triggers para INSERT / atualização de tipo, metragem, quartos, bairro e cidade. `Comercial` e `Terreno` usam `450m2`, `120m2` etc.; imóvel residencial usa `3-quartos`, `1-quarto` etc.; área desconhecida vira `area-nao-informada`.
- `functions/_shared/property-url.js`: usa o slug persistido; fallback à lógica de `public_url_terms` para transição.
- `functions/_middleware.js`: inclui `slug` ao pesquisar link antigo `?imovel=`. Preserva as regras JWT e cabeçalhos do CRC, sem alterações funcionais.
- `functions/_shared/property-seo.js` (novo): template visual com a paleta e fontes atuais, SEO no HTML inicial, escaping/XSS, JSON-LD, OG, galeria de imagens R2, preço, área, cadastro de interesse e WhatsApp.
- `functions/imoveis/[slug].js`: página SSR no Preview, consulta parametrizada ao D1, 301 para slug alterado com ID igual, 404 para inativo/não encontrado, 503 sem revelar detalhes de erro.
- `functions/sitemap.xml.js`: XML dos imóveis publicados em Preview, marcado noindex.
- `functions/robots.txt.js` (novo) + `public/_routes.json`: `Disallow: /` no Preview, sem alterar o `public/robots.txt` institucional.
- `public/js/property-detail-preview.js` (novo): galeria, compartilhamento e formulário de lead com `property_code` enviado à API atual; nenhum JS de CRM foi refeito.
- `package.json`: acrescenta testes SEO e corrige a referência inválida a `tests/access-release-4.4.0.test.mjs` (arquivo ausente no ZIP 4.5.5) para o existente `tests/access-jwks-diagnostic.test.mjs`. A versão 4.5.3 de `package.json` permanece por compatibilidade com os testes herdados; o nome de entrega é 4.6.0.
- `tests/hotfix-4.5.3-tipo-dropdown.test.mjs`: corrige regex do teste para aceitar CRLF do Windows (falhava **na base recebida**, antes da integração). **Não altera** o dropdown no CRM.
- `tests/seo-4.6.0-integration.test.mjs`, `tests/seo-4.6.0-migration.py`: testes novos.
- `tools/gerar_sync_preview.py`, `tools/copiar_r2_prod_para_preview.ps1`, `tools/test_gerar_sync_preview.py`: sincronização offline do D1 e cópia direcionada do R2, com teste do script atualizado para os caminhos reais da 4.5.5.

## 3. Regra de segurança e ambiente

- Alterações de código somente no repositório local (branch de trabalho criada pelo usuário) e, depois, em deploy **Preview**.
- `wrangler.toml` foi preservado: Production `yolanda-crm` / `yolanda-imoveis-prod`; Preview `yolanda-crm-dev` / `yolanda-imoveis-dev`.
- A nova SSR exige `MEDIA_ENV=preview` e bindings `DB` + `MEDIA_BUCKET`. Retorna 404 em Production para evitar ativar a 4.6.0 antes da promoção aprovada.
- Páginas e sitemap do Preview retornam `X-Robots-Tag: noindex, nofollow` e `robots.txt` bloqueia rastreadores.
- **Esta entrega não está pronta para publicação em `main`**: antes da promoção, a migration deve ser planejada no D1 de Production e o bloqueio `MEDIA_ENV=preview` ajustado de forma controlada após homologação.
- Production é apenas origem **somente leitura** para exportar snapshot; jamais executar `migrations apply`, `d1 execute --file`, DELETE ou upload no banco/bucket de Production neste procedimento.

## 4. Integração local sem perder o hotfix

Dentro da raiz do repositório local:

```powershell
git status
git switch dev
git pull --ff-only origin dev
git switch -c feature/seo-460-sobre-455
```

Extraia **o ZIP somente alterações** sobre a raiz do repositório, preservando as pastas. Antes, faça cópia de segurança local da branch ou assegure que `git status` esteja limpo. Não extraia o **ZIP completo** sobre uma branch que contenha mudanças mais recentes sem comparar com `git diff`.

```powershell
git diff --check
npm test
python tests/seo-4.6.0-migration.py
python tools/test_gerar_sync_preview.py
```

O `npm test` foi executado com sucesso em Node 22.16 local. No teste de R2 há uma exceção simulada e esperada `Falha R2 simulada`, mas o processo finaliza com sucesso.

Não inclua `.git`, `.wrangler`, `production.sql`, `preview.sql`, dados reais ou arquivos de backup no commit. O ZIP completo distribuído **não contém `.git` nem dados D1/R2**.

## 5. Renovar D1 Preview com snapshot de Production

**Antes** de iniciar, interrompa alterações no CRC Preview e confira as bindings no painel Cloudflare. O operador deve possuir backups e estar autorizado a copiar eventuais dados pessoais existentes em leads/histórico.

### 5.1 Backups (nenhuma alteração remota)

```powershell
$backupDir = Join-Path $env:USERPROFILE ('Documents\Yolanda_Backups\SEO460_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
npx wrangler d1 export yolanda-crm --remote --output="$backupDir\production.sql"
npx wrangler d1 export yolanda-crm-dev --env preview --remote --output="$backupDir\preview_antes.sql"
```

Confirme que ambos os exports retornam exit code 0, têm tamanho não nulo e estão fora do Git.

### 5.2 Alinhar schema no Preview (somente banco dev)

```powershell
npx wrangler d1 migrations list yolanda-crm-dev --env preview --remote
```

Deve aparecer a migration **`0009_public_url.sql`**, não o antigo arquivo `0009_vitrine_slug_imoveis.sql`. Confira a lista; se houver alguma `0009` incompatível aplicada, **pare e analise antes de seguir**. Depois execute apenas para Preview:

```powershell
npx wrangler d1 migrations apply yolanda-crm-dev --env preview --remote
npx wrangler d1 export yolanda-crm-dev --env preview --remote --output="$backupDir\preview_schema_460.sql"
```

`preview_antes.sql` continua sendo o backup anterior às migrations. `preview_schema_460.sql` é o snapshot para a ferramenta offline já com a coluna `slug` no destino.

### 5.3 Gerar o SQL de sincronização e validar antes da limpeza

```powershell
python tools/gerar_sync_preview.py --production-export "$backupDir\production.sql" --preview-export "$backupDir\preview_schema_460.sql" --out-dir "$backupDir\gerado"
Get-Content "$backupDir\gerado\manifesto_sem_dados_pessoais.json"
```

A ferramenta exige exatamente **3 imóveis e 0 clientes em Production**, interrompendo caso os números mudem. Copia outras tabelas comerciais conforme os dados reais, sem inventar leads ou clientes. Se os backups apresentarem tabelas ou colunas incompatíveis, não gera SQL aplicável.

### 5.4 Copiar fotos R2 antes de alterar o D1 Preview

```powershell
powershell -ExecutionPolicy Bypass -File tools/copiar_r2_prod_para_preview.ps1 -Manifest "$backupDir\gerado\r2_prod_manifest.csv" -PastaTemporaria "$backupDir\r2_temporario" -ConfirmarCopiaPreview
```

Lê apenas `yolanda-imoveis-prod`, grava apenas `yolanda-imoveis-dev`. Não apaga imagens. Confirme que todos os objetos do manifesto foram copiados.

### 5.5 Substituir dados comerciais SOMENTE no D1 Preview

**Atenção: operação destrutiva no Preview** (requer backups e confirmação do manifesto), nunca executar no D1 Production.

```powershell
npx wrangler d1 execute yolanda-crm-dev --env preview --remote --file "$backupDir\gerado\SOMENTE_PREVIEW_SUBSTITUIR_DADOS.sql"
```

Essa cópia é pontual, **não** sincronização contínua. O processo remove os dados comerciais antigos do Preview antes de inserir as linhas de Production com IDs originais. O script não apaga tabelas, migrations nem arquivos R2 antigos não referenciados.

### 5.6 Validar

```powershell
npx wrangler d1 execute yolanda-crm-dev --env preview --remote --command "SELECT code,type,bedrooms,area_m2,slug,status FROM properties ORDER BY id;"
npx wrangler d1 execute yolanda-crm-dev --env preview --remote --command "SELECT COUNT(*) AS clientes FROM clients;"
npx wrangler d1 execute yolanda-crm-dev --env preview --remote --command "PRAGMA foreign_key_check;"
```

Resultado esperado se os dados ainda correspondem ao informado: **3 imóveis e 0 clientes**; slugs corretos; sem violações de FK; galeria R2 do Preview carregando fotos reais copiadas. Qualquer erro: interrompa e recupere usando `preview_antes.sql`/recuperação D1 (evite repetir SQL às cegas).

## 6. Homologação Cloudflare Pages

Confira que Pages e D1 Preview estão vinculados ao ambiente de **Preview** (e não ao banco/bucket Production). No projeto `yolanda-site`, publique pelo seu fluxo GitHub na branch `dev` ou branch temporária conectada à homologação, sem PR para `main`.

Verifique:

1. Vitrine e CRC 4.5.5 intactos: filtro, modal, WhatsApp com texto, campos de telefone/valor, dropdown **Tipo** com seis opções e retenção de tipo personalizado.
2. Cards apontam para `/imoveis/<slug>` (o código existente já prioriza `prop.url` da API pública).
3. Casa/apartamento: `<n>-quarto(s)`; Terreno/Comercial: `<n>m2`; caracteres acentuados normalizados; links alterados retornam 301.
4. Fonte HTML do imóvel contém `<title>`, description, canonical, OG, `application/ld+json`, primeira foto; não depende de renderização JS para leitura por buscadores.
5. 404 para imóvel inativo, excluído, alugado ou vendido; 503 controlado para erro D1.
6. `https://dev.yolanda-site.pages.dev/robots.txt` deve responder `Disallow: /` e HTML do Preview conter `X-Robots-Tag: noindex`.
7. Formulário de interesse mantém `property_code` no POST `/api/public/contact` e integra com lead do CRC.

Se o Preview não estiver usando exatamente a branch `dev`, ajuste o fluxo GitHub de acordo com a configuração existente. **Não publique em Production** sem UAT, backup e migração de produção separados.

## 7. Relatório de execução local

- `npm test`: sucesso na base 4.5.5 integrada (inclui 4.5.1/4.5.2/4.5.3 e hotfix dropdown).
- `python tests/seo-4.6.0-migration.py`: sucesso no schema real 0001–0009 + 0010; backfill, área, acentos, singular, triggers e unicidade.
- `python tools/test_gerar_sync_preview.py`: sucesso com bases fictícias, 3 imóveis Production/0 clientes e Preview fictício; nenhum acesso remoto.
- Integração completa com `wrangler dev` e testes UAT em navegadores reais: **ainda pendentes**.
