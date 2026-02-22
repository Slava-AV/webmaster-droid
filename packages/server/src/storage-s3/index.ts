import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type {
  AuditEvent,
  CheckpointMeta,
  CmsDocument,
  CmsStage,
  PublishedVersionMeta,
  RollbackRequest,
} from "@webmaster-droid/contracts";
import { normalizeCmsDocument } from "@webmaster-droid/contracts";
import type { StorageAdapter } from "../core";

interface S3CmsStorageOptions {
  bucket: string;
  region: string;
  prefix?: string;
  client?: S3Client;
}

interface CheckpointEnvelope {
  checkpoint: CheckpointMeta;
  content: CmsDocument;
}

function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function monthKey(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

function keySafeTimestamp(date = new Date()): string {
  return `${date.getTime()}`;
}

async function bodyToString(body: unknown): Promise<string> {
  if (!body) {
    return "";
  }

  if (typeof body === "string") {
    return body;
  }

  if (
    typeof body === "object" &&
    body !== null &&
    "transformToString" in body &&
    typeof (body as { transformToString: () => Promise<string> }).transformToString ===
      "function"
  ) {
    return (body as { transformToString: () => Promise<string> }).transformToString();
  }

  return "";
}

function parseIdFromKey(key: string): string {
  const filename = key.split("/").pop() ?? key;
  const parts = filename.split("__");
  if (parts.length !== 2) {
    return filename.replace(/\.json$/, "");
  }

  return parts[1].replace(/\.json$/, "");
}

function parseTimestampFromKey(key: string): string {
  const filename = key.split("/").pop() ?? key;
  const parts = filename.split("__");
  if (parts.length !== 2) {
    return new Date(0).toISOString();
  }

  const encoded = Number(parts[0]);
  const parsed = new Date(encoded);

  if (Number.isNaN(parsed.getTime())) {
    return new Date(0).toISOString();
  }

  return parsed.toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCheckpointEnvelope(value: unknown): CheckpointEnvelope | null {
  if (!isRecord(value)) {
    return null;
  }

  const checkpoint = value.checkpoint;
  const content = value.content;
  if (!isRecord(checkpoint) || !isRecord(content)) {
    return null;
  }

  const id = typeof checkpoint.id === "string" ? checkpoint.id : "";
  const createdAt = typeof checkpoint.createdAt === "string" ? checkpoint.createdAt : "";
  const reason = typeof checkpoint.reason === "string" ? checkpoint.reason : "";
  const createdBy =
    typeof checkpoint.createdBy === "string" ? checkpoint.createdBy : undefined;

  if (!id || !createdAt || !reason) {
    return null;
  }

  return {
    checkpoint: {
      id,
      createdAt,
      createdBy,
      reason,
    },
    content: content as unknown as CmsDocument,
  };
}

function mergeLegacyValue(target: unknown, incoming: unknown): unknown {
  if (!isRecord(target) || !isRecord(incoming)) {
    return incoming;
  }

  for (const [key, value] of Object.entries(incoming)) {
    if (target[key] === undefined) {
      target[key] = value;
      continue;
    }

    target[key] = mergeLegacyValue(target[key], value);
  }

  return target;
}

function normalizeLegacyIndexedKeys(root: unknown): boolean {
  let changed = false;

  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }

    if (!isRecord(node)) {
      return;
    }

    const record = node;
    const keys = Object.keys(record);

    for (const key of keys) {
      const match = /^([^\[\]]+)\[(\d+)\]$/.exec(key);
      if (!match) {
        continue;
      }

      const baseKey = match[1];
      const index = Number(match[2]);
      if (Number.isNaN(index)) {
        continue;
      }

      const baseValue = record[baseKey];
      if (baseValue !== undefined && !Array.isArray(baseValue)) {
        continue;
      }

      const targetArray = (record[baseKey] as unknown[] | undefined) ?? [];
      record[baseKey] = targetArray;

      const legacyValue = record[key];
      const existing = targetArray[index];
      if (existing === undefined) {
        targetArray[index] = legacyValue;
      } else {
        targetArray[index] = mergeLegacyValue(existing, legacyValue);
      }

      delete record[key];
      changed = true;
    }

    for (const value of Object.values(record)) {
      visit(value);
    }
  };

  visit(root);
  return changed;
}

export class S3CmsStorage implements StorageAdapter {
  private readonly bucket: string;
  private readonly client: S3Client;
  private readonly prefix: string;

  constructor(options: S3CmsStorageOptions) {
    this.bucket = options.bucket;
    this.prefix = options.prefix?.replace(/\/$/, "") ?? "cms";
    this.client =
      options.client ??
      new S3Client({
        region: options.region,
      });
  }

  async ensureInitialized(seed: CmsDocument): Promise<void> {
    const [live, draft] = await Promise.all([
      this.tryGetStage("live"),
      this.tryGetStage("draft"),
    ]);

    if (!live) {
      await this.saveStage("live", seed);
    }

    if (!draft) {
      await this.saveStage("draft", seed);
    }
  }

  async getContent(stage: CmsStage): Promise<CmsDocument> {
    const key = this.stageKey(stage);
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );

    const text = await bodyToString(response.Body);
    const parsed = JSON.parse(text) as CmsDocument;
    normalizeLegacyIndexedKeys(parsed);
    return normalizeCmsDocument(parsed);
  }

  async saveDraft(content: CmsDocument): Promise<void> {
    await this.saveStage("draft", content);
  }

  async saveLive(content: CmsDocument): Promise<void> {
    await this.saveStage("live", content);
  }

  async putPublicAsset(input: {
    key: string;
    body: Uint8Array;
    contentType: string;
    cacheControl?: string;
  }): Promise<void> {
    const key = input.key.replace(/^\/+/, "");
    if (!key) {
      throw new Error("Public asset key is required.");
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: input.body,
        ContentType: input.contentType,
        CacheControl: input.cacheControl,
      })
    );
  }

  async createCheckpoint(
    content: CmsDocument,
    input: { createdBy?: string; reason: string }
  ): Promise<CheckpointMeta> {
    const createdAt = nowIso();
    const id = createId("cp");
    const key = `${this.prefix}/checkpoints/${keySafeTimestamp()}__${id}.json`;

    const checkpointMeta: CheckpointMeta = {
      id,
      createdAt,
      createdBy: input.createdBy,
      reason: input.reason,
    };

    const payload: CheckpointEnvelope = {
      checkpoint: checkpointMeta,
      content: {
        ...content,
        meta: {
          ...content.meta,
          updatedAt: createdAt,
          updatedBy: input.createdBy,
          sourceCheckpointId: id,
        },
      },
    };

    await this.putJson(key, payload);

    return checkpointMeta;
  }

  async deleteCheckpoint(id: string): Promise<boolean> {
    const targetId = id.trim();
    if (!targetId) {
      return false;
    }

    const keys = await this.listKeys(`${this.prefix}/checkpoints/`);
    const key = keys.find((candidate) => parseIdFromKey(candidate) === targetId);
    if (!key) {
      return false;
    }

    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );

    return true;
  }

  async listCheckpoints(): Promise<CheckpointMeta[]> {
    const keys = await this.listKeys(`${this.prefix}/checkpoints/`);

    const items = await Promise.all(
      keys.map(async (key) => {
        const fallback: CheckpointMeta = {
          id: parseIdFromKey(key),
          createdAt: parseTimestampFromKey(key),
          reason: "auto-checkpoint",
        };

        try {
          const text = await this.getText(key);
          const parsed = JSON.parse(text) as unknown;
          const envelope = parseCheckpointEnvelope(parsed);
          if (!envelope) {
            return fallback;
          }

          return {
            id: envelope.checkpoint.id || fallback.id,
            createdAt: envelope.checkpoint.createdAt || fallback.createdAt,
            createdBy: envelope.checkpoint.createdBy,
            reason: envelope.checkpoint.reason || fallback.reason,
          };
        } catch {
          return fallback;
        }
      })
    );

    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async publishDraft(input: {
    content: CmsDocument;
    createdBy?: string;
  }): Promise<PublishedVersionMeta> {
    const createdAt = nowIso();
    const id = createId("pub");
    const key = `${this.prefix}/published/${keySafeTimestamp()}__${id}.json`;

    const payload: CmsDocument = {
      ...input.content,
      meta: {
        ...input.content.meta,
        updatedAt: createdAt,
        updatedBy: input.createdBy,
        contentVersion: id,
      },
    };

    await this.putJson(key, payload);

    return {
      id,
      createdAt,
      createdBy: input.createdBy,
      sourceContentVersion: input.content.meta.contentVersion,
    };
  }

  async listPublishedVersions(): Promise<PublishedVersionMeta[]> {
    const keys = await this.listKeys(`${this.prefix}/published/`);

    const items = keys.map((key) => {
      const id = parseIdFromKey(key);
      const createdAt = parseTimestampFromKey(key);

      return {
        id,
        createdAt,
        sourceContentVersion: id,
      };
    });

    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getSnapshot(input: RollbackRequest): Promise<CmsDocument | null> {
    const folder =
      input.sourceType === "checkpoint"
        ? `${this.prefix}/checkpoints/`
        : `${this.prefix}/published/`;

    const keys = await this.listKeys(folder);
    const key = keys.find((candidate) => parseIdFromKey(candidate) === input.sourceId);

    if (!key) {
      return null;
    }

    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );

    const text = await bodyToString(response.Body);
    const parsed = JSON.parse(text) as unknown;
    const envelope = parseCheckpointEnvelope(parsed);
    const content = envelope ? envelope.content : (parsed as CmsDocument);
    normalizeLegacyIndexedKeys(content);
    return normalizeCmsDocument(content);
  }

  async appendEvent(event: AuditEvent): Promise<void> {
    const key = `${this.prefix}/events/${monthKey()}.jsonl`;
    const existing = await this.tryGetText(key);
    const line = `${JSON.stringify(event)}\n`;
    const body = `${existing ?? ""}${line}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: "application/x-ndjson",
      })
    );
  }

  private async tryGetStage(stage: CmsStage): Promise<CmsDocument | null> {
    try {
      return await this.getContent(stage);
    } catch (error) {
      if (this.isMissingKey(error)) {
        return null;
      }

      throw error;
    }
  }

  private async saveStage(stage: CmsStage, content: CmsDocument): Promise<void> {
    await this.putJson(this.stageKey(stage), content);
  }

  private stageKey(stage: CmsStage): string {
    return `${this.prefix}/${stage}/current.json`;
  }

  private async putJson(key: string, value: unknown): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: JSON.stringify(value, null, 2),
        ContentType: "application/json",
      })
    );
  }

  private async listKeys(prefix: string): Promise<string[]> {
    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
      })
    );

    const keys = (response.Contents ?? [])
      .map((item) => item.Key)
      .filter((key): key is string => Boolean(key));

    return keys;
  }

  private async tryGetText(key: string): Promise<string | null> {
    try {
      return await this.getText(key);
    } catch (error) {
      if (this.isMissingKey(error)) {
        return null;
      }

      throw error;
    }
  }

  private async getText(key: string): Promise<string> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );

    return bodyToString(response.Body);
  }

  private isMissingKey(error: unknown): boolean {
    if (
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name?: string }).name === "NoSuchKey"
    ) {
      return true;
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "$metadata" in error &&
      typeof (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode === "number"
    ) {
      return (
        (error as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode === 404
      );
    }

    return false;
  }
}
