// tnk-site/netlify/functions/collections.js
import { getStore } from "@netlify/blobs";

const STORE_NAME = "tnk-data";

export async function handler(event) {
  try {
    // CORS / preflight
    if (event.httpMethod === "OPTIONS") {
      return resp(204, null);
    }

    const method = event.httpMethod;

    // IMPORTANT: this dependency must be installed (package.json in tnk-site)
    const store = getStore(STORE_NAME);

    const user = event?.clientContext?.user || null;
    const isAuthed = !!user;

    if (method === "GET") {
      const name = event.queryStringParameters?.name;
      if (!name) return resp(400, { ok: false, error: "Missing ?name" });

      const key = `${name}.json`;

      // If it doesn't exist yet, return null/empty (not an error)
      const data = await store.get(key, { type: "json" });
      return resp(200, { ok: true, data: data ?? null });
    }

    if (method === "PUT") {
      if (!isAuthed) return resp(401, { ok: false, error: "Auth required" });

      const body = safeJSON(event.body);
      const { name, data } = body || {};
      if (!name) return resp(400, { ok: false, error: "Missing name" });

      const key = `${name}.json`;

      // store.set accepts string/buffer; we store JSON string
      await store.set(key, JSON.stringify(data ?? null), {
        metadata: { updatedAt: new Date().toISOString() }
      });

      return resp(200, { ok: true });
    }

    return resp(405, { ok: false, error: "Method Not Allowed" });
  } catch (err) {
    // This prevents opaque 502s and shows the real reason in your browser console/network tab.
    return resp(500, {
      ok: false,
      error: "Collections function failed",
      detail: err?.message || String(err)
    });
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS"
  };
}

function resp(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
    body: obj === null ? "" : JSON.stringify(obj)
  };
}

function safeJSON(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}
