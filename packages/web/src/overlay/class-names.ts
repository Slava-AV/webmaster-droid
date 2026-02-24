export const OVERLAY_CLASS_NAMES = {
  panel: "wmd-panel",
  launcherButton: "wmd-launcher",
  header: "wmd-header",
  headerRow: "wmd-header-row",
  publishState: "wmd-publish-state",
  publishStatePublished: "wmd-publish-state--published",
  publishStateUnpublished: "wmd-publish-state--unpublished",
  publishButton: "wmd-publish-button",
  tabs: "wmd-tabs",
  tabButton: "wmd-tab-button",
  tabButtonActive: "wmd-tab-button--active",
  loginTitle: "wmd-login-title",
  headerActions: "wmd-header-actions",
  iconButton: "wmd-icon-button",
  icon: "wmd-icon",
  closeButton: "wmd-close-button",
  loginSection: "wmd-login-section",
  loginWarning: "wmd-login-warning",
  loginCard: "wmd-login-card",
  loginHeading: "wmd-login-heading",
  loginFields: "wmd-login-fields",
  fieldInput: "wmd-field-input",
  primaryButton: "wmd-primary-button",
  chatSection: "wmd-chat-section",
  message: "wmd-message",
  messageTool: "wmd-message--tool",
  messageUser: "wmd-message--user",
  messageThinking: "wmd-message--thinking",
  messageAssistant: "wmd-message--assistant",
  messageFallback: "wmd-message--fallback",
  assistantAvatar: "wmd-assistant-avatar",
  assistantAvatarFallback: "wmd-assistant-avatar-fallback",
  assistantAvatarPending: "wmd-assistant-avatar--pending",
  markdownContent: "wmd-markdown-content",
  pendingShim: "wmd-pending-shim",
  footer: "wmd-footer",
  modelRow: "wmd-model-row",
  modelLabel: "wmd-model-label",
  modelSelect: "wmd-model-select",
  selectedElement: "wmd-selected-element",
  selectedKind: "wmd-selected-kind",
  selectedText: "wmd-selected-text",
  selectedLabel: "wmd-selected-label",
  selectedClearButton: "wmd-selected-clear",
  selectedClearIcon: "wmd-selected-clear-icon",
  composerRow: "wmd-composer-row",
  composerInput: "wmd-composer-input",
  sendButton: "wmd-send-button",
  historySection: "wmd-history-section",
  historyColumns: "wmd-history-columns",
  historyCard: "wmd-history-card",
  historyCardTitle: "wmd-history-card-title",
  historyList: "wmd-history-list",
  historyStack: "wmd-history-stack",
  historyItem: "wmd-history-item",
  historyItemCheckpoint: "wmd-history-item--checkpoint",
  historyTextBlock: "wmd-history-text",
  historyTimestamp: "wmd-history-timestamp",
  historyReason: "wmd-history-reason",
  historyActions: "wmd-history-actions",
  historyAction: "wmd-history-action",
  historyDelete: "wmd-history-delete",
  emptyText: "wmd-empty-text",
} as const;

export type OverlayClassNameSlot = keyof typeof OVERLAY_CLASS_NAMES;

export function overlayClass(slot: OverlayClassNameSlot, className?: string): string {
  if (!className) {
    return OVERLAY_CLASS_NAMES[slot];
  }

  return `${OVERLAY_CLASS_NAMES[slot]} ${className}`;
}

export function joinClassNames(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(" ");
}
