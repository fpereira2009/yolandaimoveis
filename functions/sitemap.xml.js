import { origin, published, propertyPath } from './_shared/property-url.js';
export async function onRequestGet({env}) {
  const {results} = await env.DB.prepare('SELECT id, public_url_terms FROM properties WHERE ' + published + ' ORDER BY id').all();
  const urls = ['/', ...results.map(propertyPath)];
  return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    urls.map(path => '<url><loc>' + origin + path + '</loc></url>').join('') + '</urlset>', {headers:{'Content-Type':'application/xml; charset=utf-8'}});
}
