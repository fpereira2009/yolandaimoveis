# Yolanda CRM 4.4.0 — Diagnóstico seguro do JWKS Cloudflare Access

## Diagnóstico já confirmado
A URL pública `/cdn-cgi/access/certs` retorna um JSON válido com `keys` RSA/RS256 no navegador. A Pages Function continua respondendo `ACCESS_VERIFICATION_UNAVAILABLE`, portanto precisamos verificar a etapa da requisição realizada **dentro da Function**.

## Alteração
Arquivo modificado: `functions/_shared/access-auth.js`.
A lógica de autenticação e a exigência de JWT assinado foram preservadas. O código registra **somente** a etapa de falha do carregamento JWKS e, caso exista, o código HTTP. Não escreve domínio, AUD, token, cookie, email, chave pública nem corpo da resposta.

## Como usar no Preview
1. Substitua somente `functions/_shared/access-auth.js` pelo arquivo deste pacote na branch de testes.
2. Faça commit/push para `dev` e aguarde o deployment da Cloudflare concluir.
3. Abra o log em tempo real da Pages Function para o deployment dev.
4. Em outra janela, autentique-se em `https://dev.yolanda-site.pages.dev/app/`.
5. Procure `[access-jwks] JWKS_UNAVAILABLE` na requisição `/app/` e veja o campo `stage` (e `httpStatus`, quando houver).

## Interpretar os resultados
- `FETCH_FAILED_OR_REDIRECT_BLOCKED`: a chamada `fetch()` falhou ou houve um redirecionamento bloqueado pelo parâmetro `redirect: 'error'`. Verificar conectividade/redirect usando diagnóstico controlado, não remover a validação JWT.
- `HTTP_NON_OK`: endpoint respondeu HTTP diferente de 2xx. O log inclui `httpStatus`.
- `INVALID_JSON`: corpo retornado não pôde ser interpretado como JSON.
- `KEYS_MISSING`: corpo JSON não continha uma lista `keys`.

Se o log de `[access-jwks]` não aparecer, confira se o código alterado foi publicado na branch dev e se a requisição passou pela mesma Function. Não reative `DEV_BYPASS`.

## Escopo
Nenhuma alteração no Wrangler, Pages bindings, D1, R2, migrações, layout ou regras de leads. Sem deploy remoto executado.
