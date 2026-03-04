import type { ChatMessage } from "./types";

export function createMessage(
  role: ChatMessage["role"],
  text: string,
  status?: ChatMessage["status"]
): ChatMessage {
  return {
    id: `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
    status: role === "assistant" ? status ?? "final" : undefined,
  };
}

export function insertBeforePendingMessage(
  entries: ChatMessage[],
  message: ChatMessage,
  pendingAssistantId: string | null
): ChatMessage[] {
  if (!pendingAssistantId) {
    return [...entries, message];
  }

  const pendingIndex = entries.findIndex((entry) => entry.id === pendingAssistantId);
  if (pendingIndex === -1) {
    return [...entries, message];
  }

  const next = [...entries];
  next.splice(pendingIndex, 0, message);
  return next;
}

export function removeMessageById(entries: ChatMessage[], messageId: string | null): ChatMessage[] {
  if (!messageId) {
    return entries;
  }

  return entries.filter((entry) => entry.id !== messageId);
}

export function resolvePendingAssistant(
  entries: ChatMessage[],
  pendingAssistantId: string | null,
  text: string
): { nextEntries: ChatMessage[]; replaced: boolean } {
  if (!pendingAssistantId) {
    return { nextEntries: entries, replaced: false };
  }

  let replaced = false;
  const nextEntries = entries.map((entry) => {
    if (entry.id !== pendingAssistantId) {
      return entry;
    }

    replaced = true;
    return {
      ...entry,
      text,
      status: "final" as const,
    };
  });

  return { nextEntries, replaced };
}

export function formatHistoryTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

export function historyTimestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function toReadableToolLine(toolName: string, summary: string): string {
  const normalized = summary.trim();
  if (!normalized) {
    return toolName.replace(/_/g, " ");
  }

  const prefixedPattern = new RegExp(`^${toolName.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\s*:\\s*`, "i");
  const withoutToolPrefix = normalized.replace(prefixedPattern, "");
  const withoutTechnicalPrefix = withoutToolPrefix.replace(/^[a-z0-9_]+:\s*/i, "");
  return withoutTechnicalPrefix || normalized;
}

export function buildModelHistory(
  entries: ChatMessage[]
): Array<{ role: "user" | "assistant"; text: string }> {
  return entries
    .filter((entry): entry is ChatMessage & { role: "user" | "assistant" } =>
      entry.role === "user" || entry.role === "assistant"
    )
    .slice(-12)
    .map((entry) => ({
      role: entry.role,
      text: entry.text,
    }));
}

export function kindIcon(kind: "text" | "image" | "link" | "section"): string {
  if (kind === "image") {
    return "IMG";
  }

  if (kind === "link") {
    return "LNK";
  }

  if (kind === "section") {
    return "SEC";
  }

  return "TXT";
}

export const OVERLAY_FONT_FAMILY =
  "var(--font-ibm-plex-mono, ui-monospace), SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
