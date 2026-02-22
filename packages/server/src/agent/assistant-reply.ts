import { type CmsPageId } from "@webmaster-droid/contracts";

const STYLE_CONTROL_PATTERNS: Array<{ control: string; pattern: RegExp }> = [
  { control: "line-height", pattern: /\b(line[\s-]?height|leading)\b/i },
  { control: "font-size", pattern: /\b(font[\s-]?size|text[\s-]?size)\b/i },
  { control: "letter-spacing", pattern: /\b(letter[\s-]?spacing|tracking)\b/i },
  { control: "typography", pattern: /\btypography\b/i },
];

const STYLE_FOLLOW_UP_PATTERN =
  /^\s*(here|this|that|all|everywhere|site[-\s]?wide|same|yes|1|2|3|a|b|c)\b/i;

function normalizeStyleControlToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function detectRequestedStyleControls(value: string): string[] {
  const found = new Set<string>();
  for (const candidate of STYLE_CONTROL_PATTERNS) {
    if (candidate.pattern.test(value)) {
      found.add(candidate.control);
    }
  }

  return Array.from(found);
}

export function inferRequestedStyleControls(
  prompt: string,
  history?: Array<{ role: "user" | "assistant"; text: string }>
): string[] {
  const direct = detectRequestedStyleControls(prompt);
  if (direct.length > 0) {
    return direct;
  }

  if (!STYLE_FOLLOW_UP_PATTERN.test(prompt) || !history || history.length === 0) {
    return [];
  }

  const recentUserTurns = history
    .filter((turn) => turn.role === "user")
    .slice(-4)
    .map((turn) => turn.text)
    .join("\n");

  return detectRequestedStyleControls(recentUserTurns);
}

export function isStyleControlSupported(control: string, themeTokenKeys: string[]): boolean {
  const needle = normalizeStyleControlToken(control);
  return themeTokenKeys.some((tokenKey) => {
    const normalizedToken = normalizeStyleControlToken(tokenKey);
    if (needle === "typography") {
      return /(lineheight|fontsize|letterspacing|typography|tracking|leading)/.test(
        normalizedToken
      );
    }

    return normalizedToken.includes(needle);
  });
}

function buildUnsupportedStyleBoundaryMessage(unsupportedControls: string[]): string {
  const controlLabel =
    unsupportedControls.length > 1
      ? unsupportedControls.join(", ")
      : unsupportedControls[0] ?? "that styling control";

  return [
    `I can't change ${controlLabel} in this CMS draft because that styling control is not available here.`,
    "Please ask Superadmin to enable it.",
  ].join("\n");
}

function isStyleWorkaroundReply(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("pick one") ||
    normalized.includes("where should we apply") ||
    normalized.includes("click") ||
    normalized.includes("specific text block") ||
    normalized.includes("edit wording") ||
    normalized.includes("all headings") ||
    normalized.includes("all body text")
  );
}

function keyTokensFromName(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function collectKeyTokens(value: unknown, out: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeyTokens(item, out));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
    keyTokensFromName(key).forEach((token) => out.add(token));
    collectKeyTokens(child, out);
  });
}

export function pageHasComponentToken(pageValue: unknown, token: string): boolean {
  const tokens = new Set<string>();
  collectKeyTokens(pageValue, tokens);
  return tokens.has(token.toLowerCase());
}

function mentionsFormAsExistingComponent(value: string): boolean {
  const normalized = value.toLowerCase();
  if (!/\bform\b/.test(normalized)) {
    return false;
  }

  // Ignore explicit "no form" statements.
  if (/\b(no|not|without|don't|doesn't|cannot|can't)\b[^.!?\n]{0,28}\bform\b/.test(normalized)) {
    return false;
  }

  return (
    /\b(the|your|our)\s+contact\s+form\b/.test(normalized) ||
    /\b(above|below|beside|next to|around|under|over|before|after)\b[^.!?\n]{0,40}\bform\b/.test(
      normalized
    ) ||
    /\bform\b[^.!?\n]{0,40}\b(above|below|beside|next to|right|left|column|block|section)\b/.test(
      normalized
    )
  );
}

function formatPageLabel(pageId: CmsPageId | null): string {
  if (!pageId) {
    return "current";
  }

  return pageId.replace(/([A-Z])/g, " $1").toLowerCase();
}

export function normalizeAssistantReply(
  rawText: string,
  context: {
    mutationsApplied: boolean;
    blockedThemeTokenCount: number;
    blockedContentPathCount: number;
    unsupportedStyleControls: string[];
    currentPageId: CmsPageId | null;
    currentPageHasForm: boolean;
  }
): string {
  if (context.unsupportedStyleControls.length > 0 && !context.mutationsApplied) {
    const normalized = rawText.trim();
    const mentionsSuperadmin = /superadmin/i.test(normalized);
    if (!normalized || isStyleWorkaroundReply(normalized) || !mentionsSuperadmin) {
      return buildUnsupportedStyleBoundaryMessage(context.unsupportedStyleControls);
    }

    return normalized;
  }

  if (context.blockedThemeTokenCount > 0 && !context.mutationsApplied) {
    return [
      "That theme token is not available in this draft.",
      "Please ask Superadmin to add that token capability.",
    ].join("\n");
  }

  const normalized = rawText.trim();
  const looksLikeFallbackDone = /^done\.?$/i.test(normalized);

  if (
    normalized &&
    !context.currentPageHasForm &&
    mentionsFormAsExistingComponent(normalized)
  ) {
    const pageLabel = formatPageLabel(context.currentPageId);
    return [
      `I don't see a form on the ${pageLabel} page in the current CMS structure.`,
      "Please place this relative to sections that already exist.",
    ].join("\n");
  }

  if (!normalized || (looksLikeFallbackDone && !context.mutationsApplied)) {
    if (context.mutationsApplied) {
      return "Changes were applied.";
    }

    if (context.blockedContentPathCount > 0) {
      return "No changes were applied because one or more target fields do not exist.";
    }

    return "No changes were applied.";
  }

  return normalized;
}
