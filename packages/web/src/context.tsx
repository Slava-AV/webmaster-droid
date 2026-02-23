"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import type { SelectedElementContext } from "@webmaster-droid/contracts";

import { fetchModels } from "./api";
import { resolveWebmasterDroidConfig } from "./config";
import { getSupabaseBrowserClient } from "./supabase-client";
import type {
  ModelCapabilities,
  ModelOption,
  WebmasterDroidConfig,
  WebmasterDroidContextValue,
} from "./types";

const WebmasterDroidContext = createContext<WebmasterDroidContextValue | null>(null);

const DEFAULT_MODEL_CAPABILITIES: ModelCapabilities = {
  contentEdit: true,
  themeTokenEdit: true,
  imageGenerate: false,
  imageEdit: false,
  visionAssist: false,
};

export function WebmasterDroidProvider(props: {
  children: ReactNode;
  config?: WebmasterDroidConfig;
}) {
  const resolvedConfig = useMemo(
    () => resolveWebmasterDroidConfig(props.config),
    [props.config]
  );

  const [isAdminMode, setIsAdminMode] = useState(false);

  useEffect(() => {
    const checkMode = () => {
      const params = new URLSearchParams(window.location.search);
      const modeValue = params.get(resolvedConfig.modeQueryParam);
      if (modeValue === resolvedConfig.modeQueryValue) {
        window.sessionStorage.setItem(resolvedConfig.modeStorageKey, "1");
      }

      const persisted = window.sessionStorage.getItem(resolvedConfig.modeStorageKey);
      setIsAdminMode(modeValue === resolvedConfig.modeQueryValue || persisted === "1");
    };

    checkMode();
    window.addEventListener("popstate", checkMode);

    return () => {
      window.removeEventListener("popstate", checkMode);
    };
  }, [resolvedConfig.modeQueryParam, resolvedConfig.modeQueryValue, resolvedConfig.modeStorageKey]);

  const supabase = useMemo(
    () => getSupabaseBrowserClient(resolvedConfig),
    [resolvedConfig]
  );
  const authConfigured = Boolean(supabase);

  const [session, setSession] = useState<Session | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [showModelPickerState, setShowModelPickerState] = useState(false);
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [capabilities, setCapabilities] = useState<ModelCapabilities>(
    DEFAULT_MODEL_CAPABILITIES
  );
  const [includeThinking, setIncludeThinking] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedElement, setSelectedElement] = useState<SelectedElementContext | null>(null);

  useEffect(() => {
    let ignore = false;

    if (!isAdminMode || !supabase) {
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!ignore) {
        setSession(data.session ?? null);
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      ignore = true;
      data.subscription.unsubscribe();
    };
  }, [isAdminMode, supabase]);

  useEffect(() => {
    let ignore = false;

    if (!isAdminMode) {
      return;
    }

    fetchModels(resolvedConfig.apiBaseUrl)
      .then((models) => {
        if (ignore) {
          return;
        }

        const options = models.availableModels ?? [];
        const preferredDefault = options.some((option) => option.id === models.defaultModelId)
          ? models.defaultModelId
          : options[0]?.id ?? models.defaultModelId;

        setShowModelPickerState(models.showModelPicker);
        setModelOptions(options);
        setCapabilities(models.capabilities ?? DEFAULT_MODEL_CAPABILITIES);
        setModelId((current) => {
          if (current && options.some((option) => option.id === current)) {
            return current;
          }

          return preferredDefault;
        });
      })
      .catch(() => {
        if (!ignore) {
          setShowModelPickerState(false);
          setModelOptions([]);
          setCapabilities(DEFAULT_MODEL_CAPABILITIES);
          setModelId((current) => current ?? resolvedConfig.defaultModelId);
        }
      });

    return () => {
      ignore = true;
    };
  }, [isAdminMode, resolvedConfig.apiBaseUrl, resolvedConfig.defaultModelId]);

  const activeSession = isAdminMode ? session : null;
  const showModelPicker = isAdminMode ? showModelPickerState : false;

  const value = useMemo<WebmasterDroidContextValue>(
    () => ({
      config: resolvedConfig,
      isAdminMode,
      session: activeSession,
      token: activeSession?.access_token ?? null,
      isAuthenticated: Boolean(activeSession?.access_token),
      modelId,
      setModelId,
      showModelPicker,
      modelOptions,
      capabilities,
      includeThinking,
      setIncludeThinking,
      refreshKey,
      requestRefresh: () => setRefreshKey((x) => x + 1),
      authConfigured,
      selectedElement,
      setSelectedElement,
      clearSelectedElement: () => setSelectedElement(null),
    }),
    [
      resolvedConfig,
      isAdminMode,
      activeSession,
      modelId,
      showModelPicker,
      modelOptions,
      capabilities,
      includeThinking,
      refreshKey,
      authConfigured,
      selectedElement,
    ]
  );

  return <WebmasterDroidContext.Provider value={value}>{props.children}</WebmasterDroidContext.Provider>;
}

export function useWebmasterDroid(): WebmasterDroidContextValue {
  const context = useContext(WebmasterDroidContext);
  if (!context) {
    throw new Error("useWebmasterDroid must be used within <WebmasterDroidProvider>");
  }

  return context;
}
