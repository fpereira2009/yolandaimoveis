# Yolanda – site + CRC (Cloudflare Pages + D1 + Access)

Domínios: `yolandaimoveis.com.br` (site público) e `crc.yolandaimoveis.com.br` (painel restrito).
O mesmo projeto Pages atende os dois; `functions/_middleware.js` entrega o painel (`/app`) só no `crc.`.

## Publicação
1. `npm i -g wrangler && wrangler login`
2. `wrangler d1 create yolanda-crm` → cole o `database_id` no `wrangler.toml`
3. `wrangler d1 migrations apply yolanda-crm --remote`   (aplica 0001, 0002 e 0003)
   Se o banco já existe e a lista de migrações estiver inconsistente, aplique só a nova:
   `wrangler d1 execute yolanda-crm --remote --file=migrations/0003_categoria_captacao.sql` (rode uma única vez)
4. `wrangler pages deploy public --project-name yolanda-site`
5. Pages > Settings > Functions > D1 bindings: `DB` = yolanda-crm
6. Pages > Custom domains: adicione `yolandaimoveis.com.br`, `www` e `crc.yolandaimoveis.com.br`
7. Zero Trust > Access > Applications: proteja SOMENTE o host `crc.yolandaimoveis.com.br` (todo o host),
   política "e-mails permitidos" (Iêda + você). NÃO proteja o domínio público (o site e /api/public/* precisam ficar abertos).
8. Pages > Variables: `ACCESS_TEAM_DOMAIN` (ex.: seutime.cloudflareaccess.com) e `ACCESS_AUD`
   (Application Audience tag). Sem elas a API restrita responde 503 de propósito.
9. Entre em `crc.yolandaimoveis.com.br` > aba Imóveis > "Importar CSV" (planilha antiga exportada como CSV)
   ou cadastre os imóveis um a um. O código YTI-0001, YTI-0002… é gerado pelo banco.

## Como as peças se falam
- Site público lê o catálogo em `GET /api/public/properties` (só Disponível/Reservado).
- Formulário "anunciar imóvel" e o contato no modal do imóvel gravam em `POST /api/public/contact`:
  cria/reaproveita o cliente (pelo telefone) e abre um lead; se já houver lead aberto, só registra uma nota.
- Lead novo no painel → cria o cliente no CRC. Cliente novo no CRC → abre um lead no funil.
- Editar nome/telefone de um lado atualiza o outro (e todos os leads da mesma pessoa).
- Nota ou mudança de etapa em um lead reagenda o follow-up para amanhã (a data pode ser alterada no campo do lead).
- Páginas legais: `/privacidade` e `/termos` (arquivos em `public/`), com link no rodapé do site.

## Teste local
`.dev.vars` com `DEV_BYPASS=1`; `wrangler d1 migrations apply yolanda-crm --local`;
`wrangler pages dev public --d1 DB` (abra `/app/` direto).
