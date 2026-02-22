import {
  createDefaultCmsDocument,
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

function parseAllowedInternalPathsEnv(): string[] {
  const raw = process.env.CMS_ALLOWED_INTERNAL_PATHS;
  if (!raw) {
    return [
      "/",
      "/about/",
      "/portfolio/",
      "/contact/",
      "/privacy-policy/",
      "/legal-notice/",
    ];
  }

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
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
