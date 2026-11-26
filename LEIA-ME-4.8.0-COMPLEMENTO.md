# Complemento 4.8.0 — DEV
A revisão local usa `npm test` e `node --experimental-sqlite --test tests/seo-4.8.0-complemento.test.mjs` (Node 22+), com SQLite em memória.

A migration mantém slugs existentes; inserções e edições dos campos que compõem o slug passam a omitir zero quartos. A rota existente redireciona URLs antigas pelo ID. Comercial e Terreno mantêm metragem no slug. Nenhum cadastro é corrigido automaticamente. A API pública usa a descrição SEO apenas quando o texto original não possui conteúdo; o CRM continua recebendo o valor original.

## Aplicação autorizada no D1 de Preview

Os comandos abaixo são propostos para uma etapa futura, exclusivamente no `yolanda-crm-dev`. Antes de executá-los, obtenha autorização explícita, confirme o ID do D1 na configuração de Preview e verifique se DEV e TESTE compartilham esse recurso. Coordene uma janela sem escritas e registre um ponto de recuperação do D1 anterior à aplicação.

1. Liste as migrations pendentes e confirme que somente a `0012` está pendente. Pare se houver outra pendência ou divergência no schema.
2. Antes da aplicação, salve localmente a saída ordenada de `id, slug`, confirme a existência dos dois triggers e do índice único e verifique que `foreign_key_check` não retorna violações. Mantenha a evidência fora do Git.
3. Após resolver a pendência de atomicidade abaixo, aplique a migration usando o Wrangler já instalado. Repita a listagem e as consultas. Confirme que a `0012` saiu da lista, ambos os triggers têm a definição esperada, `uq_properties_slug` continua único, os pares `id, slug` são idênticos ao registro anterior e não há violações referenciais.

```powershell
.\node_modules\.bin\wrangler.cmd d1 migrations list yolanda-crm-dev --env preview --remote
.\node_modules\.bin\wrangler.cmd d1 execute yolanda-crm-dev --env preview --remote --command "SELECT name, sql FROM sqlite_schema WHERE type = 'trigger' AND name IN ('trg_properties_slug_insert', 'trg_properties_slug_update') ORDER BY name; PRAGMA index_list('properties'); SELECT id, slug FROM properties ORDER BY id; PRAGMA foreign_key_check;"
.\node_modules\.bin\wrangler.cmd d1 migrations apply yolanda-crm-dev --env preview --remote
```

**Pendência de atomicidade remota.** O Wrangler instalado monta uma consulta por migration com o SQL do arquivo e o `INSERT` em `d1_migrations` e envia ambos pela mesma chamada. Isso demonstra o agrupamento no cliente. A garantia de rollback de DDL e do registro de aplicação no executor remoto do D1 permanece sem confirmação. Os testes SQLite em memória cobrem a sequência e o schema. Antes da execução remota, confirme a garantia para o aplicador e a versão em uso.

**Recuperação.** Se a aplicação falhar, mantenha a pausa nas escritas e repita somente a listagem e as consultas de diagnóstico. Se o schema, os slugs e o histórico permanecerem iguais ao estado anterior, investigue a causa e submeta uma nova tentativa à aprovação. Se um trigger estiver ausente, o histórico divergir ou os dados mudarem, não repita o `apply`. Proponha restaurar o `yolanda-crm-dev` ao ponto anterior via D1 Time Travel, com aprovação específica e avaliação das escritas que seriam perdidas. Depois da restauração, repita as verificações de histórico, triggers, índice, slugs e chaves estrangeiras antes de liberar escritas.
