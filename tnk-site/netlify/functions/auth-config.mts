import type { Config } from "@netlify/functions";

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });

export default async () => {
  try {
    const domain = Netlify.env.AUTH0_DOMAIN;
    const clientId = Netlify.env.AUTH0_CLIENT_ID;
    if (!domain || !clientId) {
      return jsonResponse(
        {
          error: "Auth0 configuration is missing."
        },
        500
      );
    }

    return jsonResponse({
      domain,
      clientId,
      audience: Netlify.env.AUTH0_AUDIENCE || null,
      rolesClaim: Netlify.env.AUTH0_ROLES_CLAIM || null,
      redirectUri: Netlify.env.AUTH0_REDIRECT_URI || null,
      adminRole: Netlify.env.AUTH0_ADMIN_ROLE || "admin",
      employeeRole: Netlify.env.AUTH0_EMPLOYEE_ROLE || "employee"
    });
  } catch (error) {
    return jsonResponse({ error: "Failed to load Auth0 configuration." }, 500);
  }
};

export const config: Config = {
  path: "/api/auth/config"
};
