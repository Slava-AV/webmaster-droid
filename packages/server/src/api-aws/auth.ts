import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from "jose";

export interface AdminIdentity {
  sub: string;
  email?: string;
  role?: string;
}

let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  const jwksUrl = process.env.SUPABASE_JWKS_URL;
  if (!jwksUrl) {
    throw new Error("SUPABASE_JWKS_URL is not configured");
  }

  if (!jwksCache) {
    jwksCache = createRemoteJWKSet(new URL(jwksUrl));
  }

  return jwksCache;
}

function buildSupabaseUserEndpoint(): string {
  const explicitBaseUrl = process.env.SUPABASE_URL?.trim();
  if (explicitBaseUrl) {
    return `${explicitBaseUrl.replace(/\/$/, "")}/auth/v1/user`;
  }

  const jwksUrl = process.env.SUPABASE_JWKS_URL?.trim();
  if (!jwksUrl) {
    throw new Error("SUPABASE_JWKS_URL is not configured");
  }

  const parsed = new URL(jwksUrl);
  return `${parsed.origin}/auth/v1/user`;
}

function getSupabaseAnonKey(): string {
  const key =
    process.env.SUPABASE_ANON_KEY?.trim() ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!key) {
    throw new Error("SUPABASE_ANON_KEY is required for HS256 token verification fallback.");
  }

  return key;
}

async function verifyHs256ViaSupabase(token: string): Promise<AdminIdentity> {
  const response = await fetch(buildSupabaseUserEndpoint(), {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
      apikey: getSupabaseAnonKey(),
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase token verification failed: ${response.status} ${detail}`);
  }

  const user = (await response.json()) as {
    id?: string;
    email?: string;
    role?: string;
  };

  const sub = typeof user.id === "string" ? user.id : "";
  if (!sub) {
    throw new Error("Supabase token verification returned no user id.");
  }

  return {
    sub,
    email: typeof user.email === "string" ? user.email : undefined,
    role: typeof user.role === "string" ? user.role : undefined,
  };
}

export function getBearerToken(headers: Record<string, string | undefined>): string | null {
  const value = headers.authorization ?? headers.Authorization;
  if (!value) {
    return null;
  }

  const [prefix, token] = value.split(" ");
  if (prefix?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

export async function verifyAdminToken(token: string): Promise<AdminIdentity> {
  const header = decodeProtectedHeader(token);
  const algorithm = typeof header.alg === "string" ? header.alg : "";

  if (algorithm === "HS256") {
    const secret = process.env.SUPABASE_JWT_SECRET?.trim();
    if (secret) {
      const result = await jwtVerify(token, new TextEncoder().encode(secret), {
        algorithms: ["HS256"],
      });

      const payload = result.payload;
      const identity: AdminIdentity = {
        sub: String(payload.sub ?? ""),
        email: typeof payload.email === "string" ? payload.email : undefined,
        role:
          typeof payload.role === "string"
            ? payload.role
            : typeof payload.user_role === "string"
              ? payload.user_role
              : undefined,
      };

      if (!identity.sub) {
        throw new Error("Invalid token: subject is missing.");
      }

      const enforcedAdminEmail = process.env.ADMIN_EMAIL;
      if (
        enforcedAdminEmail &&
        identity.email?.toLowerCase() !== enforcedAdminEmail.toLowerCase()
      ) {
        throw new Error("Authenticated user is not allowed for admin access.");
      }

      return identity;
    }

    const identity = await verifyHs256ViaSupabase(token);
    const enforcedAdminEmail = process.env.ADMIN_EMAIL;
    if (
      enforcedAdminEmail &&
      identity.email?.toLowerCase() !== enforcedAdminEmail.toLowerCase()
    ) {
      throw new Error("Authenticated user is not allowed for admin access.");
    }

    return identity;
  }

  const result = await jwtVerify(token, getJwks(), {
    algorithms: ["RS256", "ES256"],
  });

  const payload = result.payload;
  const identity: AdminIdentity = {
    sub: String(payload.sub ?? ""),
    email: typeof payload.email === "string" ? payload.email : undefined,
    role:
      typeof payload.role === "string"
        ? payload.role
        : typeof payload.user_role === "string"
          ? payload.user_role
          : undefined,
  };

  if (!identity.sub) {
    throw new Error("Invalid token: subject is missing.");
  }

  const enforcedAdminEmail = process.env.ADMIN_EMAIL;
  if (enforcedAdminEmail && identity.email?.toLowerCase() !== enforcedAdminEmail.toLowerCase()) {
    throw new Error("Authenticated user is not allowed for admin access.");
  }

  return identity;
}
