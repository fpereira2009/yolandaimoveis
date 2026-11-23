# Yolanda CRM 4.5.3 — Hotfix 1: dropdown "Tipo" no cadastro e edição de imóveis

Data: 22/11/2026. Base: **projeto completo 4.5.3**, sem incluir as alterações SEO/SSR 4.6.0 em preparação.

## O que mudou

- `public/app/index.html`: `#prop-type` passa de `<input list="prop-type-options">` para `<select id="prop-type">`, com os mesmos seis valores já disponíveis: `Casa`, `Apartamento`, `Terreno`, `Comercial`, `Chácara/Sítio` e `Cobertura`.
- `public/js/crm-properties.js`: ao cadastrar imóvel, a seleção inicial é `Casa`. Ao editar imóvel com tipo preexistente fora das seis opções, o valor atual é inserido no dropdown como opção temporária, evitando perdê-lo; essa opção desaparece ao voltar ao cadastro de outro imóvel. O payload continua usando `type: g('prop-type')` e os mesmos endpoints.
- `public/app/index.html`: a referência do script de propriedades usa `?v=4.5.3-hf1`, para evitar manter o JS anterior em cache.
- `CHANGELOG.md`: entrada específica do hotfix, sem alterar versão contratual 4.5.3.
- `tests/hotfix-4.5.3-tipo-dropdown.test.mjs`: 30 verificações; incluídas no comando `npm test` do `package.json`.

## Arquivos alterados

1. `public/app/index.html`
2. `public/js/crm-properties.js`
3. `CHANGELOG.md`
4. `package.json`
5. `tests/hotfix-4.5.3-tipo-dropdown.test.mjs` (novo)
6. `LEIA-ME-HOTFIX-4.5.3-TIPO-DROPDOWN.md` (novo)

Nenhuma mudança em `wrangler.toml`, migrations, APIs, bindings, R2, D1, regras de leads, políticas ou identidade visual.

## Testes locais

- `npm test`: **805 verificações aprovadas** (775 herdadas + 30 novas). O teste R2 inclui uma exceção simulada e esperada; o comando terminou com status 0.
- A edição de imóveis com tipos personalizados foi testada sem criar HTML a partir do texto (usando `textContent`).
- **A implantação remota e o UAT de navegador ainda não foram executados.**

## Aplicação no VS Code

1. `git status` para confirmar que não há mudanças locais pendentes; `git switch dev` e `git pull --ff-only origin dev`.
2. Extrair **somente os arquivos alterados** na raiz do projeto, preservando os caminhos. Alternativamente, utilizar o ZIP completo como referência, sem sobrescrever trabalho posterior 4.6.0.
3. Confira `git diff` dos arquivos alterados e execute `npm test`.
4. Faça commit do hotfix em `dev` e use o fluxo GitHub já configurado para gerar Preview. Não há comandos de deploy Pages nem migration neste pacote.
5. Homologue no CRM (`/app/`): abra **Novo Imóvel**, verifique o dropdown e suas seis opções; altere o tipo, salve e reabra; edite imóvel existente, confirme a seleção correta e que os demais campos permanecem intactos; no mobile, verifique o seletor nativo.
6. Só promova o hotfix de `dev` para `teste` e `main` quando o Preview for aprovado.

**Atenção:** esta entrega foi gerada sobre a versão 4.5.3 original, **não** sobre os arquivos da 4.6.0. Se você já incorporou mudanças SEO em sua branch, aplique apenas as alterações pontuais e revise conflitos antes de fazer commit.
