export function onRequestGet({env}) {
  const preview = env?.MEDIA_ENV === 'preview';
  const body = preview ? 'User-agent: *\nDisallow: /\n' : 'User-agent: *\nDisallow: /app/\nSitemap: https://yolandaimoveis.com.br/sitemap.xml\n';
  return new Response(body, {headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'public,max-age=300',...(preview?{'X-Robots-Tag':'noindex, nofollow'}:{})}});
}
