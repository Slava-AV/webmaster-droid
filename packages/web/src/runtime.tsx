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

import {
  createDefaultCmsDocument,
  type CmsDocument,
} from "@webmaster-droid/contracts";
import { EditableProvider } from "./editables";

import { fetchCmsContent } from "./api";
import { WebmasterDroidProvider, useWebmasterDroid } from "./context";
import { WebmasterDroidOverlay } from "./overlay";
import type { WebmasterDroidConfig } from "./types";

type AnyCmsDocument = CmsDocument<object, object, string>;

export type WebmasterDroidCmsContextValue<
  TDocument extends AnyCmsDocument = AnyCmsDocument,
> = {
  document: TDocument;
  stage: "live" | "draft";
  loading: boolean;
  error: string | null;
};

type CmsRuntimeBridgeProps<TDocument extends AnyCmsDocument> = {
  children: ReactNode;
  fallbackDocument?: TDocument;
  includeOverlay: boolean;
  applyThemeTokens: boolean;
};

type RuntimeState<TDocument extends AnyCmsDocument> = {
  requestKey: string;
  document: TDocument;
  error: string | null;
};

const CmsRuntimeContext = createContext<WebmasterDroidCmsContextValue<AnyCmsDocument> | null>(null);

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

function CmsRuntimeBridge<TDocument extends AnyCmsDocument>(
  props: CmsRuntimeBridgeProps<TDocument>
) {
  const { config, isAdminMode, isAuthenticated, token, refreshKey } = useWebmasterDroid();
  const defaultDocument = useMemo<TDocument>(
    () => (props.fallbackDocument ?? (createDefaultCmsDocument() as TDocument)),
    [props.fallbackDocument]
  );

  const stage = useMemo<"live" | "draft">(
    () => (isAdminMode && isAuthenticated ? "draft" : "live"),
    [isAdminMode, isAuthenticated]
  );

  const requestKey = useMemo(
    () => `${stage}:${token ?? "anon"}:${refreshKey}`,
    [refreshKey, stage, token]
  );

  const [state, setState] = useState<RuntimeState<TDocument>>({
    requestKey: "",
    document: defaultDocument,
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
          document: content as TDocument,
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
          document: defaultDocument,
          error: message,
        });
      });

    return () => {
      ignore = true;
    };
  }, [config.apiBaseUrl, defaultDocument, requestKey, stage, token]);

  const loading = state.requestKey !== requestKey;
  const error = loading ? null : state.error;

  const value = useMemo<WebmasterDroidCmsContextValue<TDocument>>(
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

export function WebmasterDroidRuntime<TDocument extends AnyCmsDocument = AnyCmsDocument>(props: {
  children: ReactNode;
  fallbackDocument?: TDocument;
  config?: WebmasterDroidConfig;
  includeOverlay?: boolean;
  applyThemeTokens?: boolean;
}) {
  return (
    <WebmasterDroidProvider config={props.config}>
      <CmsRuntimeBridge<TDocument>
        fallbackDocument={props.fallbackDocument}
        includeOverlay={props.includeOverlay ?? true}
        applyThemeTokens={props.applyThemeTokens ?? true}
      >
        {props.children}
      </CmsRuntimeBridge>
    </WebmasterDroidProvider>
  );
}

export function useWebmasterDroidCmsDocument<
  TDocument extends AnyCmsDocument = AnyCmsDocument,
>(): WebmasterDroidCmsContextValue<TDocument> {
  const context = useContext(CmsRuntimeContext);
  if (!context) {
    throw new Error("useWebmasterDroidCmsDocument must be used within <WebmasterDroidRuntime>");
  }

  return context as WebmasterDroidCmsContextValue<TDocument>;
}
