"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { REQUIRED_PUBLISH_CONFIRMATION, type RollbackRequest } from "@webmaster-droid/contracts";
import { parseSelectedEditableFromTarget } from "@webmaster-droid/react";

import {
  deleteCheckpoint,
  fetchHistory,
  publishDraft,
  rollbackDraft,
  streamChat,
} from "./api";
import { useWebmasterDroid } from "./context";
import { getSupabaseBrowserClient } from "./supabase-client";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "thinking" | "system" | "tool";
  text: string;
  status?: "pending" | "final";
};

function createMessage(
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

function insertBeforePendingMessage(
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

function removeMessageById(entries: ChatMessage[], messageId: string | null): ChatMessage[] {
  if (!messageId) {
    return entries;
  }

  return entries.filter((entry) => entry.id !== messageId);
}

function resolvePendingAssistant(
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

function formatHistoryTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function historyTimestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function toReadableToolLine(toolName: string, summary: string): string {
  const normalized = summary.trim();
  if (!normalized) {
    return toolName.replace(/_/g, " ");
  }

  const prefixedPattern = new RegExp(`^${toolName.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\s*:\\s*`, "i");
  const withoutToolPrefix = normalized.replace(prefixedPattern, "");
  const withoutTechnicalPrefix = withoutToolPrefix.replace(/^[a-z0-9_]+:\s*/i, "");
  return withoutTechnicalPrefix || normalized;
}

function buildModelHistory(
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

function kindIcon(kind: "text" | "image" | "link" | "section"): string {
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

export function WebmasterDroidOverlay() {
  const {
    config,
    isAdminMode,
    isAuthenticated,
    token,
    modelId,
    setModelId,
    showModelPicker,
    modelOptions,
    includeThinking,
    requestRefresh,
    authConfigured,
    selectedElement,
    setSelectedElement,
    clearSelectedElement,
  } = useWebmasterDroid();

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "history">("chat");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [history, setHistory] = useState<{
    checkpoints: Array<{ id: string; createdAt: string; reason: string }>;
    published: Array<{ id: string; createdAt: string }>;
  }>({ checkpoints: [], published: [] });
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [deletingCheckpointId, setDeletingCheckpointId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const overlayRootRef = useRef<HTMLDivElement | null>(null);
  const pendingAssistantIdRef = useRef<string | null>(null);

  const supabase = useMemo(() => getSupabaseBrowserClient(config), [config]);

  const refreshHistory = useCallback(
    async (showErrorMessage: boolean) => {
      if (!token) {
        return;
      }

      try {
        const data = await fetchHistory(config.apiBaseUrl, token);
        setHistory(data);
      } catch {
        if (showErrorMessage) {
          setMessages((prev) => [
            ...prev,
            createMessage("system", "Failed to load rollback history."),
          ]);
        }
      }
    },
    [config.apiBaseUrl, token]
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    chatEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [isOpen, messages]);

  useEffect(() => {
    if (!isOpen || !isAuthenticated || !token) {
      return;
    }

    void refreshHistory(true);
  }, [isAuthenticated, isOpen, refreshHistory, token]);

  useEffect(() => {
    if (!isAdminMode || !isOpen) {
      return;
    }

    const onDocumentClickCapture = (event: MouseEvent) => {
      const overlayRoot = overlayRootRef.current;
      if (overlayRoot && event.target instanceof Node && overlayRoot.contains(event.target)) {
        return;
      }

      const nextSelection = parseSelectedEditableFromTarget(
        event.target,
        window.location.pathname
      );
      if (!nextSelection) {
        return;
      }

      setSelectedElement(nextSelection);
    };

    document.addEventListener("click", onDocumentClickCapture, true);
    return () => {
      document.removeEventListener("click", onDocumentClickCapture, true);
    };
  }, [isAdminMode, isOpen, setSelectedElement]);

  const selectableModels = modelOptions;

  if (!isAdminMode) {
    return null;
  }

  const signInWithPassword = async () => {
    if (!supabase) {
      setMessages((prev) => [
        ...prev,
        createMessage("system", "Supabase is not configured in frontend env."),
      ]);
      return;
    }

    if (!email.trim() || !password) {
      setMessages((prev) => [
        ...prev,
        createMessage("system", "Email and password are required."),
      ]);
      return;
    }

    setSigningIn(true);
    try {
      const response = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (response.error) {
        setMessages((prev) => [
          ...prev,
          createMessage("system", `Auth error: ${response.error.message}`),
        ]);
        return;
      }

      setPassword("");
      setMessages((prev) => [...prev, createMessage("system", "Signed in successfully.")]);
    } finally {
      setSigningIn(false);
    }
  };

  const onSend = async () => {
    if (!token || !message.trim() || sending) {
      return;
    }

    const userText = message.trim();
    const userMessage = createMessage("user", userText);
    const pendingAssistantMessage = createMessage("assistant", "", "pending");
    pendingAssistantIdRef.current = pendingAssistantMessage.id;
    setMessage("");
    setSending(true);
    setMessages((prev) => [...prev, userMessage, pendingAssistantMessage]);
    let assistantMessageReceived = false;
    let streamErrorReceived = false;

    try {
      await streamChat({
        apiBaseUrl: config.apiBaseUrl,
        token,
        message: userText,
        modelId: modelId ?? undefined,
        includeThinking,
        currentPath: window.location.pathname,
        selectedElement,
        history: buildModelHistory(messages),
        onEvent: (event) => {
          if (event.event === "thinking") {
            if (!includeThinking) {
              return;
            }

            const note =
              typeof event.data === "object" &&
              event.data !== null &&
              "note" in event.data
                ? String((event.data as { note: string }).note)
                : JSON.stringify(event.data);

            setMessages((prev) =>
              insertBeforePendingMessage(
                prev,
                createMessage("thinking", note),
                pendingAssistantIdRef.current
              )
            );
            return;
          }

          if (event.event === "tool") {
            const toolName =
              typeof event.data === "object" &&
              event.data !== null &&
              "tool" in event.data
                ? String((event.data as { tool: string }).tool)
                : "tool";
            const summary =
              typeof event.data === "object" &&
              event.data !== null &&
              "summary" in event.data
                ? String((event.data as { summary: string }).summary)
                : "Executed tool step.";

            setMessages((prev) =>
              insertBeforePendingMessage(
                prev,
                createMessage("tool", toReadableToolLine(toolName, summary)),
                pendingAssistantIdRef.current
              )
            );
            return;
          }

          if (event.event === "message") {
            const text =
              typeof event.data === "object" &&
              event.data !== null &&
              "text" in event.data
                ? String((event.data as { text: string }).text)
                : String(event.data);

            const normalizedText = text.trim();
            if (!normalizedText) {
              return;
            }

            assistantMessageReceived = true;
            const pendingAssistantId = pendingAssistantIdRef.current;
            setMessages((prev) => {
              const { nextEntries, replaced } = resolvePendingAssistant(
                prev,
                pendingAssistantId,
                normalizedText
              );

              if (replaced) {
                return nextEntries;
              }

              return [...prev, createMessage("assistant", normalizedText, "final")];
            });
            pendingAssistantIdRef.current = null;
            return;
          }

          if (event.event === "done") {
            if (!assistantMessageReceived && !streamErrorReceived) {
              const pendingAssistantId = pendingAssistantIdRef.current;
              setMessages((prev) => [
                ...removeMessageById(prev, pendingAssistantId),
                createMessage("system", "No assistant response received. Please retry."),
              ]);
              pendingAssistantIdRef.current = null;
            }
            return;
          }

          if (event.event === "draft-updated") {
            requestRefresh();
            void refreshHistory(false);
            return;
          }

          if (event.event === "error") {
            const detail =
              typeof event.data === "object" &&
              event.data !== null &&
              "error" in event.data
                ? String((event.data as { error: string }).error)
                : "Unknown stream error.";

            const pendingAssistantId = pendingAssistantIdRef.current;
            setMessages((prev) => [
              ...removeMessageById(prev, pendingAssistantId),
              createMessage("system", `**Error:** ${detail}`),
            ]);
            pendingAssistantIdRef.current = null;
            streamErrorReceived = true;
            return;
          }
        },
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Chat failed.";
      const pendingAssistantId = pendingAssistantIdRef.current;
      setMessages((prev) => [...removeMessageById(prev, pendingAssistantId), createMessage("system", detail)]);
      pendingAssistantIdRef.current = null;
    } finally {
      pendingAssistantIdRef.current = null;
      setSending(false);
    }
  };

  const onPublish = async () => {
    if (!token) {
      return;
    }

    const approved = window.confirm(
      "Publish current draft to live site? This action affects all visitors."
    );
    if (!approved) {
      return;
    }

    try {
      await publishDraft(config.apiBaseUrl, token, {
        confirmationText: REQUIRED_PUBLISH_CONFIRMATION,
      });
      requestRefresh();
      await refreshHistory(false);
      setMessages((prev) => [
        ...prev,
        createMessage("system", "Draft published successfully."),
      ]);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Publish failed.";
      setMessages((prev) => [...prev, createMessage("system", detail)]);
    }
  };

  const onRollback = async (request: RollbackRequest, label: string) => {
    if (!token) {
      return;
    }

    try {
      await rollbackDraft(config.apiBaseUrl, token, request);
      requestRefresh();
      await refreshHistory(false);
      setMessages((prev) => [
        ...prev,
        createMessage("system", `Draft restored from ${label}.`),
      ]);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Rollback failed.";
      setMessages((prev) => [...prev, createMessage("system", detail)]);
    }
  };

  const onDeleteCheckpoint = async (checkpoint: {
    id: string;
    createdAt: string;
    reason: string;
  }) => {
    if (!token || deletingCheckpointId) {
      return;
    }

    const timestampLabel = formatHistoryTime(checkpoint.createdAt);
    const reasonLine = checkpoint.reason ? `\nReason: ${checkpoint.reason}` : "";
    const approved = window.confirm(
      `Delete checkpoint from ${timestampLabel}? This cannot be undone.${reasonLine}`
    );
    if (!approved) {
      return;
    }

    setDeletingCheckpointId(checkpoint.id);
    try {
      await deleteCheckpoint(config.apiBaseUrl, token, { checkpointId: checkpoint.id });
      await refreshHistory(false);
      setMessages((prev) => [
        ...prev,
        createMessage("system", `Deleted checkpoint from ${timestampLabel}.`),
      ]);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Delete checkpoint failed.";
      setMessages((prev) => [...prev, createMessage("system", detail)]);
    } finally {
      setDeletingCheckpointId((current) => (current === checkpoint.id ? null : current));
    }
  };

  const onClearChat = () => {
    if (sending) {
      return;
    }

    if (messages.length === 0 && !message.trim() && !selectedElement) {
      return;
    }

    pendingAssistantIdRef.current = null;
    setMessages([]);
    setMessage("");
    clearSelectedElement();
  };

  const onMessageKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    if (!isAuthenticated || sending || !message.trim()) {
      return;
    }

    void onSend();
  };

  const latestPublished = history.published.reduce<number | null>((max, item) => {
    const value = historyTimestamp(item.createdAt);
    if (value === null) {
      return max;
    }

    return max === null ? value : Math.max(max, value);
  }, null);

  const latestCheckpoint = history.checkpoints.reduce<number | null>((max, item) => {
    const value = historyTimestamp(item.createdAt);
    if (value === null) {
      return max;
    }

    return max === null ? value : Math.max(max, value);
  }, null);

  const publishState =
    latestCheckpoint !== null && (latestPublished === null || latestCheckpoint > latestPublished)
      ? "Unpublished"
      : "Published";

  return (
    <>
      {isOpen ? (
        <div
          ref={overlayRootRef}
          data-admin-overlay-root
          className="fixed bottom-4 right-4 z-[100] flex h-[62vh] w-[min(480px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-lg border border-stone-300 bg-[#f6f2eb] text-stone-900 shadow-2xl"
          style={{
            fontFamily:
              "var(--font-ibm-plex-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
          }}
        >
          <header className="border-b border-stone-300 bg-[#f3eee5] p-2">
            <div className="flex items-center gap-2">
              {isAuthenticated ? (
                <>
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[10px] font-medium leading-4 ${
                      publishState === "Published"
                        ? "border-stone-300 bg-[#ece5d9] text-stone-600"
                        : "border-stone-500 bg-[#ded4c3] text-stone-800"
                    }`}
                  >
                    {publishState}
                  </span>
                  <button
                    type="button"
                    className="rounded border border-stone-700 bg-stone-800 px-2 py-1 text-[11px] font-semibold leading-4 text-stone-100 hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={onPublish}
                    disabled={!isAuthenticated}
                  >
                    Publish
                  </button>
                  <div className="inline-flex rounded-md border border-stone-300 bg-[#e8dfd1] p-0.5">
                    <button
                      type="button"
                      className={`rounded px-2 py-1 text-[11px] font-medium leading-4 ${
                        activeTab === "chat"
                          ? "bg-[#f7f2e8] text-stone-900 shadow-sm"
                          : "text-stone-600 hover:text-stone-900"
                      }`}
                      onClick={() => setActiveTab("chat")}
                    >
                      Chat
                    </button>
                    <button
                      type="button"
                      className={`rounded px-2 py-1 text-[11px] font-medium leading-4 ${
                        activeTab === "history"
                          ? "bg-[#f7f2e8] text-stone-900 shadow-sm"
                          : "text-stone-600 hover:text-stone-900"
                      }`}
                      onClick={() => setActiveTab("history")}
                    >
                      History ({history.published.length + history.checkpoints.length})
                    </button>
                  </div>
                </>
              ) : (
                <h2 className="text-[12px] font-semibold text-stone-700">Login</h2>
              )}
              <div className="ml-auto flex items-center gap-1">
                {isAuthenticated ? (
                  <button
                    type="button"
                    aria-label="Clear chat"
                    title="Clear chat"
                    disabled={sending || (messages.length === 0 && !message.trim() && !selectedElement)}
                    className="inline-flex h-6 w-6 items-center justify-center rounded border border-stone-300 text-stone-600 hover:bg-[#efe8dc] hover:text-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={onClearChat}
                  >
                    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
                      <path
                        d="M4.5 5.5H15.5M8 3.75H12M7 7.5V13.5M10 7.5V13.5M13 7.5V13.5M6.5 5.5L7 15C7.03 15.6 7.53 16.08 8.13 16.08H11.87C12.47 16.08 12.97 15.6 13 15L13.5 5.5"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                ) : null}
                <button
                  type="button"
                  className="rounded border border-stone-300 px-2 py-1 text-[11px] leading-4 text-stone-700 hover:bg-[#efe8dc]"
                  onClick={() => setIsOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </header>

          {!isAuthenticated ? (
            <section className="flex min-h-0 flex-1 items-center justify-center bg-[#ece7dd] p-3">
              {!authConfigured ? (
                <div className="w-full max-w-sm rounded border border-red-300 bg-[#f8f3e9] p-3 text-[11px] leading-4 text-red-700">
                  Missing Supabase config (`supabaseUrl` / `supabaseAnonKey`).
                </div>
              ) : (
                <div className="w-full max-w-sm rounded border border-stone-300 bg-[#f8f3e9] p-3">
                  <h3 className="mb-2 text-[12px] font-semibold text-stone-700">Sign in</h3>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="login"
                      className="w-full rounded border border-stone-300 bg-[#f4efe6] px-2 py-1.5 text-[12px] text-stone-900 outline-none focus:border-stone-500"
                    />
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Password"
                      className="w-full rounded border border-stone-300 bg-[#f4efe6] px-2 py-1.5 text-[12px] text-stone-900 outline-none focus:border-stone-500"
                    />
                    <button
                      type="button"
                      onClick={signInWithPassword}
                      disabled={signingIn || !email.trim() || !password}
                      className="w-full rounded border border-stone-700 bg-stone-800 px-2 py-1.5 text-[12px] font-medium text-stone-100 hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {signingIn ? "Signing in" : "Sign in"}
                    </button>
                  </div>
                </div>
              )}
            </section>
          ) : activeTab === "chat" ? (
            <>
              <section className="flex-1 space-y-1 overflow-auto bg-[#ece7dd] p-2">
                {messages.map((entry) => {
                  const isAssistant = entry.role === "assistant";
                  const isPendingAssistant = isAssistant && entry.status === "pending";

                  return (
                    <div
                      key={entry.id}
                      className={
                        entry.role === "tool"
                          ? "max-w-[96%] px-0.5 py-0 text-[10px] leading-tight text-stone-500"
                          : `max-w-[92%] rounded-md py-1.5 text-[12px] leading-4 ${
                              entry.role === "user"
                                ? "ml-auto bg-[#2e2b27] px-2 text-stone-50"
                                : entry.role === "thinking"
                                  ? "bg-[#e3dbce] px-2 text-stone-700"
                                  : isAssistant
                                    ? "relative border border-[#d6ccbb] bg-[#f8f3e9] pl-8 pr-2 text-stone-800"
                                    : "bg-[#ddd2bf] px-2 text-stone-800"
                            }`
                      }
                    >
                      {entry.role === "tool" ? (
                        <span>{entry.text}</span>
                      ) : (
                        <>
                          {isAssistant ? (
                            <span
                              aria-hidden="true"
                              className={`pointer-events-none absolute left-2 top-1.5 inline-flex h-[18px] w-[18px] select-none items-center justify-center rounded-full border border-[#d6ccbb] bg-[#efe8dc] text-[9px] font-semibold text-stone-700 ${
                                isPendingAssistant ? "animate-pulse" : ""
                              }`}
                            >
                              W
                            </span>
                          ) : null}
                          <div className="max-w-none text-inherit [&_code]:rounded [&_code]:bg-stone-900/10 [&_code]:px-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:mb-1 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-4">
                            {isPendingAssistant && !entry.text.trim() ? (
                              <span className="block h-4" aria-hidden="true" />
                            ) : (
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.text}</ReactMarkdown>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </section>

              <footer className="border-t border-stone-300 bg-[#f3eee5] p-2">
                {showModelPicker && selectableModels.length > 1 ? (
                  <div className="mb-1 flex items-center gap-1.5">
                    <label
                      htmlFor="admin-model-picker"
                      className="text-[10px] font-semibold uppercase tracking-wide text-stone-600"
                    >
                      Model
                    </label>
                    <select
                      id="admin-model-picker"
                      value={modelId ?? selectableModels[0]?.id}
                      onChange={(event) => setModelId(event.target.value)}
                      disabled={sending}
                      className="h-7 min-w-0 flex-1 rounded border border-stone-300 bg-[#f7f2e8] px-2 text-[11px] text-stone-800 outline-none focus:border-stone-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {selectableModels.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {selectedElement ? (
                  <div className="mb-1 flex items-center gap-1 rounded border border-stone-300 bg-[#e8dfd1] px-1.5 py-1">
                    <span className="inline-flex shrink-0 items-center justify-center rounded border border-stone-300 bg-[#f7f2e8] px-1 py-0.5 text-[9px] font-semibold text-stone-700">
                      {kindIcon(selectedElement.kind)}
                    </span>
                    <p className="min-w-0 flex-1 truncate text-[10px] leading-3.5 text-stone-600">
                      <span className="font-semibold text-stone-800">{selectedElement.label}</span>
                      <span> · {selectedElement.path}</span>
                      {selectedElement.preview ? <span> · {selectedElement.preview}</span> : null}
                    </p>
                    <button
                      type="button"
                      aria-label="Clear selected element"
                      title="Clear selected element"
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-stone-300 bg-[#f7f2e8] text-stone-700 hover:bg-[#efe8dc]"
                      onClick={clearSelectedElement}
                    >
                      <svg viewBox="0 0 20 20" fill="none" className="h-3 w-3" aria-hidden="true">
                        <path
                          d="M5 5L15 15M15 5L5 15"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </div>
                ) : null}

                <div className="flex gap-1.5">
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    onKeyDown={onMessageKeyDown}
                    rows={2}
                    placeholder="Ask the agent to edit text, image URLs, or theme tokens"
                    className="flex-1 resize-none rounded border border-stone-300 bg-[#f4efe6] px-2 py-1.5 text-[12px] leading-4 text-stone-900 outline-none placeholder:text-stone-500 focus:border-stone-500"
                  />
                  <button
                    type="button"
                    onClick={onSend}
                    disabled={!isAuthenticated || sending || !message.trim()}
                    className="rounded border border-stone-500 bg-stone-600 px-3 py-1.5 text-[12px] font-semibold text-stone-100 hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sending ? "Sending" : "Send"}
                  </button>
                </div>
              </footer>
            </>
          ) : (
            <section className="flex min-h-0 flex-1 flex-col p-2 text-[11px] leading-4">
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
                <div className="rounded border border-stone-300 bg-[#f8f3e9]">
                  <div className="border-b border-stone-200 px-2 py-1 font-semibold text-stone-700">
                    Published ({history.published.length})
                  </div>
                  <div className="max-h-40 overflow-auto px-2 py-1.5">
                    {history.published.length > 0 ? (
                      <div className="space-y-1">
                        {history.published.map((item) => (
                          <div
                            key={`pub-${item.id}`}
                            className="flex items-center justify-between gap-2 rounded border border-stone-200 bg-[#f2ecdf] px-2 py-1"
                          >
                            <span className="truncate text-[10px] text-stone-700">
                              {formatHistoryTime(item.createdAt)}
                            </span>
                            <button
                              type="button"
                              className="rounded border border-stone-300 bg-[#f7f2e8] px-1.5 py-0.5 text-[10px] text-stone-700 hover:bg-[#efe8dc]"
                              onClick={() =>
                                onRollback(
                                  { sourceType: "published", sourceId: item.id },
                                  `published snapshot at ${formatHistoryTime(item.createdAt)}`
                                )
                              }
                            >
                              Restore
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-stone-500">No published snapshots.</p>
                    )}
                  </div>
                </div>

                <div className="flex min-h-0 flex-1 flex-col rounded border border-stone-300 bg-[#f8f3e9]">
                  <div className="border-b border-stone-200 px-2 py-1 font-semibold text-stone-700">
                    Checkpoints ({history.checkpoints.length})
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto px-2 py-1.5">
                    {history.checkpoints.length > 0 ? (
                      <div className="space-y-1">
                        {history.checkpoints.map((item) => (
                          <div
                            key={`cp-${item.id}`}
                            className="flex items-start justify-between gap-2 rounded border border-stone-200 bg-[#f2ecdf] px-2 py-1"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[10px] text-stone-700">
                                {formatHistoryTime(item.createdAt)}
                              </p>
                              {item.reason ? (
                                <p className="truncate text-[10px] text-stone-500">{item.reason}</p>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={deletingCheckpointId === item.id}
                                className="rounded border border-stone-300 bg-[#f7f2e8] px-1.5 py-0.5 text-[10px] text-stone-700 hover:bg-[#efe8dc] disabled:cursor-not-allowed disabled:opacity-50"
                                onClick={() =>
                                  onRollback(
                                    { sourceType: "checkpoint", sourceId: item.id },
                                    `checkpoint at ${formatHistoryTime(item.createdAt)}`
                                  )
                                }
                              >
                                Restore
                              </button>
                              <button
                                type="button"
                                aria-label="Delete checkpoint"
                                title="Delete checkpoint"
                                disabled={deletingCheckpointId === item.id}
                                className="inline-flex h-6 w-6 items-center justify-center rounded border border-stone-300 bg-[#f7f2e8] text-stone-700 hover:bg-[#efe8dc] disabled:cursor-not-allowed disabled:opacity-50"
                                onClick={() => {
                                  void onDeleteCheckpoint(item);
                                }}
                              >
                                <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
                                  <path
                                    d="M4.5 5.5H15.5M8 3.75H12M7 7.5V13.5M10 7.5V13.5M13 7.5V13.5M6.5 5.5L7 15C7.03 15.6 7.53 16.08 8.13 16.08H11.87C12.47 16.08 12.97 15.6 13 15L13.5 5.5"
                                    stroke="currentColor"
                                    strokeWidth="1.4"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-stone-500">No checkpoints yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 right-4 z-[100] rounded-full border border-stone-600 bg-stone-700 px-4 py-2 text-[12px] font-semibold text-stone-100 shadow-xl hover:bg-stone-800"
          style={{
            fontFamily:
              "var(--font-ibm-plex-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
          }}
        >
          Chat to Webmaster
        </button>
      )}
    </>
  );
}
