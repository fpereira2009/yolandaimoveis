# Yolanda CRM | Atualização restrita a PREVIEW

## Escopo e compatibilidade

- Projeto: Cloudflare Pages + Pages Functions + D1 SQLite + HTML/CSS/JS vanilla.
- **Banco para validação e migration:** `yolanda-crm-dev`, ID `23514b9c-5c0e-464c-8c85-1342b4fae522`.
- `wrangler.toml` foi inspecionado **e mantido intacto**. Já possui `[[env.preview.d1_databases]]`, `binding = "DB"`, `migrations_dir = "migrations"`.
- As migrations `0001` a `0006` permanecem intactas. A nova `0007` apenas acrescenta `clients.last_contact_at` e faz backfill conservador. **Não altera `leads.close_result`, `leads.close_note`, `leads.closed_at` ou `properties.status`**.
- As demais páginas públicas, CSS institucional, imagens e conteúdo de comunicação permanecem intactos. As únicas alterações visuais ficam em `public/app/index.html` e se restringem ao fluxo de seleção de imóvel, badge funcional, filtros e Kanban.
- **Não enviar este trabalho à branch de produção**. O Pages usará a configuração de preview na implantação de branch de teste, conforme a configuração do projeto no Cloudflare. Confirmar também a vinculação de D1 no painel Pages antes de testar.

## Arquivos

| Caminho | O que mudou |
|---|---|
| `functions/api/[[route]].js` | Associação livre/portfólio, proteção de Captação, reserva/liberação transacionais, preservação de Vendido/Alugado, contato do site, data de último contato CRC, compatibilidade de API. |
| `public/app/index.html` | Input único com sugestões de imóveis disponíveis e digitação livre, vínculo automático ao selecionar sugestão, badge de negociação (existente, agora ignora Captação), Kanban com coluna Fechado e buckets CRC baseados em último contato. |
| `migrations/0007_crm_ultimo_contato.sql` | Nova coluna `clients.last_contact_at` com backfill sem inferência de fechamento legado. |
| `tests/preview-crm.test.mjs` | Testes de integração usando todas as migrations reais e simulador D1 transacional. |
| `LEIA-ME-PREVIEW.md` | Instruções técnicas e comandos de preview. |

## Regras comerciais garantidas

1. **Captação** não recebe `property_id`/imóvel interno. Pode manter texto descritivo livre, sem gerar reserva. API valida inclusive requisições diretas.
2. **Reservado** ao entrar em `Proposta Enviada` ou `Documentação/Crédito`, inclusive avanço direto e associação feita desde `Novo Lead`. A geração de contatos do site vincula o ID interno de imóvel disponível para o mesmo fluxo.
3. **Disputa**: só libera quando nenhum lead `Interessado`, não excluído, em etapa de reserva mantém o imóvel; avaliação via `NOT EXISTS` dentro de `DB.batch`, após atualizar o lead.
4. **Troca/desvinculação/exclusão**: reavalia o anterior e reserva o novo, se disponível, na mesma transação. Exclusão é lógica (`deleted_at`).
5. **Reabertura**: limpa `close_result`, `close_note` e `closed_at`, mas nunca altera imóveis em `Vendido`/`Alugado`. Alterações desses status finais continuam manuais na aba Imóveis.
6. **Legados**: fechamento antigo sem resultado permanece `NULL`/vazio; nenhuma migration infere ganho/perda.

**Nota de estoque:** o selector novo oferece somente `status = 'Disponível'`. Um imóvel já vinculado pode continuar associado mesmo se estiver `Reservado` ou `Vendido`, para permitir edição e reabertura sem desligamento acidental. Vinculações novas a imóveis não disponíveis são recusadas pela API.

**CRC:** o bucket usa `clients.last_contact_at` e eventos reais (`criado`/`nota`), não um follow-up futuro. O histórico pré-0007 só permite uma estimativa de último contato baseada em `updated_at` e nos eventos existentes; a partir desta migration, registros de contato explícitos passam a atualizar a coluna.

## Passos no terminal do VS Code (na raiz do projeto)

### 1. Verificar migrations pendentes SOMENTE no remoto PREVIEW

```bash
npx wrangler d1 migrations list yolanda-crm-dev --env preview --remote --config wrangler.toml
```

### 2. Aplicar nova migration SOMENTE no remoto PREVIEW

```bash
npx wrangler d1 migrations apply yolanda-crm-dev --env preview --remote --config wrangler.toml
```

> Antes de confirmar, confira se o Wrangler indica `yolanda-crm-dev`. Se `0001` a `0006` aparecerem inesperadamente como pendentes em banco já operacional, não avance sem verificar o histórico de migrations.

### 3. Validar schema e integridade SOMENTE no remoto PREVIEW

```bash
npx wrangler d1 execute yolanda-crm-dev --env preview --remote --config wrangler.toml --command "PRAGMA table_info(clients);"
```

```bash
npx wrangler d1 execute yolanda-crm-dev --env preview --remote --config wrangler.toml --command "PRAGMA foreign_key_check;"
```

```bash
npx wrangler d1 execute yolanda-crm-dev --env preview --remote --config wrangler.toml --command "SELECT COUNT(*) AS fechados_legados_sem_resultado FROM leads WHERE stage = 'Fechado' AND close_result IS NULL;"
```

### 4. Testes locais (sem acessar D1 remoto)

Node.js 22+:

```bash
node --experimental-sqlite tests/preview-crm.test.mjs
```

## Resultado da validação local

**85 verificações passaram**, usando schema construído com migrations `0001` até `0007`, Functions reais e transações simuladas. Inclui uso direto da API, concorrência lógica de múltiplos titulares, troca/desvinculação, exclusão, captação, geração de leads via site, reabertura de Ganho e preservação de fechamentos legados.

**Limite da validação:** não foram executados comandos remotos no Cloudflare e não foi feito deploy. A execução real no D1 `yolanda-crm-dev` e a checagem visual em navegador mobile/desktop dependem do ambiente de preview do projeto.
