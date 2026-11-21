# Yolanda CRM 4.5.3 — Máscara monetária no cadastro e edição de imóveis

Data: 21/11/2026. Base: 4.5.2. Ambiente de destino: homologar primeiro no Preview (`dev`). Não houve deployment remoto.

## Alteração funcional

O mesmo campo `#prop-price`, usado no modal **Novo Imóvel** e **Editar Imóvel**, passa de `type="number"` para `type="text" inputmode="numeric"`. Isso permite mostrar pontos de milhar sem modificar a posição do campo, os estilos CSS ou os demais controles. O campo mantém `required`, recebe `maxlength="13"` e a expressão de validação de entrada `[0-9]{1,3}(\.[0-9]{3})*`.

A máscara monetária já existente em `public/js/crm-input-masks.js` passa a reconhecer `prop-price` e aplica a formatação durante `input`, `focusin` e nos movimentos Backspace/Delete sobre separadores, com preservação do cursor lógico.

`fillPropForm()` apresenta preços vindos do D1 já formatados (ex.: `1250000` vira `1.250.000`). `handleSaveProperty()` envia o valor **sem pontos**, convertido por `window.YolandaMasks.digitsOnly()` antes das requisições `POST /api/properties` e `PATCH /api/properties/:code`. O servidor mantém `money()`/`intIn()` e os prepared statements D1 `.bind()`.

**Importante**: só valores inteiros são aceitos, sem centavos. Valores fora do limite de validação do servidor continuam rejeitados. Nenhuma alteração é necessária na tabela `properties` ou nos registros existentes.

## Arquitetura

A abordagem é evoluir os scripts frontend existentes; não há necessidade de nova Pages Function ou rota: o campo alimenta o CRUD `/api/properties` já existente. A lógica de máscara é compartilhada com o campo monetário de leads, reduzindo duplicações e evitando regressões de contratos, validação e persistência.

## Arquivos relevantes

- `public/app/index.html`: input de preço e cache-busting de scripts.
- `public/js/crm-input-masks.js`: inclusão do ID `prop-price` nas máscaras monetárias.
- `public/js/crm-properties.js`: formatação no preenchimento da edição e normalização na gravação.
- `tests/release-4.5.3.test.mjs`: testes de entrada, cursor, edição, cadastro, API e bindings.
- `CHANGELOG.md`, `package.json`, `package-lock.json`: registro e numeração da release.
- Metadados de versão de API e expectativas de teste adaptados para 4.5.3.

Consulte `ARQUIVOS-ALTERADOS-4.5.3.txt` para a lista completa. Arquivos incluídos são completos, sem placeholders.

## Verificações

Executado: `npm test` com 775 verificações aprovadas, incluindo 30 específicas da 4.5.3; nenhum teste existente falhou. A falha R2 impressa no log é um erro **simulado intencionalmente** pelo teste de exclusão, e o teste foi aprovado.

Confirmada integridade de `wrangler.toml`, migrations D1, middleware Access, bindings D1 e R2 e preservação dos IDs HTML anteriores. A única alteração estrutural no campo foi a troca do tipo e seus atributos de entrada.

## Publicação no Preview

1. Em sua branch `dev`, aplique o ZIP de arquivos modificados **sobre o código 4.5.2** (mantendo pastas relativas).
2. Publique a branch no projeto `yolanda-site` e confirme `Success` no deployment de Preview.
3. Entre em `/app/`, abra **Novo Imóvel**, digite `150000` e confira `150.000`. Salve e reabra; verifique mesmo preço.
4. Edite um imóvel com preço `1250000`; confira `1.250.000`, altere e salve. Confirme valor correto após recarregar.
5. Teste teclas Backspace/Delete próximas aos pontos e digitação no celular. Verifique filtros, leads, vitrine, imagens R2 e acesso Access.
6. Só depois promova para Production, verificando os secrets/bindings específicos de Production e backup do D1.

## Compatibilidade e limites

- `wrangler.toml` e todas as migrations inalterados; nenhuma criação de endpoint, tabela ou campo.
- Preservados os textos de botões WhatsApp restaurados na 4.5.1 e filtros do CRC da 4.5.2.
- Sem alterações nas políticas legais, layout institucional, cores, tipografia ou autenticação JWT.
- Não executado deploy remoto, migração ou alteração em D1/R2.
