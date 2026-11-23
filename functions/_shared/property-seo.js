// SEO/SSR exclusivo do Preview; helpers puros (sem dependências Node).
export const SITE_NAME = 'Yolanda Transações Imobiliárias';
export const BROKER_NAME = 'Iêda Holanda';
export const BROKER_PHONE = '5524999040775';
const STATES = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));

export function slugPart(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'imovel';
}
export function cityAndState(value) {
  const input = String(value || 'Resende - RJ').trim();
  const match = /^(.*)\s+-\s+([A-Z]{2})$/i.exec(input);
  return match && STATES.has(match[2].toUpperCase())
    ? { city: match[1].trim(), state: match[2].toUpperCase() }
    : { city: input || 'Resende', state: 'RJ' };
}
export function codeFor(id) {
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw new Error('Identificador inválido');
  return `YTI-${String(id).padStart(4, '0')}`;
}
export function slugFor(property) {
  const {city, state} = cityAndState(property.city);
  const type = slugPart(property.type);
  const useArea = type === 'comercial' || type === 'terreno';
  const rawArea = Number(property.area_m2);
  // Banco D1: area_m2 é INTEGER >= 0. Não inventamos metragem quando está ausente.
  const size = useArea
    ? (Number.isSafeInteger(rawArea) && rawArea > 0 ? `${rawArea}m2` : 'area-nao-informada')
    : `${Number(property.bedrooms || 0)}-${Number(property.bedrooms || 0) === 1 ? 'quarto' : 'quartos'}`;
  return [type, size, slugPart(property.neighborhood), slugPart(city), state.toLowerCase(),
    codeFor(property.id).toLowerCase()].join('-');
}
export function slugId(slug) {
  const match = /-yti-(\d{4,})$/.exec(String(slug || ''));
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isSafeInteger(n) && n > 0 && match[1] === String(n).padStart(4, '0') ? n : null;
}
export const propertyPath = slug => `/imoveis/${encodeURIComponent(slug)}`;
export const escapeHtml = value => String(value ?? '')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
export const jsonLd = value => JSON.stringify(value).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
// Preserva somente marcação rica simples sem atributos (safe allowlist),
// mantendo scripts, handlers HTML e tags desconhecidas escapados.
export function safeDescription(value) {
  const escaped = escapeHtml(value || '');
  return escaped.replace(/&lt;(\/?)(p|strong|b|em|i|u|ul|ol|li|h4|br)&gt;/gi,
    (full, closing, tag) => tag.toLowerCase() === 'br' && closing ? '' : `<${closing}${tag.toLowerCase()}>`);
}
export const currencyBR = number => new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL', maximumFractionDigits:0 }).format(Number(number||0));
export function publicImage(row, propertyId) {
  // Nunca aceitar chaves arbitrárias da tabela no HTML; impede path traversal.
  if (!row || !new RegExp(`^properties/${propertyId}/[0-9a-f-]{36}\\.(?:webp|jpg)$`, 'i').test(row.object_key)) return null;
  return '/api/media/file/' + row.object_key.split('/').map(encodeURIComponent).join('/');
}
export function seoResponse(status, body, additional={}) {
  return new Response(body, {status, headers:{
    'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'private, no-store',
    'X-Robots-Tag':'noindex, nofollow', 'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'strict-origin-when-cross-origin', 'X-Frame-Options':'DENY', ...additional
  }});
}
export function makeHtml(property, images, requestUrl) {
  const code = codeFor(property.id), {city,state} = cityAndState(property.city);
  const url = new URL(requestUrl);
  const canonical = url.origin + propertyPath(property.slug);
  const isRent = property.purpose === 'Alugar';
  const offerVerb = isRent ? 'para alugar' : 'à venda';
  const useArea = ['terreno', 'comercial'].includes(slugPart(property.type));
  const headlineFeature = useArea ? (property.area_m2 > 0 ? `${property.area_m2} m²` : 'área não informada') : `${property.bedrooms} ${property.bedrooms === 1 ? 'quarto' : 'quartos'}`;
  const title = `${property.type} ${headlineFeature} ${offerVerb} no ${property.neighborhood}, ${city} ${state} | Yolanda`;
  const price = property.price > 0 ? currencyBR(property.price) : 'Preço sob consulta';
  const description = `${property.type} ${headlineFeature} ${offerVerb} em ${property.neighborhood}, ${city} - ${state}. ${property.area_m2 > 0 ? property.area_m2 + ' m² de área' : 'Área sob consulta'}, ${useArea ? '' : property.bedrooms + ' quartos, '}${property.bathrooms} banheiros, ${property.parking} vagas. ${property.price > 0 ? price : 'Preço sob consulta'}. Consulte a Iêda Holanda, CRECI-RJ 112406.`.replace(/\s+/g,' ').slice(0,260);
  const photos = images.map(r=>publicImage(r,property.id)).filter(Boolean);
  const safeTitle=escapeHtml(property.title), photo=photos[0];
  const mediaTags = photo ? `<meta property="og:image" content="${escapeHtml(url.origin+photo)}"><meta name="twitter:card" content="summary_large_image"><link rel="preload" as="image" href="${escapeHtml(photo)}" fetchpriority="high">` : '';
  const details = String(property.description||'').trim() || 'Entre em contato com Iêda Holanda para mais informações sobre este imóvel.';
  const jsonSchema = {
    '@context':'https://schema.org','@type':'RealEstateListing',name:property.title,
    url:canonical,description:details.slice(0,2000),dateModified:property.updated_at,
    image:photos.map(path=>url.origin+path),
    address:{'@type':'PostalAddress',addressLocality:city,addressRegion:state,addressCountry:'BR'},
    ...(property.price > 0 ? {offers:{'@type':'Offer',price:String(property.price),priceCurrency:'BRL',availability:'https://schema.org/InStock',url:canonical}} : {})
  };
  const crumbs = {'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[
    {'@type':'ListItem',position:1,name:'Início',item:url.origin+'/'},
    {'@type':'ListItem',position:2,name:'Imóveis',item:url.origin+'/#imoveis'},
    {'@type':'ListItem',position:3,name:property.title,item:canonical}
  ]};
  const locationText=escapeHtml(`${property.neighborhood} • ${city} - ${state}`);
  const photoSlides = photos.length ? photos.map((path,i)=>`<div class="seo-slide ${i?'hidden':''}" data-slide="${i}"><img src="${escapeHtml(path)}" alt="Foto ${i+1} do imóvel ${safeTitle}" ${i?'loading="lazy"':'loading="eager" fetchpriority="high"'} decoding="async" draggable="false" class="w-full h-full object-cover"></div>`).join('') :
    '<div class="flex items-center justify-center aspect-[16/9] text-moss font-heading font-bold bg-moss-soft">Imagem não disponível</div>';
  const phoneText=`Olá Iêda Holanda! Tenho interesse no imóvel ${code} - ${property.title} (${property.neighborhood}, ${city}) anunciado no site da Yolanda Transações Imobiliárias. ${canonical}`;
  const wa=`https://wa.me/${BROKER_PHONE}?text=${encodeURIComponent(phoneText)}`;
  const features=[['Área Total',property.area_m2 > 0 ? `${property.area_m2} m²` : '—'],['Dormitórios',useArea ? '—' : (property.bedrooms || 0)],['Banheiros',property.bathrooms || 0],['Vagas',property.parking || 0]];
  const featuresHtml=features.map(([label,value])=>`<div class="rounded-2xl bg-sand border border-sand-border p-3 text-center"><span class="block font-heading font-extrabold text-moss text-sm">${escapeHtml(value)}</span><span class="block text-[11px] text-charcoal/65">${escapeHtml(label)}</span></div>`).join('');
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${escapeHtml(canonical)}">
<meta name="robots" content="noindex,nofollow"><meta property="og:type" content="article"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonical)}">${mediaTags}
<link rel="icon" href="/img/logo.png" type="image/png"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet"><script src="https://cdn.tailwindcss.com/3.4.17"></script>
<script>tailwind.config={theme:{extend:{colors:{sand:{DEFAULT:'#F5F2EB',warm:'#FCFBF8',border:'#E5DFD3'},moss:{DEFAULT:'#2C4A3E',light:'#3B6152',dark:'#1E352C',soft:'#EAF0ED'},terracotta:{DEFAULT:'#C86D51',hover:'#B55C41',soft:'#F8EBE7'},charcoal:'#232825',whatsapp:'#25D366'},fontFamily:{heading:['"Plus Jakarta Sans"','sans-serif'],sans:['"Inter"','sans-serif']},boxShadow:{soft:'0 10px 30px -10px rgba(44,74,62,.08)',card:'0 4px 20px -2px rgba(44,74,62,.07)'}}}};</script>
<style>body{background:#F5F2EB;color:#232825;font-family:Inter,sans-serif}h1,h2,h3,.font-heading{font-family:'Plus Jakarta Sans',sans-serif}.seo-slide{aspect-ratio:16/9}body img{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;-webkit-user-drag:none}.seo-slide img{transition:transform 180ms ease;user-select:none;-webkit-user-drag:none;-webkit-touch-callout:none}.seo-slide.hidden{display:none}.property-description{white-space:pre-line;overflow-wrap:anywhere}.property-description p+p{margin-top:.7em}.property-description h4{font-weight:800;color:#2C4A3E;margin:.75em 0 .35em}.property-description ul{list-style:disc;padding-left:1.5em}.property-description ol{list-style:decimal;padding-left:1.5em}</style>
<script type="application/ld+json">${jsonLd(jsonSchema)}</script><script type="application/ld+json">${jsonLd(crumbs)}</script>
</head><body class="overflow-x-hidden antialiased">
<header class="bg-sand/95 border-b border-sand-border sticky top-0 z-40 backdrop-blur-md"><div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center gap-3"><a href="/" class="flex items-center gap-2.5"><img src="/img/logo.png" alt="Logotipo Yolanda Transações Imobiliárias" class="h-10 w-auto max-w-[44px]"><div><strong class="font-heading text-moss font-extrabold">Yolanda</strong><span class="block text-[10px] font-semibold text-moss/75 uppercase tracking-wider">Transações Imobiliárias</span></div></a><nav class="flex items-center gap-4 text-sm font-semibold"><a href="/#imoveis" class="text-moss hover:text-terracotta">Imóveis</a><a href="${escapeHtml(wa)}" target="_blank" rel="noopener noreferrer" class="bg-terracotta text-white rounded-xl px-4 py-2.5 hover:bg-terracotta-hover">WhatsApp</a></nav></div></header>
<main class="max-w-2xl mx-auto px-3 sm:px-6 pt-6 pb-14">
<nav aria-label="Breadcrumb" class="text-xs sm:text-sm text-moss/75 mb-4"><a class="hover:text-terracotta underline" href="/">Início</a> / <a class="hover:text-terracotta underline" href="/#imoveis">Imóveis</a> / <span aria-current="page">${escapeHtml(code)}</span></nav>
<article class="bg-white w-full rounded-3xl overflow-hidden shadow-2xl border border-sand-border" aria-labelledby="property-title">
<div id="seo-gallery" data-count="${photos.length}" class="property-image-frame relative aspect-[16/9] bg-moss-soft touch-pan-y overflow-hidden" aria-label="Galeria de imagens do imóvel">
${photoSlides}
${photos.length>1?`<button type="button" id="seo-prev" aria-label="Foto anterior" class="absolute top-1/2 -translate-y-1/2 left-3 p-2 rounded-full bg-white/90 text-moss shadow-md hover:bg-sand text-xl leading-none">‹</button><button type="button" id="seo-next" aria-label="Próxima foto" class="absolute top-1/2 -translate-y-1/2 right-3 p-2 rounded-full bg-white/90 text-moss shadow-md hover:bg-sand text-xl leading-none">›</button><span id="seo-counter" aria-live="polite" class="absolute bottom-4 right-4 rounded-lg bg-charcoal/80 text-white text-xs font-bold px-2.5 py-1">1 / ${photos.length}</span>`:''}
<a href="/#imoveis" aria-label="Fechar detalhes e voltar aos imóveis" class="absolute top-4 right-4 p-2.5 w-10 h-10 flex items-center justify-center rounded-full bg-white/95 text-charcoal hover:bg-terracotta hover:text-white shadow-md transition-colors text-xl leading-none">×</a>
<div class="absolute bottom-4 left-4 flex items-center gap-2">
<span class="px-3 py-1 rounded-full text-xs font-heading font-bold ${isRent ? 'bg-terracotta' : 'bg-moss'} text-white">${escapeHtml(property.purpose)}</span>
<span class="px-3 py-1 rounded-full bg-charcoal/85 text-white font-mono text-xs font-bold">${escapeHtml(code)}</span>
</div></div>
<div class="p-5 sm:p-7 space-y-5">
<div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
<div><p class="text-xs font-bold text-terracotta">${escapeHtml(property.type)} • ${escapeHtml(property.neighborhood)}, ${escapeHtml(city)} - ${escapeHtml(state)}</p>
<h1 id="property-title" class="font-heading font-extrabold text-moss text-xl sm:text-2xl mt-1">${safeTitle}</h1>
<p class="font-heading font-extrabold text-charcoal text-2xl sm:text-3xl mt-2">${escapeHtml(price)}</p></div>
<button id="seo-share" type="button" title="Compartilhar este imóvel" aria-label="Compartilhar anúncio" class="self-start shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sand hover:bg-moss-soft text-moss border border-sand-border font-heading font-bold text-xs transition-colors"><span aria-hidden="true" class="text-terracotta text-base">↗</span><span class="sr-only">Compartilhar</span></button>
</div>
<div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">${featuresHtml}</div>
<div class="space-y-1.5"><h2 class="font-heading font-bold text-moss text-sm">Descrição do Imóvel</h2>
<div class="property-description text-xs sm:text-sm text-charcoal/80 leading-relaxed">${safeDescription(details)}</div></div>
<form id="seo-interest" class="space-y-2">
<h2 class="font-heading font-bold text-moss text-sm">Quero falar sobre este imóvel</h2>
<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
<input id="seo-name" type="text" name="name" required minlength="2" maxlength="120" autocomplete="name" placeholder="Seu nome *" aria-label="Seu nome" class="w-full px-4 py-3 rounded-xl bg-sand/70 border border-sand-border text-sm focus:outline-none focus:ring-2 focus:ring-moss/30">
<input id="seo-phone" type="tel" name="phone" required autocomplete="tel" inputmode="tel" placeholder="Seu WhatsApp com DDD *" aria-label="Seu WhatsApp com DDD" class="w-full px-4 py-3 rounded-xl bg-sand/70 border border-sand-border text-sm focus:outline-none focus:ring-2 focus:ring-moss/30"></div>
<input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" class="hidden">
<p class="text-[11px] text-charcoal/60">Seu contato fica registrado para a Iêda retornar, e o WhatsApp abre em seguida.</p>
<p id="seo-form-message" role="status" aria-live="polite" class="text-xs text-moss"></p>
<div class="pt-4 mt-4 border-t border-sand-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-sand p-4 rounded-2xl">
<div class="flex items-center gap-3"><img src="/img/fotocorretora.jpeg" alt="Iêda Holanda" class="w-12 h-12 aspect-square rounded-full object-cover object-top border-2 border-terracotta shrink-0">
<div><p class="font-heading font-bold text-moss text-sm">Iêda Holanda</p><p class="text-xs text-charcoal/70">CRECI-RJ 112406 • (24) 99904-0775</p></div></div>
<button type="submit" class="py-3.5 px-6 rounded-xl bg-whatsapp hover:brightness-105 text-white font-heading font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all"><span>Enviar e chamar no WhatsApp</span></button>
</div></form>
</div></article>
<p class="text-center mt-5"><a class="text-sm font-heading font-bold text-moss hover:text-terracotta" href="/#imoveis">← Voltar aos imóveis</a></p>
</main>
<footer class="bg-moss-dark text-sand/85 px-4 sm:px-6 lg:px-8 py-8 text-center text-xs"><p>Yolanda Transações Imobiliárias — Iêda Holanda • CRECI-RJ 112406</p><a href="/privacidade" class="underline mr-4">Política de Privacidade</a><a href="/termos" class="underline">Termos de Serviço</a></footer>
<script>const PHOTO_URLS=${jsonLd(photos)},WA_LINK=${jsonLd(wa)},PROPERTY_CODE=${jsonLd(code)},PROPERTY_URL=${jsonLd(canonical)};</script><script src="/js/property-detail-preview.js?v=4.6.0"></script></body></html>`;
}
