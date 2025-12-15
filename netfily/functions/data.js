// netlify/functions/data.js
import { getStore } from '@netlify/blobs';

export default async (req, context) => {
  // CORS (simple)
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() });
  }

  const url = new URL(req.url);
  const key = url.searchParams.get('key');       // e.g. "timesheets", "invoices"
  if (!key) return json({ ok: false, error: 'Missing ?key' }, 400);

  // bucket per site
  const store = getStore({ name: 'tnk-data' });

  try {
    if (req.method === 'GET') {
      const raw = await store.get(key, { type: 'json' });
      return json({ ok: true, rows: raw || [] });
    }

    // Everything else requires auth
    const user = context.clientContext?.user || null;
    if (!user) return json({ ok: false, error: 'Unauthorized' }, 401);

    const body = await readJSON(req);

    // POST: append item(s)
    if (req.method === 'POST') {
      const curr = (await store.get(key, { type: 'json' })) || [];
      const add = Array.isArray(body) ? body : [body];
      // ensure ids
      add.forEach((r) => (r.id ||= crypto.randomUUID()));
      const next = [...curr, ...add];
      await store.setJSON(key, next);
      return json({ ok: true, rows: add });
    }

    // PUT: upsert by id
    if (req.method === 'PUT') {
      const curr = (await store.get(key, { type: 'json' })) || [];
      const up = Array.isArray(body) ? body : [body];
      const map = new Map(curr.map((r) => [r.id, r]));
      up.forEach((r) => {
        if (!r.id) r.id = crypto.randomUUID();
        map.set(r.id, { ...(map.get(r.id) || {}), ...r });
      });
      const next = Array.from(map.values());
      await store.setJSON(key, next);
      return json({ ok: true, rows: up });
    }

    // DELETE: by id
    if (req.method === 'DELETE') {
      const id = body?.id;
      if (!id) return json({ ok: false, error: 'Missing id' }, 400);
      const curr = (await store.get(key, { type: 'json' })) || [];
      const next = curr.filter((r) => r.id !== id);
      await store.setJSON(key, next);
      return json({ ok: true });
    }

    return json({ ok: false, error: 'Method not allowed' }, 405);
  } catch (e) {
    return json({ ok: false, error: e.message || 'Server error' }, 500);
  }
};

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors() },
  });
}
async function readJSON(req) {
  const text = await req.text();
  try { return text ? JSON.parse(text) : {}; } catch { return {}; }
}
