"use client";

export {
  EditableImage,
  EditableLink,
  EditableProvider,
  EditableRichText,
  EditableText,
  editableMeta,
  parseSelectedEditableFromTarget,
  useEditableDocument,
} from "./editables";

export { buildApiUrl, resolveWebmasterDroidConfig } from "./config";
export { WebmasterDroidProvider, useWebmasterDroid } from "./context";
export { WebmasterDroidOverlay } from "./overlay";
export { WebmasterDroidRuntime, useWebmasterDroidCmsDocument } from "./runtime";
export { getSupabaseBrowserClient } from "./supabase-client";
export type { WebmasterDroidOverlayProps } from "./overlay";
export type { WebmasterDroidCmsContextValue, WebmasterDroidRuntimeProps } from "./runtime";

export {
  deleteCheckpoint,
  fetchCmsContent,
  fetchHistory,
  fetchModels,
  publishDraft,
  rollbackDraft,
  streamChat,
} from "./api";

export type {
  ModelOption,
  ResolvedWebmasterDroidConfig,
  WebmasterDroidConfig,
  WebmasterDroidContextValue,
} from "./types";
