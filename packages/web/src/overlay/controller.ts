"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { REQUIRED_PUBLISH_CONFIRMATION, type RollbackRequest } from "@webmaster-droid/contracts";

import {
  deleteCheckpoint,
  fetchHistory,
  publishDraft,
  rollbackDraft,
  streamChat,
} from "../api";
import { parseSelectedEditableFromTarget } from "../editables";
import { useWebmasterDroid } from "../context";
import { getSupabaseBrowserClient } from "../supabase-client";
import type { ChatMessage, OverlayHistory, OverlayTab } from "./types";
import {
  buildModelHistory,
  createMessage,
  formatHistoryTime,
  historyTimestamp,
  insertBeforePendingMessage,
  removeMessageById,
  resolvePendingAssistant,
  toReadableToolLine,
} from "./utils";

export function useOverlayController() {
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
  const [activeTab, setActiveTab] = useState<OverlayTab>("chat");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [history, setHistory] = useState<OverlayHistory>({ checkpoints: [], published: [] });
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [deletingCheckpointId, setDeletingCheckpointId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [assistantAvatarFailed, setAssistantAvatarFailed] = useState(false);
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
    setAssistantAvatarFailed(false);
  }, [config.assistantAvatarUrl]);

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

  const signInWithPassword = useCallback(async () => {
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
  }, [email, password, supabase]);

  const onSend = useCallback(async () => {
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
      setMessages((prev) => [
        ...removeMessageById(prev, pendingAssistantId),
        createMessage("system", detail),
      ]);
      pendingAssistantIdRef.current = null;
    } finally {
      pendingAssistantIdRef.current = null;
      setSending(false);
    }
  }, [
    config.apiBaseUrl,
    includeThinking,
    message,
    messages,
    modelId,
    requestRefresh,
    refreshHistory,
    selectedElement,
    sending,
    token,
  ]);

  const onPublish = useCallback(async () => {
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
  }, [config.apiBaseUrl, requestRefresh, refreshHistory, token]);

  const onRollback = useCallback(
    async (request: RollbackRequest, label: string) => {
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
    },
    [config.apiBaseUrl, requestRefresh, refreshHistory, token]
  );

  const onDeleteCheckpoint = useCallback(
    async (checkpoint: { id: string; createdAt: string; reason: string }) => {
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
    },
    [config.apiBaseUrl, deletingCheckpointId, refreshHistory, token]
  );

  const onClearChat = useCallback(() => {
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
  }, [clearSelectedElement, message, messages.length, selectedElement, sending]);

  const onMessageKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
        return;
      }

      event.preventDefault();
      if (!isAuthenticated || sending || !message.trim()) {
        return;
      }

      void onSend();
    },
    [isAuthenticated, message, onSend, sending]
  );

  const latestPublished = useMemo(
    () =>
      history.published.reduce<number | null>((max, item) => {
        const value = historyTimestamp(item.createdAt);
        if (value === null) {
          return max;
        }

        return max === null ? value : Math.max(max, value);
      }, null),
    [history.published]
  );

  const latestCheckpoint = useMemo(
    () =>
      history.checkpoints.reduce<number | null>((max, item) => {
        const value = historyTimestamp(item.createdAt);
        if (value === null) {
          return max;
        }

        return max === null ? value : Math.max(max, value);
      }, null),
    [history.checkpoints]
  );

  const publishState: "Published" | "Unpublished" =
    latestCheckpoint !== null && (latestPublished === null || latestCheckpoint > latestPublished)
      ? "Unpublished"
      : "Published";
  const assistantAvatarFallbackLabel = (config.assistantAvatarFallback || "W")
    .trim()
    .charAt(0)
    .toUpperCase() || "W";
  const showAssistantAvatarImage = Boolean(config.assistantAvatarUrl) && !assistantAvatarFailed;

  return {
    isAdminMode,
    isAuthenticated,
    authConfigured,
    isOpen,
    setIsOpen,
    activeTab,
    setActiveTab,
    overlayRootRef,
    chatEndRef,
    publishState,
    selectableModels: modelOptions,
    showModelPicker,
    modelId,
    setModelId,
    includeThinking,
    selectedElement,
    clearSelectedElement,
    email,
    setEmail,
    password,
    setPassword,
    signingIn,
    signInWithPassword,
    message,
    setMessage,
    messages,
    sending,
    onSend,
    onPublish,
    onRollback,
    history,
    deletingCheckpointId,
    onDeleteCheckpoint,
    onClearChat,
    onMessageKeyDown,
    assistantAvatarFallbackLabel,
    showAssistantAvatarImage,
    assistantAvatarUrl: config.assistantAvatarUrl,
    setAssistantAvatarFailed,
    clearChatDisabled:
      sending || (messages.length === 0 && !message.trim() && !selectedElement),
  };
}
