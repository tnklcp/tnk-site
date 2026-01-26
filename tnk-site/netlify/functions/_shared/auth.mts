import { createRemoteJWKSet, jwtVerify } from "jose";

type AuthConfig = {
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

const getEnv = (key: string): string | undefined => {
  if (typeof Netlify === "undefined" || !Netlify.env) {
    return undefined;
  }
  if (typeof Netlify.env.get === "function") {
    return Netlify.env.get(key);
  }
  return (Netlify.env as Record<string, string | undefined>)[key];
};

const getAuthConfig = (): AuthConfig => ({
  rolesClaim: getEnv("IDENTITY_ROLES_CLAIM") || undefined,
  adminRole: getEnv("IDENTITY_ADMIN_ROLE") || "admin",
  employeeRole: getEnv("IDENTITY_EMPLOYEE_ROLE") || "employee"
});

const getIdentityIssuer = (req: Request): string | null => {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = forwardedHost || req.headers.get("host");
  if (!host) {
    return null;
  }
  const proto = req.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}/.netlify/identity`;
};

const normalizeRoles = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === "string") return [value];
  return [];
};

const getRoles = (payload: Record<string, unknown>, config: AuthConfig): string[] => {
  const appMetadata =
    payload.app_metadata && typeof payload.app_metadata === "object"
      ? (payload.app_metadata as Record<string, unknown>)
      : undefined;
  const configuredClaim = config.rolesClaim
    ? payload[config.rolesClaim] ?? appMetadata?.[config.rolesClaim]
    : undefined;
  const fallbackClaim =
    configuredClaim ??
    payload["https://tnk/roles"] ??
    payload.roles ??
    appMetadata?.roles ??
    payload.app_metadata;
  return normalizeRoles(fallbackClaim);
};

export const verifyAuth = async (req: Request): Promise<AuthResult> => {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    throw new Error("Missing bearer token");
  }

  const config = getAuthConfig();
  const issuer = getIdentityIssuer(req);
  if (!issuer) {
    throw new Error("Identity issuer unavailable");
  }
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  const { payload } = await jwtVerify(token, jwks, { issuer });

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
