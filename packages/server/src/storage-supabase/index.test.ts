import assert from "node:assert/strict";
import test from "node:test";

import { createDefaultCmsDocument, type AuditEvent } from "@webmaster-droid/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SupabaseCmsStorage } from "./index";

type UploadCall = {
  key: string;
  body: string;
  contentType?: string;
};

function createMockClient(input: {
  onDownload: (key: string) => Promise<{ data: { text: () => Promise<string> } | null; error: unknown }>;
  onUpload: (call: UploadCall) => Promise<{ error: unknown }>;
}): SupabaseClient {
  return {
    storage: {
      from: () => ({
        download: (key: string) => input.onDownload(key),
        upload: (key: string, body: string, opts?: { contentType?: string }) =>
          input.onUpload({
            key,
            body,
            contentType: opts?.contentType,
          }),
      }),
    },
  } as unknown as SupabaseClient;
}

test("appendEvent creates log file body when monthly object is missing", async () => {
  const uploads: UploadCall[] = [];
  const client = createMockClient({
    onDownload: async () => ({
      data: null,
      error: {
        statusCode: "404",
        message: "Object not found",
      },
    }),
    onUpload: async (call) => {
      uploads.push(call);
      return { error: null };
    },
  });

  const storage = new SupabaseCmsStorage({
    supabaseUrl: "https://example.supabase.co",
    serviceRoleKey: "service-role",
    bucket: "webmaster-droid-cms",
    client,
  });

  const event: AuditEvent = {
    id: "evt_test_1",
    type: "chat_mutation",
    actor: "tester@example.com",
    createdAt: "2026-03-01T00:00:00.000Z",
    detail: { reason: "test" },
  };

  await storage.appendEvent(event);

  assert.equal(uploads.length, 1);
  assert.match(uploads[0].key, /^cms\/events\/\d{4}-\d{2}\.jsonl$/);
  assert.equal(uploads[0].contentType, "application/x-ndjson");
  assert.equal(uploads[0].body, `${JSON.stringify(event)}\n`);
});

test("ensureInitialized creates missing stage files and monthly event log", async () => {
  const uploads: UploadCall[] = [];
  const client = createMockClient({
    onDownload: async () => ({
      data: null,
      error: {
        statusCode: "404",
        message: "The resource was not found",
      },
    }),
    onUpload: async (call) => {
      uploads.push(call);
      return { error: null };
    },
  });

  const storage = new SupabaseCmsStorage({
    supabaseUrl: "https://example.supabase.co",
    serviceRoleKey: "service-role",
    bucket: "webmaster-droid-cms",
    client,
  });

  await storage.ensureInitialized(createDefaultCmsDocument());

  const keys = uploads.map((entry) => entry.key);
  assert.equal(keys.includes("cms/live/current.json"), true);
  assert.equal(keys.includes("cms/draft/current.json"), true);
  assert.equal(keys.some((key) => /^cms\/events\/\d{4}-\d{2}\.jsonl$/.test(key)), true);
});
