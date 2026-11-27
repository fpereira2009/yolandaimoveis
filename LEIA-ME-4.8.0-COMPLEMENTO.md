# Complemento 4.8.0 — DEV
A revisão local usa `npm test` e `node --experimental-sqlite --test tests/seo-4.8.0-complemento.test.mjs` (Node 22+), com SQLite em memória.

A migration mantém slugs existentes; inserções e edições dos campos que compõem o slug passam a omitir zero quartos. A rota existente redireciona URLs antigas pelo ID. Comercial e Terreno mantêm metragem no slug. Nenhum cadastro é corrigido automaticamente. A API pública usa a descrição SEO apenas quando o texto original não possui conteúdo; o CRM continua recebendo o valor original.

## Migration 0012 validada no D1 de Preview

Em 26/11/2026, a migration 0012 foi aplicada no D1 de Preview yolanda-crm-dev, compartilhado entre DEV e TESTE. A produção permanece intocada.

- Os seis slugs existentes foram preservados.
- Os dois triggers de slug e o índice único uq_properties_slug foram validados.
- A consulta de integridade referencial não retornou violações.
- Os nove testes de regressão de consulta em TESTE foram aprovados.

A atomicidade em caso de falha no D1 remoto não foi testada. A aplicação bem-sucedida e os testes SQLite em memória verificam o estado resultante e a sequência da migration.

## Descrições públicas

O modal da vitrine aceita Markdown e a formatação básica de HTML legado por meio de tags permitidas sem atributos. Descrições sem conteúdo visível, inclusive as que contêm apenas a entidade `&nbsp` sem ponto e vírgula, usam o fallback automático. O conteúdo gravado no D1 é preservado.

## Recuperação do D1 de Preview

Em caso de falha em uma aplicação futura, mantenha a pausa nas escritas e repita somente a listagem e as consultas de diagnóstico. Se o schema, os slugs e o histórico permanecerem iguais ao estado anterior, investigue a causa e submeta uma nova tentativa à aprovação. Se um trigger estiver ausente, o histórico divergir ou os dados mudarem, não repita o `apply`. Proponha restaurar o `yolanda-crm-dev` ao ponto anterior via D1 Time Travel, com aprovação específica e avaliação das escritas que seriam perdidas. Depois da restauração, repita as verificações de histórico, triggers, índice, slugs e chaves estrangeiras antes de liberar escritas.
