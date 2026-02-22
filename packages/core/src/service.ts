import {
  REQUIRED_PUBLISH_CONFIRMATION,
  type AuditEvent,
  type CmsDocument,
  type CmsPatch,
  isEditablePath,
  type ModelProviderConfig,
  type PatchOperation,
  type PublishRequest,
  type RollbackRequest,
  type ThemeTokenPatch,
} from "@webmaster-droid/contracts";

import { applyPatch, applyThemeTokenPatch } from "./patch";
import type {
  AgentBatchMutationInput,
  CmsMutationInput,
  CmsServiceConfig,
  MutationResult,
  StorageAdapter,
  ThemeMutationInput,
  ThemeMutationResult,
} from "./types";

const DEFAULT_MAX_OPERATIONS = 25;
const DEFAULT_ALLOWED_INTERNAL_PATHS = [
  "/",
  "/about/",
  "/portfolio/",
  "/contact/",
  "/privacy-policy/",
  "/legal-notice/",
];
const DEFAULT_PUBLIC_ASSET_BASE_URL = "https://kompernass.in";
const DEFAULT_PUBLIC_ASSET_PREFIX = "assets/generated";
const DEFAULT_GENERATED_IMAGE_CACHE_CONTROL = "public,max-age=31536000,immutable";

function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeInternalPath(path: string): string | null {
  const trimmed = path.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  const [withoutQuery] = trimmed.split(/[?#]/, 1);
  if (!withoutQuery) {
    return null;
  }

  if (withoutQuery === "/") {
    return "/";
  }

  const normalized = withoutQuery.replace(/\/+$/, "");
  if (!normalized) {
    return null;
  }

  return `${normalized}/`;
}

function normalizeAllowedInternalPaths(paths: string[]): string[] {
  const out = new Set<string>();

  for (const path of paths) {
    const normalized = normalizeInternalPath(path);
    if (normalized) {
      out.add(normalized);
    }
  }

  return Array.from(out);
}

function comparableContentSnapshot(document: CmsDocument): string {
  return JSON.stringify({
    themeTokens: document.themeTokens,
    layout: document.layout,
    pages: document.pages,
    seo: document.seo,
  });
}

function normalizePublicAssetBaseUrl(value?: string): string {
  const raw = value?.trim();
  if (!raw) {
    return DEFAULT_PUBLIC_ASSET_BASE_URL;
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") {
      return DEFAULT_PUBLIC_ASSET_BASE_URL;
    }

    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return DEFAULT_PUBLIC_ASSET_BASE_URL;
  }
}

function normalizePublicAssetPrefix(value?: string): string {
  const normalized = (value ?? DEFAULT_PUBLIC_ASSET_PREFIX)
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");

  return normalized || DEFAULT_PUBLIC_ASSET_PREFIX;
}

function sanitizeTargetPathForKey(value: string): string {
  const normalized = value
    .replace(/\[(\d+)\]/g, "-$1-")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .toLowerCase();

  return normalized.slice(0, 80) || "image";
}

function extensionFromMimeType(contentType: string): string {
  const normalized = contentType.trim().toLowerCase().split(";", 1)[0];
  if (normalized === "image/jpeg") {
    return "jpg";
  }

  if (normalized === "image/png") {
    return "png";
  }

  if (normalized === "image/webp") {
    return "webp";
  }

  if (normalized === "image/gif") {
    return "gif";
  }

  return "png";
}

function buildGeneratedAssetKey(
  targetPath: string,
  publicAssetPrefix: string,
  contentType: string,
  now = new Date()
): string {
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const timestamp = now.getTime();
  const random = Math.random().toString(36).slice(2, 10);
  const safePath = sanitizeTargetPathForKey(targetPath);
  const ext = extensionFromMimeType(contentType);

  return `${publicAssetPrefix}/${year}/${month}/${day}/${safePath}-${timestamp}-${random}.${ext}`;
}

export class CmsService {
  private readonly storage: StorageAdapter;
  private readonly modelConfig: ModelProviderConfig;
  private readonly maxOperationsPerPatch: number;
  private readonly allowedInternalPaths: string[];
  private readonly publicAssetBaseUrl: string;
  private readonly publicAssetPrefix: string;

  constructor(storage: StorageAdapter, config: CmsServiceConfig) {
    this.storage = storage;
    this.modelConfig = config.modelConfig;
    this.maxOperationsPerPatch =
      config.maxOperationsPerPatch ?? DEFAULT_MAX_OPERATIONS;
    this.allowedInternalPaths = normalizeAllowedInternalPaths(
      config.allowedInternalPaths ?? DEFAULT_ALLOWED_INTERNAL_PATHS
    );
    this.publicAssetBaseUrl = normalizePublicAssetBaseUrl(config.publicAssetBaseUrl);
    this.publicAssetPrefix = normalizePublicAssetPrefix(config.publicAssetPrefix);
  }

  async ensureInitialized(seed: CmsDocument): Promise<void> {
    await this.storage.ensureInitialized(seed);
  }

  async getContent(stage: "live" | "draft"): Promise<CmsDocument> {
    return this.storage.getContent(stage);
  }

  getModelConfig(): ModelProviderConfig {
    return this.modelConfig;
  }

  getPublicAssetBaseUrl(): string {
    return this.publicAssetBaseUrl;
  }

  async saveGeneratedImage(input: {
    targetPath: string;
    data: Uint8Array;
    contentType: string;
    cacheControl?: string;
  }): Promise<{ key: string; url: string }> {
    const targetPath = input.targetPath.trim();
    if (!targetPath) {
      throw new Error("Generated image target path is required.");
    }

    if (!(input.data instanceof Uint8Array) || input.data.length === 0) {
      throw new Error("Generated image bytes are required.");
    }

    const contentType = input.contentType.trim().toLowerCase().split(";", 1)[0];
    if (!contentType.startsWith("image/")) {
      throw new Error(`Generated content type is not an image: ${input.contentType}`);
    }

    const key = buildGeneratedAssetKey(targetPath, this.publicAssetPrefix, contentType);

    await this.storage.putPublicAsset({
      key,
      body: input.data,
      contentType,
      cacheControl: input.cacheControl ?? DEFAULT_GENERATED_IMAGE_CACHE_CONTROL,
    });

    return {
      key,
      url: `${this.publicAssetBaseUrl}/${key}`,
    };
  }

  async mutateDraft(input: CmsMutationInput): Promise<MutationResult> {
    const currentDraft = await this.storage.getContent("draft");

    const checkpoint = await this.storage.createCheckpoint(currentDraft, {
      createdBy: input.actor,
      reason: input.reason,
    });

    const { document, warnings } = applyPatch(currentDraft, input.patch, {
      maxOperationsPerPatch: this.maxOperationsPerPatch,
      allowedInternalPaths: this.allowedInternalPaths,
    });

    document.meta.updatedAt = nowIso();
    document.meta.updatedBy = input.actor;
    document.meta.contentVersion = createId("draft");
    document.meta.sourceCheckpointId = checkpoint.id;

    await this.storage.saveDraft(document);

    await this.storage.appendEvent(this.createEvent("chat_mutation", input.actor, {
      checkpointId: checkpoint.id,
      reason: input.reason,
      operations: input.patch.operations,
      warnings,
    }));

    return {
      document,
      checkpoint,
      warnings,
    };
  }

  async mutateDraftBatch(input: AgentBatchMutationInput): Promise<MutationResult> {
    const hasContentPatch = Boolean(input.patch && input.patch.operations.length > 0);
    const hasThemePatch = Boolean(input.themePatch && Object.keys(input.themePatch).length > 0);

    if (!hasContentPatch && !hasThemePatch) {
      throw new Error("No draft mutations provided.");
    }

    const currentDraft = await this.storage.getContent("draft");

    const checkpoint = await this.storage.createCheckpoint(currentDraft, {
      createdBy: input.actor,
      reason: input.reason,
    });

    let workingDocument = currentDraft;
    const warnings: string[] = [];

    if (hasContentPatch) {
      const contentResult = applyPatch(workingDocument, input.patch as CmsPatch, {
        maxOperationsPerPatch: this.maxOperationsPerPatch,
        allowedInternalPaths: this.allowedInternalPaths,
      });
      workingDocument = contentResult.document;
      warnings.push(...contentResult.warnings);
    }

    if (hasThemePatch) {
      const themeResult = applyThemeTokenPatch(
        workingDocument,
        input.themePatch as ThemeTokenPatch
      );
      workingDocument = themeResult.document;
      warnings.push(...themeResult.warnings);
    }

    const document: CmsDocument = {
      ...workingDocument,
      meta: {
        ...workingDocument.meta,
        updatedAt: nowIso(),
        updatedBy: input.actor,
        contentVersion: createId("draft"),
        sourceCheckpointId: checkpoint.id,
      },
    };

    await this.storage.saveDraft(document);

    await this.storage.appendEvent(
      this.createEvent("chat_mutation", input.actor, {
        checkpointId: checkpoint.id,
        reason: input.reason,
        operations: input.patch?.operations,
        themePatch: input.themePatch,
        warnings,
      })
    );

    return {
      document,
      checkpoint,
      warnings,
    };
  }

  async mutateThemeTokens(input: ThemeMutationInput): Promise<ThemeMutationResult> {
    const currentDraft = await this.storage.getContent("draft");

    const checkpoint = await this.storage.createCheckpoint(currentDraft, {
      createdBy: input.actor,
      reason: input.reason,
    });

    const { document, warnings } = applyThemeTokenPatch(currentDraft, input.patch);

    document.meta.updatedAt = nowIso();
    document.meta.updatedBy = input.actor;
    document.meta.contentVersion = createId("draft");
    document.meta.sourceCheckpointId = checkpoint.id;

    await this.storage.saveDraft(document);

    await this.storage.appendEvent(this.createEvent("chat_mutation", input.actor, {
      checkpointId: checkpoint.id,
      reason: input.reason,
      themePatch: input.patch,
      warnings,
    }));

    return {
      document,
      checkpoint,
      warnings,
    };
  }

  async publishDraft(input: PublishRequest, actor?: string) {
    if (input.confirmationText !== REQUIRED_PUBLISH_CONFIRMATION) {
      throw new Error(
        `Invalid publish confirmation text. Use exactly: ${REQUIRED_PUBLISH_CONFIRMATION}`
      );
    }

    const currentDraft = await this.storage.getContent("draft");

    const version = await this.storage.publishDraft({
      content: currentDraft,
      createdBy: actor,
    });

    const publishedLive = {
      ...currentDraft,
      meta: {
        ...currentDraft.meta,
        updatedAt: nowIso(),
        updatedBy: actor,
        contentVersion: version.id,
      },
    };

    await this.storage.saveLive(publishedLive);
    await this.storage.saveDraft(publishedLive);

    await this.storage.appendEvent(this.createEvent("publish", actor, {
      version,
    }));

    return version;
  }

  async rollbackDraft(input: RollbackRequest, actor?: string) {
    const currentDraft = await this.storage.getContent("draft");

    const targetSnapshot = await this.storage.getSnapshot(input);
    if (!targetSnapshot) {
      throw new Error(`Rollback source not found: ${input.sourceType}/${input.sourceId}`);
    }

    const currentComparable = comparableContentSnapshot(currentDraft);
    const targetComparable = comparableContentSnapshot(targetSnapshot);
    if (currentComparable === targetComparable) {
      await this.storage.appendEvent(this.createEvent("rollback", actor, {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        newDraftVersion: currentDraft.meta.contentVersion,
        skipped: true,
        reason: "already-at-target",
      }));

      return currentDraft;
    }

    const newDraft: CmsDocument = {
      ...targetSnapshot,
      meta: {
        ...targetSnapshot.meta,
        updatedAt: nowIso(),
        updatedBy: actor,
        contentVersion: createId("draft"),
        sourceCheckpointId: `${input.sourceType}:${input.sourceId}`,
      },
    };

    await this.storage.saveDraft(newDraft);

    await this.storage.appendEvent(this.createEvent("rollback", actor, {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      newDraftVersion: newDraft.meta.contentVersion,
    }));

    return newDraft;
  }

  async listHistory() {
    const [checkpoints, published] = await Promise.all([
      this.storage.listCheckpoints(),
      this.storage.listPublishedVersions(),
    ]);

    return {
      checkpoints,
      published,
    };
  }

  async deleteCheckpoint(checkpointId: string): Promise<void> {
    const normalizedId = checkpointId.trim();
    if (!normalizedId) {
      throw new Error("Checkpoint id is required.");
    }

    const deleted = await this.storage.deleteCheckpoint(normalizedId);
    if (!deleted) {
      throw new Error(`Checkpoint not found: ${normalizedId}`);
    }
  }

  private createEvent(
    type: AuditEvent["type"],
    actor: string | undefined,
    detail: AuditEvent["detail"]
  ): AuditEvent {
    return {
      id: createId("evt"),
      type,
      actor,
      createdAt: nowIso(),
      detail,
    };
  }
}

export function createPatchFromAgentOperations(
  operations: Array<{ path: string; value: unknown }>
): CmsPatch {
  const patchOperations: PatchOperation[] = [];

  for (const operation of operations) {
    if (!isEditablePath(operation.path)) {
      throw new Error(`Path is out of editable scope: ${operation.path}`);
    }

    patchOperations.push({
      op: "set",
      path: operation.path,
      value: operation.value,
    });
  }

  return {
    operations: patchOperations,
  };
}

export function createThemePatchFromAgentOperations(
  operations: Array<{ token: keyof ThemeTokenPatch; value: string }>
): ThemeTokenPatch {
  const out: ThemeTokenPatch = {};

  for (const operation of operations) {
    out[operation.token] = operation.value;
  }

  return out;
}
