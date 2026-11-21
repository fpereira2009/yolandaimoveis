# Yolanda CRM 4.3.4 — revisão da resolução de disputa (Preview)

## Por que esta revisão foi necessária?
A implementação anterior só executava a requalificação quando `env.MEDIA_ENV === 'preview'`. Se a variável não estivesse disponível durante a execução da Pages Function, o fechamento como Ganho atualizava o imóvel, mas **deixava os demais leads vinculados**. Os testes locais anteriores usavam sempre `MEDIA_ENV=preview`, portanto não reproduziam a falha de configuração.

Nesta revisão, para o pacote de **homologação de Preview**, a regra é executada quando `MEDIA_ENV` for `preview` **ou estiver ausente**, mas permanece desabilitada quando seu valor for explicitamente `production`. O comportamento exato pode ser conferido por rota de diagnóstico protegida. **Antes de publicar em produção, garanta que MEDIA_ENV=production esteja efetivamente configurado para Production**. Não faça merge do pacote sem essa verificação e homologação.

## Regras implementadas
1. `Ganho`, com imóvel interno realmente associado por `leads.property_id`, em status Disponível/Reservado: encerra o vencedor e altera o imóvel para Vendido ou Alugado; **todos os demais leads ativos vinculados** ao mesmo `property_id` vão para Qualificação, `property_id=NULL`, `property=''`, `external_property=0`, `external_property_ref=''` e follow-up para **hoje** no fuso `America/Sao_Paulo`. Um evento de histórico é inserido para cada afetado. O fechamento, os eventos, a requalificação e o status do imóvel são executados em **uma única chamada `env.DB.batch([...])`**.
2. `Perdido`: encerra somente aquele lead. Outros leads permanecem exatamente como estavam. A reserva só é liberada se **nenhum outro interessado ativo** estiver associado ao imóvel.
3. Fechados (Ganho/Perdido) são excluídos do contador `Em negociação` na aba Imóveis. Leads fechados não são reabertos pela rotina de conflito.
4. Um lead não pode ser fechado como Ganho com um imóvel interno que já esteja Vendido, Alugado ou Inativo. A API retorna HTTP 409.
5. Os textos livres de `Imóvel / Região de Interesse` **não criam vínculo interno**. Para a automação funcionar, o código precisa estar salvo em `property_id` (a UI exibe explicitamente o código associado).

## Como confirmar que o código atualizado está rodando
Depois do push na branch de preview, entre no CRM com a sessão Cloudflare Access autenticada e abra no navegador:

`https://SEU-PREVIEW/api/diagnostics/disputes`

Resposta esperada:

```json
{"apiVersion":"4.3.4-revisao-1","mediaEnv":"preview","disputeRulesEnabled":true,"dbBindingAvailable":true}
```

Se `mediaEnv` for `null`, a regra nesta revisão ainda fica ativa no pacote Preview. **Se `mediaEnv` vier como `production` e `disputeRulesEnabled=false`, ajuste as variáveis/bindings do ambiente Preview no Cloudflare Pages antes de homologar**. Se a rota retornar 404, a API da revisão ainda não está publicada na branch acessada.

Após fechar um lead como Ganho, a resposta de `POST /api/leads/LD-.../close` inclui `disputeResolution` com `competitorsRequalified` (quantidade **real** de concorrentes alterados pelo banco). A interface exibe essa quantidade no aviso de sucesso.

## Teste manual mínimo
- Crie um imóvel disponível e dois leads Interessado com **o mesmo código exibido em `Imóvel associado ao atendimento`**. Leve ambos à Proposta Enviada (o imóvel deve ficar Reservado).
- Feche um como Ganho: o imóvel deve ficar Vendido (ou Alugado), o concorrente deve ficar Qualificação, sem vínculo, follow-up hoje. Confira a resposta `competitorsRequalified: 1`.
- Em outro imóvel, cadastre dois leads, reserve por um e feche-o como Perdido: o segundo não muda e o imóvel continua Reservado. Feche também o segundo como Perdido: o imóvel volta para Disponível.
- Confirme o contador `Em negociação` sem considerar leads fechados.

## Consultas D1 (somente leitura, Preview)
```bash
npx wrangler d1 execute yolanda-crm-dev --env preview --remote --config wrangler.toml --command "SELECT p.id AS imóvel_id, p.status, l.id AS lead_id, l.stage, l.close_result, l.property_id, l.followup_at FROM properties p JOIN leads l ON l.property_id=p.id WHERE p.deleted_at IS NULL AND l.deleted_at IS NULL ORDER BY p.id DESC, l.id DESC LIMIT 30;"
```

Conferir descrições que têm código textual mas não vínculo real:
```bash
npx wrangler d1 execute yolanda-crm-dev --env preview --remote --config wrangler.toml --command "SELECT id, name, property, property_id, stage FROM leads WHERE deleted_at IS NULL AND property_id IS NULL AND property LIKE '%YTI-%' LIMIT 30;"
```

O projeto **não exige migration nova**, nem alteração em R2 ou `wrangler.toml` nesta revisão.

## Arquivos alterados
- `functions/api/[[route]].js`
- `functions/api/%5B%5Broute%5D%5D.js` (espelho original mantido idêntico)
- `public/app/index.html`
- `tests/conflicts-4.3.4.test.mjs`
- este README

## Testes locais
```
node --experimental-sqlite tests/conflicts-4.3.4.test.mjs
node --experimental-sqlite tests/preview-crm.test.mjs
node --experimental-sqlite tests/r2-media.test.mjs
node tests/ui-4.3.2.test.mjs
node tests/vitrine-sem-imagem.test.mjs
```
Todos os testes foram realizados localmente com migrations e SQLite em memória; **não houve acesso a D1 remoto nem deploy**. Testes de concorrência real entre requisições simultâneas em Pages/D1 e de cache/distribuição ainda dependem de homologação em ambiente publicado.
