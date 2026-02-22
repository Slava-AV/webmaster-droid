"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import type { CmsDocument } from "@webmaster-droid/contracts";
import { EditableProvider } from "@webmaster-droid/react";

import { fetchCmsContent } from "./api";
import { WebmasterDroidProvider, useWebmasterDroid } from "./context";
import { WebmasterDroidOverlay } from "./overlay";
import type { WebmasterDroidConfig } from "./types";

export type WebmasterDroidCmsContextValue = {
  document: CmsDocument;
  stage: "live" | "draft";
  loading: boolean;
  error: string | null;
};

type CmsRuntimeBridgeProps = {
  children: ReactNode;
  fallbackDocument: CmsDocument;
  includeOverlay: boolean;
  applyThemeTokens: boolean;
};

type RuntimeState = {
  requestKey: string;
  document: CmsDocument;
  error: string | null;
};

const CmsRuntimeContext = createContext<WebmasterDroidCmsContextValue | null>(null);

function createThemeCssVariables(tokens: CmsDocument["themeTokens"]): CSSProperties {
  return {
    ["--brand-primary" as string]: tokens.brandPrimary,
    ["--brand-primary-dark" as string]: tokens.brandPrimaryDark,
    ["--brand-primary-light" as string]: tokens.brandPrimaryLight,
    ["--brand-dark" as string]: tokens.brandDark,
    ["--brand-text" as string]: tokens.brandText,
    ["--brand-surface" as string]: tokens.brandSurface,
    ["--brand-border" as string]: tokens.brandBorder,
  };
}

function CmsRuntimeBridge(props: CmsRuntimeBridgeProps) {
  const { config, isAdminMode, isAuthenticated, token, refreshKey } = useWebmasterDroid();

  const stage = useMemo<"live" | "draft">(
    () => (isAdminMode && isAuthenticated ? "draft" : "live"),
    [isAdminMode, isAuthenticated]
  );

  const requestKey = useMemo(
    () => `${stage}:${token ?? "anon"}:${refreshKey}`,
    [refreshKey, stage, token]
  );

  const [state, setState] = useState<RuntimeState>({
    requestKey: "",
    document: props.fallbackDocument,
    error: null,
  });

  useEffect(() => {
    let ignore = false;

    fetchCmsContent(config.apiBaseUrl, stage, token)
      .then((content) => {
        if (ignore) {
          return;
        }

        setState({
          requestKey,
          document: content,
          error: null,
        });
      })
      .catch((error) => {
        if (ignore) {
          return;
        }

        const message = error instanceof Error ? error.message : "Failed to load content.";
        setState({
          requestKey,
          document: props.fallbackDocument,
          error: message,
        });
      });

    return () => {
      ignore = true;
    };
  }, [config.apiBaseUrl, props.fallbackDocument, requestKey, stage, token]);

  const loading = state.requestKey !== requestKey;
  const error = loading ? null : state.error;

  const value = useMemo<WebmasterDroidCmsContextValue>(
    () => ({
      document: state.document,
      stage,
      loading,
      error,
    }),
    [error, loading, stage, state.document]
  );

  const content = props.applyThemeTokens ? (
    <div style={createThemeCssVariables(value.document.themeTokens)}>{props.children}</div>
  ) : (
    props.children
  );

  return (
    <CmsRuntimeContext.Provider value={value}>
      <EditableProvider document={value.document} mode={stage} enabled={isAdminMode}>
        {content}
      </EditableProvider>
      {props.includeOverlay ? <WebmasterDroidOverlay /> : null}
    </CmsRuntimeContext.Provider>
  );
}

export function WebmasterDroidRuntime(props: {
  children: ReactNode;
  fallbackDocument: CmsDocument;
  config?: WebmasterDroidConfig;
  includeOverlay?: boolean;
  applyThemeTokens?: boolean;
}) {
  return (
    <WebmasterDroidProvider config={props.config}>
      <CmsRuntimeBridge
        fallbackDocument={props.fallbackDocument}
        includeOverlay={props.includeOverlay ?? true}
        applyThemeTokens={props.applyThemeTokens ?? true}
      >
        {props.children}
      </CmsRuntimeBridge>
    </WebmasterDroidProvider>
  );
}

export function useWebmasterDroidCmsDocument(): WebmasterDroidCmsContextValue {
  const context = useContext(CmsRuntimeContext);
  if (!context) {
    throw new Error("useWebmasterDroidCmsDocument must be used within <WebmasterDroidRuntime>");
  }

  return context;
}
