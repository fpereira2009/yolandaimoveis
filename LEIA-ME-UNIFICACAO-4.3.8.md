# Yolanda CRM 4.3.8 — Unificação de regras Preview / Production

**Base auditada:** arquivo `yolanda imoveis 4.3.8.zip`, pasta `02_desenvolvimento` (working tree fornecida). Não foram consultados bancos remotos nem efetuados deploys.

## Objetivo

Utilizar a **mesma implementação de regras de negócio** em Preview e Production, mantendo o D1 e o R2 fisicamente separados em cada ambiente.

## Divergências encontradas e correção (diff lógico)

| Funcionalidade | Código recebido | Código unificado |
| --- | --- | --- |
| Fechamento Ganho com concorrentes | Em `production`, a requalificação era desativada por `disputeRulesEnabled(env)` | Sempre requalifica leads ativos concorrentes para **Qualificação**, remove `property_id` e referência externa, ajusta follow-up para hoje e grava histórico, tudo em `env.DB.batch` |
| Fechamento Perdido | `releaseStmt` em produção e `releaseAfterLossStmt` em Preview | Em ambos, mantém os demais leads intactos e libera o imóvel somente quando não resta outro interessado ativo |
| Conclusão de imóvel já vendido/alugado | A proteção contra segundo Ganho dependia do ambiente | A mesma validação rejeita novo Ganho com imóvel `Vendido`, `Alugado` ou `Inativo` |
| Galeria R2 | `mediaEnabled` aceitava somente `preview` | Aceita `MEDIA_ENV=preview` **ou** `production`, desde que `DB` e `MEDIA_BUCKET` estejam presentes; valores ausentes/inválidos falham fechados |
| URLs legadas | Em produção havia fallback para `properties.photo_url` e `legacy_photo_url` na API | Em ambos, capa vem apenas da tabela `property_images`. Sem R2, retorna **sem foto** e a vitrine mostra “Imagem não disponível”. Nenhum dado legado foi apagado |
| Criação/edição/importação de imóvel | Produção ainda aceitava nova URL de foto | Ambos rejeitam links não vazios em `photo_url` e exigem upload R2 |
| Exclusão de imóvel sem configuração de R2 | Produção executava apenas soft-delete, podendo abandonar arquivos | Não executa exclusão incompleta se os bindings da galeria estiverem indisponíveis (503) |
| Diagnóstico da disputa | `disputeRulesEnabled` dependia de `MEDIA_ENV` | `GET /api/diagnostics/disputes` autenticado confirma a regra ativa em ambos e indica disponibilidade de mídia sem revelar IDs ou segredos |
| Erro interno | Resposta de erro autenticado poderia expor mensagem SQL/exceção | Retorno 500 é genérico; detalhes permanecem em logs do servidor |

**Atenção:** o código inclui duas rotas espelhadas (`[[route]].js` e `%5B%5Broute%5D%5D.js`), mantidas idênticas para não introduzir regressões nesta atualização.

## Isolamento mantido no wrangler.toml

O arquivo de configuração foi alterado **somente nos comentários**. Os bindings, nomes e identificadores originais foram mantidos integralmente.

| Ambiente | MEDIA_ENV | DB (D1) | MEDIA_BUCKET (R2) |
| --- | --- | --- | --- |
| Production | `production` | `yolanda-crm` | `yolanda-imoveis-prod` |
| Preview | `preview` | `yolanda-crm-dev` | `yolanda-imoveis-dev` |

Não copiar dados entre os bancos nem alterar IDs de bindings. `MEDIA_ENV` **não ativa ou desativa regras comerciais**; apenas valida a disponibilidade do subsistema de mídia.

## Diferença de branches identificada no ZIP

O histórico Git fornecido mostra `main` (produção) na revisão **4.3.6** e `dev` / `teste` na **4.3.8**. A diferença de código entre essas revisões inclui a proteção de imagens da vitrine em `public/index.html`. Por isso, o **ZIP de arquivos atualizados também inclui `public/index.html` da 4.3.8**, mesmo que esse arquivo não precisasse de edição para unificar as regras do backend. Isso evita publicar o hotfix sobre a 4.3.6 mantendo a vitrine desatualizada. Compare sempre com seu repositório atual antes de substituir arquivos.

## Antes de publicar em Production

1. **Confirmar a configuração do Pages**: `MEDIA_ENV=production`, `DB=yolanda-crm`, `MEDIA_BUCKET=yolanda-imoveis-prod`. No Preview usar os três recursos de teste. Conferir os bindings do deploy efetivo, não apenas do repositório.
2. **Confirmar a migration 0008** em produção, sem reaplicar ou editar SQL já aplicado:

   ```bash
   npx wrangler d1 migrations list yolanda-crm --remote --config wrangler.toml
   npx wrangler d1 execute yolanda-crm --remote --config wrangler.toml --command "PRAGMA table_info(property_images);"
   npx wrangler d1 execute yolanda-crm --remote --config wrangler.toml --command "PRAGMA foreign_key_check;"
   ```

   Para Preview:

   ```bash
   npx wrangler d1 migrations list yolanda-crm-dev --env preview --remote --config wrangler.toml
   npx wrangler d1 execute yolanda-crm-dev --env preview --remote --config wrangler.toml --command "PRAGMA table_info(property_images);"
   ```

3. **Fazer backup antes de qualquer migração pendente ou implantação de produção**:

   ```bash
   npx wrangler d1 export yolanda-crm --remote --output=./backup-yolanda-crm-antes-unificacao.sql --config wrangler.toml
   ```

4. Verificar a rota de diagnóstico no domínio autenticado de cada ambiente:

   ```json
   {
     "apiVersion": "4.3.8-regras-unificadas",
     "mediaEnv": "production",
     "disputeRulesEnabled": true,
     "mediaEnabled": true,
     "dbBindingAvailable": true,
     "mediaBucketBindingAvailable": true
   }
   ```

   Em Preview o valor esperado de `mediaEnv` é `preview`. A rota **não confirma a identidade do banco**: confirme isso nas configurações de binding.

5. Testar: dois leads em proposta no mesmo imóvel, fechar um como **Ganho**, verificar o outro em **Qualificação**, sem imóvel, follow-up hoje; repetir com **Perdido** e verificar que o outro não mudou; enviar uma foto R2 e abrir a vitrine pública.
6. **Publicar apenas após validar Preview e planejar a liberação de produção**. A mudança de regra passa a atingir dados reais quando a nova API estiver publicada em Production. Não há alteração retroativa automática de leads previamente fechados.

## Segurança — ponto de atenção

A captura do painel mostra `DEV_BYPASS` configurado no **Preview**. No código recebido, se o valor for `1`, a autenticação da API é ignorada nesse ambiente, inclusive se o site de Preview estiver acessível pela internet. **Verifique o valor real, remova o bypass remoto e proteja o Preview com Cloudflare Access** antes de utilizar dados reais. Não habilite `DEV_BYPASS` em Production. Esta atualização não altera automaticamente sua política de autenticação; preserva as validações existentes.

Os arquivos `.git`, `.wrangler` e caches locais do ZIP fornecido foram **intencionalmente excluídos** do pacote de entrega.

## Testes

```bash
npm test
```

Node 22+ recomendado. O pacote corrige `package.json` para `type: module` (as Functions e os testes já usam ESM) e inclui testes com dois bancos SQLite e dois R2 em memória, além das suítes legadas atualizadas. Nenhuma migration nova.

## Limitações

- O teste de isolamento é local; **não é prova de como os bindings estão atualmente resolvidos no deploy remoto**.
- R2 e D1 não suportam transação distribuída. O projeto mantém a estratégia existente de compensação/repetição na remoção de fotos.
- URLs antigas permanecem em `properties.photo_url` para auditoria, mas a vitrine exige fotos cadastradas em `property_images`.
- A UI protege contra download casual de imagens, não contra captura de tela ou requisições técnicas ao recurso público.
