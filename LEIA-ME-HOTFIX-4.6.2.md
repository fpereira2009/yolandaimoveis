# Yolanda CRM 4.6.2 — Hotfix SEO Production

Este pacote corrige **somente** três arquivos de Functions. Não altera banco D1, R2, vitrine nem CRM.

## Alterações

- `functions/sitemap.xml.js`: remove restrição de Preview; XML disponível em Preview e Production, e `X-Robots-Tag: noindex` somente no Preview.
- `functions/imoveis/[slug].js`: permite consulta aos bindings do ambiente Preview/Production; páginas de imóveis ativos ficam indexáveis somente em Production; inexistentes continuam 404 + noindex.
- `functions/_shared/property-seo.js`: meta `robots` depende do ambiente, mantendo `noindex,nofollow` em Preview.

## Aplicação pelo VS Code/PowerShell (Windows)

1. Na pasta raiz do projeto, crie a branch **a partir da dev atualizada**:

```powershell
git status
git switch dev
git pull --ff-only origin dev
git switch -c fix/seo-production-462
```

2. **Preferencial:** descompacte este ZIP em uma pasta temporária e copie **somente os três arquivos JS** preservando os caminhos `functions/...` dentro da raiz do projeto. Faça backup das versões existentes se desejar. A cópia substitui os arquivos completos; confira `git diff` para garantir que não haja mudanças não relacionadas.

   **Alternativa (patch):** copie `Hotfix_4.6.2_SEO_Production.patch` para a raiz do projeto e execute:

```powershell
git apply --check --ignore-whitespace .\Hotfix_4.6.2_SEO_Production.patch
git apply --ignore-whitespace .\Hotfix_4.6.2_SEO_Production.patch
```

Se o `git apply --check` falhar, **não force**: o código da branch pode ter divergido da base usada. Use os três arquivos completos com revisão do diff, ou aplique manualmente as alterações.

3. Teste:

```powershell
node --check functions/sitemap.xml.js
node --check 'functions/imoveis/[slug].js'
node --check functions/_shared/property-seo.js
git diff --check
npm test
git diff --stat
git diff
```

4. Suba para homologação conforme o fluxo do projeto (branch de correção -> dev -> teste); publique em **main somente por Pull Request**, conforme a proteção do GitHub.

## Validação depois do deploy de Production

```powershell
curl.exe -i https://yolandaimoveis.com.br/sitemap.xml
curl.exe -i https://yolandaimoveis.com.br/robots.txt
curl.exe -sS -D - -o NUL https://yolandaimoveis.com.br/imoveis/SEU-SLUG-REAL
```

Confirme:
- Sitemap HTTP 200, `Content-Type: application/xml`, URLs reais; nunca `Not Found`.
- URL de imóvel ativo HTTP 200, `canonical` correto, sem `noindex`; HTML da página deve mostrar `index,follow`.
- URL inexistente HTTP 404 e `noindex`.
- Preview continua com `noindex` nas páginas de imóvel.
- O binding `DB` de Production aponta ao D1 `yolanda-crm`; `MEDIA_BUCKET` ao R2 Production; `MEDIA_ENV=production`.
- As migrations 0009 e 0010 já devem estar aplicadas em Production. **Não execute migrations apenas por causa deste hotfix**.

## Fonte e compatibilidade

Arquivos reconstruídos sobre a base 4.6.0 completa previamente fornecida, cujos trechos relevantes coincidem com os trechos da `origin/main` 4.6.1 apresentados na conversa. Ainda assim, **confira o `git diff` antes de commitar**; alterações posteriores nesses três arquivos precisam ser preservadas.

O teste automatizado incluso verifica a sintaxe JavaScript e o comportamento de sitemap/páginas com D1 simulado; ele não substitui a validação na Cloudflare Production.
