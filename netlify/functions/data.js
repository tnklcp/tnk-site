// netlify/functions/data.js
import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors() });
  }

  const url = new URL(req.url);
  const key = url.searchParams.get("key"); // e.g. "tnk_invoices"
  if (!key) return json({ ok: false, error: "Missing ?key" }, 400);

  const store = getStore({ name: "tnk-data" });

  try {
    // GET (public, but your portal pages require Identity anyway)
    if (req.method === "GET") {
      const value = await store.get(key, { type: "json" });
      // Back-compat: also expose as `rows`
      return json({ ok: true, value: value ?? null, rows: value ?? null }, 200);
    }

    // Writes require auth
    const user = context.clientContext?.user || null;
    if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

    const body = await readJSON(req);

    // PUT: overwrite (objects) OR upsert (arrays)
    if (req.method === "PUT") {
      // Explicit overwrite mode
      if (body && body.__mode === "set") {
        await store.setJSON(key, body.value ?? null);
        return json({ ok: true, value: body.value ?? null, rows: body.value ?? null }, 200);
      }

      // If current is an array, do upsert-by-id
      const curr = await store.get(key, { type: "json" });

      const isCurrArray = Array.isArray(curr);
      const isBodyArray = Array.isArray(body);

      // Upsert array items
      if (isBodyArray) {
        if (!isCurrArray && curr != null) {
          return json({ ok: false, error: "Cannot upsert array into non-array store. Use __mode:set." }, 400);
        }
        const map = new Map((curr || []).map((r) => [r.id, r]));
        body.forEach((r) => {
          if (!r || typeof r !== "object") return;
          if (!r.id) r.id = crypto.randomUUID();
          map.set(r.id, { ...(map.get(r.id) || {}), ...r });
        });
        const next = Array.from(map.values());
        await store.setJSON(key, next);
        return json({ ok: true, value: next, rows: next }, 200);
      }

      // Upsert single object into array (if curr is array and body has id)
      if (isCurrArray && body && typeof body === "object") {
        const map = new Map((curr || []).map((r) => [r.id, r]));
        const r = { ...body };
        if (!r.id) r.id = crypto.randomUUID();
        map.set(r.id, { ...(map.get(r.id) || {}), ...r });
        const next = Array.from(map.values());
        await store.setJSON(key, next);
        return json({ ok: true, value: next, rows: next }, 200);
      }

      // Otherwise, treat as overwrite of object/blob
      await store.setJSON(key, body ?? null);
      return json({ ok: true, value: body ?? null, rows: body ?? null }, 200);
    }

    // POST: append into array only
    if (req.method === "POST") {
      const curr = (await store.get(key, { type: "json" })) || [];
      if (!Array.isArray(curr)) {
        return json({ ok: false, error: "POST only supported for array collections. Use PUT __mode:set for objects." }, 400);
      }
      const add = Array.isArray(body) ? body : [body];
      add.forEach((r) => {
        if (r && typeof r === "object") r.id ||= crypto.randomUUID();
      });
      const next = [...curr, ...add];
      await store.setJSON(key, next);
      return json({ ok: true, value: add, rows: add }, 200);
    }

    // DELETE: remove by id from array only
    if (req.method === "DELETE") {
      const id = body?.id;
      if (!id) return json({ ok: false, error: "Missing id" }, 400);

      const curr = (await store.get(key, { type: "json" })) || [];
      if (!Array.isArray(curr)) {
        return json({ ok: false, error: "DELETE only supported for array collections." }, 400);
      }
      const next = curr.filter((r) => r?.id !== id);
      await store.setJSON(key, next);
      return json({ ok: true }, 200);
    }

    return json({ ok: false, error: "Method not allowed" }, 405);
  } catch (e) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors() },
  });
}
async function readJSON(req) {
  const text = await req.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}
