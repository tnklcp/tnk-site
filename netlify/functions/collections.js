// tnk-site/netlify/functions/collections.js
import { getStore } from "@netlify/blobs";

/**
 * Generic JSON collection storage using Netlify Blobs
 * - GET  ?name=collection_name
 * - PUT  { name, data }
 * 
 * WRITE requires Netlify Identity
 * READ is public (portals depend on it)
 */

export async function handler(event) {
  const store = getStore({ name: "tnk-data" });
  const method = event.httpMethod;

  // ---------- GET ----------
  if (method === "GET") {
    const name = event.queryStringParameters?.name;
    if (!name) {
      return json(400, { ok: false, error: "Missing ?name" });
    }

    try {
      const key = `${name}.json`;
      const data = await store.get(key, { type: "json" });

      return json(200, {
        ok: true,
        data: data ?? []
      });
    } catch (err) {
      console.error("[collections GET error]", err);
      return json(500, { ok: false, error: "Failed to read collection" });
    }
  }

  // ---------- AUTH REQUIRED ----------
  const user = event.clientContext?.user;
  if (!user) {
    return json(401, { ok: false, error: "Authentication required" });
  }

  // ---------- PUT ----------
  if (method === "PUT") {
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return json(400, { ok: false, error: "Invalid JSON body" });
    }

    const { name, data } = body;
    if (!name) {
      return json(400, { ok: false, error: "Missing collection name" });
    }

    try {
      const key = `${name}.json`;
      await store.set(key, JSON.stringify(data ?? []), {
        metadata: {
          updatedAt: new Date().toISOString(),
          updatedBy: user.email || "unknown"
        }
      });

      return json(200, { ok: true });
    } catch (err) {
      console.error("[collections PUT error]", err);
      return json(500, { ok: false, error: "Failed to write collection" });
    }
  }

  // ---------- METHOD NOT ALLOWED ----------
  return json(405, { ok: false, error: "Method not allowed" });
}

/* ---------------- helpers ---------------- */

function json(status, obj) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    },
    body: JSON.stringify(obj)
  };
}
