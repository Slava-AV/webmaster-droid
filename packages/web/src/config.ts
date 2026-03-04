import type {
  ResolvedWebmasterDroidConfig,
  WebmasterDroidConfig,
} from "./types";

const DEFAULT_CONFIG: ResolvedWebmasterDroidConfig = {
  apiBaseUrl: "",
  supabaseUrl: "",
  supabaseAnonKey: "",
  modeQueryParam: "mode",
  modeQueryValue: "admin",
  modeStorageKey: "webmaster_droid_admin_mode",
  defaultModelId: "openai:gpt-5.2",
  assistantAvatarUrl: "",
  assistantAvatarFallback: "W",
};

function normalizeOptionalString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function normalizeApiBaseUrl(value: string): string {
  if (!value) {
    return "";
  }

  return value.replace(/\/$/, "");
}

export function resolveWebmasterDroidConfig(
  input?: WebmasterDroidConfig
): ResolvedWebmasterDroidConfig {
  const apiBaseUrl = normalizeApiBaseUrl(
    normalizeOptionalString(input?.apiBaseUrl ?? process.env.NEXT_PUBLIC_AGENT_API_BASE_URL)
  );

  const supabaseUrl = normalizeOptionalString(
    input?.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  );
  const supabaseAnonKey = normalizeOptionalString(
    input?.supabaseAnonKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const modeQueryParam =
    normalizeOptionalString(input?.modeQueryParam) || DEFAULT_CONFIG.modeQueryParam;
  const modeQueryValue =
    normalizeOptionalString(input?.modeQueryValue) || DEFAULT_CONFIG.modeQueryValue;
  const modeStorageKey =
    normalizeOptionalString(input?.modeStorageKey) || DEFAULT_CONFIG.modeStorageKey;
  const defaultModelId =
    normalizeOptionalString(input?.defaultModelId) || DEFAULT_CONFIG.defaultModelId;
  const assistantAvatarUrl =
    normalizeOptionalString(input?.assistantAvatarUrl) || DEFAULT_CONFIG.assistantAvatarUrl;
  const assistantAvatarFallback =
    normalizeOptionalString(input?.assistantAvatarFallback) || DEFAULT_CONFIG.assistantAvatarFallback;

  return {
    apiBaseUrl,
    supabaseUrl,
    supabaseAnonKey,
    modeQueryParam,
    modeQueryValue,
    modeStorageKey,
    defaultModelId,
    assistantAvatarUrl,
    assistantAvatarFallback,
  };
}

export function buildApiUrl(apiBaseUrl: string, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizeApiBaseUrl(apiBaseUrl)}${normalizedPath}`;
}
