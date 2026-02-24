import type {
  ModelProviderConfig,
  PublishRequest,
  RollbackRequest,
  SelectedElementContext,
  SelectedElementKind,
} from "@webmaster-droid/contracts";
import { runAgentTurn } from "../agent";

import { getBearerToken, verifyAdminToken } from "./auth";
import { jsonResponse, normalizePath, parseJsonBody, sseResponse } from "./http";
import { normalizeEditablePath } from "./normalize-editable-path";
import { getCmsService } from "./service-factory";
import type { ApiGatewayProxyEvent, ApiGatewayProxyResult } from "./types";

declare const awslambda: {
  streamifyResponse: (
    handler: (
      event: unknown,
      responseStream: unknown,
      context: unknown
    ) => Promise<void>
  ) => (event: unknown, responseStream: unknown, context: unknown) => Promise<void>;
  HttpResponseStream: {
    from: (
      responseStream: unknown,
      metadata: {
        statusCode: number;
        headers: Record<string, string>;
      }
    ) => {
      write: (chunk: string) => void;
      end: () => void;
    };
  };
};
type AwsStreamHandler = (event: unknown, responseStream: unknown, context: unknown) => Promise<void>;

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

const SSE_HEADERS: Record<string, string> = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type,authorization,accept,cache-control",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};

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

function toHeaderRecord(
  headers: unknown
): Record<string, string | undefined> {
  if (!headers || typeof headers !== "object") {
    return {};
  }

  return headers as Record<string, string | undefined>;
}

function eventMethod(event: unknown): string {
  if (!event || typeof event !== "object") {
    return "GET";
  }

  const e = event as {
    httpMethod?: string;
    requestContext?: { http?: { method?: string } };
  };

  return e.httpMethod ?? e.requestContext?.http?.method ?? "GET";
}

function eventPath(event: unknown): string {
  if (!event || typeof event !== "object") {
    return "/";
  }

  const e = event as { path?: string; rawPath?: string };
  return normalizePath(e.path ?? e.rawPath ?? "/");
}

function parseEventBody<T>(event: unknown): T {
  if (!event || typeof event !== "object") {
    throw new Error("Request body is required.");
  }

  const e = event as {
    body?: string | null;
    isBase64Encoded?: boolean;
  };

  if (!e.body) {
    throw new Error("Request body is required.");
  }

  const raw = e.isBase64Encoded
    ? Buffer.from(e.body, "base64").toString("utf8")
    : e.body;

  return JSON.parse(raw) as T;
}

function sseEvent(event: string, data: unknown): string {
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  return `event: ${event}\ndata: ${payload}\n\n`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

async function requireAdminFromHeaders(headers: Record<string, string | undefined>) {
  const token = getBearerToken(headers);
  if (!token) {
    throw new Error("Missing bearer token.");
  }

  return verifyAdminToken(token);
}

async function requireAdmin(event: ApiGatewayProxyEvent) {
  return requireAdminFromHeaders(toHeaderRecord(event.headers));
}

function getStageFromQuery(query: ApiGatewayProxyEvent["queryStringParameters"]) {
  const stage = query?.stage;
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

export async function handler(
  event: ApiGatewayProxyEvent
): Promise<ApiGatewayProxyResult> {
  try {
    if (event.httpMethod === "OPTIONS") {
      return jsonResponse(200, { ok: true });
    }

    const service = await getCmsService();
    const path = normalizePath(event.path);

    if (event.httpMethod === "GET" && path.endsWith("/content")) {
      const stage = getStageFromQuery(event.queryStringParameters);
      if (stage === "draft") {
        await requireAdmin(event);
      }

      const content = await service.getContent(stage);
      return jsonResponse(200, { stage, content });
    }

    if (event.httpMethod === "GET" && path.endsWith("/models")) {
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

    if (event.httpMethod === "GET" && path.endsWith("/session")) {
      const identity = await requireAdmin(event);
      return jsonResponse(200, {
        authenticated: true,
        identity,
      });
    }

    if (event.httpMethod === "GET" && path.endsWith("/history")) {
      await requireAdmin(event);
      const history = await service.listHistory();
      return jsonResponse(200, history);
    }

    if (event.httpMethod === "POST" && path.endsWith("/publish")) {
      const identity = await requireAdmin(event);
      const body = parseJsonBody<PublishRequest>(event.body);
      const result = await service.publishDraft(body, identity.email ?? identity.sub);

      return jsonResponse(200, {
        ok: true,
        version: result,
      });
    }

    if (event.httpMethod === "POST" && path.endsWith("/rollback")) {
      const identity = await requireAdmin(event);
      const body = parseJsonBody<RollbackRequest>(event.body);
      const document = await service.rollbackDraft(body, identity.email ?? identity.sub);

      return jsonResponse(200, {
        ok: true,
        draftVersion: document.meta.contentVersion,
      });
    }

    if (event.httpMethod === "POST" && path.endsWith("/checkpoints/delete")) {
      await requireAdmin(event);
      const body = parseJsonBody<DeleteCheckpointRequestBody>(event.body);
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

    if (event.httpMethod === "POST" && path.endsWith("/chat/stream")) {
      const identity = await requireAdmin(event);
      const body = parseJsonBody<ChatRequestBody>(event.body);
      const selectedElement = normalizeSelectedElementContext(body.selectedElement);

      const result = await runAgentTurn(service, {
        prompt: body.message,
        modelId: body.modelId,
        includeThinking: body.includeThinking,
        actor: identity.email ?? identity.sub,
        currentPath: body.currentPath,
        selectedElement,
        history: body.history,
      });

      const events: Array<{ event: string; data: unknown }> = [];

      if (body.includeThinking) {
        for (const note of result.thinking) {
          events.push({
            event: "thinking",
            data: { note },
          });
        }
      }

      for (const toolEvent of result.toolEvents) {
        events.push({
          event: "tool",
          data: toolEvent,
        });
      }

      events.push({
        event: "message",
        data: {
          text: result.text,
        },
      });

      if (result.mutationsApplied) {
        events.push({
          event: "draft-updated",
          data: {
            contentVersion: result.updatedDraft.meta.contentVersion,
            updatedAt: result.updatedDraft.meta.updatedAt,
            summary: result.mutationSummary ?? {
              contentOperations: 0,
              themeTokenChanges: 0,
              imageOperations: 0,
            },
          },
        });
      }

      events.push({
        event: "done",
        data: { ok: true },
      });

      return sseResponse(200, events);
    }

    return jsonResponse(404, {
      error: "Not found",
      path,
      method: event.httpMethod,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const statusCode = message.startsWith("Checkpoint not found:") ? 404 : 400;
    return jsonResponse(statusCode, {
      ok: false,
      error: message,
    });
  }
}

function createStreamHandler(): AwsStreamHandler {
  if (
    typeof awslambda === "undefined" ||
    typeof awslambda.streamifyResponse !== "function" ||
    typeof awslambda.HttpResponseStream?.from !== "function"
  ) {
    return async () => {
      throw new Error(
        "AWS Lambda stream handler requires the awslambda runtime global. " +
          "Use the non-streaming `handler` outside AWS Lambda."
      );
    };
  }

  const runtime = awslambda;

  return runtime.streamifyResponse(async (event: unknown, responseStream: unknown) => {
    const stream = runtime.HttpResponseStream.from(responseStream, {
      statusCode: 200,
      headers: SSE_HEADERS,
    });

    const write = (eventName: string, data: unknown) => {
      stream.write(sseEvent(eventName, data));
    };

    let heartbeat: ReturnType<typeof setInterval> | null = null;

    try {
      const method = eventMethod(event);
      const path = eventPath(event);

      if (method === "OPTIONS") {
        write("done", { ok: true });
        return;
      }

      if (method !== "POST" || !path.endsWith("/chat/stream")) {
        write("error", {
          ok: false,
          error: `Not found: ${method} ${path}`,
        });
        return;
      }

      const identity = await requireAdminFromHeaders(
        toHeaderRecord((event as { headers?: unknown }).headers)
      );
      const body = parseEventBody<ChatRequestBody>(event);
      const service = await getCmsService();
      const selectedElement = normalizeSelectedElementContext(body.selectedElement);

      write("ready", { ok: true });

      heartbeat = setInterval(() => {
        write("ping", { ts: new Date().toISOString() });
      }, 15000);

      const result = await runAgentTurn(service, {
        prompt: body.message,
        modelId: body.modelId,
        includeThinking: body.includeThinking,
        actor: identity.email ?? identity.sub,
        currentPath: body.currentPath,
        selectedElement,
        history: body.history,
        onThinkingEvent: body.includeThinking
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
      if (heartbeat) {
        clearInterval(heartbeat);
      }
      stream.end();
    }
  });
}

let cachedStreamHandler: AwsStreamHandler | null = null;

export const streamHandler: AwsStreamHandler = async (
  event: unknown,
  responseStream: unknown,
  context: unknown
) => {
  if (!cachedStreamHandler) {
    cachedStreamHandler = createStreamHandler();
  }

  return cachedStreamHandler(event, responseStream, context);
};
