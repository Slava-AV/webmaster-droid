import {
  normalizeCmsDocument,
  type CmsDocument,
} from "@webmaster-droid/contracts";

type AnyCmsDocument = CmsDocument<object, object, string>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item));
  }

  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = cloneValue(item);
    }
    return out;
  }

  return value;
}

function mergeMissing(target: unknown, defaults: unknown): unknown {
  if (Array.isArray(target) || Array.isArray(defaults)) {
    return target === undefined ? cloneValue(defaults) : target;
  }

  if (!isRecord(defaults)) {
    return target === undefined ? defaults : target;
  }

  if (!isRecord(target)) {
    return cloneValue(defaults);
  }

  const out: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(defaults)) {
    out[key] = mergeMissing(out[key], value);
  }

  return out;
}

export function normalizeCmsDocumentWithFallback<TDocument extends AnyCmsDocument>(
  document: unknown,
  fallbackDocument: TDocument
): TDocument {
  const merged = mergeMissing(
    isRecord(document) ? document : {},
    fallbackDocument
  ) as AnyCmsDocument;

  return normalizeCmsDocument(
    merged as unknown as CmsDocument<Record<string, unknown>, Record<string, unknown>, string>
  ) as TDocument;
}
