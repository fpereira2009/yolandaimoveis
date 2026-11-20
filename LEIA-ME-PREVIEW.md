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
| `public/app/index.html` | Input com sugestões de imóveis disponíveis e digitação livre, campos associados e região posicionados no cadastro e na movimentação de etapa, não editáveis no modal Editar Lead, badge de negociação, Kanban com coluna Fechado e buckets CRC baseados em último contato. |
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

**113 verificações passaram**, usando schema construído com migrations `0001` até `0007`, Functions reais e transações simuladas. Inclui uso direto da API, concorrência lógica de múltiplos titulares, troca/desvinculação, exclusão, captação, geração de leads via site, reabertura de Ganho e preservação de fechamentos legados.

**Limite da validação:** não foram executados comandos remotos no Cloudflare e não foi feito deploy. A execução real no D1 `yolanda-crm-dev` e a checagem visual em navegador mobile/desktop dependem do ambiente de preview do projeto.

## Ajuste posterior: campos de imóvel nos cards de leads

**Alterações somente na interface do CRM (`public/app/index.html`)**:

- **Cadastrar Novo Lead:** “Imóvel associado ao atendimento” vem **antes** de “Imóvel / Região de Interesse”. Mantidos os modos sem vínculo, portfólio e parceria externa; a seleção de imóvel do portfólio continua limitada a disponíveis, com campo livre para texto manual.
- **Mover Lead:** os dois campos passaram para o card de detalhes, **imediatamente depois** do bloco “Mover Etapa no Funil” e **antes** de “Fechar Lead (Ganho / Perdido)”. Há botão “Salvar” para atualizar a associação e a região sem mudar a etapa.
- **Mudança de etapa:** se um imóvel novo for selecionado, clicar em outra etapa envia `property`, `link_mode`, `property_code`/`external_ref` e `stage` **na mesma requisição PATCH**, que usa o `env.DB.batch` existente na Function para gerir a reserva/liberação.
- **Editar Lead:** os dois campos são ocultados no formulário compartilhado e **não são enviados à API** ao salvar as demais alterações, impedindo a alteração acidental do vínculo.
- **Captação:** o card de movimentação permite somente texto livre; associação interna continua vedada.
- **Lead fechado:** exibe os dois campos para consulta, sem permitir alteração durante o fechamento. A reabertura não altera status Vendido/Alugado. Antes de Fechar Lead, alterações não salvas do imóvel são detectadas, com pedido de salvamento prévio.

Nenhuma nova migration ou alteração de Pages Functions foi necessária neste ajuste, pois a API anterior já aceitava a atualização atômica de imóvel/etapa. Os arquivos `wrangler.toml` e `migrations/` foram preservados.

### Arquivos alterados nesta etapa

1. `public/app/index.html`
2. `tests/preview-crm.test.mjs` (verificação da estrutura/ordem do formulário, edição sem vínculo, escolha de imóvel, texto manual, PATCH combinado e proteção do fechamento)
3. `LEIA-ME-PREVIEW.md`

**Resultado atualizado da validação:** 113 verificações locais aprovadas com todas as migrations originais e Functions reais. Nenhum banco remoto foi alterado e nenhum deploy foi executado.


## Refinamento posterior: ordenação do modal de movimentação (somente PREVIEW)

**Arquivo funcional alterado:** `public/app/index.html`. Sem alteração em `functions/`, `wrangler.toml` ou migrations. A base é o pacote completo atualizado que já contém associação/região no modal Mover Lead.

Ordem do modal (logo abaixo do cabeçalho):

1. **Imóvel associado ao atendimento**, com o campo de região e botão **Associar imóvel**; os IDs `detail-prop-mode`, `detail-prop-id`, `detail-property`, `detail-property-options` e handlers `syncDetailPropertyBox`, `onDetailPropertyInput`, `saveLeadProperty` foram preservados.
2. **Mover Etapa no Funil (Toque para alterar)**, com os mesmos `moveLeadStage()` e etapas.
3. **Contato rápido:** o WhatsApp original foi movido do rodapé para esta posição e ganhou um botão apenas com ícone `phone` à direita, usando `tel:+55...` (a partir de `normPhone(lead.phone)`). O botão de discagem usa `sm:hidden`, portanto só aparece em viewport **abaixo de 640 px**; inclui `aria-label` e `title` para acessibilidade.
4. **Próximo follow-up**, preservando `detail-followup`, `saveLeadFollowup()` e os atalhos de data.
5. **Fechar Lead (Ganho / Perdido)**, preservando `openCloseLead()`; não aparece quando o lead já está fechado.
6. **Registrar Nova Interação / Follow-up**, preservando `new-note-text` e `addLeadNote()`.

O histórico e o resultado de fechamento foram mantidos abaixo dos seis blocos, antes do rodapé **Fechar Janela**. O controle redundante *Modalidade do Atendimento* (Compra/Aluguel) não aparece mais neste modal; a modalidade continua no formulário Editar Lead.

**Testes:** `node --experimental-sqlite tests/preview-crm.test.mjs`, com **138 verificações locais aprovadas** incluindo ordenação, IDs, eventos, telefone, responsividade (classe `sm:hidden`), associação, mudança de etapa e todas as regras de reserva anteriores.

**Infraestrutura:** nenhuma nova migration, comando Wrangler, alteração de banco ou deploy necessária nesta entrega. Não foi acessado o banco remoto `yolanda-crm-dev`. Aplicar somente na branch de preview e conferir o mobile/desktop no Pages Preview após o push. Verificar a binding `DB` no painel Cloudflare Pages, pois o arquivo `wrangler.toml` já aponta `env.preview` para `yolanda-crm-dev`.
