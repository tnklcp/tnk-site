// tnk-site/netlify/functions/collections.js
import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  try {
    const store = getStore({ name: "tnk-data" });

    // Auth (Netlify Identity)
    const user = context?.clientContext?.user || null;
    const isAuthed = !!user;

    const url = new URL(req.url);
    const method = req.method?.toUpperCase?.() || "GET";

    if (method === "GET") {
      const name = url.searchParams.get("name");
      if (!name) return json({ ok: false, error: "Missing name" }, 400);

      const key = `${name}.json`;
      const blob = await store.get(key, { type: "json" });
      return json({ ok: true, data: blob ?? null }, 200);
    }

    if (method === "PUT") {
      if (!isAuthed) return json({ ok: false, error: "Auth required" }, 401);

      const bodyText = await req.text();
      const body = bodyText ? safeJSON(bodyText) : {};
      const { name, data } = body || {};
      if (!name) return json({ ok: false, error: "Missing name" }, 400);

      const key = `${name}.json`;
      await store.set(key, JSON.stringify(data ?? null), {
        metadata: { updatedAt: new Date().toISOString() },
      });

      return json({ ok: true }, 200);
    }

    return json({ ok: false, error: "Method Not Allowed" }, 405);
  } catch (e) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      // same-origin fetches are fine, but CORS headers don't hurt
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

function safeJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
