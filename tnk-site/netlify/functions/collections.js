// tnk-site/netlify/functions/collections.js
// Netlify Blobs-backed collection get/set with:
// - CORS
// - Loud, useful errors
// - Manual fallback configuration (siteID + token) if Blobs env isn't auto-configured

import { getStore } from "@netlify/blobs";

export default async (request, context) => {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response("", { status: 204, headers: corsHeaders() });
  }

  try {
    const method = request.method;

    // Try normal auto-configured store first.
    // If Blobs env isn't configured, we fall back to manual config.
    const store = getConfiguredStore();

    if (method === "GET") {
      const url = new URL(request.url);
      const name = url.searchParams.get("name");
      if (!name) return json(400, { ok: false, error: "Missing ?name" });

      const key = `${name}.json`;
      const data = await safeGetJSON(store, key);

      return json(200, { ok: true, data: data ?? null });
    }

    if (method === "PUT") {
      const user = await resolveUser(request, context);
      if (!user) return json(401, { ok: false, error: "Auth required" });

      let body = {};
      try {
        body = await request.json();
      } catch {
        return json(400, { ok: false, error: "Invalid JSON body" });
      }

      const { name, data } = body || {};
      if (!name) return json(400, { ok: false, error: "Missing name" });

      const key = `${name}.json`;

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
    return json(500, {
      ok: false,
      error: "Collections function failed",
      message: err?.message || String(err),
      stack: err?.stack || null,
      hint:
        "If you see MissingBlobsEnvironmentError, set NETLIFY_SITE_ID and NETLIFY_BLOBS_TOKEN env vars in Netlify.",
    });
  }
};

/**
 * Attempt to create a store in auto mode.
 * If the environment isn't configured for Blobs, fall back to manual mode using env vars.
 */
function getConfiguredStore() {
  try {
    // Auto-config mode (works when Netlify Blobs is properly enabled/configured)
    return getStore({ name: "tnk-data" });
  } catch (e) {
    // Manual fallback mode:
    // Netlify requires siteID + token if Blobs env isn't automatically configured.
    const env = globalThis.Netlify?.env || {};
    const siteID =
      env.NETLIFY_SITE_ID ||
      env.SITE_ID ||
      env.SITE_ID_PROD ||
      "";

    // You must set ONE of these yourself in Netlify env vars.
    // Recommended name: NETLIFY_BLOBS_TOKEN (a Netlify personal access token)
    const token =
      env.NETLIFY_BLOBS_TOKEN ||
      env.NETLIFY_AUTH_TOKEN ||
      env.NETLIFY_API_TOKEN ||
      "";

    if (!siteID || !token) {
      // Throw a helpful error that will show in the browser response
      throw new Error(
        [
          "MissingBlobsEnvironmentError: Netlify Blobs is not configured for this site.",
          "Manual configuration required:",
          "Set environment variables in Netlify:",
          "  NETLIFY_SITE_ID = <your site id>",
          "  NETLIFY_BLOBS_TOKEN = <a Netlify personal access token>",
          "",
          "Then redeploy.",
        ].join("\n")
      );
    }

    return getStore({
      name: "tnk-data",
      siteID,
      token,
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
  return new Response(JSON.stringify(obj), {
    status: statusCode,
    headers: corsHeaders(),
  });
}

async function resolveUser(request, context) {
  const ctxUser = context?.clientContext?.user || null;
  if (ctxUser) return ctxUser;

  const auth = request.headers.get("authorization");
  if (!auth) return null;

  try {
    const origin = new URL(request.url).origin;
    const res = await fetch(`${origin}/.netlify/identity/user`, {
      headers: { Authorization: auth },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function safeGetJSON(store, key) {
  try {
    return await store.get(key, { type: "json" });
  } catch (err) {
    const text = await store.get(key, { type: "text" });
    if (text == null) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw err;
    }
  }
}
