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

type IdentityUser = {
  id?: string;
  email?: string;
  roles?: unknown;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
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

const normalizeBaseUrl = (value?: string): string | null => {
  if (!value) return null;
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  return trimmed;
};

const toIdentityIssuer = (value: string): string =>
  value.includes("/.netlify/identity") ? value.replace(/\/+$/, "") : `${value}/.netlify/identity`;

const getTokenIssuer = (token: string): string | null => {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    ) as Record<string, unknown>;
    if (typeof payload.iss !== "string") return null;
    const normalized = normalizeBaseUrl(payload.iss);
    return normalized ? toIdentityIssuer(normalized) : null;
  } catch {
    return null;
  }
};

const getIdentityIssuerCandidates = (req: Request): string[] => {
  const candidates: string[] = [];
  const explicit = normalizeBaseUrl(getEnv("IDENTITY_ISSUER"));
  if (explicit) {
    candidates.push(toIdentityIssuer(explicit));
  }

  const envBases = [
    getEnv("URL"),
    getEnv("SITE_URL"),
    getEnv("DEPLOY_PRIME_URL"),
    getEnv("DEPLOY_URL")
  ]
    .map(normalizeBaseUrl)
    .filter((value): value is string => Boolean(value));
  envBases.forEach((base) => candidates.push(toIdentityIssuer(base)));

  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = forwardedHost || req.headers.get("host");
  if (host) {
    const proto = req.headers.get("x-forwarded-proto") || "https";
    candidates.push(toIdentityIssuer(`${proto}://${host}`));
  }

  return Array.from(new Set(candidates));
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

const parseIdentityUser = (user: IdentityUser, config: AuthConfig): AuthResult => {
  const userMetadata = user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
  const nameCandidates = [
    (userMetadata as Record<string, unknown>)["full_name"],
    (userMetadata as Record<string, unknown>)["fullName"],
    (userMetadata as Record<string, unknown>)["name"]
  ].filter((value) => typeof value === "string") as string[];
  const payload = {
    sub: user.id,
    email: user.email,
    name: nameCandidates[0],
    roles: user.roles,
    app_metadata: user.app_metadata,
    user_metadata: user.user_metadata
  } as Record<string, unknown>;
  return {
    subject: String(user.id || ""),
    email: user.email ? String(user.email) : undefined,
    name: nameCandidates[0],
    roles: getRoles(payload, config)
  };
};

const fetchIdentityUser = async (issuer: string, token: string): Promise<IdentityUser> => {
  const response = await fetch(`${issuer}/user`, {
    headers: {
      authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) {
    throw new Error(`Identity user request failed (${response.status})`);
  }
  const data = await response.json().catch(() => ({}));
  return data as IdentityUser;
};

export const verifyAuth = async (req: Request): Promise<AuthResult> => {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    throw new Error("Missing bearer token");
  }

  const config = getAuthConfig();
  const tokenIssuer = getTokenIssuer(token);
  const issuers = Array.from(
    new Set([tokenIssuer, ...getIdentityIssuerCandidates(req)].filter(Boolean))
  ) as string[];
  if (issuers.length === 0) {
    throw new Error("Identity issuer unavailable");
  }

  let lastError: unknown;
  for (const issuer of issuers) {
    try {
      const user = await fetchIdentityUser(issuer, token);
      return parseIdentityUser(user, config);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error("Unauthorized");
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
