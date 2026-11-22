import {HttpError,todayBR,leadCode,clientCode,propCode} from './common.js';
// ---------- Exportação (CSV com ; e BOM: abre direto no Excel em português) ----------
function csvEsc(v) {
  if (v === null || v === undefined) return '""';
  if (typeof v === 'number') return String(v);
  let t = String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return '"' + t.replace(/"/g, '""') + '"';
}
const toCsv = (headers, rows) => '\uFEFF' + [headers, ...rows].map((r) => r.map(csvEsc).join(';')).join('\r\n') + '\r\n';

async function exportCsv(env, base) {
  const q = (sql) => env.DB.prepare(sql).all().then((r) => r.results);
  let headers, rows;
  if (base === 'leads') {
    headers = ['codigo', 'nome', 'telefone', 'categoria', 'modalidade', 'etapa', 'temperatura', 'imovel_interesse', 'valor', 'proximo_followup', 'origem', 'codigo_cliente', 'criado_em', 'atualizado_em', 'fechado_em', 'excluido_em', 'imovel_codigo', 'imovel_externo', 'imovel_externo_ref', 'resultado_fechamento', 'obs_fechamento'];
    rows = (await q('SELECT * FROM leads ORDER BY id')).map((r) => [leadCode(r.id), r.name, r.phone, r.category, r.modality, r.stage, r.temp, r.property, r.value, r.followup_at, r.source, r.client_id ? clientCode(r.client_id) : '', r.created_at, r.updated_at, r.closed_at, r.deleted_at,
      r.property_id ? propCode(r.property_id) : '', r.external_property ? 'Sim' : 'Não', r.external_property_ref, r.close_result, r.close_note]);
  } else if (base === 'clientes') {
    headers = ['codigo', 'nome', 'telefone', 'modalidade', 'regioes_interesse', 'faixa_orcamento', 'preferencias', 'ultima_interacao', 'proxima_acao', 'aniversariante_do_mes', 'follow_up_pendente', 'origem', 'criado_em', 'atualizado_em', 'excluido_em'];
    rows = (await q('SELECT * FROM clients ORDER BY id')).map((r) => [clientCode(r.id), r.name, r.phone, r.modality, r.regions, r.budget, r.preferences, r.last_interaction, r.next_action, r.birthday_month ? 'Sim' : 'Não', r.pending_followup ? 'Sim' : 'Não', r.source, r.created_at, r.updated_at, r.deleted_at]);
  } else if (base === 'imoveis') {
    headers = ['codigo', 'titulo', 'finalidade', 'tipo', 'bairro', 'cidade', 'valor', 'area_m2', 'quartos', 'banheiros', 'vagas', 'foto_url', 'destaque', 'status', 'descricao', 'criado_em', 'atualizado_em', 'excluido_em'];
    rows = (await q('SELECT * FROM properties ORDER BY id')).map((r) => [propCode(r.id), r.title, r.purpose, r.type, r.neighborhood, r.city, r.price, r.area_m2, r.bedrooms, r.bathrooms, r.parking, r.photo_url, r.badge, r.status, r.description, r.created_at, r.updated_at, r.deleted_at]);
  } else if (base === 'historico') {
    headers = ['codigo_lead', 'tipo', 'texto', 'data'];
    rows = (await q('SELECT * FROM lead_events ORDER BY lead_id, created_at, id')).map((r) => [leadCode(r.lead_id), r.kind, r.text, r.created_at]);
  } else throw new HttpError(404, 'Base desconhecida.');
  return new Response(toCsv(headers, rows), { headers: {
    'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store',
    'Content-Disposition': `attachment; filename="yolanda_${base}_${todayBR()}.csv"`,
  } });
}


export {exportCsv};
