import {
  createStarterCmsDocument,
  type ModelProviderConfig,
} from "@webmaster-droid/contracts";
import { CmsService } from "@webmaster-droid/core";
import { S3CmsStorage } from "@webmaster-droid/storage-s3";

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

function starterAllowedInternalPaths(): string[] {
  const seed = createStarterCmsDocument();
  const out = new Set<string>(["/"]);

  for (const entry of Object.values(seed.seo)) {
    const normalized = normalizeAllowedPath(entry.path);
    if (normalized) {
      out.add(normalized);
    }
  }

  return Array.from(out);
}

function parseAllowedInternalPathsEnv(fallbackPaths: string[]): string[] {
  const raw = process.env.CMS_ALLOWED_INTERNAL_PATHS;
  if (!raw) {
    return fallbackPaths;
  }

  const normalized = raw
    .split(",")
    .map((item) => normalizeAllowedPath(item))
    .filter((value): value is string => Boolean(value));

  return normalized.length > 0 ? normalized : fallbackPaths;
}

export async function getCmsService(): Promise<CmsService> {
  if (!servicePromise) {
    servicePromise = (async () => {
      const storage = new S3CmsStorage({
        bucket: requireEnv("CMS_S3_BUCKET"),
        region: requireEnv("CMS_S3_REGION"),
        prefix: "cms",
      });

      const service = new CmsService(storage, {
        modelConfig: buildModelConfig(),
        allowedInternalPaths: parseAllowedInternalPathsEnv(starterAllowedInternalPaths()),
        publicAssetBaseUrl: parseOptionalEnv("CMS_PUBLIC_BASE_URL"),
        publicAssetPrefix: parseOptionalEnv("CMS_GENERATED_ASSET_PREFIX"),
      });

      await service.ensureInitialized(createStarterCmsDocument());
      return service;
    })();
  }

  return servicePromise;
}
