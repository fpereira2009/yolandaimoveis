# Release 4.4.0 — como homologar antes do merge

## Fonte e escopo

Base de código: pacote ZIP consolidado Yolanda CRM 4.3.8 entregue na conversa. O conteúdo de `wrangler.toml`, as bases D1 e os buckets R2 permanecem sem alteração de apontamento. Mudanças são locais; não houve operações na conta Cloudflare.

## Etapa 1 — preparar Preview **antes de publicar o código**

1. Cloudflare Zero Trust → Access → Applications → `yolanda-site - Cloudflare Pages` → Additional settings → consultar **Application Audience (AUD) Tag**.
2. Cloudflare Dashboard → Workers & Pages → `yolanda-site` → Settings → Preview → Variables and secrets:
   - `ACCESS_TEAM_DOMAIN`: `yolandaimoveis.cloudflareaccess.com` (confirme o domínio real do seu time no painel);
   - `ACCESS_AUD`: valor exato do **AUD da aplicação de Preview** (não o invente, nem use o AUD da aplicação CRC de produção caso seja diferente);
   - `MEDIA_ENV=preview`.
3. Verificar bindings Preview: `DB → yolanda-crm-dev`, `MEDIA_BUCKET → yolanda-imoveis-dev`.
4. Confirmar que a política de Preview só tem condição `Include: Emails` com usuários autorizados. Remover `DEV_BYPASS` das variáveis do Cloudflare; a nova API ignora essa variável mesmo que permaneça configurada.
5. Não use a conta Cloudflare de produção para executar testes destrutivos. Faça backups antes de futuras migrations ou mudanças na produção.

## Etapa 2 — testes locais

```bash
npm test
```

Requer Node 22+ com `node:sqlite` experimental habilitado pelo script npm. As seis suítes incluem JWT RSA local, regras de negócio, galeria e paridade de ambientes.

## Etapa 3 — homologação Preview após push pelo GitHub/VS Code

1. Em janela anônima, `https://dev.yolanda-site.pages.dev/app/` e `https://teste.yolanda-site.pages.dev/app/` devem exigir login Cloudflare; acesso não autorizado permanece bloqueado.
2. Entre com e-mail autorizado e confirme os módulos Leads, CRC e Imóveis; confirme que o CRM **não retorna 503** após a autenticação (caso retorne, revise `ACCESS_TEAM_DOMAIN` e `ACCESS_AUD`).
3. Em Network, sem sessão Access: `GET /api/leads` deve responder `401` ou ser interceptado pela tela de login; com sessão, deve responder `200`. Mesmo que `DEV_BYPASS=1` esteja definido, acesso anônimo não deve funcionar.
4. Teste Ganho em um imóvel com 2 leads ativos: concorrente volta para Qualificação, perde associação e recebe follow-up hoje; Perdido não altera os demais.
5. Envie fotos JPEG/WebP; confirme capa e carrossel. Tente enviar arquivo inválido: a API deve retornar `415`. Imóveis inativos/suprimidos não devem expor fotos ao visitante anônimo.
6. Confira a vitrine e os campos do CRM no celular e no desktop. Textos, cores, tipografia, navegação e handlers devem permanecer iguais à 4.3.8.

## Etapa 4 — preparação de produção (após homologação)

1. Confirme Cloudflare Production: `MEDIA_ENV=production`, `DB → yolanda-crm`, `MEDIA_BUCKET → yolanda-imoveis-prod`, `ACCESS_TEAM_DOMAIN` e `ACCESS_AUD` da aplicação Access do CRC.
2. Verifique a migration 0008 no D1 de produção; **4.4.0 não acrescenta migration**.
3. Confirme buckets R2 privados e desligue acesso público direto `r2.dev`/Custom Domain se estiver ativo.
4. Antes do merge, faça backup do D1 real, revise o diff e use as opções de rollback do Pages. A release não altera dados automaticamente.
5. Após publicar por GitHub, valide URLs públicas, CRM autenticado, galeria e disputa comercial no ambiente real.

## Itens ainda não resolvidos por esta versão

- Não existe autorização por propriedade/usuário no D1 (RBAC), apenas controle do grupo autorizado pelo Access.
- CSP `script-src` forte exige remover handlers inline e CDN de scripts; isso fica para uma release dedicada.
- R2 e D1 não possuem transação distribuída; avalie job de reconciliação.
- Rate Limiting público por IP e Turnstile exigem configuração adicional.
- A análise dinâmica remota e SCA de dependências não foram executadas.

Leia `CHANGELOG.md` e `RELATORIO_AUDITORIA_SEGURANCA_4.4.0.md` antes da promoção de versão.
