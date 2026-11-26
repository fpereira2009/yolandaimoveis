// SEO/SSR para Preview e Production; helpers puros (sem dependências Node).
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
export function makeHtml(property, images, requestUrl, isProduction = false) {
  const code = codeFor(property.id), {city,state} = cityAndState(property.city);
  const url = new URL(requestUrl);
  const canonical = (isProduction ? 'https://yolandaimoveis.com.br' : url.origin) + propertyPath(property.slug || slugFor(property));
  const isRent = property.purpose === 'Alugar';
  const offerVerb = isRent ? 'para alugar' : 'à venda';
  const useArea = ['terreno', 'comercial'].includes(slugPart(property.type));
  const quantity = (n, singular, plural) => Number(n) > 0 ? `${Number(n)} ${Number(n) === 1 ? singular : plural}` : '';
  const area = Number(property.area_m2) > 0 ? `${Number(property.area_m2)} m²` : '';
  const rooms = useArea ? '' : quantity(property.bedrooms, 'quarto', 'quartos');
  const headlineFeature = useArea ? area : rooms;
  const title = `${[property.type, headlineFeature, offerVerb].filter(Boolean).join(' ')} em ${property.neighborhood}, ${city} ${state} | Yolanda`;
  const price = property.price > 0 ? currencyBR(property.price) : 'Preço sob consulta';
  const parking = property.parking;
  const parkingText = (typeof parking === 'number' || (typeof parking === 'string' && parking.trim() !== '')) && Number.isSafeInteger(Number(parking)) && Number(parking) >= 0
    ? `${Number(parking)} ${Number(parking) === 1 ? 'vaga' : 'vagas'}` : '';
  const attributes = [area && area + ' de área', quantity(property.bathrooms, 'banheiro', 'banheiros'), parkingText].filter(Boolean);
  const description = `${[property.type, headlineFeature, offerVerb].filter(Boolean).join(' ')} em ${property.neighborhood}, ${city} - ${state}. ${attributes.length ? attributes.join(', ') + '. ' : ''}${price}${isRent && property.price > 0 ? ' por mês' : ''}. Consulte a Iêda Holanda, CRECI-RJ 112406.`.replace(/\s+/g,' ').trim();
  const photos = images.map(r=>publicImage(r,property.id)).filter(Boolean);
  const safeTitle=escapeHtml(property.title), photo=photos[0];
  const mediaTags = photo ? `<meta property="og:image" content="${escapeHtml(url.origin+photo)}"><meta name="twitter:card" content="summary_large_image"><link rel="preload" as="image" href="${escapeHtml(photo)}" fetchpriority="high">` : '';
  const details = String(property.description||'').trim() || 'Entre em contato com Iêda Holanda para mais informações sobre este imóvel.';
  const jsonSchema = {
    '@context':'https://schema.org','@type':'RealEstateListing',name:property.title,
    url:canonical,description,dateModified:property.updated_at,
    image:photos.map(path=>url.origin+path),

    mainEntity: {
      '@type': ({Casa:'House',Apartamento:'Apartment',Cobertura:'Apartment'})[property.type] || 'Place',
      name: title,
      address: {'@type':'PostalAddress',addressLocality:city,addressRegion:state,addressCountry:'BR'},
      containedInPlace: {'@type':'Place',name:property.neighborhood},
      ...(Number(property.area_m2)>0 ? {floorSize:{'@type':'QuantitativeValue',value:Number(property.area_m2),unitCode:'MTK'}} : {}),
      ...(!useArea && Number(property.bedrooms)>0 ? {numberOfBedrooms:Number(property.bedrooms)} : {}),
      ...(Number(property.bathrooms)>0 ? {numberOfBathroomsTotal:Number(property.bathrooms)} : {})
    },
    ...(property.price > 0 ? {offers:{'@type':'Offer',price:String(property.price),priceCurrency:'BRL',
      businessFunction:'http://purl.org/goodrelations/v1#'+(isRent?'LeaseOut':'Sell'),url:canonical,
      ...(property.status==='Disponível'?{availability:'https://schema.org/InStock'}:{}),
      ...(isRent?{priceSpecification:{'@type':'UnitPriceSpecification',price:Number(property.price),priceCurrency:'BRL',unitText:'MONTH',unitCode:'MON'}}:{})}} : {})
  };
  const crumbs = {'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[
    {'@type':'ListItem',position:1,name:'Início',item:url.origin+'/'},
    {'@type':'ListItem',position:2,name:property.title,item:canonical}
  ]};
  const locationText=escapeHtml(`${property.neighborhood} • ${city} - ${state}`);
  const photoSlides = photos.length ? photos.map((path,i)=>`<div class="seo-slide ${i?'hidden':''}" data-slide="${i}"><img src="${escapeHtml(path)}" alt="Foto ${i+1} do imóvel ${safeTitle}" ${i?'loading="lazy"':'loading="eager" fetchpriority="high"'} decoding="async" draggable="false" class="w-full h-full object-cover"></div>`).join('') :
    '<div class="flex items-center justify-center aspect-[16/10] text-moss font-heading font-bold bg-moss-soft">Imagem não disponível</div>';
  const phoneText=`Olá Iêda Holanda! Tenho interesse no imóvel ${code} - ${property.title} (${property.neighborhood}, ${city}) anunciado no site da Yolanda Transações Imobiliárias. ${canonical}`;
  const wa=`https://wa.me/${BROKER_PHONE}?text=${encodeURIComponent(phoneText)}`;
  const features=[['Área',property.area_m2 > 0 ? `${property.area_m2} m²` : 'Consultar'],...(!useArea ? [['Quartos',property.bedrooms]] : []),['Banheiros',property.bathrooms],['Vagas',parkingText ? Number(parking) : 'Consultar']];
  const featuresHtml=features.map(([label,value])=>`<div class="rounded-xl bg-sand px-3 py-3 text-center"><span class="font-heading font-extrabold text-moss">${escapeHtml(value)}</span><span class="block text-xs text-charcoal/65">${escapeHtml(label)}</span></div>`).join('');
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><!-- Google Tag Manager -->
    <script>
    (function(w,d,s,l,i){w[l]=w[l]||[];
    w[l].push({'gtm.start': new Date().getTime(),event:'gtm.js'});
    var f=d.getElementsByTagName(s)[0],
    j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';
    j.async=true;
    j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;
    f.parentNode.insertBefore(j,f);
    })(window,document,'script','dataLayer','GTM-PT6FQG5R');
    </script>
    <!-- End Google Tag Manager --><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${escapeHtml(canonical)}">
<meta name="robots" content="${isProduction ? 'index,follow' : 'noindex,nofollow'}"><meta property="og:type" content="article"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonical)}">${mediaTags}
<link rel="icon" href="/img/logo.png" type="image/png"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet"><script src="https://cdn.tailwindcss.com/3.4.17"></script>
<script>tailwind.config={theme:{extend:{colors:{sand:{DEFAULT:'#F5F2EB',warm:'#FCFBF8',border:'#E5DFD3'},moss:{DEFAULT:'#2C4A3E',light:'#3B6152',dark:'#1E352C',soft:'#EAF0ED'},terracotta:{DEFAULT:'#C86D51',hover:'#B55C41',soft:'#F8EBE7'},charcoal:'#232825',whatsapp:'#25D366'},fontFamily:{heading:['"Plus Jakarta Sans"','sans-serif'],sans:['"Inter"','sans-serif']},boxShadow:{soft:'0 10px 30px -10px rgba(44,74,62,.08)',card:'0 4px 20px -2px rgba(44,74,62,.07)'}}}};</script>
<style>body{background:#F5F2EB;color:#232825;font-family:Inter,sans-serif}h1,h2,h3,.font-heading{font-family:'Plus Jakarta Sans',sans-serif}.seo-slide{aspect-ratio:16/10}body img{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;-webkit-user-drag:none}.seo-slide img{user-select:none;-webkit-user-drag:none;-webkit-touch-callout:none}.seo-slide.hidden{display:none}.property-description{white-space:pre-line;overflow-wrap:anywhere}.property-description p+p{margin-top:.7em}.property-description h4{font-weight:800;color:#2C4A3E;margin:.75em 0 .35em}.property-description ul{list-style:disc;padding-left:1.5em}.property-description ol{list-style:decimal;padding-left:1.5em}</style>
<script type="application/ld+json">${jsonLd(jsonSchema)}</script><script type="application/ld+json">${jsonLd(crumbs)}</script>
</head><body class="overflow-x-hidden antialiased"><!-- Google Tag Manager (noscript) -->
    <noscript>
    <iframe
        src="https://www.googletagmanager.com/ns.html?id=GTM-PT6FQG5R"
        height="0"
        width="0"
        style="display:none;visibility:hidden">
    </iframe>
    </noscript>
<!-- End Google Tag Manager (noscript) -->
<header class="bg-sand/95 border-b border-sand-border sticky top-0 z-40 backdrop-blur-md"><div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center gap-3"><a href="/" class="flex items-center gap-2.5"><img src="/img/logo.png" alt="Logotipo Yolanda Transações Imobiliárias" class="h-10 w-auto max-w-[44px]"><div><strong class="font-heading text-moss font-extrabold">Yolanda</strong><span class="block text-[10px] font-semibold text-moss/75 uppercase tracking-wider">Transações Imobiliárias</span></div></a><nav class="flex items-center gap-4 text-sm font-semibold"><a href="/#imoveis" class="text-moss hover:text-terracotta">Imóveis</a><a data-contact-origin="seo_header" href="${escapeHtml(wa)}" target="_blank" rel="noopener noreferrer" class="bg-terracotta text-white rounded-xl px-4 py-2.5 hover:bg-terracotta-hover">WhatsApp</a></nav></div></header>
<main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-7 pb-16"><nav aria-label="Breadcrumb" class="text-sm text-moss/75 mb-5"><a class="underline" href="/">Início</a> / <a class="underline" href="/#imoveis">Imóveis</a> / <span aria-current="page">${escapeHtml(code)}</span></nav>
<div class="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start"><article class="lg:col-span-8 bg-white rounded-3xl border border-sand-border shadow-card overflow-hidden"><div class="relative bg-moss-soft" id="seo-gallery" data-count="${photos.length}" aria-label="Galeria de imagens do imóvel">${photoSlides}
${photos.length>1?`<button type="button" id="seo-prev" aria-label="Foto anterior" class="absolute top-1/2 left-3 -translate-y-1/2 rounded-full bg-white/95 text-moss font-bold px-3 py-2 shadow-md">‹</button><button type="button" id="seo-next" aria-label="Próxima foto" class="absolute top-1/2 right-3 -translate-y-1/2 rounded-full bg-white/95 text-moss font-bold px-3 py-2 shadow-md">›</button><span id="seo-counter" class="absolute bottom-3 right-3 bg-charcoal/80 text-white text-xs rounded-lg px-3 py-1">1 / ${photos.length}</span>`:''}</div>
<div class="p-5 sm:p-8"><div class="flex flex-wrap gap-2 mb-3"><span class="rounded-full bg-moss text-white px-3 py-1 text-xs font-bold">${escapeHtml(property.purpose)}</span><span class="rounded-full bg-sand text-moss px-3 py-1 text-xs font-bold">${escapeHtml(code)}</span></div><p class="text-terracotta font-semibold text-sm mb-2">${locationText}</p><h1 class="text-moss font-heading font-extrabold text-2xl sm:text-3xl leading-tight">${safeTitle}</h1><p class="font-heading font-extrabold text-charcoal text-3xl my-5">${escapeHtml(price)}</p><div class="grid grid-cols-2 sm:grid-cols-4 gap-2 border-y border-sand-border py-5">${featuresHtml}</div><h2 class="font-heading font-bold text-moss text-xl mt-7 mb-3">Descrição do imóvel</h2><div class="property-description text-charcoal/80 text-sm sm:text-base leading-relaxed">${safeDescription(details)}</div></div></article>
<aside class="lg:col-span-4 space-y-4"><section class="bg-white rounded-3xl border border-sand-border shadow-card p-6"><h2 class="font-heading text-moss text-lg font-extrabold">Atendimento personalizado</h2><p class="text-sm text-charcoal/70 mt-2">Iêda Holanda | Corretora de Imóveis<br>CRECI-RJ 112406</p><a data-contact-origin="seo_sidebar" href="${escapeHtml(wa)}" target="_blank" rel="noopener noreferrer" class="block text-center mt-5 rounded-xl bg-terracotta hover:bg-terracotta-hover text-white px-5 py-3.5 font-heading font-bold">Tenho Interesse · WhatsApp</a><button id="seo-share" type="button" class="w-full mt-3 rounded-xl bg-sand text-moss px-5 py-3 text-sm font-semibold">Compartilhar este imóvel</button></section>
<section class="bg-white rounded-3xl border border-sand-border shadow-card p-6"><h2 class="font-heading text-moss text-lg font-extrabold mb-3">Solicitar atendimento</h2><form id="seo-interest"><input type="text" name="website" tabindex="-1" aria-hidden="true" class="hidden" autocomplete="off"><label class="block text-sm font-bold mb-1" for="seo-name">Seu nome</label><input id="seo-name" name="name" required minlength="2" maxlength="120" class="w-full mb-3 px-4 py-3 rounded-xl bg-sand/70 border border-sand-border" autocomplete="name"><label class="block text-sm font-bold mb-1" for="seo-phone">WhatsApp com DDD</label><input id="seo-phone" name="phone" type="tel" inputmode="tel" required autocomplete="tel" placeholder="(24) 99999-9999" class="w-full mb-4 px-4 py-3 rounded-xl bg-sand/70 border border-sand-border"><button type="submit" class="w-full rounded-xl bg-moss text-white px-5 py-3 font-heading font-bold">Enviar e chamar no WhatsApp</button><p id="seo-form-message" role="status" aria-live="polite" class="text-xs mt-3 text-moss"></p></form></section></aside></div></main>
<footer class="bg-moss-dark text-sand/85 px-4 sm:px-6 lg:px-8 py-8 text-center text-xs"><p>Yolanda Transações Imobiliárias — Iêda Holanda • CRECI-RJ 112406</p><a href="/privacidade" class="underline mr-4">Política de Privacidade</a><a href="/termos" class="underline">Termos de Serviço</a></footer>
<script>window.YTIProperty=${jsonLd({codigo:code,titulo:property.title,tipo:property.type,cidade:property.city,bairro:property.neighborhood,valor:property.price,finalidade:property.purpose})};const PHOTO_URLS=${jsonLd(photos)},WA_LINK=${jsonLd(wa)},PROPERTY_CODE=${jsonLd(code)},PROPERTY_URL=${jsonLd(canonical)};</script><script src="/js/analytics.js?v=4.7.8"></script><script src="/js/property-detail-preview.js?v=4.7.8"></script></body></html>`;
}
