const STAGES = ['Novo Lead', 'Qualificação', 'Visita Agendada', 'Proposta Enviada', 'Documentação/Crédito', 'Fechado'];
const CLIENT_MODALITIES = ['Compra', 'Venda', 'Aluguel'];
const LEAD_MODALITIES_BY_CATEGORY = {
  Interessado: ['Compra', 'Aluguel'],
  Captação: ['Venda', 'Aluguel'],
};
const TEMPS = ['Quente', 'Morno', 'Frio'];
const CATEGORIES = ['Interessado', 'Captação'];   // Captação = proprietário que quer anunciar
const PURPOSES = ['Comprar', 'Alugar'];
const PSTATUS = ['Disponível', 'Reservado', 'Vendido', 'Alugado', 'Inativo'];
const CLOSE_RESULTS = ['Ganho', 'Perdido'];
// O imóvel pode ser vinculado desde Novo Lead; só as etapas HOLDING_STAGES reservam.
const LINK_STAGES = ['Novo Lead', 'Qualificação', 'Visita Agendada', 'Proposta Enviada', 'Documentação/Crédito'];
// Etapas em que o lead "segura" e aciona a reserva do imóvel
const HOLDING_STAGES_SQL = "('Proposta Enviada','Documentação/Crédito')";
const HOLDING_STAGES = ['Proposta Enviada', 'Documentação/Crédito'];
const TZ = 'America/Sao_Paulo';
const CODE_PREFIX = 'YTI-';

class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });

// ---------- Utilidades ----------
const nowIso = () => new Date().toISOString();
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const todayBR = () => dayFmt.format(new Date());
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dmy = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);

function followupView(at) {
  if (!at) return { status: 'Em dia', label: 'Sem data' };
  const t = todayBR();
  if (at < t) return { status: 'Atrasado', label: 'Atrasado • ' + dmy(at) };
  if (at === t) return { status: 'Hoje', label: 'Hoje' };
  if (at === addDays(t, 1)) return { status: 'Em dia', label: 'Amanhã' };
  return { status: 'Em dia', label: dmy(at) };
}
const eventDate = (iso) => new Date(iso).toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ' •');

const leadCode = (id) => 'LD-' + (100 + id);
const clientCode = (id) => 'CRC-' + String(id).padStart(2, '0');
const propCode = (id) => CODE_PREFIX + String(id).padStart(4, '0');
const parseId = (code, offset = 0, expectedPrefix = null) => {
  const match = /^(LD|CRC|YTI)-(\d+)$/.exec(String(code));
  if (!match || (expectedPrefix && match[1] !== expectedPrefix) ||
      (offset === 100 && match[1] !== 'LD') || (offset !== 100 && match[1] === 'LD')) {
    throw new HttpError(404, 'Registro não encontrado.');
  }
  const n = Number(match[2]) - offset;
  if (!Number.isSafeInteger(n) || n < 1) throw new HttpError(404, 'Registro não encontrado.');
  return n;
};

function str(v, field, { min = 0, max = 200, required = false } = {}) {
  const s = String(v ?? '').trim();
  if ((required || s) && (s.length < Math.max(min, 1) || s.length > max)) throw new HttpError(400, `Campo "${field}" inválido (${required || min ? 'obrigatório, ' : ''}até ${max} caracteres).`);
  return s;
}
function oneOf(v, list, field) {
  if (!list.includes(v)) throw new HttpError(400, `Valor inválido em "${field}".`);
  return v;
}
function validateLeadModality(category, modality) {
  const allowed = LEAD_MODALITIES_BY_CATEGORY[category];
  if (!allowed || !allowed.includes(modality)) {
    throw new HttpError(400, `Modalidade "${modality}" inválida para a categoria "${category}". Use: ${(allowed || []).join(' ou ')}.`);
  }
  return modality;
}
function intIn(v, field, max) {
  const n = Number(v === '' || v == null ? 0 : v);
  if (!Number.isFinite(n) || n < 0 || n > max) throw new HttpError(400, `Valor inválido em "${field}".`);
  return Math.round(n);
}
function normPhone(v) {
  let d = String(v ?? '').replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if (d.length < 10 || d.length > 11) throw new HttpError(400, 'Telefone inválido. Use DDD + número, ex.: (24) 99999-9999.');
  return '55' + d;
}
const money = (v) => intIn(v, 'valor', 1e9);
function dateOrNull(v) {
  if (v === null || v === '' || v === undefined) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(new Date(v + 'T12:00:00Z')) || new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) !== v) throw new HttpError(400, 'Data de follow-up inválida.');
  return v;
}
const isUnique = (e) => String(e && e.message).includes('UNIQUE');


export { STAGES, CLIENT_MODALITIES, LEAD_MODALITIES_BY_CATEGORY, TEMPS, CATEGORIES, PURPOSES, PSTATUS, CLOSE_RESULTS, LINK_STAGES, HOLDING_STAGES_SQL, HOLDING_STAGES, TZ, CODE_PREFIX, HttpError, json, nowIso, dayFmt, todayBR, addDays, dmy, followupView, eventDate, leadCode, clientCode, propCode, parseId, str, oneOf, validateLeadModality, intIn, normPhone, money, dateOrNull, isUnique };
