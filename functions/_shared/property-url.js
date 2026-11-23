// Normalização pública 4.6.0. Não altera regras de negócio, API ou identidade visual.
export const published = "deleted_at IS NULL AND status IN ('Disponível','Reservado')";
export const origin = 'https://yolandaimoveis.com.br';
export function propertyPath(row) {
  // 4.6.0 (após migration 0010): slug persistido e atualizado pelo D1.
  if (typeof row?.slug === 'string' && /^[a-z0-9-]+$/.test(row.slug)) return '/imoveis/' + row.slug;
  // Fallback preserva resposta do banco 4.5.5 durante diagnóstico da transição.
  const terms = (row?.public_url_terms || 'imovel').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').replace(/-rj-rj$/, '-rj');
  return '/imoveis/' + terms + '-yti-' + String(row.id).padStart(4, '0');
}
export function escapeMarkup(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[char]);
}
