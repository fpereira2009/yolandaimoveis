import {HttpError,json,parseId,isUnique} from './common.js';
import {authenticate} from '../access-auth.js';
import {verifyWriteOrigin,readJson} from '../request-guards.js';
import {clientOut,CLIENTS_SQL,propOut} from './serialization.js';
import {listLeads,createLead,patchLead,deleteLead,addNote,closeLead,softDelete} from './leads.js';
import {createClient,patchClient} from './clients.js';
import {propValues,insertProperty,patchProperty,deletePropertyWithMedia,importProperties} from './properties.js';
import {publicProperties,publicContact} from './public.js';
import {exportCsv} from './csv.js';
import {mediaEnabled,propertyImageMap} from '../property-media.js';
// ---------- Roteador ----------
export async function onRequest({ request, env, params }) {
  try {
    const method = request.method;
    const parts = [].concat(params.route || []);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) verifyWriteOrigin(request);
    const body = method === 'GET' || method === 'HEAD' || method === 'DELETE'
      ? {} : await readJson(request, parts[0] === 'public' ? 8192 : 1024 * 1024);

    if (parts[0] === 'public') {
      if (parts[1] === 'properties' && method === 'GET') return await publicProperties(env);
      if (parts[1] === 'contact' && method === 'POST') return await publicContact(env, body);
      throw new HttpError(404, 'Rota não encontrada.');
    }

    await authenticate(request, env);
    const [res, id, sub] = parts;
    // Diagnóstico autenticado: mesma regra de disputa para ambos os ambientes;
    // MEDIA_ENV controla apenas a disponibilidade da integração R2.
    if (res === 'diagnostics' && id === 'disputes' && !sub && method === 'GET') {
      return json({
        apiVersion: '4.5.3' ,
        mediaEnv: env.MEDIA_ENV || null,
        disputeRulesEnabled: true,
        mediaEnabled: mediaEnabled(env),
        dbBindingAvailable: Boolean(env.DB),
        mediaBucketBindingAvailable: Boolean(env.MEDIA_BUCKET),
      });
    }
    if (res === 'export' && method === 'GET' && id) return await exportCsv(env, id.replace(/\.csv$/, ''));
    if (res === 'leads') {
      if (!id) { if (method === 'GET') return json(await listLeads(env)); if (method === 'POST') return json(await createLead(env, body), 201); }
      else if (!sub) {
        if (method === 'PATCH') return json(await patchLead(env, parseId(id, 100, 'LD'), body));
        if (method === 'DELETE') return json(await deleteLead(env, parseId(id, 100, 'LD')));
      } else if (sub === 'notes' && method === 'POST') return json(await addNote(env, parseId(id, 100, 'LD'), body), 201);
      else if (sub === 'close' && method === 'POST') return json(await closeLead(env, parseId(id, 100, 'LD'), body));
    }
    if (res === 'clients') {
      if (!id) {
        if (method === 'GET') return json({ items: (await env.DB.prepare(CLIENTS_SQL).all()).results.map(clientOut) });
        if (method === 'POST') return json(await createClient(env, body), 201);
      } else if (!sub) {
        if (method === 'PATCH') return json(await patchClient(env, parseId(id, 0, 'CRC'), body));
        if (method === 'DELETE') return json(await softDelete(env, 'clients', parseId(id, 0, 'CRC')));
      }
    }
    if (res === 'properties') {
      if (!id) {
        if (method === 'GET') {
          const rows = (await env.DB.prepare('SELECT * FROM properties WHERE deleted_at IS NULL ORDER BY id DESC').all()).results;
          const galleries = await propertyImageMap(env);
          return json({ items: rows.map(r => propOut(r, galleries.get(r.id) || [], env)) });
        }
        if (method === 'POST') return json(await insertProperty(env, await propValues(body, { defaults: true })), 201);
      } else if (id === 'import' && method === 'POST') return json(await importProperties(env, body));
      else if (!sub) {
        if (method === 'PATCH') return json(await patchProperty(env, parseId(id, 0, 'YTI'), body));
        if (method === 'DELETE') return json(await deletePropertyWithMedia(env, parseId(id, 0, 'YTI')));
      }
    }
    throw new HttpError(404, 'Rota não encontrada.');
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, ...(e.extra || {}) }, e.status);
    if (isUnique(e)) return json({ error: 'Registro duplicado.' }, 409);
    console.error(e);
    // Não enviar detalhes de exceção, SQL ou nomes internos de infraestrutura.
    return json({ error: 'Erro interno. Tente novamente ou contate o suporte.' }, 500);
  }
}
