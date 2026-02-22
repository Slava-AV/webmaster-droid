export type OverlayTab = "chat" | "history";

export type ChatMessageRole = "user" | "assistant" | "thinking" | "system" | "tool";

export type ChatMessageStatus = "pending" | "final";

export type ChatMessage = {
  id: string;
  role: ChatMessageRole;
  text: string;
  status?: ChatMessageStatus;
};

export type HistoryCheckpoint = {
  id: string;
  createdAt: string;
  reason: string;
};

export type PublishedSnapshot = {
  id: string;
  createdAt: string;
};

export type OverlayHistory = {
  checkpoints: HistoryCheckpoint[];
  published: PublishedSnapshot[];
};
