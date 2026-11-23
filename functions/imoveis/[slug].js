import { published, origin, propertyPath, escapeMarkup as esc } from '../_shared/property-url.js';
import { propertyImageRows, mediaPath, parsePropertyCode } from '../_shared/property-media.js';
import '../../public/js/property-description.js';

function html(body, status = 200) {
  return new Response(body, {status, headers: {'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store'}});
}

export async function onRequestGet({params, env, request}) {
  const code = params.slug.match(/(yti-\d{4,})$/i)?.[1].toUpperCase();
  const id = parsePropertyCode(code);
  const row = id && await env.DB.prepare('SELECT * FROM properties WHERE id = ? AND ' + published).bind(id).first();
  if (!row) return html('<html lang="pt-BR"><meta charset="utf-8"><title>Imóvel indisponível</title><h1>Imóvel indisponível</h1><a href="/">Ver outros imóveis</a></html>', 404);
  const path = propertyPath(row);
  if (new URL(request.url).pathname !== path) return Response.redirect(new URL(path, request.url), 301);
  const photos = await propertyImageRows(env, id);
  const location = [row.neighborhood, row.city].filter(Boolean).join(', ');
  const title = [row.title, location, 'Yolanda Imóveis'].filter(Boolean).join(' | ');
  const facts = [row.type, row.purpose, row.status, row.bedrooms && row.bedrooms + ' quarto(s)', row.area_m2 && row.area_m2 + ' m²'].filter(Boolean).join(' · ');
  const price = row.price > 0 ? new Intl.NumberFormat('pt-BR', {style:'currency',currency:'BRL'}).format(row.price) : 'Preço sob consulta';
  const description = row.description || [row.title, location, facts, price].join(' · ');
  return html(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description.replace(/\s+/g,' ').slice(0,180))}">
<link rel="canonical" href="${origin + path}"><link rel="stylesheet" href="/property.css"></head>
<body><main><nav><a href="/">← Yolanda Transações Imobiliárias</a></nav><article>
<h1>${esc(row.title)}</h1><p>${esc(location)}</p><p>${esc(facts)}</p><strong>${esc(price)}</strong>
<div class="gallery">${photos.map((photo,i) => `<img src="${esc(mediaPath(photo.object_key,env))}" alt="${esc(row.title)} — foto ${i+1}" ${i ? 'loading="lazy"' : ''}>`).join('')}</div>
<section>${globalThis.YolandaDescription.toHtml(description)}</section><p>Referência ${esc(code)}</p>
<a class="contact" href="/?interesse=${code}">Tenho interesse neste imóvel</a></article></main></body></html>`);
}
