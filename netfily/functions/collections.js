// Generic collection get/set using Netlify Blobs
import { getStore } from "@netlify/blobs";

export async function handler(event) {
  const method = event.httpMethod;
  const store = getStore("tnk-data"); // one store for the site

  // Optional: require Identity for write
  const user = event.clientContext && event.clientContext.user;
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
    const body = JSON.parse(event.body || "{}");
    const { name, data } = body || {};
    if (!name) return json(400, { ok: false, error: "Missing name" });
    const key = `${name}.json`;
    await store.set(key, JSON.stringify(data ?? null), { metadata: { updatedAt: new Date().toISOString() } });
    return json(200, { ok: true });
  }

  return json(405, { ok: false, error: "Method Not Allowed" });
}

function json(status, obj) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj)
  };
}
