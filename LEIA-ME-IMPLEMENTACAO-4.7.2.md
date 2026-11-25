# Yolanda CRM 4.7.2 — Otimização de JavaScript e Mídia | Preview

**Escopo:** somente a homepage/vitrine pública. **Não altera** `/app` (CRM), APIs, Functions, D1, R2, schema, SSR, conteúdo, cores ou layout. Nada é publicado automaticamente. Base obrigatória: **4.7.1 já incorporada à `dev`**.

## 1. O que muda

| Item | Antes (4.7.1) | Depois (4.7.2) |
|---|---|---|
| Lucide na vitrine | UMD CDN externo, 82 KB transferidos no Lighthouse | JS local com somente os **16 ícones** usados, arquivo de aproximadamente 4 KB |
| Compatibilidade | `window.lucide.createIcons()` | A mesma API; atualiza ícones em cards, galeria e modal |
| Favicon | `/img/logo.png` ~170 KB | `/img/favicon-32.png` ~2,2 KB |
| Ícone iOS | `/img/logo.png` ~170 KB | `/img/apple-touch-icon-180.png` ~22,6 KB |
| Avatar dinâmico do modal | `/img/fotocorretora.jpeg` | `/img/fotocorretora-480.webp` já existente na 4.7.1 |

**Limites:** o ganho em Lighthouse só pode ser medido após deployment. O carregamento de fotos dos anúncios R2 permanece intacto; não criamos uma versão de 960 px nem alteramos banco/objetos. As fontes Google Fonts permanecem iguais nesta etapa para evitar regressão de tipografia/CLS. O renderer simplificado tem licença/atribuição Lucide em `public/js/LICENSE-LUCIDE.txt`.

## 2. Criar a branch de desenvolvimento

No PowerShell na raiz do repositório:

```powershell
git switch dev
git pull --ff-only origin dev
git switch -c perf/otimizacao-vitrine-472
```

Confirme que os ajustes da 4.7.1 já estão presentes e que `public/css/tailwind.min.css` está versionado. **Se não estiver, pare e resolva a base antes de avançar.**

## 3. Copiar os arquivos do ZIP

Extraia o ZIP em uma pasta temporária e copie as pastas `public`, `tools`, `tests` e `performance` para as respectivas pastas do repositório, preservando os caminhos.

**Não copie um `index.html` pronto:** o pacote não traz esse arquivo, e também não inclui um `vitrine-app.js` completo. A alteração dos dois arquivos é feita pelo script, respeitando o HTML/JS existente na sua branch.

Observação: incluímos novamente `tests/test_performance_471.py` para corrigir a possível ausência do arquivo no pacote anterior. Se você já tiver uma versão local diferente, compare antes de sobrescrever.

## 4. Validar e aplicar

```powershell
py tools/aplicar_performance_472.py --check
```

**Somente se terminar com `CHECK OK`**, execute:

```powershell
py tools/aplicar_performance_472.py --apply
```

O script:
- recusa a branch `main`;
- exige CSS 4.7.1, avatar WebP, ícones e favicon locais;
- confere a existência de exatamente **16 nomes de ícones** no HTML/JS;
- aborta se as referências esperadas diferirem;
- guarda um backup fora do repositório, na pasta temporária;
- somente altera `public/index.html` e a referência `BROKER_AVATAR` em `public/js/vitrine-app.js`.

Aplicar de novo não duplica conteúdo. **Se der `BLOQUEADO`, não force alterações manuais; revise o erro e a branch.**

## 5. Testes automatizados

```powershell
node --check public/js/lucide-vitrine-472.js
node --check public/js/vitrine-app.js
node --test tests/performance-4.7.2.test.mjs
py tests/test_performance_472.py
npm test
git diff --check
git status --short
```

Os novos testes verificam ícones dinâmicos, atributos de acessibilidade, favicon, manutenção dos scripts e HTML. **O `npm test` completo depende dos testes legados presentes na branch atual**. Se ele falhar por arquivo ausente ou dependência pré-existente, não avance até esclarecer.

## 6. Homologação visual/funcional

Teste no Preview autenticado pelo Cloudflare Access:

1. Homepage mobile e desktop sem mudança de cores, fontes, dimensões ou alinhamento;
2. Header: logotipo, cadeado, WhatsApp, menu mobile e botão de busca;
3. Filtros: finalidade, localização, tipo, dormitórios e pesquisa;
4. Cards: ícones de localização, WhatsApp e compartilhamento;
5. Imóvel sem foto: texto **“Imagem não disponível”**, sem foto fictícia;
6. Modal: abrir, navegar no carrossel com setas e fechar pelo **X**;
7. Botão de sincronização e avatar da corretora no modal, sem erro no Console;
8. Abrir uma URL de imóvel SSR em nova aba, sem alteração dos dados estruturados.

Na aba **Network**, com **Disable cache**, confirmar:

- `/js/lucide-vitrine-472.js?v=4.7.2` → HTTP 200;
- `https://unpkg.com/lucide@0.469.0` e `.../lucide.min.js` → **nenhuma requisição na homepage** (a tela CRM `/app` não é alterada);
- `/img/favicon-32.png` → HTTP 200 (o navegador pode não requisitar o apple-touch icon);
- `public/css/tailwind.min.css` → HTTP 200;
- a API pública e imagens R2 continuam carregando.

**Aviso:** abrir `public/index.html` como arquivo `C:\...` não é teste válido; sirva com HTTP ou use Preview. O servidor Python local valida apenas recursos estáticos, não Functions/D1/R2.

## 7. Commit e deployment no DEV Preview

**Depois dos testes e revisão das alterações:**

```powershell
git add public/index.html public/js/vitrine-app.js public/js/lucide-vitrine-472.js public/js/LICENSE-LUCIDE.txt
git add public/img/favicon-32.png public/img/apple-touch-icon-180.png
git add tools/aplicar_performance_472.py tools/comparar_lighthouse_472.py
git add tests/performance-4.7.2.test.mjs tests/test_performance_472.py
# Opcional, se estiver ausente e revisado:
git add tests/test_performance_471.py

git diff --cached --check
git diff --cached --stat
git commit -m "perf: reduzir Lucide e icones da vitrine 4.7.2"
git push -u origin perf/otimizacao-vitrine-472
```

Crie o PR com **base `dev`** e compare `perf/otimizacao-vitrine-472`. Não faça merge em `main` ou `teste` nessa fase. Após o merge, aguarde o deployment da branch `dev` com status **Success**, e então execute Lighthouse Mobile pelo Chrome autenticado.

## 8. Comparar Lighthouse

Exporte um novo relatório `.json` após a publicação no Preview. Compare o JSON da 4.7.1 com o da 4.7.2:

```powershell
py tools/comparar_lighthouse_472.py --antes ".\relatorio-471.json" --depois ".\relatorio-472.json"
```

**Baseline medido 4.7.1:** Performance 78, FCP 1,6 s, LCP 3,0 s, TBT 620 ms, CLS 0,065. **Meta 4.7.2:** reduzir o TBT, aproximar LCP de 2,5 s e Performance de 90, sem regressão funcional. São metas, não garantias.

Repita três vezes nas mesmas condições e compare medianas. O Lighthouse anterior teve diferenças de CPU simulada entre execuções; por isso comparar uma única pontuação seria enganoso.

## 9. Reversão

Antes do commit, confira os arquivos alterados com `git diff`. Se a alteração 4.7.2 não for aprovada e **não existirem outras edições locais nesses dois arquivos**, restaure:

```powershell
git restore -- public/index.html public/js/vitrine-app.js
```

Os backups completos também ficam no diretório temporário `Yolanda-4.7.2-backups`. Após o merge em `dev`, prefira um `git revert` específico do commit 4.7.2, em novo PR, sem mexer em Production. Não exclua as imagens históricas do R2 nem execute migração D1.
