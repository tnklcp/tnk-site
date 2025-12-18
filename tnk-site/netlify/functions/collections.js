// tnk-site/netlify/functions/collections.js
import { getStore } from "@netlify/blobs";

/**
 * Netlify Functions v2 style (req, context)
 * - GET is public (read-only)
 * - PUT requires Netlify Identity auth (context.clientContext.user)
 */
export default async (req, context) => {
  const store = getStore("tnk-data");
  const url = new URL(req.url);

  // CORS (basic)
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (req.method === "GET") {
    const name = url.searchParams.get("name");
    if (!name) return json({ ok: false, error: "Missing ?name" }, 400);

    const key = `${name}.json`;
    const data = await store.get(key, { type: "json" });
    return json({ ok: true, data: data ?? null }, 200);
  }

  if (req.method === "PUT") {
    const user = context?.clientContext?.user || null;
    if (!user) return json({ ok: false, error: "Auth required" }, 401);

    const body = await safeJson(req);
    const name = body?.name;
    const data = body?.data;

    if (!name) return json({ ok: false, error: "Missing name" }, 400);

    const key = `${name}.json`;
    await store.setJSON(key, data ?? null, {
      metadata: { updatedAt: new Date().toISOString() }
    });

    return json({ ok: true }, 200);
  }

  return json({ ok: false, error: "Method Not Allowed" }, 405);
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

async function safeJson(req) {
  try {
    const t = await req.text();
    return t ? JSON.parse(t) : {};
  } catch {
    return {};
  }
}
