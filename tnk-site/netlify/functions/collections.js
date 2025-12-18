// Generic collection get/set using Netlify Blobs (browser-safe, CORS, loud errors)
import { getStore } from "@netlify/blobs";

export async function handler(event) {
  const method = event.httpMethod;

  // CORS preflight
  if (method === "OPTIONS") return json(204, null);

  try {
    // IMPORTANT: use the object form consistently
    const store = getStore({ name: "tnk-data" });

    // Netlify injects this when a valid Identity JWT is provided via Authorization: Bearer <token>
    const user = event.clientContext?.user || null;
    const isAuthed = !!user;

    if (method === "GET") {
      const name = event.queryStringParameters?.name;
      if (!name) return json(400, { ok: false, error: "Missing name" });

      const key = `${name}.json`;
      const blob = await store.get(key, { type: "json" });
      return json(200, { ok: true, data: blob ?? null });
    }

    if (method === "PUT") {
      if (!isAuthed) return json(401, { ok: false, error: "Auth required" });

      const body = safeJSON(event.body);
      const { name, data } = body || {};
      if (!name) return json(400, { ok: false, error: "Missing name" });

      const key = `${name}.json`;
      await store.set(key, JSON.stringify(data ?? null), {
        metadata: { updatedAt: new Date().toISOString(), updatedBy: user?.email || "unknown" }
      });

      return json(200, { ok: true });
    }

    return json(405, { ok: false, error: "Method Not Allowed" });
  } catch (e) {
    // This prevents “502 mystery meat” and gives you an actual message in Network tab
    return json(500, { ok: false, error: e?.message || String(e) });
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}

function json(status, obj) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
    body: obj === null ? "" : JSON.stringify(obj)
  };
}

function safeJSON(text) {
  try { return text ? JSON.parse(text) : {}; } catch { return {}; }
}
