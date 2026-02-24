import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { SelectedElementContext } from "@webmaster-droid/contracts";
import { joinClassNames, overlayClass } from "./class-names";
import { kindIcon, OVERLAY_FONT_FAMILY, formatHistoryTime } from "./utils";
import type {
  ChatMessage,
  HistoryCheckpoint,
  OverlayHistory,
  OverlayTab,
  PublishedSnapshot,
} from "./types";

type OverlayHeaderProps = {
  isAuthenticated: boolean;
  publishState: "Published" | "Unpublished";
  activeTab: OverlayTab;
  historyCount: number;
  clearChatDisabled: boolean;
  onPublish: () => void;
  onTabChange: (tab: OverlayTab) => void;
  onClearChat: () => void;
  onClose: () => void;
};

export function OverlayHeader({
  isAuthenticated,
  publishState,
  activeTab,
  historyCount,
  clearChatDisabled,
  onPublish,
  onTabChange,
  onClearChat,
  onClose,
}: OverlayHeaderProps) {
  return (
    <header className={overlayClass("header", "border-b border-stone-300 bg-[#f3eee5] p-2")}>
      <div className={overlayClass("headerRow", "flex items-center gap-2")}>
        {isAuthenticated ? (
          <>
            <span
              className={joinClassNames(
                overlayClass("publishState", "rounded border px-1.5 py-0.5 text-[10px] font-medium leading-4"),
                publishState === "Published"
                  ? overlayClass("publishStatePublished", "border-stone-300 bg-[#ece5d9] text-stone-600")
                  : overlayClass("publishStateUnpublished", "border-stone-500 bg-[#ded4c3] text-stone-800")
              )}
            >
              {publishState}
            </span>
            <button
              type="button"
              className={overlayClass(
                "publishButton",
                "rounded border border-stone-700 bg-stone-800 px-2 py-1 text-[11px] font-semibold leading-4 text-stone-100 hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
              )}
              onClick={onPublish}
              disabled={!isAuthenticated}
            >
              Publish
            </button>
            <div className={overlayClass("tabs", "inline-flex rounded-md border border-stone-300 bg-[#e8dfd1] p-0.5")}>
              <button
                type="button"
                className={joinClassNames(
                  overlayClass("tabButton", "rounded px-2 py-1 text-[11px] font-medium leading-4"),
                  activeTab === "chat"
                    ? overlayClass("tabButtonActive", "bg-[#f7f2e8] text-stone-900 shadow-sm")
                    : "text-stone-600 hover:text-stone-900"
                )}
                onClick={() => onTabChange("chat")}
              >
                Chat
              </button>
              <button
                type="button"
                className={joinClassNames(
                  overlayClass("tabButton", "rounded px-2 py-1 text-[11px] font-medium leading-4"),
                  activeTab === "history"
                    ? overlayClass("tabButtonActive", "bg-[#f7f2e8] text-stone-900 shadow-sm")
                    : "text-stone-600 hover:text-stone-900"
                )}
                onClick={() => onTabChange("history")}
              >
                History ({historyCount})
              </button>
            </div>
          </>
        ) : (
          <h2 className={overlayClass("loginTitle", "text-[12px] font-semibold text-stone-700")}>Login</h2>
        )}
        <div className={overlayClass("headerActions", "ml-auto flex items-center gap-1")}>
          {isAuthenticated ? (
            <button
              type="button"
              aria-label="Clear chat"
              title="Clear chat"
              disabled={clearChatDisabled}
              className={overlayClass(
                "iconButton",
                "inline-flex h-6 w-6 items-center justify-center rounded border border-stone-300 text-stone-600 hover:bg-[#efe8dc] hover:text-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
              )}
              onClick={onClearChat}
            >
              <svg
                viewBox="0 0 20 20"
                fill="none"
                className={overlayClass("icon", "h-3.5 w-3.5")}
                aria-hidden="true"
              >
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
            className={overlayClass(
              "closeButton",
              "rounded border border-stone-300 px-2 py-1 text-[11px] leading-4 text-stone-700 hover:bg-[#efe8dc]"
            )}
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </header>
  );
}

type OverlayLoginPanelProps = {
  authConfigured: boolean;
  email: string;
  password: string;
  signingIn: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSignIn: () => void;
};

export function OverlayLoginPanel({
  authConfigured,
  email,
  password,
  signingIn,
  onEmailChange,
  onPasswordChange,
  onSignIn,
}: OverlayLoginPanelProps) {
  return (
    <section
      className={overlayClass(
        "loginSection",
        "flex min-h-0 flex-1 items-center justify-center bg-[#ece7dd] p-3"
      )}
    >
      {!authConfigured ? (
        <div
          className={overlayClass(
            "loginWarning",
            "w-full max-w-sm rounded border border-red-300 bg-[#f8f3e9] p-3 text-[11px] leading-4 text-red-700"
          )}
        >
          Missing Supabase config (`supabaseUrl` / `supabaseAnonKey`).
        </div>
      ) : (
        <div className={overlayClass("loginCard", "w-full max-w-sm rounded border border-stone-300 bg-[#f8f3e9] p-3")}>
          <h3 className={overlayClass("loginHeading", "mb-2 text-[12px] font-semibold text-stone-700")}>
            Sign in
          </h3>
          <div className={overlayClass("loginFields", "space-y-2")}>
            <input
              type="text"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder="login"
              className={overlayClass(
                "fieldInput",
                "w-full rounded border border-stone-300 bg-[#f4efe6] px-2 py-1.5 text-[12px] text-stone-900 outline-none focus:border-stone-500"
              )}
            />
            <input
              type="password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder="Password"
              className={overlayClass(
                "fieldInput",
                "w-full rounded border border-stone-300 bg-[#f4efe6] px-2 py-1.5 text-[12px] text-stone-900 outline-none focus:border-stone-500"
              )}
            />
            <button
              type="button"
              onClick={onSignIn}
              disabled={signingIn || !email.trim() || !password}
              className={overlayClass(
                "primaryButton",
                "w-full rounded border border-stone-700 bg-stone-800 px-2 py-1.5 text-[12px] font-medium text-stone-100 hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
              )}
            >
              {signingIn ? "Signing in" : "Sign in"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

type OverlayChatPanelProps = {
  messages: ChatMessage[];
  chatEndRef: RefObject<HTMLDivElement | null>;
  showAssistantAvatarImage: boolean;
  assistantAvatarUrl: string;
  assistantAvatarFallbackLabel: string;
  onAssistantAvatarError: () => void;
  showModelPicker: boolean;
  selectableModels: Array<{ id: string; label: string }>;
  modelId: string | null;
  sending: boolean;
  onModelChange: (value: string) => void;
  selectedElement: SelectedElementContext | null;
  onClearSelectedElement: () => void;
  message: string;
  onMessageChange: (value: string) => void;
  onMessageKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  isAuthenticated: boolean;
};

export function OverlayChatPanel({
  messages,
  chatEndRef,
  showAssistantAvatarImage,
  assistantAvatarUrl,
  assistantAvatarFallbackLabel,
  onAssistantAvatarError,
  showModelPicker,
  selectableModels,
  modelId,
  sending,
  onModelChange,
  selectedElement,
  onClearSelectedElement,
  message,
  onMessageChange,
  onMessageKeyDown,
  onSend,
  isAuthenticated,
}: OverlayChatPanelProps) {
  return (
    <>
      <section className={overlayClass("chatSection", "flex-1 space-y-1 overflow-auto bg-[#ece7dd] p-2")}>
        {messages.map((entry) => {
          const isAssistant = entry.role === "assistant";
          const isPendingAssistant = isAssistant && entry.status === "pending";

          return (
            <div
              key={entry.id}
              className={joinClassNames(
                overlayClass("message"),
                entry.role === "tool"
                  ? overlayClass("messageTool", "max-w-[96%] px-0.5 py-0 text-[10px] leading-tight text-stone-500")
                  : entry.role === "user"
                    ? overlayClass(
                        "messageUser",
                        "ml-auto max-w-[92%] rounded-md bg-[#2e2b27] px-2 py-1.5 text-[12px] leading-4 text-stone-50"
                      )
                    : entry.role === "thinking"
                      ? overlayClass(
                          "messageThinking",
                          "max-w-[92%] rounded-md bg-[#e3dbce] px-2 py-1.5 text-[12px] leading-4 text-stone-700"
                        )
                      : isAssistant
                        ? overlayClass(
                            "messageAssistant",
                            "relative max-w-[92%] rounded-md border border-[#d6ccbb] bg-[#f8f3e9] pl-8 pr-2 py-1.5 text-[12px] leading-4 text-stone-800"
                          )
                        : overlayClass(
                            "messageFallback",
                            "max-w-[92%] rounded-md bg-[#ddd2bf] px-2 py-1.5 text-[12px] leading-4 text-stone-800"
                          )
              )}
            >
              {entry.role === "tool" ? (
                <span>{entry.text}</span>
              ) : (
                <>
                  {isAssistant ? (
                    showAssistantAvatarImage ? (
                      <img
                        src={assistantAvatarUrl}
                        alt=""
                        aria-hidden="true"
                        className={joinClassNames(
                          overlayClass(
                            "assistantAvatar",
                            "pointer-events-none absolute left-2 top-1.5 h-[18px] w-[18px] select-none rounded-full border border-[#d6ccbb] bg-[#efe8dc] object-cover"
                          ),
                          isPendingAssistant ? overlayClass("assistantAvatarPending", "animate-pulse") : null
                        )}
                        onError={onAssistantAvatarError}
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className={joinClassNames(
                          overlayClass(
                            "assistantAvatarFallback",
                            "pointer-events-none absolute left-2 top-1.5 inline-flex h-[18px] w-[18px] select-none items-center justify-center rounded-full border border-[#d6ccbb] bg-[#efe8dc] text-[9px] font-semibold text-stone-700"
                          ),
                          isPendingAssistant ? overlayClass("assistantAvatarPending", "animate-pulse") : null
                        )}
                      >
                        {assistantAvatarFallbackLabel}
                      </span>
                    )
                  ) : null}
                  <div
                    className={overlayClass(
                      "markdownContent",
                      "max-w-none text-inherit [&_code]:rounded [&_code]:bg-stone-900/10 [&_code]:px-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:mb-1 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-4"
                    )}
                  >
                    {isPendingAssistant && !entry.text.trim() ? (
                      <span className={overlayClass("pendingShim", "block h-4")} aria-hidden="true" />
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

      <footer className={overlayClass("footer", "border-t border-stone-300 bg-[#f3eee5] p-2")}>
        {showModelPicker && selectableModels.length > 1 ? (
          <div className={overlayClass("modelRow", "mb-1 flex items-center gap-1.5")}>
            <label
              htmlFor="admin-model-picker"
              className={overlayClass("modelLabel", "text-[10px] font-semibold uppercase tracking-wide text-stone-600")}
            >
              Model
            </label>
            <select
              id="admin-model-picker"
              value={modelId ?? selectableModels[0]?.id}
              onChange={(event) => onModelChange(event.target.value)}
              disabled={sending}
              className={overlayClass(
                "modelSelect",
                "h-7 min-w-0 flex-1 rounded border border-stone-300 bg-[#f7f2e8] px-2 text-[11px] text-stone-800 outline-none focus:border-stone-500 disabled:cursor-not-allowed disabled:opacity-60"
              )}
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
          <div
            className={overlayClass(
              "selectedElement",
              "mb-1 flex items-center gap-1 rounded border border-stone-300 bg-[#e8dfd1] px-1.5 py-1"
            )}
          >
            <span
              className={overlayClass(
                "selectedKind",
                "inline-flex shrink-0 items-center justify-center rounded border border-stone-300 bg-[#f7f2e8] px-1 py-0.5 text-[9px] font-semibold text-stone-700"
              )}
            >
              {kindIcon(selectedElement.kind)}
            </span>
            <p className={overlayClass("selectedText", "min-w-0 flex-1 truncate text-[10px] leading-3.5 text-stone-600")}>
              <span className={overlayClass("selectedLabel", "font-semibold text-stone-800")}>
                {selectedElement.label}
              </span>
              <span> · {selectedElement.path}</span>
              {selectedElement.preview ? <span> · {selectedElement.preview}</span> : null}
            </p>
            <button
              type="button"
              aria-label="Clear selected element"
              title="Clear selected element"
              className={overlayClass(
                "selectedClearButton",
                "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-stone-300 bg-[#f7f2e8] text-stone-700 hover:bg-[#efe8dc]"
              )}
              onClick={onClearSelectedElement}
            >
              <svg
                viewBox="0 0 20 20"
                fill="none"
                className={overlayClass("selectedClearIcon", "h-3 w-3")}
                aria-hidden="true"
              >
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

        <div className={overlayClass("composerRow", "flex gap-1.5")}>
          <textarea
            value={message}
            onChange={(event) => onMessageChange(event.target.value)}
            onKeyDown={onMessageKeyDown}
            rows={2}
            placeholder="Ask the agent to edit text, image URLs, or theme tokens"
            className={overlayClass(
              "composerInput",
              "flex-1 resize-none rounded border border-stone-300 bg-[#f4efe6] px-2 py-1.5 text-[12px] leading-4 text-stone-900 outline-none placeholder:text-stone-500 focus:border-stone-500"
            )}
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!isAuthenticated || sending || !message.trim()}
            className={overlayClass(
              "sendButton",
              "rounded border border-stone-500 bg-stone-600 px-3 py-1.5 text-[12px] font-semibold text-stone-100 hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            {sending ? "Sending" : "Send"}
          </button>
        </div>
      </footer>
    </>
  );
}

type OverlayHistoryPanelProps = {
  history: OverlayHistory;
  deletingCheckpointId: string | null;
  onRestorePublished: (snapshot: PublishedSnapshot) => void;
  onRestoreCheckpoint: (checkpoint: HistoryCheckpoint) => void;
  onDeleteCheckpoint: (checkpoint: HistoryCheckpoint) => void;
};

export function OverlayHistoryPanel({
  history,
  deletingCheckpointId,
  onRestorePublished,
  onRestoreCheckpoint,
  onDeleteCheckpoint,
}: OverlayHistoryPanelProps) {
  return (
    <section className={overlayClass("historySection", "flex min-h-0 flex-1 flex-col p-2 text-[11px] leading-4")}>
      <div className={overlayClass("historyColumns", "flex min-h-0 flex-1 flex-col gap-2 overflow-hidden")}>
        <div className={overlayClass("historyCard", "rounded border border-stone-300 bg-[#f8f3e9]")}>
          <div className={overlayClass("historyCardTitle", "border-b border-stone-200 px-2 py-1 font-semibold text-stone-700")}>
            Published ({history.published.length})
          </div>
          <div className={overlayClass("historyList", "max-h-40 overflow-auto px-2 py-1.5")}>
            {history.published.length > 0 ? (
              <div className={overlayClass("historyStack", "space-y-1")}>
                {history.published.map((item) => (
                  <div
                    key={`pub-${item.id}`}
                    className={overlayClass(
                      "historyItem",
                      "flex items-center justify-between gap-2 rounded border border-stone-200 bg-[#f2ecdf] px-2 py-1"
                    )}
                  >
                    <span className={overlayClass("historyTimestamp", "truncate text-[10px] text-stone-700")}>
                      {formatHistoryTime(item.createdAt)}
                    </span>
                    <button
                      type="button"
                      className={overlayClass(
                        "historyAction",
                        "rounded border border-stone-300 bg-[#f7f2e8] px-1.5 py-0.5 text-[10px] text-stone-700 hover:bg-[#efe8dc]"
                      )}
                      onClick={() => onRestorePublished(item)}
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className={overlayClass("emptyText", "text-[10px] text-stone-500")}>No published snapshots.</p>
            )}
          </div>
        </div>

        <div
          className={overlayClass(
            "historyCard",
            "flex min-h-0 flex-1 flex-col rounded border border-stone-300 bg-[#f8f3e9]"
          )}
        >
          <div className={overlayClass("historyCardTitle", "border-b border-stone-200 px-2 py-1 font-semibold text-stone-700")}>
            Checkpoints ({history.checkpoints.length})
          </div>
          <div className={overlayClass("historyList", "min-h-0 flex-1 overflow-auto px-2 py-1.5")}>
            {history.checkpoints.length > 0 ? (
              <div className={overlayClass("historyStack", "space-y-1")}>
                {history.checkpoints.map((item) => (
                  <div
                    key={`cp-${item.id}`}
                    className={overlayClass(
                      "historyItemCheckpoint",
                      "flex items-start justify-between gap-2 rounded border border-stone-200 bg-[#f2ecdf] px-2 py-1"
                    )}
                  >
                    <div className={overlayClass("historyTextBlock", "min-w-0 flex-1")}>
                      <p className={overlayClass("historyTimestamp", "truncate text-[10px] text-stone-700")}>
                        {formatHistoryTime(item.createdAt)}
                      </p>
                      {item.reason ? (
                        <p className={overlayClass("historyReason", "truncate text-[10px] text-stone-500")}>
                          {item.reason}
                        </p>
                      ) : null}
                    </div>
                    <div className={overlayClass("historyActions", "flex items-center gap-1")}>
                      <button
                        type="button"
                        disabled={deletingCheckpointId === item.id}
                        className={overlayClass(
                          "historyAction",
                          "rounded border border-stone-300 bg-[#f7f2e8] px-1.5 py-0.5 text-[10px] text-stone-700 hover:bg-[#efe8dc] disabled:cursor-not-allowed disabled:opacity-50"
                        )}
                        onClick={() => onRestoreCheckpoint(item)}
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        aria-label="Delete checkpoint"
                        title="Delete checkpoint"
                        disabled={deletingCheckpointId === item.id}
                        className={overlayClass(
                          "historyDelete",
                          "inline-flex h-6 w-6 items-center justify-center rounded border border-stone-300 bg-[#f7f2e8] text-stone-700 hover:bg-[#efe8dc] disabled:cursor-not-allowed disabled:opacity-50"
                        )}
                        onClick={() => onDeleteCheckpoint(item)}
                      >
                        <svg
                          viewBox="0 0 20 20"
                          fill="none"
                          className={overlayClass("icon", "h-3.5 w-3.5")}
                          aria-hidden="true"
                        >
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
              <p className={overlayClass("emptyText", "text-[10px] text-stone-500")}>No checkpoints yet.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

type OverlayLauncherButtonProps = {
  onOpen: () => void;
};

export function OverlayLauncherButton({ onOpen }: OverlayLauncherButtonProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={overlayClass(
        "launcherButton",
        "fixed bottom-4 right-4 z-[100] rounded-full border border-stone-600 bg-stone-700 px-4 py-2 text-[12px] font-semibold text-stone-100 shadow-xl hover:bg-stone-800"
      )}
      style={{ fontFamily: OVERLAY_FONT_FAMILY }}
    >
      Chat to Webmaster
    </button>
  );
}
