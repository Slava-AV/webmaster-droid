import type {
  ModelProviderConfig,
  PublishRequest,
  RollbackRequest,
  SelectedElementContext,
  SelectedElementKind,
} from "@webmaster-droid/contracts";

import { runAgentTurn } from "../agent";
import type { CmsService } from "../core";
import {
  getBearerToken,
  type AdminIdentity,
  verifyAdminToken,
} from "../api-aws/auth";
import { normalizeEditablePath } from "../api-aws/normalize-editable-path";

import {
  jsonResponse,
  normalizePath,
  parseJsonBody,
  sseEvent,
  sseHeaders,
} from "./http";
import { getCmsService } from "./service-factory";

interface ChatRequestBody {
  message: string;
  modelId?: string;
  includeThinking?: boolean;
  currentPath?: string;
  selectedElement?: SelectedElementContext;
  history?: Array<{ role: "user" | "assistant"; text: string }>;
}

interface DeleteCheckpointRequestBody {
  checkpointId: string;
}

const SELECTION_KIND_SET = new Set<SelectedElementKind>([
  "text",
  "image",
  "link",
  "section",
]);
const DEFAULT_MODEL_OPTIONS: Array<{
  id: string;
  label: string;
  provider: "openai" | "gemini";
}> = [
  {
    id: "openai:gpt-5.2",
    label: "OpenAI GPT-5.2",
    provider: "openai",
  },
  {
    id: "gemini:gemini-3-flash-preview",
    label: "Google Gemini 3 Flash (preview)",
    provider: "gemini",
  },
  {
    id: "gemini:gemini-3.1-pro-preview",
    label: "Google Gemini 3.1 Pro (preview)",
    provider: "gemini",
  },
];

interface ModelCapabilities {
  contentEdit: boolean;
  themeTokenEdit: boolean;
  imageGenerate: boolean;
  imageEdit: boolean;
  visionAssist: boolean;
}

function buildAvailableModels(config: ModelProviderConfig): Array<{ id: string; label: string }> {
  const enabledProviders = new Set<"openai" | "gemini">();
  if (config.openaiEnabled) {
    enabledProviders.add("openai");
  }
  if (config.geminiEnabled) {
    enabledProviders.add("gemini");
  }

  const options = new Map<string, { id: string; label: string }>();
  for (const candidate of DEFAULT_MODEL_OPTIONS) {
    if (!enabledProviders.has(candidate.provider)) {
      continue;
    }

    options.set(candidate.id, {
      id: candidate.id,
      label: candidate.label,
    });
  }

  return Array.from(options.values());
}

function buildModelCapabilities(input: {
  config: ModelProviderConfig;
  availableModels: Array<{ id: string; label: string }>;
  hasPublicAssetBaseUrl: boolean;
}): ModelCapabilities {
  const hasReadableModel = input.availableModels.length > 0;
  const hasImagePipeline = input.config.geminiEnabled && input.hasPublicAssetBaseUrl;

  return {
    contentEdit: hasReadableModel,
    themeTokenEdit: hasReadableModel,
    imageGenerate: hasImagePipeline,
    imageEdit: hasImagePipeline,
    visionAssist: hasReadableModel,
  };
}

function resolveDefaultModelId(
  config: ModelProviderConfig,
  availableModels: Array<{ id: string; label: string }>
): string {
  const requestedDefault = config.defaultModelId.trim();
  if (availableModels.some((model) => model.id === requestedDefault)) {
    return requestedDefault;
  }

  return availableModels[0]?.id ?? requestedDefault;
}

function toHeaderRecord(headers: Headers): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });

  return out;
}

async function requireAdminFromHeaders(headers: Headers): Promise<AdminIdentity> {
  const token = getBearerToken(toHeaderRecord(headers));
  if (!token) {
    throw new Error("Missing bearer token.");
  }

  return verifyAdminToken(token);
}

function getStageFromQuery(url: URL): "live" | "draft" {
  const stage = url.searchParams.get("stage");
  if (stage === "draft") {
    return "draft";
  }

  return "live";
}

function normalizeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) {
    return null;
  }

  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 3)}...`;
}

function normalizeSelectionKind(value: unknown): SelectedElementKind | null {
  if (typeof value !== "string") {
    return null;
  }

  if (SELECTION_KIND_SET.has(value as SelectedElementKind)) {
    return value as SelectedElementKind;
  }

  return null;
}

function normalizePagePath(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const [withoutQuery] = value.split(/[?#]/, 1);
  const trimmed = withoutQuery?.trim() ?? "";

  if (!trimmed || !trimmed.startsWith("/")) {
    return null;
  }

  return trimmed;
}

function normalizeRelatedPaths(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const out = new Set<string>();
  for (const item of value) {
    const normalized = normalizeEditablePath(item);
    if (normalized) {
      out.add(normalized);
    }
  }

  return Array.from(out);
}

function normalizeSelectedElementContext(
  value: unknown
): SelectedElementContext | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const path = normalizeEditablePath(record.path);
  const label = normalizeText(record.label, 120);
  const kind = normalizeSelectionKind(record.kind);
  const pagePath = normalizePagePath(record.pagePath);

  if (!path || !label || !kind || !pagePath) {
    return undefined;
  }

  const selected: SelectedElementContext = {
    path,
    label,
    kind,
    pagePath,
  };

  const relatedPaths = normalizeRelatedPaths(record.relatedPaths);
  if (relatedPaths.length > 0) {
    selected.relatedPaths = relatedPaths;
  }

  const preview = normalizeText(record.preview, 140);
  if (preview) {
    selected.preview = preview;
  }

  return selected;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function createChatStreamResponse(input: {
  service: CmsService;
  requestSignal: AbortSignal;
  body: ChatRequestBody;
  actor: string;
}): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let closed = false;

      const close = () => {
        if (closed) {
          return;
        }

        closed = true;
        if (heartbeat) {
          clearInterval(heartbeat);
        }
        controller.close();
      };

      const write = (eventName: string, data: unknown) => {
        if (closed) {
          return;
        }

        controller.enqueue(encoder.encode(sseEvent(eventName, data)));
      };

      const abortHandler = () => {
        close();
      };
      input.requestSignal.addEventListener("abort", abortHandler, { once: true });

      void (async () => {
        try {
          const selectedElement = normalizeSelectedElementContext(input.body.selectedElement);

          write("ready", { ok: true });
          heartbeat = setInterval(() => {
            write("ping", { ts: new Date().toISOString() });
          }, 15_000);

          const result = await runAgentTurn(input.service, {
            prompt: input.body.message,
            modelId: input.body.modelId,
            includeThinking: input.body.includeThinking,
            actor: input.actor,
            currentPath: input.body.currentPath,
            selectedElement,
            history: input.body.history,
            onThinkingEvent: input.body.includeThinking
              ? (note) => {
                  write("thinking", { note });
                }
              : undefined,
            onToolEvent: (toolEvent) => {
              write("tool", toolEvent);
            },
          });

          write("message", { text: result.text });
          if (result.mutationsApplied) {
            write("draft-updated", {
              contentVersion: result.updatedDraft.meta.contentVersion,
              updatedAt: result.updatedDraft.meta.updatedAt,
              summary: result.mutationSummary ?? {
                contentOperations: 0,
                themeTokenChanges: 0,
                imageOperations: 0,
              },
            });
          }

          write("done", { ok: true });
        } catch (error) {
          write("error", {
            ok: false,
            error: errorMessage(error),
          });
          write("done", { ok: false });
        } finally {
          input.requestSignal.removeEventListener("abort", abortHandler);
          close();
        }
      })();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: sseHeaders(),
  });
}

export async function handler(request: Request): Promise<Response> {
  try {
    const method = request.method.toUpperCase();
    if (method === "OPTIONS") {
      return jsonResponse(200, { ok: true });
    }

    const url = new URL(request.url);
    const path = normalizePath(url.pathname);

    const service = await getCmsService();

    if (method === "GET" && path.endsWith("/content")) {
      const stage = getStageFromQuery(url);
      if (stage === "draft") {
        await requireAdminFromHeaders(request.headers);
      }

      const content = await service.getContent(stage);
      return jsonResponse(200, { stage, content });
    }

    if (method === "GET" && path.endsWith("/models")) {
      const config = service.getModelConfig();
      const availableModels = buildAvailableModels(config);
      const defaultModelId = resolveDefaultModelId(config, availableModels);
      const capabilities = buildModelCapabilities({
        config,
        availableModels,
        hasPublicAssetBaseUrl: Boolean(service.getPublicAssetBaseUrl()),
      });
      return jsonResponse(200, {
        providers: {
          openai: config.openaiEnabled,
          gemini: config.geminiEnabled,
        },
        capabilities,
        defaultModelId,
        showModelPicker: availableModels.length > 1,
        availableModels,
      });
    }

    if (method === "GET" && path.endsWith("/session")) {
      const identity = await requireAdminFromHeaders(request.headers);
      return jsonResponse(200, {
        authenticated: true,
        identity,
      });
    }

    if (method === "GET" && path.endsWith("/history")) {
      await requireAdminFromHeaders(request.headers);
      const history = await service.listHistory();
      return jsonResponse(200, history);
    }

    if (method === "POST" && path.endsWith("/publish")) {
      const identity = await requireAdminFromHeaders(request.headers);
      const body = await parseJsonBody<PublishRequest>(request);
      const result = await service.publishDraft(body, identity.email ?? identity.sub);

      return jsonResponse(200, {
        ok: true,
        version: result,
      });
    }

    if (method === "POST" && path.endsWith("/rollback")) {
      const identity = await requireAdminFromHeaders(request.headers);
      const body = await parseJsonBody<RollbackRequest>(request);
      const document = await service.rollbackDraft(body, identity.email ?? identity.sub);

      return jsonResponse(200, {
        ok: true,
        draftVersion: document.meta.contentVersion,
      });
    }

    if (method === "POST" && path.endsWith("/checkpoints/delete")) {
      await requireAdminFromHeaders(request.headers);
      const body = await parseJsonBody<DeleteCheckpointRequestBody>(request);
      const checkpointId =
        typeof body.checkpointId === "string" ? body.checkpointId.trim() : "";

      if (!checkpointId) {
        throw new Error("checkpointId is required.");
      }

      await service.deleteCheckpoint(checkpointId);
      return jsonResponse(200, {
        ok: true,
        checkpointId,
      });
    }

    if (method === "POST" && path.endsWith("/chat/stream")) {
      const identity = await requireAdminFromHeaders(request.headers);
      const body = await parseJsonBody<ChatRequestBody>(request);

      return createChatStreamResponse({
        service,
        requestSignal: request.signal,
        body,
        actor: identity.email ?? identity.sub,
      });
    }

    return jsonResponse(404, {
      error: "Not found",
      path,
      method,
    });
  } catch (error) {
    const message = errorMessage(error);
    const statusCode = message.startsWith("Checkpoint not found:") ? 404 : 400;
    return jsonResponse(statusCode, {
      ok: false,
      error: message,
    });
  }
}

export default handler;
