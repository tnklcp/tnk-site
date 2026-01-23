function json(statusCode, body) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "Content-Type": "application/json" },
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
  if (roles.includes("customer")) return "customer";
  return null;
}

function getAdminToken() {
  const env = Netlify.env || {};
  return (
    env.NETLIFY_IDENTITY_ADMIN_TOKEN ||
    env.NETLIFY_IDENTITY_TOKEN ||
    env.IDENTITY_ADMIN_TOKEN ||
    ""
  );
}

export default async (request, context) => {
  try {
    if (request.method !== "POST") {
      return json(405, { ok: false, error: "Method Not Allowed" });
    }

    const user = context?.clientContext?.user || null;
    if (!user) return json(401, { ok: false, error: "Unauthorized" });

    const role = getRole(user);
    if (role === "admin" || role === "employee") {
      return json(200, { ok: true, skipped: true, reason: "privileged-role" });
    }

    const adminToken = getAdminToken();
    if (!adminToken) {
      return json(500, {
        ok: false,
        error: "Missing Identity admin token",
        hint: "Set NETLIFY_IDENTITY_ADMIN_TOKEN (preferred) in Netlify environment variables.",
      });
    }

    const userId = user?.id || user?.sub;
    if (!userId) return json(400, { ok: false, error: "Missing user id" });

    const origin = new URL(request.url).origin;
    const existingRoles = Array.isArray(user?.app_metadata?.roles) ? user.app_metadata.roles : [];
    const nextRoles = existingRoles
      .map((r) => String(r || "").toLowerCase())
      .filter(Boolean);

    if (!nextRoles.includes("customer")) nextRoles.push("customer");

    const res = await fetch(`${origin}/.netlify/identity/admin/users/${userId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        app_metadata: {
          roles: nextRoles,
          role: nextRoles.includes("employee") ? "employee" : "customer",
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return json(res.status, {
        ok: false,
        error: "Identity role assignment failed",
        detail: detail || res.statusText,
      });
    }

    return json(200, { ok: true, updated: true });
  } catch (err) {
    return json(500, { ok: false, error: "Server error", message: err?.message || String(err) });
  }
};
