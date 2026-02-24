import {
  createDefaultCmsDocument,
  type ModelProviderConfig,
} from "@webmaster-droid/contracts";
import { CmsService } from "../core";
import { readTrimmedEnv } from "../runtime-env";
import { S3CmsStorage } from "../storage-s3";

let servicePromise: Promise<CmsService> | null = null;

function requireEnv(name: string): string {
  const value = readTrimmedEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parseBooleanEnv(name: string, defaultValue: boolean): boolean {
  const raw = readTrimmedEnv(name);
  if (!raw) {
    return defaultValue;
  }

  return raw.toLowerCase() === "true";
}

function parseOptionalEnv(name: string): string | undefined {
  return readTrimmedEnv(name);
}

function buildModelConfig(): ModelProviderConfig {
  return {
    openaiEnabled: parseBooleanEnv("MODEL_OPENAI_ENABLED", true),
    geminiEnabled: parseBooleanEnv("MODEL_GEMINI_ENABLED", true),
    defaultModelId: parseOptionalEnv("DEFAULT_MODEL_ID") ?? "openai:gpt-5.2",
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
  const raw = parseOptionalEnv("CMS_ALLOWED_INTERNAL_PATHS");
  if (!raw) {
    return ["/"];
  }

  const normalized = raw
    .split(",")
    .map((item) => normalizeAllowedPath(item))
    .filter((value): value is string => Boolean(value));

  return normalized.length > 0 ? normalized : ["/"];
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
        allowedInternalPaths: parseAllowedInternalPathsEnv(),
        publicAssetBaseUrl: parseOptionalEnv("CMS_PUBLIC_BASE_URL"),
        publicAssetPrefix: parseOptionalEnv("CMS_GENERATED_ASSET_PREFIX"),
      });

      await service.ensureInitialized(createDefaultCmsDocument());
      return service;
    })();
  }

  return servicePromise;
}
