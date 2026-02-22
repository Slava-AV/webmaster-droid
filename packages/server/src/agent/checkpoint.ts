import {
  type PatchOperation,
  requiresStrictImageValidation,
  type ThemeTokens,
} from "@webmaster-droid/contracts";

const CHECKPOINT_REASON_MAX_LENGTH = 96;

function clampCheckpointReason(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= CHECKPOINT_REASON_MAX_LENGTH) {
    return compact;
  }

  return `${compact.slice(0, CHECKPOINT_REASON_MAX_LENGTH - 3).trimEnd()}...`;
}

export function normalizeCheckpointReasonHint(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const compact = clampCheckpointReason(value);
  if (!compact) {
    return null;
  }

  if (
    /^agent-(content|theme)-edit$/i.test(compact) ||
    /^agent-image-generate$/i.test(compact) ||
    /^agent-turn-edit$/i.test(compact) ||
    /^update$/i.test(compact) ||
    /^edit$/i.test(compact) ||
    /^changes?$/i.test(compact)
  ) {
    return null;
  }

  return compact;
}

function pluralize(count: number, singular: string, plural?: string): string {
  if (count === 1) {
    return singular;
  }

  return plural ?? `${singular}s`;
}

function scopeFromContentPath(path: string): string {
  const segments = path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);

  if (segments[0] === "pages" && segments[1]) {
    return segments[1];
  }

  if (segments[0] === "layout") {
    return "layout";
  }

  if (segments[0] === "seo" && segments[1]) {
    return `seo ${segments[1]}`;
  }

  if (segments[0] === "seo") {
    return "seo";
  }

  return "site";
}

function summarizeContentScopes(paths: string[]): string {
  const orderedScopes: string[] = [];
  const seen = new Set<string>();

  for (const path of paths) {
    const scope = scopeFromContentPath(path);
    if (seen.has(scope)) {
      continue;
    }

    seen.add(scope);
    orderedScopes.push(scope);
  }

  if (orderedScopes.length === 0) {
    return "site";
  }

  if (orderedScopes.length === 1) {
    return orderedScopes[0];
  }

  if (orderedScopes.length === 2) {
    return `${orderedScopes[0]} and ${orderedScopes[1]}`;
  }

  return "multiple sections";
}

export function resolveCheckpointReason(input: {
  reasonHints: string[];
  contentOperations: PatchOperation[];
  themeTokens: Partial<ThemeTokens>;
}): string {
  const hinted = input.reasonHints.at(-1);
  if (hinted) {
    return hinted;
  }

  const contentPaths = input.contentOperations.map((operation) => operation.path);
  const contentCount = contentPaths.length;
  const themeCount = Object.keys(input.themeTokens).length;
  const hasContent = contentCount > 0;
  const hasTheme = themeCount > 0;

  if (!hasContent && !hasTheme) {
    return "Apply CMS updates";
  }

  if (hasContent && hasTheme) {
    const scope = summarizeContentScopes(contentPaths);
    const base =
      scope === "multiple sections"
        ? `Update content across multiple sections and ${themeCount} theme ${pluralize(themeCount, "token")}`
        : `Update ${scope} content and ${themeCount} theme ${pluralize(themeCount, "token")}`;
    return clampCheckpointReason(base);
  }

  if (hasContent) {
    const scope = summarizeContentScopes(contentPaths);
    const hasAnyImageChange = contentPaths.some((path) => requiresStrictImageValidation(path));
    const imageOnlyChanges = contentPaths.every((path) => requiresStrictImageValidation(path));

    if (imageOnlyChanges) {
      const base =
        scope === "multiple sections"
          ? `Update ${contentCount} ${pluralize(contentCount, "image")} across multiple sections`
          : `Update ${scope} ${pluralize(contentCount, "image")}`;
      return clampCheckpointReason(base);
    }

    if (hasAnyImageChange) {
      const base =
        scope === "multiple sections"
          ? "Update content and images across multiple sections"
          : `Update ${scope} content and images`;
      return clampCheckpointReason(base);
    }

    const base =
      scope === "multiple sections"
        ? "Update content across multiple sections"
        : `Update ${scope} content`;
    return clampCheckpointReason(base);
  }

  return clampCheckpointReason(
    `Update ${themeCount} theme ${pluralize(themeCount, "token")}`
  );
}
