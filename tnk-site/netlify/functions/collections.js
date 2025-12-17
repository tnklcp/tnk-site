// Generic collection get/set using Netlify Blobs (stable + JSON-safe)
import { getStore } from "@netlify/blobs";

export async function handler(event, context) {
  const method = event.httpMethod;
  const store = getStore({ name: "tnk-data" }); // <-- FIXED: correct signature

  // Require Identity for writes only (GET is public)
  const user = context?.clientContext?.user || event?.clientContext?.user || null;
  const isAuthed = !!user;

  try {
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
      await store.setJSON(key, data ?? null, {
        metadata: { updatedAt: new Date().toISOString() }
      });

      return json(200, { ok: true });
    }

    return json(405, { ok: false, error: "Method Not Allowed" });
  } catch (e) {
    return json(500, { ok: false, error: e?.message || "Server error" });
  }
}

function safeJSON(txt) {
  try { return txt ? JSON.parse(txt) : {}; } catch { return {}; }
}

function json(status, obj) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  };
}
