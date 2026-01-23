import { getStore } from "@netlify/blobs";

function json(status, bodyObj) {
  return new Response(JSON.stringify(bodyObj), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function getRole(user) {
  if (!user) return null;
  const appRoles = Array.isArray(user?.app_metadata?.roles) ? user.app_metadata.roles : [];
  const appRole = typeof user?.app_metadata?.role === "string" ? [user.app_metadata.role] : [];
  const metaRoles = Array.isArray(user?.user_metadata?.roles) ? user.user_metadata.roles : [];
  const metaRole = typeof user?.user_metadata?.role === "string" ? [user.user_metadata.role] : [];
  const roles = [...appRoles, ...appRole, ...metaRoles, ...metaRole]
    .map((r) => String(r || "").toLowerCase())
    .filter(Boolean);
  if (roles.includes("admin")) return "admin";
  if (roles.includes("employee")) return "employee";
  return "customer";
}

async function resolveUser(request, context) {
  const ctxUser = context?.clientContext?.user || null;
  if (ctxUser) return ctxUser;

  const auth = request.headers.get("authorization");
  if (!auth) return null;

  try {
    const origin = new URL(request.url).origin;
    const res = await fetch(`${origin}/.netlify/identity/user`, {
      headers: { Authorization: auth }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function getConfiguredStore() {
  try {
    return getStore({ name: "tnk-data" });
  } catch {
    const env = globalThis.Netlify?.env || process.env || {};
    const siteID = env.NETLIFY_SITE_ID || env.SITE_ID || env.SITE_ID_PROD || "";
    const token = env.NETLIFY_BLOBS_TOKEN || env.NETLIFY_AUTH_TOKEN || env.NETLIFY_API_TOKEN || "";

    if (!siteID || !token) {
      throw new Error("MissingBlobsEnvironmentError: Netlify Blobs is not configured for this site.");
    }

    return getStore({ name: "tnk-data", siteID, token });
  }
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:(.+?);base64,(.+)$/);
  if (!match) return null;
  return { mime: match[1], data: match[2] };
}

function safeName(name) {
  return String(name || "photo")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);
}

export default async (request, context) => {
  try {
    if (request.method !== "POST") return json(405, { ok: false, error: "Method Not Allowed" });

    const user = await resolveUser(request, context);
    const role = getRole(user);
    if (!user || (role !== "admin" && role !== "employee")) {
      return json(401, { ok: false, error: "Unauthorized" });
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      return json(400, { ok: false, error: "Invalid JSON body" });
    }

    const jobId = String(body.jobId || "").trim();
    const name = safeName(body.name || "photo");
    const parsed = parseDataUrl(body.dataUrl);

    if (!jobId) return json(400, { ok: false, error: "Missing jobId" });
    if (!parsed) return json(400, { ok: false, error: "Invalid dataUrl" });

    const key = `job-photos/${jobId}/${Date.now()}-${name}`;
    const buffer = Buffer.from(parsed.data, "base64");

    const store = getConfiguredStore();
    await store.set(key, buffer);

    return json(200, { ok: true, key });
  } catch (err) {
    console.error("[photo_upload] error:", err);
    return json(500, { ok: false, error: "Server error", message: err?.message || String(err) });
  }
};
