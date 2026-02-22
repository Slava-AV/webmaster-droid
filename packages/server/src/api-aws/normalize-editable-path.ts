const EDITABLE_ROOTS = ["pages.", "layout.", "seo.", "themeTokens."] as const;
const MAX_PATH_LENGTH = 320;

export function normalizeEditablePath(value: unknown): string | null {
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
