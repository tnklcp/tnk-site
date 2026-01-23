import { getStore } from "@netlify/blobs";

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

function contentTypeForKey(key) {
  const lower = String(key || "").toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

export default async (request, context) => {
  try {
    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const user = await resolveUser(request, context);
    const role = getRole(user);
    if (!user || (role !== "admin" && role !== "employee")) {
      return new Response("Unauthorized", { status: 401 });
    }

    const url = new URL(request.url);
    const key = url.searchParams.get("key");
    if (!key || !key.startsWith("job-photos/")) {
      return new Response("Missing or invalid key", { status: 400 });
    }

    const store = getConfiguredStore();
    const data = await store.get(key, { type: "arrayBuffer" });
    if (!data) return new Response("Not Found", { status: 404 });

    return new Response(Buffer.from(data), {
      status: 200,
      headers: { "Content-Type": contentTypeForKey(key) }
    });
  } catch (err) {
    console.error("[photo_get] error:", err);
    return new Response("Server error", { status: 500 });
  }
};
