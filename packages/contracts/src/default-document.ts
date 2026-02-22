import type { CmsDocument, ThemeTokens } from "./index";

const DEFAULT_THEME_TOKENS: ThemeTokens = {
  brandPrimary: "#0f766e",
  brandPrimaryDark: "#115e59",
  brandPrimaryLight: "#ccfbf1",
  brandDark: "#0f172a",
  brandText: "#1e293b",
  brandSurface: "#f8fafc",
  brandBorder: "#e2e8f0",
};

function cloneDocument(document: CmsDocument): CmsDocument {
  return JSON.parse(JSON.stringify(document)) as CmsDocument;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeMissing(target: unknown, defaults: unknown): unknown {
  if (Array.isArray(target) || Array.isArray(defaults)) {
    return target === undefined ? cloneValue(defaults) : target;
  }

  if (!isRecord(defaults)) {
    return target === undefined ? defaults : target;
  }

  if (!isRecord(target)) {
    return cloneRecord(defaults);
  }

  const out: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(defaults)) {
    if (out[key] === undefined) {
      out[key] = cloneValue(value);
      continue;
    }

    out[key] = mergeMissing(out[key], value);
  }

  return out;
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = cloneValue(item);
  }
  return out;
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item));
  }

  if (isRecord(value)) {
    return cloneRecord(value);
  }

  return value;
}

export function createDefaultCmsDocument(): CmsDocument {
  const now = new Date().toISOString();

  return {
    meta: {
      schemaVersion: 1,
      contentVersion: "seed_v1",
      updatedAt: now,
      updatedBy: "system",
    },
    themeTokens: DEFAULT_THEME_TOKENS,
    layout: {},
    pages: {},
    seo: {},
  };
}

export function normalizeCmsDocument(input: CmsDocument): CmsDocument {
  const defaults = createDefaultCmsDocument();
  const merged = mergeMissing(cloneDocument(input), defaults) as CmsDocument;

  if (merged.meta.schemaVersion < defaults.meta.schemaVersion) {
    merged.meta.schemaVersion = defaults.meta.schemaVersion;
  }

  return merged;
}
