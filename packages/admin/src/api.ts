import type {
  CmsDocument,
  PublishRequest,
  RollbackRequest,
  SelectedElementContext,
} from "@webmaster-droid/contracts";

import { buildApiUrl } from "./config";
import type { AdminAuthToken, ModelOption } from "./types";

function withAuthHeaders(token: AdminAuthToken): Record<string, string> {
  if (!token) {
    return {};
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

export async function fetchCmsContent(
  apiBaseUrl: string,
  stage: "live" | "draft",
  token?: AdminAuthToken
) {
  const response = await fetch(buildApiUrl(apiBaseUrl, `/api/content?stage=${stage}`), {
    headers: {
      ...withAuthHeaders(token),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${stage} content.`);
  }

  const payload = (await response.json()) as {
    content: CmsDocument;
  };

  return payload.content;
}

export async function fetchModels(apiBaseUrl: string) {
  const response = await fetch(buildApiUrl(apiBaseUrl, "/api/models"), {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch model configuration.");
  }

  return (await response.json()) as {
    providers: {
      openai: boolean;
      gemini: boolean;
    };
    defaultModelId: string;
    showModelPicker: boolean;
    availableModels: ModelOption[];
  };
}

export async function fetchHistory(apiBaseUrl: string, token: AdminAuthToken) {
  const response = await fetch(buildApiUrl(apiBaseUrl, "/api/history"), {
    headers: {
      ...withAuthHeaders(token),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch history.");
  }

  return (await response.json()) as {
    checkpoints: Array<{ id: string; createdAt: string; reason: string }>;
    published: Array<{ id: string; createdAt: string }>;
  };
}

export async function publishDraft(
  apiBaseUrl: string,
  token: AdminAuthToken,
  body: PublishRequest
) {
  const response = await fetch(buildApiUrl(apiBaseUrl, "/api/publish"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...withAuthHeaders(token),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Publish failed: ${detail}`);
  }

  return response.json();
}

export async function rollbackDraft(
  apiBaseUrl: string,
  token: AdminAuthToken,
  body: RollbackRequest
) {
  const response = await fetch(buildApiUrl(apiBaseUrl, "/api/rollback"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...withAuthHeaders(token),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Rollback failed: ${detail}`);
  }

  return response.json();
}

export async function deleteCheckpoint(
  apiBaseUrl: string,
  token: AdminAuthToken,
  body: { checkpointId: string }
) {
  const response = await fetch(buildApiUrl(apiBaseUrl, "/api/checkpoints/delete"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...withAuthHeaders(token),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Delete checkpoint failed: ${detail}`);
  }

  return response.json();
}

function parseEventChunk(chunk: string): Array<{ event: string; data: string }> {
  const normalized = chunk.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");

  const parsed: Array<{ event: string; data: string }> = [];
  let eventName = "message";
  let dataLines: string[] = [];

  const flush = () => {
    if (dataLines.length === 0) {
      eventName = "message";
      return;
    }

    parsed.push({
      event: eventName || "message",
      data: dataLines.join("\n"),
    });

    eventName = "message";
    dataLines = [];
  };

  for (const line of lines) {
    if (line === "") {
      flush();
      continue;
    }

    if (line.startsWith(":")) {
      continue;
    }

    const separatorIndex = line.indexOf(":");
    const field = separatorIndex === -1 ? line : line.slice(0, separatorIndex);
    let value = separatorIndex === -1 ? "" : line.slice(separatorIndex + 1);
    if (value.startsWith(" ")) {
      value = value.slice(1);
    }

    if (field === "event") {
      eventName = value || "message";
      continue;
    }

    if (field === "data") {
      dataLines.push(value);
    }
  }

  return parsed;
}

function yieldToUi() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

export async function streamChat(params: {
  apiBaseUrl: string;
  token: string;
  message: string;
  modelId?: string;
  includeThinking: boolean;
  currentPath?: string;
  selectedElement?: SelectedElementContext | null;
  history?: Array<{ role: "user" | "assistant"; text: string }>;
  onEvent: (event: { event: string; data: unknown }) => void;
}) {
  const response = await fetch(buildApiUrl(params.apiBaseUrl, "/api/chat/stream"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Accept: "text/event-stream",
      ...withAuthHeaders(params.token),
    },
    body: JSON.stringify({
      message: params.message,
      modelId: params.modelId,
      includeThinking: params.includeThinking,
      currentPath: params.currentPath,
      selectedElement: params.selectedElement ?? null,
      history: params.history,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Chat request failed: ${detail}`);
  }

  if (!response.body) {
    throw new Error("Missing response body for SSE stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const events = parseEventChunk(`${chunk}\n\n`);
      for (const event of events) {
        let payload: unknown = event.data;
        try {
          payload = JSON.parse(event.data);
        } catch {
          payload = event.data;
        }

        params.onEvent({
          event: event.event,
          data: payload,
        });

        await yieldToUi();
      }
    }
  }

  const remainder = buffer.trim();
  if (!remainder) {
    return;
  }

  for (const event of parseEventChunk(`${remainder}\n\n`)) {
    let payload: unknown = event.data;
    try {
      payload = JSON.parse(event.data);
    } catch {
      payload = event.data;
    }

    params.onEvent({
      event: event.event,
      data: payload,
    });

    await yieldToUi();
  }
}
