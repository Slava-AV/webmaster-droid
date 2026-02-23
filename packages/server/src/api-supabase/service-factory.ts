import {
  createDefaultCmsDocument,
  type ModelProviderConfig,
} from "@webmaster-droid/contracts";

import { CmsService } from "../core";
import { SupabaseCmsStorage } from "../storage-supabase";

const DEFAULT_SUPABASE_BUCKET = "webmaster-droid-cms";
const DEFAULT_STORAGE_PREFIX = "cms";

let servicePromise: Promise<CmsService> | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parseBooleanEnv(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (!raw) {
    return defaultValue;
  }

  return raw.toLowerCase() === "true";
}

function parseOptionalEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (!raw) {
    return undefined;
  }

  const trimmed = raw.trim();
  return trimmed || undefined;
}

function buildModelConfig(): ModelProviderConfig {
  return {
    openaiEnabled: parseBooleanEnv("MODEL_OPENAI_ENABLED", true),
    geminiEnabled: parseBooleanEnv("MODEL_GEMINI_ENABLED", true),
    defaultModelId: process.env.DEFAULT_MODEL_ID ?? "openai:gpt-5.2",
  };
}

function normalizeAllowedPath(path: string): string | null {
  const trimmed = path.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  if (trimmed === "/") {
    return "/";
  }

  const normalized = trimmed.replace(/\/+$/, "");
  if (!normalized) {
    return null;
  }

  return `${normalized}/`;
}

function parseAllowedInternalPathsEnv(): string[] {
  const raw = process.env.CMS_ALLOWED_INTERNAL_PATHS;
  if (!raw) {
    return ["/"];
  }

  const normalized = raw
    .split(",")
    .map((item) => normalizeAllowedPath(item))
    .filter((value): value is string => Boolean(value));

  return normalized.length > 0 ? normalized : ["/"];
}

function resolveStorageBucket(): string {
  return (
    parseOptionalEnv("CMS_SUPABASE_BUCKET") ??
    parseOptionalEnv("SUPABASE_STORAGE_BUCKET") ??
    DEFAULT_SUPABASE_BUCKET
  );
}

function resolveStoragePrefix(): string {
  return parseOptionalEnv("CMS_STORAGE_PREFIX") ?? DEFAULT_STORAGE_PREFIX;
}

function deriveSupabasePublicBaseUrl(bucket: string): string | undefined {
  const explicit = parseOptionalEnv("CMS_PUBLIC_BASE_URL");
  if (explicit) {
    return explicit;
  }

  const supabaseUrl = parseOptionalEnv("SUPABASE_URL");
  if (!supabaseUrl) {
    return undefined;
  }

  const normalized = supabaseUrl.replace(/\/+$/, "");
  return `${normalized}/storage/v1/object/public/${bucket}`;
}

export async function getCmsService(): Promise<CmsService> {
  if (!servicePromise) {
    servicePromise = (async () => {
      const bucket = resolveStorageBucket();
      const storage = new SupabaseCmsStorage({
        supabaseUrl: requireEnv("SUPABASE_URL"),
        serviceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
        bucket,
        prefix: resolveStoragePrefix(),
      });

      const service = new CmsService(storage, {
        modelConfig: buildModelConfig(),
        allowedInternalPaths: parseAllowedInternalPathsEnv(),
        publicAssetBaseUrl: deriveSupabasePublicBaseUrl(bucket),
        publicAssetPrefix: parseOptionalEnv("CMS_GENERATED_ASSET_PREFIX"),
      });

      await service.ensureInitialized(createDefaultCmsDocument());
      return service;
    })();
  }

  return servicePromise;
}
