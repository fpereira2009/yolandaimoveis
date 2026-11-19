// crc.yolandaimoveis.com.br -> painel restrito (/app). No domínio público o painel não existe.
const RESTRICTED_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  'Pragma': 'no-cache',
  'X-Robots-Tag': 'noindex, nofollow'
};

function withRestrictedHeaders(response) {
  const cloned = new Response(response.body, response);
  for (const [key, value] of Object.entries(RESTRICTED_HEADERS)) {
    cloned.headers.set(key, value);
  }
  return cloned;
}

export async function onRequest(ctx) {
  const url = new URL(ctx.request.url);
  const isCrc = url.hostname.startsWith('crc.');

  if (!isCrc && url.pathname.startsWith('/app') && ctx.env.DEV_BYPASS !== '1') {
    return new Response('Não encontrado', {
      status: 404,
      headers: RESTRICTED_HEADERS
    });
  }

  if (isCrc && url.pathname === '/') {
    const assetResponse = await ctx.env.ASSETS.fetch(new URL('/app/', url));
    return withRestrictedHeaders(assetResponse);
  }

  const response = await ctx.next();
  if (isCrc || url.pathname.startsWith('/app')) {
    return withRestrictedHeaders(response);
  }

  return response;
}