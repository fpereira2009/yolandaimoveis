# Yolanda CRM 4.3.1 — Preview | Zoom, fotos R2 e descrição formatada

## Escopo

Esta entrega parte do pacote R2 anterior e destina-se **apenas à branch / ao ambiente Preview**. O D1 configurado em `wrangler.toml` para preview é `yolanda-crm-dev`; o bucket R2 é `yolanda-imoveis-dev`. Nenhum comando de deploy é fornecido. `wrangler.toml`, migrations existentes, demais regras de leads e status de imóveis permaneceram inalterados.

## Alterações

1. **Zoom no detalhe do imóvel (vitrine pública):** duplo clique na fotografia em desktop ou dois toques próximos no smartphone alternam ampliação de 2,2×. No modo ampliado, arraste para explorar; outro duplo clique/dois toques retorna ao tamanho original. Setas continuam navegando pela galeria, o swipe entre fotos funciona sem zoom e trocar/fechar foto restaura o estado.
2. **Somente upload R2 no CRM (preview):** o campo de inclusão de foto por URL e seus handlers de pré-visualização foram removidos, assim como a leitura de URLs de fotos no importador CSV da interface. Criação, edição e importação via API passam a recusar `photo_url` não vazio **quando `MEDIA_ENV=preview`**, devolvendo HTTP 400 (importação em lote informa a linha ignorada). Outros ambientes não têm o contrato legado alterado para proteger produção.
3. **Links antigos:** a coluna `properties.photo_url` permanece intacta no banco, mas **não é usada para obter a capa no Preview**. Imóveis com fotos apenas no sistema antigo ficarão sem foto cadastrada no Preview até receberem novas fotos R2. Não existe migração automática de fotos antigas.
4. **Descrição formatada:** editor visual `contenteditable` no CRM com negrito, itálico e listas; ao colar conteúdo HTML formatado da IA, preserva títulos, parágrafos e marcadores. O D1 armazena **Markdown**, não HTML executável. A vitrine converte Markdown em HTML escapado e apresenta a formatação. O limite original de **2.000 caracteres** continua, inclusive na validação da API/SQLite. Campos e regras do imóvel permanecem iguais.

## Arquivos alterados/criados

- `public/app/index.html` — formulário de imóveis, upload somente R2, editor e importador CSV.
- `public/index.html` — zoom, swipe e descrição formatada no detalhe do imóvel.
- `public/js/property-description.js` (novo) — conversão Markdown/HTML controlada, sem bibliotecas adicionais.
- `functions/api/[[route]].js` e `functions/api/%5B%5Broute%5D%5D.js` — bloqueio de URL no preview e serialização do portfólio (duas cópias existentes permanecem idênticas).
- `functions/_shared/property-media.js` — capa exclusivamente R2 em preview.
- `tests/r2-media.test.mjs` — regressão de novas regras e controles.
- `LEIA-ME-4.3.1-PREVIEW.md` (novo) — este guia.

## Implantação e verificação (sem comandos de deploy)

1. Extraia o ZIP de **arquivos modificados** sobre o projeto na branch Preview, mantendo a mesma estrutura de diretórios.
2. Confirme que `MEDIA_ENV=preview`, `DB=yolanda-crm-dev` e `MEDIA_BUCKET=yolanda-imoveis-dev` estão configurados no ambiente Preview no Cloudflare Pages; não use credenciais de produção.
3. Execute testes locais: `node --experimental-sqlite tests/r2-media.test.mjs` e `node --experimental-sqlite tests/preview-crm.test.mjs`.
4. Se necessário validar o D1 remoto (sem modificar dados):

   ```bash
   npx wrangler d1 execute yolanda-crm-dev --env preview --remote --config wrangler.toml --command "PRAGMA table_info(properties);"
   npx wrangler d1 execute yolanda-crm-dev --env preview --remote --config wrangler.toml --command "SELECT COUNT(*) AS total FROM property_images;"
   npx wrangler d1 execute yolanda-crm-dev --env preview --remote --config wrangler.toml --command "PRAGMA foreign_key_check;"
   ```

5. Teste manual no preview:
   - Abra um imóvel com várias fotos no desktop. Dê **duplo clique** sobre a foto, arraste e clique duas vezes novamente; confirme o zoom e o retorno normal.
   - No smartphone, dê **dois toques próximos** sobre a foto; arraste a imagem ampliada. Dê dois toques novamente. Fora do zoom, deslize para a foto seguinte e confira o contador.
   - Crie e edite um imóvel. Confirme que só há **seleção de fotos do dispositivo** e definição da capa, sem campo URL.
   - Importe CSV que contenha coluna `foto_url`: não deve importar links desse campo; o restante dos dados deve funcionar.
   - Cole da IA uma descrição com **negritos, título, parágrafos e listas**, salve, reabra o editor e visualize o resultado na vitrine.
   - Tente enviar via API uma URL externa para `photo_url` no preview: a operação deve ser rejeitada.
   - Confira a legibilidade no desktop e no mobile e as rotas existentes para leads, CRC, Kanban, fechamento e reserva.

## Segurança, compatibilidade e limites

- O HTML colado não é enviado ao banco; tags, scripts, estilos e atributos de origem são descartados na conversão. A vitrine escapa entidades HTML antes de renderizar o Markdown; links da descrição permanecem texto, não links clicáveis, de propósito.
- O acesso ao upload e à exclusão de fotos segue protegido pelas Pages Functions e pela autenticação já existente.
- A interface usa `document.execCommand` para comandos básicos de formatação, compatível com os navegadores móveis/desktop mais comuns, mas o teste de colagem real deve incluir Safari iOS e Chrome Android.
- O limite de 2.000 caracteres é **texto Markdown já formatado**. Se excedido, o CRM exibe aviso e não salva.
- Não foi feita migração nova, transferência de imagens, execução remota no D1/R2, alteração no ambiente de produção ou deploy.
