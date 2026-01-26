import type { Config } from "@netlify/functions";

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });

const getEnv = (key: string): string | undefined => {
  if (typeof Netlify === "undefined" || !Netlify.env) {
    return undefined;
  }
  if (typeof Netlify.env.get === "function") {
    return Netlify.env.get(key);
  }
  return (Netlify.env as Record<string, string | undefined>)[key];
};

export default async () => {
  try {
    return jsonResponse({
      rolesClaim: getEnv("IDENTITY_ROLES_CLAIM") || null,
      adminRole: getEnv("IDENTITY_ADMIN_ROLE") || "admin",
      employeeRole: getEnv("IDENTITY_EMPLOYEE_ROLE") || "employee"
    });
  } catch (error) {
    return jsonResponse({ error: "Failed to load identity configuration." }, 500);
  }
};

export const config: Config = {
  path: "/api/auth/config"
};
