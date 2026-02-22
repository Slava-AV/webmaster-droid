import { type ModelMessage } from "ai";

import {
  type CmsDocument,
  type CmsPageId,
  type SelectedElementContext,
} from "@webmaster-droid/contracts";

function normalizeRoutePath(path: string): string | null {
  const trimmed = path.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  const [withoutQuery] = trimmed.split(/[?#]/, 1);
  if (!withoutQuery) {
    return null;
  }

  if (withoutQuery === "/") {
    return "/";
  }

  const normalized = withoutQuery.replace(/\/+$/, "");
  return normalized ? `${normalized}/` : null;
}

export function inferPageIdFromPath(path: string | undefined, draft: CmsDocument): CmsPageId | null {
  if (!path) {
    return null;
  }

  const normalizedPath = normalizeRoutePath(path);
  if (!normalizedPath) {
    return null;
  }

  for (const [pageId, entry] of Object.entries(draft.seo)) {
    const routePath = normalizeRoutePath(entry.path);
    if (routePath && routePath === normalizedPath) {
      return pageId;
    }
  }

  if (normalizedPath === "/" && "home" in draft.pages) {
    return "home";
  }

  return null;
}

export function toHistoryModelMessages(
  history?: Array<{ role: "user" | "assistant"; text: string }>
): ModelMessage[] {
  if (!history || history.length === 0) {
    return [];
  }

  const messages: ModelMessage[] = [];
  for (const turn of history.slice(-12)) {
    if (turn.role === "user") {
      messages.push({
        role: "user",
        content: turn.text,
      });
      continue;
    }

    messages.push({
      role: "assistant",
      content: turn.text,
    });
  }

  return messages;
}

export function formatSelectedElementContext(selectedElement?: SelectedElementContext): string {
  if (!selectedElement) {
    return "No selected element.";
  }

  const lines = [
    `path: ${selectedElement.path}`,
    `label: ${selectedElement.label}`,
    `kind: ${selectedElement.kind}`,
    `pagePath: ${selectedElement.pagePath}`,
  ];

  if (selectedElement.relatedPaths && selectedElement.relatedPaths.length > 0) {
    lines.push(`relatedPaths: ${selectedElement.relatedPaths.join(", ")}`);
  }

  if (selectedElement.preview) {
    lines.push(`preview: ${selectedElement.preview}`);
  }

  return lines.join("\n");
}

const MAX_STRUCTURE_DEPTH = 6;
const MAX_STRUCTURE_KEYS_PER_OBJECT = 18;

function describeStructure(value: unknown, depth = 0): unknown {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    if (depth >= MAX_STRUCTURE_DEPTH) {
      return { type: "array", item: "unknown" };
    }

    return {
      type: "array",
      item: value.length > 0 ? describeStructure(value[0], depth + 1) : "unknown",
    };
  }

  if (typeof value === "object") {
    if (depth >= MAX_STRUCTURE_DEPTH) {
      return "object";
    }

    const out: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>);

    for (let index = 0; index < entries.length; index += 1) {
      if (index >= MAX_STRUCTURE_KEYS_PER_OBJECT) {
        out.__truncatedKeys = `${entries.length - index} more`;
        break;
      }

      const [key, child] = entries[index];
      out[key] = describeStructure(child, depth + 1);
    }

    return out;
  }

  return typeof value;
}

export function previewDocument(document: CmsDocument): string {
  return JSON.stringify(
    {
      pages: describeStructure(document.pages),
      layout: describeStructure(document.layout),
      seo: describeStructure(document.seo),
      themeTokens: describeStructure(document.themeTokens),
    },
    null,
    2
  );
}

export function getByPath(root: unknown, path: string): unknown {
  const trimmed = path.trim();
  if (!trimmed) {
    return root;
  }

  const segments = trimmed
    .replace(/\[(\d+)\]/g, ".$1")
    .replace(/^\./, "")
    .split(".")
    .filter(Boolean);

  let current: unknown = root;
  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (/^\d+$/.test(segment)) {
      if (!Array.isArray(current)) {
        return undefined;
      }
      current = current[Number(segment)];
      continue;
    }

    if (typeof current !== "object") {
      return undefined;
    }

    const record = current as Record<string, unknown>;
    if (!(segment in record)) {
      return undefined;
    }
    current = record[segment];
  }

  return current;
}

function makeSnippet(
  text: string,
  queryLower: string
): { snippet: string; truncated: boolean } {
  const index = text.toLowerCase().indexOf(queryLower);
  if (index < 0) {
    const snippet = text.slice(0, 160);
    return {
      snippet,
      truncated: snippet.length < text.length,
    };
  }

  const start = Math.max(0, index - 60);
  const end = Math.min(text.length, index + queryLower.length + 60);
  return {
    snippet: text.slice(start, end),
    truncated: start > 0 || end < text.length,
  };
}

export function searchDocument(document: CmsDocument, query: string) {
  const hits: Array<{ path: string; snippet: string; snippetTruncated: boolean }> = [];
  const queryLower = query.trim().toLowerCase();
  if (!queryLower) {
    return hits;
  }

  const seen = new Set<string>();
  let pathHitCount = 0;
  const MAX_PATH_HITS = 8;

  const pushHit = (path: string, snippet: string, snippetTruncated: boolean) => {
    if (!path || hits.length >= 20) {
      return;
    }

    const key = `${path}::${snippet}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    hits.push({
      path,
      snippet,
      snippetTruncated,
    });
  };

  const maybePushPathHit = (path: string) => {
    if (!path || pathHitCount >= MAX_PATH_HITS) {
      return;
    }

    const pathLower = path.toLowerCase();
    if (!pathLower.includes(queryLower)) {
      return;
    }

    // If query is an exact object path, avoid flooding with all descendants.
    const isDescendantOfExactQuery =
      pathLower !== queryLower &&
      (pathLower.startsWith(`${queryLower}.`) || pathLower.startsWith(`${queryLower}[`));

    if (isDescendantOfExactQuery) {
      return;
    }

    pathHitCount += 1;
    pushHit(path, `Path match: ${path}`, false);
  };

  const visit = (value: unknown, basePath: string) => {
    maybePushPathHit(basePath);

    if (typeof value === "string") {
      if (value.toLowerCase().includes(queryLower)) {
        const snippet = makeSnippet(value, queryLower);
        pushHit(basePath, snippet.snippet, snippet.truncated);
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        visit(item, `${basePath}[${index}]`);
      });
      return;
    }

    if (value && typeof value === "object") {
      Object.entries(value).forEach(([key, child]) => {
        const nextPath = basePath ? `${basePath}.${key}` : key;
        visit(child, nextPath);
      });
    }
  };

  visit(document, "");
  return hits;
}
