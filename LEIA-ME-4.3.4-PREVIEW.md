# Yolanda CRM 4.3.4 — resolução de disputas Lead × Imóvel (Preview)

## Ambiente e escopo
- Implantação inicial: Cloudflare Pages **preview**.
- Banco: D1 `yolanda-crm-dev` (`DB` no `wrangler.toml`).
- A nova automação de fechamento é executada **somente quando `env.MEDIA_ENV === 'preview'`**. Produção continua com o comportamento anterior até uma promoção futura, após homologação.
- Nenhuma migration nova, nenhuma alteração em R2 e nenhum deploy executado.

## Regra 1: fechamento como **Ganho**
Ao fechar um lead interessado como Ganho associado a um imóvel interno disponível ou reservado:
1. O lead vencedor permanece **Fechado / Ganho**, com observação e data do encerramento.
2. O imóvel passa para **Vendido** ou **Alugado**, conforme a finalidade (`properties.purpose`).
3. Todos os **outros leads ativos** (`stage != 'Fechado'` e não excluídos) vinculados ao mesmo `property_id` passam a **Qualificação**.
4. Esses leads perdem a associação: `property_id = NULL`, `property = ''`, `external_property = 0`, `external_property_ref = ''`.
5. O `followup_at` é atualizado para **hoje no fuso America/Sao_Paulo**.
6. Um evento explicativo é registrado para cada lead alterado em `lead_events`.
7. Leads **já fechados** (ganhos/perdidos/legados), independentemente do vínculo histórico, não são reabertos nem alterados.
8. Fechamento do vencedor, eventos dos concorrentes, requalificação dos concorrentes e atualização do imóvel são executados na **mesma transação `env.DB.batch([...])`**.

## Regra 2: fechamento como **Perdido**
- O lead perdido fica **Fechado / Perdido**; seu resultado e histórico são mantidos.
- **Nenhum outro lead é modificado**.
- O imóvel permanece **Reservado enquanto existir outro interessado ativo vinculado** (inclusive em Qualificação); volta para Disponível apenas quando nenhum outro interessado ativo estiver vinculado. As demais transições de etapa continuam seguindo a regra anterior de liberação por etapas de reserva.
- O contador **Em negociação** da aba Imóveis e o KPI de propostas excluem leads com fechamento `Perdido`, além dos leads com etapa `Fechado`.

## Interface
- `public/app/index.html`: após fechar um lead, todas as listas são recarregadas da API, para refletir automaticamente os outros leads alterados e os contadores.
- O texto de confirmação do fechamento Ganho informa quantos outros leads ativos serão requalificados.
- Nenhuma cor, tipografia, estrutura de tela ou ID/evento foi removido.

## Arquivos modificados / criados
- `functions/api/[[route]].js` (regra transacional)
- `functions/api/%5B%5Broute%5D%5D.js` (cópia/espelho existente preservado)
- `public/app/index.html` (contadores, aviso e sincronização)
- `tests/preview-crm.test.mjs` (executa regressão como preview)
- `tests/conflicts-4.3.4.test.mjs` (novo: cenários Ganho/Perdido/rollback/isolamento)
- `LEIA-ME-4.3.4-PREVIEW.md` (este documento)

## Testes locais
Execute na raiz do projeto (Node.js 22+ com SQLite experimental):

```bash
node --experimental-sqlite tests/conflicts-4.3.4.test.mjs
node --experimental-sqlite tests/preview-crm.test.mjs
node --experimental-sqlite tests/r2-media.test.mjs
node tests/ui-4.3.2.test.mjs
node tests/vitrine-sem-imagem.test.mjs
```

**Testes funcionais para fazer no site de preview:**
1. Cadastre imóvel e três leads interessados vinculados. Coloque dois em Proposta Enviada/Documentação-Crédito e o terceiro em Qualificação.
2. Feche um dos leads da proposta como Ganho. Verifique: imóvel Vendido/Alugado; os outros dois em Qualificação, sem imóvel e com follow-up hoje, histórico presente.
3. Recarregue a tela. Confirme que o contador Em negociação não contabiliza o vencedor nem os outros leads desvinculados.
4. Cadastre outro imóvel e dois leads; mantenha um em Qualificação. Feche o que mantém a reserva como Perdido. Verifique que o outro não sofreu alterações e que o imóvel continua Reservado.
5. Feche o último lead ativo como Perdido. Verifique que o imóvel volta para Disponível.
6. Abra o Kanban: não deve mostrar os fechados; as demais etapas e o CRC continuam funcionando.
7. Teste o mesmo fluxo no celular e no desktop.

## Validação D1 no preview (leitura apenas)

```bash
npx wrangler d1 execute yolanda-crm-dev --env preview --remote --config wrangler.toml --command "PRAGMA foreign_key_check;"
```

Exemplo de inspeção de disputas:

```bash
npx wrangler d1 execute yolanda-crm-dev --env preview --remote --config wrangler.toml --command "SELECT p.code, p.status, COUNT(CASE WHEN l.stage != 'Fechado' AND l.deleted_at IS NULL AND l.category = 'Interessado' THEN 1 END) AS leads_ativos FROM properties p LEFT JOIN leads l ON l.property_id = p.id WHERE p.deleted_at IS NULL GROUP BY p.id, p.code, p.status ORDER BY p.id DESC LIMIT 20;"
```

Nenhuma migration é necessária para 4.3.4: o esquema já inclui `leads.property_id`, `followup_at`, `stage`, `close_result` e `lead_events`.

## Cuidados
- Não faça merge cego desta versão na branch de **produção**: a regra automática foi habilitada somente para `MEDIA_ENV=preview`, por segurança de rollout. Para ativar na produção no futuro, faça uma alteração de habilitação deliberada e teste novamente.
- Testes locais utilizam D1 simulado com SQLite/migrations reais. Não equivalem à validação de concorrência sob carga em Cloudflare remoto.
