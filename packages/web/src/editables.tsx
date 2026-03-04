import React, {
  createContext,
  createElement,
  useContext,
  type HTMLAttributes,
  type ImgHTMLAttributes,
  type ReactNode,
} from "react";
import sanitizeHtml from "sanitize-html";

import type { CmsDocument, SelectedElementContext, SelectedElementKind } from "@webmaster-droid/contracts";

const EDITABLE_ROOTS = ["pages.", "layout.", "seo.", "themeTokens."] as const;
const MAX_PATH_LENGTH = 320;
const MAX_LABEL_LENGTH = 120;
const MAX_PREVIEW_LENGTH = 140;
const warnedInvalidPaths = new Set<string>();
type AnyCmsDocument = CmsDocument<object, object, string>;
const RICH_TEXT_ALLOWED_TAGS = [
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "strong",
  "u",
  "ul",
] as const;
const RICH_TEXT_ALLOWED_ATTRS = ["href", "title", "aria-label", "rel"] as const;

type EditableMode = "live" | "draft";

interface EditableContextValue {
  document: AnyCmsDocument;
  mode: EditableMode;
  enabled: boolean;
}

const EditableContext = createContext<EditableContextValue | null>(null);

export function EditableProvider(props: {
  document: AnyCmsDocument;
  mode?: EditableMode;
  enabled?: boolean;
  children: ReactNode;
}) {
  return (
    <EditableContext.Provider
      value={{
        document: props.document,
        mode: props.mode ?? "live",
        enabled: props.enabled ?? true,
      }}
    >
      {props.children}
    </EditableContext.Provider>
  );
}

export function useEditableDocument() {
  const context = useContext(EditableContext);
  if (!context) {
    throw new Error("useEditableDocument must be used within <EditableProvider>");
  }

  return context;
}

function splitPath(path: string): string[] {
  return path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function readByPath(input: unknown, path: string): unknown {
  const segments = splitPath(path);
  let current: unknown = input;

  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (Number.isNaN(index)) {
        return undefined;
      }
      current = current[index];
      continue;
    }

    if (typeof current !== "object" || current === null) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function normalizeEditablePath(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_PATH_LENGTH) {
    return null;
  }

  if (!EDITABLE_ROOTS.some((prefix) => trimmed.startsWith(prefix))) {
    return null;
  }

  return trimmed;
}

function warnInvalidEditablePath(
  componentName: string,
  propName: string,
  value: unknown
) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const rawValue =
    typeof value === "string"
      ? value
      : (() => {
          try {
            return JSON.stringify(value);
          } catch {
            return String(value);
          }
        })();

  const key = `${componentName}:${propName}:${rawValue}`;
  if (warnedInvalidPaths.has(key)) {
    return;
  }
  warnedInvalidPaths.add(key);

  console.warn(
    `[webmaster-droid] ${componentName} received ${propName}="${rawValue}", but editable paths must start with one of: ${EDITABLE_ROOTS.join(", ")}. This field will stay fallback-only and will be skipped by \`webmaster-droid seed\`.`
  );
}

function normalizeShortText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) {
    return null;
  }

  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 3)}...`;
}

function normalizeKind(value: unknown): SelectedElementKind | null {
  if (value === "text" || value === "image" || value === "link" || value === "section") {
    return value;
  }

  return null;
}

function normalizeRelatedPaths(value: unknown, componentName?: string): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const out = new Set<string>();
  for (const item of value) {
    const normalized = normalizeEditablePath(item);
    if (normalized) {
      out.add(normalized);
      continue;
    }

    if (componentName) {
      warnInvalidEditablePath(componentName, "relatedPaths", item);
    }
  }

  return Array.from(out);
}

function normalizePagePath(value: unknown): string {
  if (typeof value !== "string") {
    return "/";
  }

  const [withoutQuery] = value.split(/[?#]/, 1);
  const trimmed = withoutQuery?.trim() ?? "";

  if (!trimmed.startsWith("/")) {
    return "/";
  }

  return trimmed || "/";
}

export type EditableMetaInput = {
  path: string;
  label: string;
  kind: SelectedElementKind;
  relatedPaths?: string[];
  preview?: string;
  componentName?: string;
};

export function editableMeta(input: EditableMetaInput): Record<string, string> {
  const path = normalizeEditablePath(input.path);
  const label = normalizeShortText(input.label, MAX_LABEL_LENGTH);
  const kind = normalizeKind(input.kind);

  if (!path && input.componentName) {
    warnInvalidEditablePath(input.componentName, "path", input.path);
  }

  if (!path || !label || !kind) {
    return {};
  }

  const attrs: Record<string, string> = {
    "data-wmd-path": path,
    "data-wmd-label": label,
    "data-wmd-kind": kind,
  };

  const relatedPaths = normalizeRelatedPaths(input.relatedPaths ?? [], input.componentName);
  if (relatedPaths.length > 0) {
    attrs["data-wmd-related-paths"] = JSON.stringify(relatedPaths);
  }

  const preview = normalizeShortText(input.preview, MAX_PREVIEW_LENGTH);
  if (preview) {
    attrs["data-wmd-preview"] = preview;
  }

  return attrs;
}

export function parseSelectedEditableFromTarget(
  target: EventTarget | null,
  pagePath: string
): SelectedElementContext | null {
  const targetElement =
    target instanceof Element
      ? target
      : target instanceof Node
        ? target.parentElement
        : null;

  if (!targetElement) {
    return null;
  }

  const element = targetElement.closest<HTMLElement>("[data-wmd-path][data-wmd-label][data-wmd-kind]");
  if (!element) {
    return null;
  }

  const path = normalizeEditablePath(element.dataset.wmdPath);
  const label = normalizeShortText(element.dataset.wmdLabel, MAX_LABEL_LENGTH);
  const kind = normalizeKind(element.dataset.wmdKind);

  if (!path || !label || !kind) {
    return null;
  }

  let parsedRelated: unknown = [];
  const rawRelated = element.dataset.wmdRelatedPaths;
  if (rawRelated) {
    try {
      parsedRelated = JSON.parse(rawRelated);
    } catch {
      parsedRelated = [];
    }
  }

  const relatedPaths = normalizeRelatedPaths(parsedRelated);
  const preview = normalizeShortText(element.dataset.wmdPreview, MAX_PREVIEW_LENGTH);

  const selected: SelectedElementContext = {
    path,
    label,
    kind,
    pagePath: normalizePagePath(pagePath),
  };

  if (relatedPaths.length > 0) {
    selected.relatedPaths = relatedPaths;
  }

  if (preview) {
    selected.preview = preview;
  }

  return selected;
}

function pickStringValue(
  document: AnyCmsDocument,
  path: string,
  fallback: string | undefined,
  componentName: string,
  fallbackPropName: string,
  missingBehavior: "throw" | "empty" = "throw"
): string {
  const value = readByPath(document, path);
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  if (typeof fallback === "string") {
    return fallback;
  }

  const message = `${componentName} missing content for "${path}". Provide a CMS value or set \`${fallbackPropName}\`.`;
  if (missingBehavior === "empty") {
    console.error(message);
    return "";
  }

  throw new Error(message);
}

function sanitizeRichTextHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [...RICH_TEXT_ALLOWED_TAGS],
    allowedAttributes: {
      a: [...RICH_TEXT_ALLOWED_ATTRS],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
  }) as string;
}

type TagName = keyof React.JSX.IntrinsicElements;

export interface EditableTextProps extends HTMLAttributes<HTMLElement> {
  path: string;
  fallback?: string;
  as?: TagName;
  label?: string;
  relatedPaths?: string[];
}

export function EditableText({
  path,
  fallback,
  as = "span",
  label,
  relatedPaths,
  ...rest
}: EditableTextProps) {
  const { document, enabled } = useEditableDocument();
  const value = pickStringValue(
    document,
    path,
    fallback,
    "EditableText",
    "fallback",
    "empty"
  );

  const attrs = enabled
    ? editableMeta({
        componentName: "EditableText",
        path,
        label: label ?? path,
        kind: "text",
        relatedPaths,
        preview: value,
      })
    : {};

  return createElement(as, { ...rest, ...attrs }, value);
}

export interface EditableRichTextProps extends HTMLAttributes<HTMLElement> {
  path: string;
  fallback?: string;
  as?: TagName;
  label?: string;
}

export function EditableRichText({
  path,
  fallback,
  as = "div",
  label,
  ...rest
}: EditableRichTextProps) {
  const { document, enabled } = useEditableDocument();
  const value = pickStringValue(
    document,
    path,
    fallback,
    "EditableRichText",
    "fallback",
    "empty"
  );
  const sanitizedHtml = sanitizeRichTextHtml(value);

  const attrs = enabled
    ? editableMeta({
        componentName: "EditableRichText",
        path,
        label: label ?? path,
        kind: "section",
        preview: value,
      })
    : {};

  return createElement(as, {
    ...rest,
    ...attrs,
    dangerouslySetInnerHTML: { __html: sanitizedHtml },
  });
}

export interface EditableImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  path: string;
  fallbackSrc?: string;
  altPath?: string;
  fallbackAlt?: string;
  label?: string;
}

export function EditableImage({
  path,
  fallbackSrc,
  altPath,
  fallbackAlt = "",
  label,
  ...rest
}: EditableImageProps) {
  const { document, enabled } = useEditableDocument();
  const src = pickStringValue(
    document,
    path,
    fallbackSrc,
    "EditableImage",
    "fallbackSrc",
    "empty"
  );
  const alt = altPath
    ? pickStringValue(
        document,
        altPath,
        fallbackAlt,
        "EditableImage",
        "fallbackAlt",
        "empty"
      )
    : (fallbackAlt ?? "");

  const attrs = enabled
    ? editableMeta({
        componentName: "EditableImage",
        path,
        label: label ?? path,
        kind: "image",
        relatedPaths: altPath ? [altPath] : [],
        preview: src,
      })
    : {};

  return <img {...rest} {...attrs} src={src} alt={alt} />;
}

export interface EditableLinkProps extends Omit<HTMLAttributes<HTMLAnchorElement>, "children"> {
  hrefPath: string;
  labelPath: string;
  fallbackHref?: string;
  fallbackLabel?: string;
  label?: string;
}

export function EditableLink({
  hrefPath,
  labelPath,
  fallbackHref,
  fallbackLabel,
  label,
  ...rest
}: EditableLinkProps) {
  const { document, enabled } = useEditableDocument();
  const href = pickStringValue(
    document,
    hrefPath,
    fallbackHref,
    "EditableLink",
    "fallbackHref",
    "empty"
  );
  const text = pickStringValue(
    document,
    labelPath,
    fallbackLabel,
    "EditableLink",
    "fallbackLabel",
    "empty"
  );

  const attrs = enabled
    ? editableMeta({
        componentName: "EditableLink",
        path: labelPath,
        label: label ?? labelPath,
        kind: "link",
        relatedPaths: [hrefPath],
        preview: href,
      })
    : {};

  return (
    <a {...rest} {...attrs} href={href}>
      {text}
    </a>
  );
}
