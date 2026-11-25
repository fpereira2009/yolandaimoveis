/* Yolanda Vitrine 4.7.2 — 16 ícones SVG leves, sem dependência externa.
 * Compatibilidade restrita: window.lucide.createIcons() usado na homepage/vitrine.
 * Formas baseadas nos ícones Lucide (licença MIT, ver LICENSE-LUCIDE.txt).
 * NÃO substituir a biblioteca do CRM (/app), que usa outros ícones.
 */
(function (global) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const icons = Object.freeze({
    'lock': [['rect', {width: 18, height: 11, x: 3, y: 11, rx: 2}], ['path', {d: 'M7 11V7a5 5 0 0 1 10 0v4'}]],
    'message-circle': [['path', {d: 'M7.9 20A9 9 0 1 1 20 16.2l.5 4.3-4.3-.5A9 9 0 0 1 7.9 20Z'}]],
    'menu': [['path', {d: 'M4 6h16M4 12h16M4 18h16'}]],
    'search': [['circle', {cx: 11, cy: 11, r: 8}], ['path', {d: 'm21 21-4.3-4.3'}]],
    'arrow-right': [['path', {d: 'M5 12h14m-7-7 7 7-7 7'}]],
    'refresh-cw': [['path', {d: 'M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5'}]],
    'shield-check': [['path', {d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10'}], ['path', {d: 'm9 12 2 2 4-4'}]],
    'map-pin': [['path', {d: 'M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z'}], ['circle', {cx: 12, cy: 10, r: 3}]],
    'send': [['path', {d: 'm22 2-7 20-4-9-9-4Z'}], ['path', {d: 'M22 2 11 13'}]],
    'phone': [['path', {d: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.7 19.7 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6 19.7 19.7 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .7 3a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.2-1.3a2 2 0 0 1 2.1-.5 13 13 0 0 0 3 .7 2 2 0 0 1 1.7 2z'}]],
    'check-circle-2': [['circle', {cx: 12, cy: 12, r: 10}], ['path', {d: 'm9 12 2 2 4-4'}]],
    'image-off': [['path', {d: 'M10.1 3H21v11M21 17v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5c0-.6.2-1.1.6-1.5M3 3l18 18'}], ['circle', {cx: 9, cy: 9, r: 2}], ['path', {d: 'm5 17 4-4 3 3'}]],
    'share-2': [['circle', {cx: 18, cy: 5, r: 3}], ['circle', {cx: 6, cy: 12, r: 3}], ['circle', {cx: 18, cy: 19, r: 3}], ['path', {d: 'm8.7 13.5 6.6 4m0-11-6.6 4'}]],
    'chevron-left': [['path', {d: 'm15 18-6-6 6-6'}]],
    'chevron-right': [['path', {d: 'm9 18 6-6-6-6'}]],
    'x': [['path', {d: 'M18 6 6 18M6 6l12 12'}]]
  });

  function createIcons() {
    // Chamadas repetidas são necessárias: o catálogo e a galeria recriam HTML.
    const placeholders = global.document.querySelectorAll('[data-lucide]');
    for (const el of placeholders) {
      const name = el.getAttribute('data-lucide');
      const paths = Object.prototype.hasOwnProperty.call(icons, name) ? icons[name] : null;
      if (!paths) continue; // fail-safe: não remove um ícone desconhecido.
      const svg = global.document.createElementNS(NS, 'svg');
      svg.setAttribute('xmlns', NS);
      svg.setAttribute('width', '24');
      svg.setAttribute('height', '24');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      for (const attr of Array.from(el.attributes || [])) {
        if (attr.name !== 'data-lucide' && !/^on/i.test(attr.name)) svg.setAttribute(attr.name, attr.value);
      }
      svg.setAttribute('class', ((el.getAttribute('class') || '') + ' lucide lucide-' + name).trim());
      for (const pair of paths) {
        const child = global.document.createElementNS(NS, pair[0]);
        for (const key of Object.keys(pair[1])) child.setAttribute(key, String(pair[1][key]));
        svg.appendChild(child);
      }
      el.replaceWith(svg);
    }
  }

  // Mantém a API consumida pelo vitrine-app.js, mas não afeta o CRM.
  global.lucide = { createIcons: createIcons };
  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', createIcons, { once: true });
  } else {
    createIcons();
  }
})(window);
