import { createRemoteJWKSet, jwtVerify } from "jose";

type AuthConfig = {
  domain: string;
  audience?: string;
  rolesClaim?: string;
  adminRole: string;
  employeeRole: string;
};

type AuthResult = {
  subject: string;
  email?: string;
  name?: string;
  roles: string[];
};

const getAuthConfig = (): AuthConfig => {
  const domain = Netlify.env.AUTH0_DOMAIN;
  if (!domain) {
    throw new Error("AUTH0_DOMAIN is not configured");
  }

  return {
    domain,
    audience: Netlify.env.AUTH0_AUDIENCE || undefined,
    rolesClaim: Netlify.env.AUTH0_ROLES_CLAIM || undefined,
    adminRole: Netlify.env.AUTH0_ADMIN_ROLE || "admin",
    employeeRole: Netlify.env.AUTH0_EMPLOYEE_ROLE || "employee"
  };
};

const normalizeRoles = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === "string") return [value];
  return [];
};

const getRoles = (payload: Record<string, unknown>, config: AuthConfig): string[] => {
  if (config.rolesClaim && payload[config.rolesClaim]) {
    return normalizeRoles(payload[config.rolesClaim]);
  }
  const fallbackClaim = payload["https://tnk/roles"] ?? payload.roles;
  return normalizeRoles(fallbackClaim);
};

export const verifyAuth = async (req: Request): Promise<AuthResult> => {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    throw new Error("Missing bearer token");
  }

  const config = getAuthConfig();
  const issuer = `https://${config.domain}/`;
  const jwks = createRemoteJWKSet(new URL(`${issuer}.well-known/jwks.json`));

  const { payload } = await jwtVerify(token, jwks, {
    issuer,
    audience: config.audience
  });

  return {
    subject: String(payload.sub || ""),
    email: payload.email ? String(payload.email) : undefined,
    name: payload.name ? String(payload.name) : undefined,
    roles: getRoles(payload as Record<string, unknown>, config)
  };
};

export const requireRole = (auth: AuthResult, allowed: string[]): void => {
  if (allowed.length === 0) return;
  const hasRole = auth.roles.some((role) => allowed.includes(role));
  if (!hasRole) {
    throw new Error("Forbidden");
  }
};

export const getRoleConfig = () => {
  const config = getAuthConfig();
  return {
    adminRole: config.adminRole,
    employeeRole: config.employeeRole
  };
};
