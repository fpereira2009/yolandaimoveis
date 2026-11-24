import {origin, published, propertyPath} from './_shared/property-url.js';
export async function onRequestGet({request,env}) {
  if (!['preview', 'production'].includes(env?.MEDIA_ENV) || !env?.DB) return new Response('Not Found', {status:404,headers:{'Cache-Control':'no-store'}});
  try {
    const rows = (await env.DB.prepare('SELECT id, slug, updated_at FROM properties WHERE ' + published + ' ORDER BY id DESC LIMIT 50000').all()).results || [];
    const escape = v => String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const urls=[{path:'/',updated_at:null}, ...rows.map(r=>({path:propertyPath(r),updated_at:r.updated_at}))];
    const xml='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+urls.map(r=>'<url><loc>'+escape(origin+r.path)+'</loc>'+( /^\d{4}-\d{2}-\d{2}/.test(r.updated_at||'') ? '<lastmod>'+r.updated_at.slice(0,10)+'</lastmod>' : '' )+'</url>').join('\n')+'\n</urlset>';
    return new Response(xml, {headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public,max-age=300',...(env.MEDIA_ENV === 'preview' ? {'X-Robots-Tag':'noindex, nofollow'} : {})}});
  } catch {
    console.error('[seo-sitemap]','QUERY_FAILED');
    return new Response('Sitemap unavailable',{status:503,headers:{'Cache-Control':'no-store'}});
  }
}
