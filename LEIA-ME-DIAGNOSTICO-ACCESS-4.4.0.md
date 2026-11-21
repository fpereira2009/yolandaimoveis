# Yolanda CRM 4.4.0 — Diagnóstico de 503 no Access (somente Preview)

## Causa do diagnóstico ambíguo
`functions/_middleware.js` mostrava `Acesso não configurado.` para **qualquer** falha 503 retornada pelo validador JWT. Isso inclui uma configuração ausente/inválida em `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD` e falhas ao buscar as chaves públicas (JWKS) do Cloudflare Access.

As imagens do site público e favicon são recursos públicos/estáticos: carregarem não testa a configuração usada para `/app/`.

## Alteração mínima
- Arquivo: `functions/_middleware.js`.
- No Preview, diferencia três códigos de falha sem expor o token, os secrets nem seus valores:
  - `ACCESS_CONFIG_INVALID` (503): pelo menos uma variável de autenticação ausente ou formato inválido na Function.
  - `ACCESS_VERIFICATION_UNAVAILABLE` (503): problema ao consultar/verificar chaves públicas de Access, como falha temporária do endpoint JWKS.
  - `ACCESS_UNAUTHORIZED` (401): JWT ausente, expirado, com audiência inválida ou outra falha de autenticação.
- Os logs de Preview exibem apenas se os dois valores estão preenchidos (true/false), **nunca seus conteúdos**.
- Em produção, mantém mensagens genéricas e não ativa diagnósticos de Preview.
- **Nenhum bypass**, nenhum segredo novo, nenhuma migration ou mudança no `wrangler.toml`.

## Como testar
1. Substitua o arquivo `functions/_middleware.js` pela versão deste ZIP na branch `dev`, faça commit e push. Não é necessário mexer em D1/R2.
2. Após sucesso do deployment, abra `https://dev.yolanda-site.pages.dev/app/` e faça login pelo Access.
3. Confira o campo `code` da resposta JSON se persistir erro:
   - `ACCESS_CONFIG_INVALID`: conferir a disponibilidade e o formato de `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD` nos bindings efetivos do deployment Preview.
   - `ACCESS_VERIFICATION_UNAVAILABLE`: conferir a disponibilidade de `https://yolandaimoveis.cloudflareaccess.com/cdn-cgi/access/certs`, a configuração do team domain e logs de Functions. O middleware agora separa esse caso do anterior.
   - `ACCESS_UNAUTHORIZED`: conferir o JWT da aplicação Access que protege os Previews e seu AUD, além da presença do header `Cf-Access-Jwt-Assertion`.
4. Em Workers & Pages > yolanda-site > Deployments > deployment Preview > Functions logs, procure `[preview-access]` com apenas flags booleanas. Não cole tokens no chat, prints ou repositório.
5. Após solucionar o problema, é recomendável remover os diagnósticos verbosos, mantendo a proteção `fail-closed`.

## Testes locais
- Regressão completa da 4.4.0 aprovada: 572 verificações, mais suíte da vitrine.
- Três cenários adicionais passaram: configuração ausente, JWT ausente, falha simulada na busca de chaves públicas.
- Não houve teste remoto nem publicação Cloudflare.
