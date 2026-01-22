// tnk-site/netlify/functions/collections.js
// Netlify Blobs-backed collection get/set with:
// - CORS
// - Loud, useful errors
// - Manual fallback configuration (siteID + token) if Blobs env isn't auto-configured

import { getStore } from "@netlify/blobs";

const COLLECTION_RULES = {
  tnk_accounts: { read: ["admin"], write: ["admin"], type: "array" },
  tnk_jobs: {
    read: ["admin", "employee"],
    write: ["admin", "employee"],
    type: "array",
    employeeFilter: (item, email) =>
      !item?.assignee || String(item.assignee || "").toLowerCase() === email,
  },
  tnk_invoices: {
    read: ["admin", "customer"],
    write: ["admin"],
    type: "array",
    customerFilter: (item, email) =>
      String(item?.customer_email || "").toLowerCase() === email,
  },
  tnk_timesheets: {
    read: ["admin", "employee"],
    write: ["admin", "employee"],
    type: "array",
    employeeFilter: (item, email) =>
      String(item?.employee_email || "").toLowerCase() === email,
  },
  tnk_paystubs: {
    read: ["admin", "employee"],
    write: ["admin"],
    type: "array",
    employeeFilter: (item, email) =>
      String(item?.employee || "").toLowerCase() === email,
  },
  tnk_reviews: {
    read: ["admin", "employee"],
    write: ["admin", "employee"],
    type: "array",
    employeeFilter: (item, email) =>
      String(item?.employee || "").toLowerCase() === email,
  },
  tnk_pto: {
    read: ["admin", "employee"],
    write: ["admin", "employee"],
    type: "array",
    employeeFilter: (item, email) =>
      String(item?.employee || "").toLowerCase() === email,
  },
  tnk_emp_comments: {
    read: ["admin", "employee"],
    write: ["admin", "employee"],
    type: "array",
    employeeFilter: (item, email) =>
      String(item?.employee || "").toLowerCase() === email,
  },
  tnk_services: { read: ["admin"], write: ["admin"], type: "array" },
  tnk_promos: { read: ["admin"], write: ["admin"], type: "array" },
  tnk_prices: { read: ["admin"], write: ["admin"], type: "array" },
  tnk_availability: { read: ["admin", "customer"], write: ["admin"], type: "array" },
  tnk_cust_prefs: { read: ["admin", "customer"], write: ["admin", "customer"], type: "map" },
  tnk_cust_extras: { read: ["admin", "customer"], write: ["admin", "customer"], type: "map" },
  tnk_cust_specials: { read: ["admin", "customer"], write: ["admin", "customer"], type: "map" },
  tnk_cust_comments: { read: ["admin", "customer"], write: ["admin", "customer"], type: "map" },
  tnk_cust_history: { read: ["admin", "customer"], write: ["admin"], type: "map" },
  tnk_cust_balances: { read: ["admin", "customer"], write: ["admin"], type: "map" },
};

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

      const rule = COLLECTION_RULES[name];
      if (!rule) return json(400, { ok: false, error: "Unknown collection" });

      const user = await resolveUser(request, context);
      const role = getRole(user);
      if (!user || !role) return json(401, { ok: false, error: "Auth required" });
      if (!rule.read.includes(role)) return json(403, { ok: false, error: "Forbidden" });

      const key = `${name}.json`;
      const data = await safeGetJSON(store, key);
      const scoped = scopeRead(rule, data, role, user?.email);

      return json(200, { ok: true, data: scoped ?? null });
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

      const rule = COLLECTION_RULES[name];
      if (!rule) return json(400, { ok: false, error: "Unknown collection" });

      const role = getRole(user);
      if (!role) return json(401, { ok: false, error: "Auth required" });
      if (!rule.write.includes(role)) return json(403, { ok: false, error: "Forbidden" });

      const key = `${name}.json`;
      const existing = await safeGetJSON(store, key);
      const next = await scopeWrite(rule, existing, data, role, user?.email);

      await store.setJSON(key, next ?? null, {
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

function scopeRead(rule, data, role, email) {
  if (role === "admin") return data;

  if (rule.type === "map") {
    const map = data && typeof data === "object" ? data : {};
    const key = String(email || "").toLowerCase();
    return key ? { [key]: map[key] ?? null } : {};
  }

  if (!Array.isArray(data)) return [];

  if (role === "employee" && typeof rule.employeeFilter === "function") {
    return data.filter((item) => rule.employeeFilter(item, String(email || "").toLowerCase()));
  }

  if (role === "customer" && typeof rule.customerFilter === "function") {
    return data.filter((item) => rule.customerFilter(item, String(email || "").toLowerCase()));
  }

  return data;
}

async function scopeWrite(rule, existing, incoming, role, email) {
  if (role === "admin") return incoming ?? null;

  if (rule.type === "map") {
    const current = existing && typeof existing === "object" ? existing : {};
    const key = String(email || "").toLowerCase();
    if (!key) return current;
    let value = null;
    if (incoming && typeof incoming === "object" && key in incoming) {
      value = incoming[key];
    } else {
      value = incoming;
    }
    return { ...current, [key]: value };
  }

  const current = Array.isArray(existing) ? existing : [];
  const next = Array.isArray(incoming) ? incoming : [];
  const actor = String(email || "").toLowerCase();

  if (role === "employee" && typeof rule.employeeFilter === "function") {
    return mergeAllowed(current, next, (item) => rule.employeeFilter(item, actor));
  }

  if (role === "customer" && typeof rule.customerFilter === "function") {
    return mergeAllowed(current, next, (item) => rule.customerFilter(item, actor));
  }

  return current;
}

function mergeAllowed(existing, incoming, allowFn) {
  const byId = new Map(
    (Array.isArray(existing) ? existing : [])
      .filter((item) => item && item.id)
      .map((item) => [item.id, item])
  );

  for (const item of Array.isArray(incoming) ? incoming : []) {
    if (!item || !item.id) continue;
    if (!allowFn(item)) continue;
    byId.set(item.id, item);
  }

  return Array.from(byId.values());
}
