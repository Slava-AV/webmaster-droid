import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JWTPayload,
} from "jose";

import { readFirstTrimmedEnv, readTrimmedEnv } from "../runtime-env";

export interface AdminIdentity {
  sub: string;
  email?: string;
  role?: string;
}

let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksCacheUrl: string | null = null;
const SUPABASE_JWKS_PATH = "/auth/v1/.well-known/jwks.json";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeSupabaseBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveSupabaseBaseUrl(): string {
  const value = readFirstTrimmedEnv(["CMS_SUPABASE_URL", "SUPABASE_URL"]);
  if (!value) {
    throw new Error("SUPABASE_URL is not configured. Set SUPABASE_URL or CMS_SUPABASE_URL.");
  }

  return normalizeSupabaseBaseUrl(value);
}

function resolveSupabaseJwksUrl(): string {
  const explicit = readTrimmedEnv("CMS_SUPABASE_JWKS_URL");
  if (explicit) {
    return explicit;
  }

  return `${resolveSupabaseBaseUrl()}${SUPABASE_JWKS_PATH}`;
}

function toAdminIdentity(payload: JWTPayload): AdminIdentity {
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

  return identity;
}

function enforceAdminEmail(identity: AdminIdentity): AdminIdentity {
  const enforcedAdminEmail = readTrimmedEnv("ADMIN_EMAIL");
  if (
    enforcedAdminEmail &&
    identity.email?.toLowerCase() !== enforcedAdminEmail.toLowerCase()
  ) {
    throw new Error("Authenticated user is not allowed for admin access.");
  }

  return identity;
}

function getJwks() {
  const jwksUrl = resolveSupabaseJwksUrl();
  if (!jwksCache || jwksCacheUrl !== jwksUrl) {
    jwksCache = createRemoteJWKSet(new URL(jwksUrl));
    jwksCacheUrl = jwksUrl;
  }

  return jwksCache;
}

function buildSupabaseUserEndpoint(): string {
  return `${resolveSupabaseBaseUrl()}/auth/v1/user`;
}

function getSupabaseAuthKey(): string {
  const key =
    readTrimmedEnv("CMS_SUPABASE_AUTH_KEY") ??
    readTrimmedEnv("SUPABASE_ANON_KEY") ??
    readTrimmedEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!key) {
    throw new Error(
      "Supabase auth fallback requires CMS_SUPABASE_AUTH_KEY, SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return key;
}

async function verifyViaSupabaseUser(
  token: string,
  previousError?: unknown
): Promise<AdminIdentity> {
  const response = await fetch(buildSupabaseUserEndpoint(), {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
      apikey: getSupabaseAuthKey(),
    },
  });

  if (!response.ok) {
    const detail = (await response.text()).trim();
    const suffix = detail ? ` ${detail}` : "";
    if (previousError) {
      throw new Error(
        `Token verification failed with JWKS/local checks (${errorMessage(previousError)}) and /auth/v1/user (${response.status}${suffix}).`
      );
    }

    throw new Error(`Supabase token verification failed: ${response.status}${suffix}`);
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
  let algorithm = "";
  try {
    const header = decodeProtectedHeader(token);
    algorithm = typeof header.alg === "string" ? header.alg : "";
  } catch {
    return enforceAdminEmail(await verifyViaSupabaseUser(token));
  }

  if (algorithm === "HS256") {
    const secret = readTrimmedEnv("CMS_SUPABASE_JWT_SECRET");
    if (secret) {
      try {
        const result = await jwtVerify(token, new TextEncoder().encode(secret), {
          algorithms: ["HS256"],
        });

        return enforceAdminEmail(toAdminIdentity(result.payload));
      } catch (localHs256Error) {
        return enforceAdminEmail(
          await verifyViaSupabaseUser(token, localHs256Error)
        );
      }
    }

    return enforceAdminEmail(await verifyViaSupabaseUser(token));
  }

  if (algorithm === "RS256" || algorithm === "ES256") {
    try {
      const result = await jwtVerify(token, getJwks(), {
        algorithms: ["RS256", "ES256"],
      });

      return enforceAdminEmail(toAdminIdentity(result.payload));
    } catch (jwksError) {
      return enforceAdminEmail(await verifyViaSupabaseUser(token, jwksError));
    }
  }

  return enforceAdminEmail(await verifyViaSupabaseUser(token));
}
