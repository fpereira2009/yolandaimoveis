import { makeHtml, slugId, slugFor, propertyPath, seoResponse } from '../_shared/property-seo.js';

const notFound = () => seoResponse(404, `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Imóvel não encontrado | Yolanda</title><body style="font-family:Inter,Arial,sans-serif;background:#F5F2EB;color:#2C4A3E;text-align:center;padding:5rem 1rem"><h1>Imóvel não disponível</h1><p>Este anúncio não foi encontrado ou não está mais publicado.</p><a href="/#imoveis">Consultar outros imóveis</a></body></html>`);
export async function onRequestGet({request, env, params}) {
  // SEO público habilitado em Preview e Production, usando os bindings do ambiente atual.
  if (!['preview', 'production'].includes(env?.MEDIA_ENV) || !env?.DB || !env?.MEDIA_BUCKET) return notFound();
  const slug = String(params?.slug || '');
  if (slug.length > 250 || !/^[a-z0-9-]+$/.test(slug)) return notFound();
  const id = slugId(slug);
  if (!id) return notFound();
  try {
    const property = await env.DB.prepare(
      "SELECT * FROM properties WHERE id = ? AND deleted_at IS NULL AND status IN ('Disponível','Reservado') LIMIT 1"
    ).bind(id).first();
    if (!property) return notFound();
    const expected = property.slug || slugFor(property);
    if (slug !== expected) {
      const redirectTo = new URL(request.url);
      redirectTo.pathname = propertyPath(expected);
      redirectTo.search = '';
      return seoResponse(301, '', {Location:redirectTo.toString()});
    }
    const imgs = (await env.DB.prepare(
      'SELECT object_key, is_cover, position, id FROM property_images WHERE property_id = ? ORDER BY is_cover DESC, position ASC, id ASC LIMIT 10'
    ).bind(id).all()).results || [];
    return seoResponse(200, makeHtml(property, imgs, request.url, env.MEDIA_ENV === 'production'),
      env.MEDIA_ENV === 'production' ? {'X-Robots-Tag':'index, follow'} : {});
  } catch (err) {
    console.error('[seo-ssr]', 'DATABASE_OR_RENDER_ERROR');
    return seoResponse(503, '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Temporariamente indisponível</title><body>Não foi possível carregar este imóvel. Tente novamente.</body></html>');
  }
}
