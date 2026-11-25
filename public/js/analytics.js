// 4.7.8 — only explicitly selected public property fields enter dataLayer.
(() => {
  const events = new Set(['property_view','whatsapp_click','lead_whatsapp','owner_lead','property_share','phone_click','property_search','property_filter','lead_error']);
  const fields = {property_code:'codigo',property_name:'titulo',property_type:'tipo',property_city:'cidade',property_neighborhood:'bairro',property_price:'valor',property_purpose:'finalidade'};
  const origins = new Set(['card','modal','header','hero','services','broker','footer','floating_button','seo_header','seo_sidebar','seo_form','interest_form','owner_form','filters']);
  function track(event, property, origin) {
    if (!events.has(event)) return;
    const payload = {event, contact_origin: origins.has(origin) ? origin : null};
    // Explicit nulls clear previous property context in GTM data model.
    for (const [key, field] of Object.entries(fields)) {
      const value = property?.[field];
      payload[key] = key === 'property_price' ? (value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null) : (typeof value === 'string' ? value : null);
    }
    (window.dataLayer = window.dataLayer || []).push(payload);
  }
  window.YTIAnalytics = {track};
  document.addEventListener('click', e => {
    const link = e.target?.closest?.('a[data-contact-origin]');
    if (link) track(link.getAttribute('href')?.startsWith('tel:') ? 'phone_click' : 'whatsapp_click', window.YTIProperty || null, link.dataset.contactOrigin);
  });
})();
