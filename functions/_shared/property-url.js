export const published = "deleted_at IS NULL AND status IN ('Disponível','Reservado')";
export const origin = 'https://yolandaimoveis.com.br';
export function propertyPath(row) {
  const terms = (row.public_url_terms || 'imovel').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').replace(/-rj-rj$/, '-rj');
  return '/imoveis/' + terms + '-yti-' + String(row.id).padStart(4, '0');
}
export function escapeMarkup(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[char]);
}
