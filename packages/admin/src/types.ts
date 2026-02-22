import type { Session } from "@supabase/supabase-js";
import type { SelectedElementContext } from "@webmaster-droid/contracts";

export type AdminAuthToken = string | null | undefined;

export type ModelOption = {
  id: string;
  label: string;
};

export type WebmasterDroidConfig = {
  apiBaseUrl?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  modeQueryParam?: string;
  modeQueryValue?: string;
  modeStorageKey?: string;
  defaultModelId?: string;
};

export type ResolvedWebmasterDroidConfig = {
  apiBaseUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  modeQueryParam: string;
  modeQueryValue: string;
  modeStorageKey: string;
  defaultModelId: string;
};

export type WebmasterDroidContextValue = {
  config: ResolvedWebmasterDroidConfig;
  isAdminMode: boolean;
  session: Session | null;
  token: string | null;
  isAuthenticated: boolean;
  modelId: string | null;
  setModelId: (modelId: string) => void;
  showModelPicker: boolean;
  modelOptions: ModelOption[];
  includeThinking: boolean;
  setIncludeThinking: (value: boolean) => void;
  refreshKey: number;
  requestRefresh: () => void;
  authConfigured: boolean;
  selectedElement: SelectedElementContext | null;
  setSelectedElement: (value: SelectedElementContext | null) => void;
  clearSelectedElement: () => void;
};
