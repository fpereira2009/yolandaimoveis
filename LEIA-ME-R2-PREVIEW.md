# Yolanda CRM — galeria de imóveis via Cloudflare R2 (preview)

Base: projeto final **4.2.2**, incluindo Kanban com somente etapas ativas. Esta entrega é uma **evolução de teste**, sem promover versão ou executar deploy de produção.

## Escopo e isolamento

- Cloudflare Pages + Pages Functions + D1 + R2; HTML/CSS/JS vanilla, sem framework novo.
- `wrangler.toml` usa `DB = yolanda-crm-dev`, `MEDIA_BUCKET = yolanda-imoveis-dev`, `MEDIA_ENV = preview` em `[env.preview]`.
- A configuração padrão (produção) aponta para `yolanda-crm` e reserva o nome `yolanda-imoveis-prod`, mas define `MEDIA_ENV = production`, desabilitando as novas APIs de mídia fora do preview.
- **Não alterar a branch de produção.** Verifique os bindings efetivos no painel Cloudflare Pages: banco D1, bucket R2, `MEDIA_ENV` e as variáveis existentes de Cloudflare Access (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`). Não configurar `DEV_BYPASS=1` em ambiente remoto.
- Criar ambos os buckets é uma operação manual; nenhum bucket remoto foi criado neste pacote.

## Por que separar as APIs

O arquivo `functions/api/[[route]].js` já concentra leads, clientes, imóveis, CSV e site. Acrescentar recebimento binário, R2, validação de imagem e seleção de capa nesse roteador aumentaria acoplamento e risco de regressões. A nova rota específica `functions/api/media/[[path]].js` lida com mídia e mantém JWT Access com as mesmas verificações do roteador atual. O roteador existente só foi alterado para serializar galerias, exibir a capa e limpar fotos quando o imóvel for excluído.

**Prós de continuar no mesmo endpoint:** menos arquivos/rotas e menos necessidade de integrar respostas. **Contras:** mistura payload JSON com binário, amplia o roteador e dificulta testes. **Escolha:** endpoints de mídia separados, preservando caminhos atuais (`/api/properties`, `/api/public/properties`, `/api/leads` etc.). As rotas mais específicas prevalecem sobre o catch-all do Pages.

## Fluxo completo

1. A corretora seleciona até dez arquivos JPEG, PNG ou WebP no formulário de criação ou edição, em uma única seleção ou por adições sucessivas.
2. No navegador, Canvas limita o maior lado a 1600 px, produz WebP (qualidade ~0,82) ou JPEG otimizado e verifica o limite de 6 MB por arquivo compactado. A imagem original **não** é enviada.
3. Salva-se o cadastro do imóvel no D1 pela API existente. Cada foto otimizada é enviada **individualmente** como corpo binário para `PUT /api/media/properties/YTI-XXXX/images`. Isso evita um payload único com dezenas de megabytes.
4. A Function valida sessão Cloudflare Access, origem, MIME e assinatura do arquivo, consulta o limite de 10, cria chave aleatória `properties/<id>/<uuid>.webp|jpg`, grava no R2 e insere metadados em `property_images` no `yolanda-crm-dev`.
5. APIs pública e interna retornam `images` (lista ordenada) e a URL da capa em `foto_url` (site) / `photo_url` (CRC). O campo antigo `properties.photo_url` permanece intacto como fallback legado.
6. Os cards da vitrine usam só a capa. A janela de detalhes mostra setas, swipe e contador. O CRC permite selecionar capa e remover fotos.
7. Por padrão, a URL é **same-origin** `/api/media/file/properties/<id>/<uuid>.webp`, entregue por Function a partir do R2. Não exige tornar o bucket público. Se `MEDIA_PUBLIC_BASE_URL` for configurada como HTTPS de um Custom Domain ou de r2.dev, as APIs passam a retornar URLs diretas desse domínio para melhor entrega via CDN.

## Schema D1 — migration incremental

`migrations/0008_property_images_r2.sql` cria `property_images`:

| Campo | Uso |
|---|---|
| `id` | PK da imagem |
| `property_id` | FK para `properties.id`, com `ON DELETE CASCADE` |
| `object_key` | chave única do objeto no R2 (não URL fixa) |
| `content_type` | somente `image/webp` ou `image/jpeg` |
| `size_bytes` | bytes efetivos, até 6 MiB |
| `position` | ordem persistida de inserção |
| `is_cover` | 0/1, com índice UNIQUE parcial para uma capa por imóvel |
| `created_at` | ISO 8601 UTC |

Um trigger SQLite impede a 11ª imagem mesmo sob uploads concorrentes. Não há atualização retroativa de `properties.photo_url` ou alteração das migrations anteriores. **A ordenação usa ordem de upload; não foi incluído drag-and-drop de reordenação** porque não fazia parte dos requisitos. Ao trocar a capa, ela passa à primeira posição da galeria serializada.

## API de mídia (preview)

| Método | Caminho | Acesso | Função |
|---|---|---|---|
| GET | `/api/media/file/properties/<id>/<uuid>.webp` | Público | entrega imagem R2 (stream/cache) |
| GET | `/api/media/properties/YTI-0001/images` | Access | lista galeria |
| PUT | `/api/media/properties/YTI-0001/images` | Access | upload binário JPEG/WebP, limite 6 MiB |
| PATCH | `/api/media/properties/YTI-0001/images/<id>` | Access | JSON `{ "cover": true }` |
| DELETE | `/api/media/properties/YTI-0001/images/<id>` | Access | remove arquivo R2 e linha D1 |
| DELETE | `/api/properties/YTI-0001` | Access | marca imóvel excluído, remove galeria R2 e metadados |

## Limpeza e consistência

R2 e D1 **não** compartilham uma transação distribuída. A implementação utiliza medidas compensatórias:

- Se o insert D1 do upload falhar, a Function tenta remover a imagem recém-criada no R2.
- O insert da imagem valida novamente `properties.deleted_at IS NULL`, bloqueando a corrida entre upload e exclusão.
- Ao excluir um imóvel, primeiro marca `deleted_at` (para bloquear uploads), depois apaga os objetos R2 e por último remove as linhas `property_images`.
- Se o R2 estiver indisponível, o imóvel já está oculto, mas seus metadados são mantidos para **repetir o DELETE**, que é idempotente; o erro é registrado no log da Function.
- O sistema evita arquivos órfãos nos fluxos normais. **Uma falha extrema entre o PUT no R2 e o registro/compensação pode deixar um objeto órfão**; para garantia operacional absoluta seria necessário acrescentar fila durável/rotina periódica de reconciliação, que não foi criada nesta versão de preview.
- A entrega das imagens pode permanecer em cache por até uma hora, mesmo após remoção física. Para exclusão emergencial, considerar purge de cache conforme o domínio de entrega.

## Wrangler — somente preparação e validação do preview

Execute a partir da raiz do repositório, autenticado na conta Cloudflare correta:

```bash
# Crie apenas o bucket de TESTES agora:
npx wrangler r2 bucket create yolanda-imoveis-dev --config wrangler.toml

# O bucket de PRODUÇÃO permanece reservado para preparação futura; não precisa
# ser criado ou exposto durante a homologação de preview:
# npx wrangler r2 bucket create yolanda-imoveis-prod --config wrangler.toml

# Confirme os buckets da conta:
npx wrangler r2 bucket list --config wrangler.toml

# Confira migrations pendentes no banco de teste:
npx wrangler d1 migrations list yolanda-crm-dev --env preview --remote --config wrangler.toml

# Aplique a nova migration APENAS ao banco de teste:
npx wrangler d1 migrations apply yolanda-crm-dev --env preview --remote --config wrangler.toml

# Verifique a tabela/índices e relações:
npx wrangler d1 execute yolanda-crm-dev --env preview --remote --config wrangler.toml --command "PRAGMA table_info(property_images);"
npx wrangler d1 execute yolanda-crm-dev --env preview --remote --config wrangler.toml --command "PRAGMA foreign_key_check;"
npx wrangler d1 execute yolanda-crm-dev --env preview --remote --config wrangler.toml --command "SELECT name FROM sqlite_master WHERE type='trigger' AND name='trg_property_images_max10';"
```

### Acesso público ao R2 (opcional)

**Padrão recomendado no preview:** mantenha o bucket privado. `/api/media/file/...` faz a leitura pública pelo Pages, no mesmo domínio do site e sem CORS.

Para experimentar o domínio temporário `r2.dev` (Cloudflare alerta que é destinado a uso não produtivo):

```bash
npx wrangler r2 bucket dev-url enable yolanda-imoveis-dev --config wrangler.toml
npx wrangler r2 bucket dev-url get yolanda-imoveis-dev --config wrangler.toml
```

Copie a URL HTTPS retornada e configure `MEDIA_PUBLIC_BASE_URL` no ambiente Preview do Pages (via painel Cloudflare, sem incluir segredo ou URL inventada no Git). As novas imagens passam a usar esse domínio. Como alternativa, associe um domínio próprio em R2 > bucket > Settings > Custom Domains, ou pela CLI:

```bash
npx wrangler r2 bucket domain add yolanda-imoveis-dev --domain SEU_SUBDOMINIO_DE_TESTES --zone-id SEU_ZONE_ID --config wrangler.toml
```

O subdomínio precisa ser de uma zona gerenciada pela mesma conta Cloudflare. Para produção, prefira Custom Domain com Cache Rules; **não use r2.dev em produção**. Quando um domínio direto for usado, avalie política CORS caso outras páginas utilizem Canvas para exportar imagens; o botão "Salvar Card" do CRC já usa a rota same-origin como primeira tentativa.

O projeto original pode ter bindings `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD` definidos no painel. **Não os sobrescreva** ao confirmar os novos bindings de R2/Media. O nome do binding deve ser exatamente `MEDIA_BUCKET`.

## Testes e homologação

```bash
node --experimental-sqlite tests/preview-crm.test.mjs
node --experimental-sqlite tests/r2-media.test.mjs
```

Validar manualmente no preview após o push GitHub:

1. Criar imóvel com 10 fotos e confirmar que a 11ª é impedida.
2. Escolher capa, salvar, recarregar CRM e confirmar capa persistente.
3. Testar vitrine em desktop e celular: card mostra capa; modal navega setas/swipe e contador.
4. Remover foto não capa, depois capa, e conferir nova capa automática.
5. Fechar e reabrir modal de edição para verificar fotos persistidas.
6. Confirmar que imóveis antigos ainda mostram URL legada até reupload manual.
7. Exportar card PNG e verificar que a foto R2 aparece.
8. Excluir imóvel de teste e consultar R2/D1 para confirmar limpeza.
9. Testar a API de upload sem Access e com origem externa: acesso negado.
10. Confirmar no painel Cloudflare Pages que **Preview** utiliza `yolanda-crm-dev` e `yolanda-imoveis-dev`, sem modificar produção.

**A migração das fotos legadas de hospedagens externas NÃO é automática.** A corretora pode abrir o imóvel existente e enviar novamente os originais, mantendo os links legados até a atualização. Não se tentou baixar URLs de terceiros automaticamente por causa de permissões/CORS e riscos de migrar imagem incorreta.

## Arquivos envolvidos

- `wrangler.toml` — binding R2 e variável `MEDIA_ENV` para cada ambiente;
- `migrations/0008_property_images_r2.sql` — nova tabela, índices e trigger;
- `functions/_shared/property-media.js` — serialização, consultas e limpeza;
- `functions/api/media/[[path]].js` — upload, capa, remoção, galeria e leitura;
- `functions/api/[[route]].js` e espelho legado `functions/api/%5B%5Broute%5D%5D.js` — CRUD e serialização integrada, sem alterar URLs existentes;
- `public/app/index.html` — controle de imagens no cadastro/edição e compressão Canvas;
- `public/index.html` — capa na vitrine, galeria horizontal no modal;
- `tests/r2-media.test.mjs` — novos testes; regressão existente mantida.

**Nenhum comando de deploy do Pages está incluído.** O push e a homologação ficam a cargo da equipe.
