// Controla o acesso à área restrita do CRC e dos deployments de Preview.
// O Cloudflare Access protege os Previews na borda; validamos seu JWT novamente.
import { authenticate } from './_shared/access-auth.js';

const RESTRICTED_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  'Pragma': 'no-cache',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
};
function protectedResponse(response) {
  const cloned = new Response(response.body, response);
  for (const [key, value] of Object.entries(RESTRICTED_HEADERS)) cloned.headers.set(key, value);
  return cloned;
}

export async function onRequest(ctx) {
  const url = new URL(ctx.request.url);
  const isCrc = url.hostname.startsWith('crc.');
  const isPreview = url.hostname.endsWith('.yolanda-site.pages.dev') && url.hostname !== 'yolanda-site.pages.dev';
  const isApp = url.pathname === '/app' || url.pathname.startsWith('/app/');
  if (isApp || (isCrc && url.pathname === '/')) {
    if (!isCrc && !isPreview) return protectedResponse(new Response('Não encontrado', { status: 404 }));
    try { await authenticate(ctx.request, ctx.env); }
    catch (e) {
      const isServiceUnavailable = e?.status === 503;
      const accessErrorCode = isServiceUnavailable
        ? (e?.message === 'Acesso não configurado no servidor.' ? 'ACCESS_CONFIG_INVALID' : 'ACCESS_VERIFICATION_UNAVAILABLE')
        : 'ACCESS_UNAUTHORIZED';
      if (isPreview && isServiceUnavailable) {
        // Somente diagnósticos de presença: nunca logar JWT, AUD, domínio ou valores secretos.
        console.error('[preview-access]', accessErrorCode, {
          teamDomainDefined: typeof ctx.env?.ACCESS_TEAM_DOMAIN === 'string' && !!ctx.env.ACCESS_TEAM_DOMAIN.trim(),
          audienceDefined: typeof ctx.env?.ACCESS_AUD === 'string' && !!ctx.env.ACCESS_AUD.trim(),
        });
      }
      const body = isPreview
        ? {
            error: isServiceUnavailable ? 'Falha na configuração ou validação do Cloudflare Access.' : 'Não autenticado.',
            code: accessErrorCode,
          }
        : { error: isServiceUnavailable ? 'Serviço de autenticação indisponível.' : 'Não autenticado.' };
      return protectedResponse(new Response(JSON.stringify(body), {
        status: isServiceUnavailable ? 503 : 401,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      }));
    }
  }
  if (isCrc && url.pathname === '/') {
    const page = await ctx.env.ASSETS.fetch(new URL('/app/', url));
    return protectedResponse(page);
  }
  const response = await ctx.next();
  return (isCrc || isApp) ? protectedResponse(response) : response;
}
