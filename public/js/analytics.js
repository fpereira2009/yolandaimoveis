// 4.7.8 — only explicitly selected public property fields enter dataLayer.
(() => {
  const events = new Set(['property_view','whatsapp_click','lead_whatsapp','owner_lead','property_share','phone_click','property_search','property_filter','lead_error']);
  const fields = {property_code:'codigo',property_name:'titulo',property_type:'tipo',property_city:'cidade',property_neighborhood:'bairro',property_price:'valor',property_purpose:'finalidade'};
  const origins = new Set(['card','modal','header','hero','services','broker','footer','floating_button','seo_header','seo_sidebar','seo_form','interest_form','owner_form','filters']);
  function track(event, property, origin, filters) {
    if (!events.has(event)) return;
    const payload = {event, contact_origin: origins.has(origin) ? origin : null};
    // Explicit nulls clear previous property context in GTM data model.
    for (const [key, field] of Object.entries(fields)) {
      const value = property?.[field];
      payload[key] = key === 'property_price' ? (value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null) : (typeof value === 'string' ? value : null);
    }
    const discovery = event === 'property_search' || event === 'property_filter';
    const allowed = (v, values) => values.includes(v) ? v : null;
    const count = discovery && Number.isSafeInteger(filters?.count) && filters.count >= 0 ? filters.count : null;
    Object.assign(payload, {
      filter_purpose: discovery ? allowed(filters?.purpose, ['Todos','Comprar','Alugar']) : null,
      filter_type: discovery ? allowed(filters?.type, ['Todos','Apartamento','Casa','Kitnet','Terreno','Comercial','Chácara/Sítio']) : null,
      filter_location: discovery && typeof filters?.location === 'string' && filters.location.length <= 80 && /^[\p{L}\p{M} .'-]+$/u.test(filters.location) ? filters.location : null,
      filter_bedrooms: discovery ? allowed(filters?.bedrooms, [0,1,2,3,4]) : null,
      search_used: discovery ? Boolean(filters?.searchUsed) : null,
      results_count: count,
      no_results: count === null ? null : count === 0
    });
    (window.dataLayer = window.dataLayer || []).push(payload);
  }
  window.YTIAnalytics = {track};
  document.addEventListener('click', e => {
    const link = e.target?.closest?.('a[data-contact-origin]');
    if (link) track(link.getAttribute('href')?.startsWith('tel:') ? 'phone_click' : 'whatsapp_click', window.YTIProperty || null, link.dataset.contactOrigin);
  });
})();
