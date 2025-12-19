// tnk-site/netlify/functions/collections.js
// Generic collection get/set using Netlify Blobs (robust + CORS + loud errors)
import { getStore } from "@netlify/blobs";

export async function handler(event, context) {
  // CORS + preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders(),
      body: "",
    };
  }

  try {
    const method = event.httpMethod;

    // IMPORTANT: getStore expects an object in current @netlify/blobs versions
    const store = getStore({ name: "tnk-data" });

    // Netlify Identity user (present if Identity + JWT sent)
    const user = context?.clientContext?.user || event?.clientContext?.user || null;
    const isAuthed = !!user;

    if (method === "GET") {
      const name = event.queryStringParameters?.name;
      if (!name) return json(400, { ok: false, error: "Missing ?name" });

      const key = `${name}.json`;

      // If the key doesn't exist, store.get returns null
      const data = await store.get(key, { type: "json" });
      return json(200, { ok: true, data: data ?? null });
    }

    if (method === "PUT") {
      // Write requires auth
      if (!isAuthed) return json(401, { ok: false, error: "Auth required" });

      let body = {};
      try {
        body = JSON.parse(event.body || "{}");
      } catch {
        return json(400, { ok: false, error: "Invalid JSON body" });
      }

      const { name, data } = body || {};
      if (!name) return json(400, { ok: false, error: "Missing name" });

      const key = `${name}.json`;

      // Store JSON directly (no double-encoding). This avoids json-parse weirdness.
      await store.setJSON(key, data ?? null, {
        metadata: {
          updatedAt: new Date().toISOString(),
          updatedBy: user?.email || "unknown",
        },
      });

      return json(200, { ok: true });
    }

    return json(405, { ok: false, error: "Method Not Allowed" });
  } catch (err) {
    // Fail loudly: surface the message so you can see it in the browser
    return json(500, {
      ok: false,
      error: "Collections function failed",
      message: err?.message || String(err),
      // helpful in Netlify logs too
      stack: err?.stack || null,
    });
  }
}

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(statusCode, obj) {
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify(obj),
  };
}
