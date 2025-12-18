// tnk-site/netlify/functions/collections.js
import { getStore } from "@netlify/blobs";

function json(statusCode, bodyObj, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      ...extraHeaders,
    },
    body: JSON.stringify(bodyObj),
  };
}

export async function handler(event, context) {
  try {
    const method = event.httpMethod || "GET";

    // CORS
    if (method === "OPTIONS") return json(204, {}, {});

    const store = getStore("tnk-data");

    if (method === "GET") {
      const name = event.queryStringParameters?.name;
      if (!name) return json(400, { ok: false, error: "Missing ?name" });

      const key = `${name}.json`;
      const data = await store.get(key, { type: "json" });
      return json(200, { ok: true, data: data ?? null });
    }

    if (method === "PUT") {
      // Require Identity for writes
      const user = context?.clientContext?.user || null;
      if (!user) return json(401, { ok: false, error: "Auth required" });

      let body = {};
      try { body = event.body ? JSON.parse(event.body) : {}; } catch { body = {}; }

      const { name, data } = body || {};
      if (!name) return json(400, { ok: false, error: "Missing name" });

      const key = `${name}.json`;
      await store.setJSON(key, data ?? null, {
        metadata: { updatedAt: new Date().toISOString() },
      });

      return json(200, { ok: true });
    }

    return json(405, { ok: false, error: "Method Not Allowed" });
  } catch (e) {
    // Don’t 502 silently—return real error.
    return json(500, {
      ok: false,
      error: e?.message || String(e),
      stack: e?.stack || null,
    });
  }
}
