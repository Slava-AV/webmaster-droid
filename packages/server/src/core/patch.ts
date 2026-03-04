import {
  isEditablePath,
  isHttpsUrl,
  requiresStrictImageValidation,
  type CmsDocument,
  type CmsPatch,
  type ThemeTokens,
  type ThemeTokenPatch,
} from "@webmaster-droid/contracts";

import type {
  PatchApplicationOptions,
  PatchApplyResult,
  PatchValidationResult,
  ThemeApplyResult,
} from "./types";

function cloneDocument(doc: CmsDocument): CmsDocument {
  return JSON.parse(JSON.stringify(doc)) as CmsDocument;
}

function splitPath(path: string): string[] {
  return path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

type LinkPathClassification = "none" | "allowed_leaf" | "restricted";

const RESTRICTED_LINK_ROOTS = [
  ["layout", "header", "primaryLinks"],
  ["layout", "footer", "navigationLinks"],
  ["layout", "footer", "legalLinks"],
] as const;

function classifyRestrictedLinkPath(path: string): LinkPathClassification {
  const segments = splitPath(path);

  for (const root of RESTRICTED_LINK_ROOTS) {
    const isRootMatch = root.every((segment, index) => segments[index] === segment);
    if (!isRootMatch) {
      continue;
    }

    if (segments.length === root.length) {
      return "restricted";
    }

    const indexSegment = segments[root.length];
    const leafSegment = segments[root.length + 1];
    const hasValidIndex = /^\d+$/.test(indexSegment ?? "");

    if (
      hasValidIndex &&
      segments.length === root.length + 2 &&
      (leafSegment === "label" || leafSegment === "href")
    ) {
      return "allowed_leaf";
    }

    return "restricted";
  }

  return "none";
}

function normalizeInternalPath(path: string): string | null {
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
  if (!normalized) {
    return null;
  }

  return `${normalized}/`;
}

export function readByPath(input: unknown, path: string): unknown {
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

function writeByPath(input: unknown, path: string, value: unknown): boolean {
  const segments = splitPath(path);
  if (segments.length === 0) {
    return false;
  }

  let current: unknown = input;

  for (let idx = 0; idx < segments.length - 1; idx += 1) {
    const segment = segments[idx];

    if (Array.isArray(current)) {
      const index = Number(segment);
      if (Number.isNaN(index)) {
        return false;
      }

      if (current[index] === undefined) {
        const next = segments[idx + 1];
        current[index] = /^\d+$/.test(next) ? [] : {};
      }

      current = current[index];
      continue;
    }

    if (typeof current !== "object" || current === null) {
      return false;
    }

    const record = current as Record<string, unknown>;
    if (record[segment] === undefined) {
      const next = segments[idx + 1];
      record[segment] = /^\d+$/.test(next) ? [] : {};
    }

    current = record[segment];
  }

  const finalSegment = segments.at(-1);
  if (!finalSegment) {
    return false;
  }

  if (Array.isArray(current)) {
    const index = Number(finalSegment);
    if (Number.isNaN(index)) {
      return false;
    }

    current[index] = value;
    return true;
  }

  if (typeof current !== "object" || current === null) {
    return false;
  }

  (current as Record<string, unknown>)[finalSegment] = value;
  return true;
}

export function validatePatch(
  patch: CmsPatch,
  source: CmsDocument,
  options: PatchApplicationOptions
): PatchValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const allowedInternalPaths = new Set(options.allowedInternalPaths);

  if (patch.operations.length > options.maxOperationsPerPatch) {
    errors.push(
      `Patch contains ${patch.operations.length} operations; limit is ${options.maxOperationsPerPatch}.`
    );
  }

  for (const operation of patch.operations) {
    if (operation.op !== "set") {
      errors.push(`Unsupported operation type: ${operation.op}`);
      continue;
    }

    if (!isEditablePath(operation.path)) {
      errors.push(`Path is out of editable scope: ${operation.path}`);
      continue;
    }

    const linkPathClassification = classifyRestrictedLinkPath(operation.path);
    if (linkPathClassification === "restricted") {
      errors.push(
        `Only link label and href leaf fields are editable for header/footer links: ${operation.path}`
      );
      continue;
    }

    const currentValue = readByPath(source, operation.path);
    if (currentValue === undefined) {
      errors.push(
        `Path does not exist and cannot be created by patch_content: ${operation.path}. Seed draft/live documents from Editable paths before first edit (for example: npx @webmaster-droid/cli seed src --out cms/seed.from-editables.json).`
      );
      continue;
    }

    if (requiresStrictImageValidation(operation.path) && !isHttpsUrl(operation.value)) {
      errors.push(`Image path requires HTTPS URL: ${operation.path}`);
    }

    if (linkPathClassification === "allowed_leaf" && operation.path.endsWith(".href")) {
      if (typeof operation.value !== "string") {
        errors.push(`Link href must be a string: ${operation.path}`);
        continue;
      }

      const normalizedHref = normalizeInternalPath(operation.value);
      if (!normalizedHref || !allowedInternalPaths.has(normalizedHref)) {
        errors.push(
          `Link href is outside allowed internal routes: ${operation.path} (${operation.value})`
        );
      }
    }

    if (
      typeof currentValue === "number" &&
      typeof operation.value !== "number" &&
      operation.value !== null
    ) {
      warnings.push(
        `Numeric field ${operation.path} received non-number value; value will still be applied.`
      );
    }

    if (
      typeof currentValue === "boolean" &&
      typeof operation.value !== "boolean" &&
      operation.value !== null
    ) {
      warnings.push(
        `Boolean field ${operation.path} received non-boolean value; value will still be applied.`
      );
    }

    if (typeof currentValue === "string" && typeof operation.value === "string") {
      const before = currentValue.trim();
      const after = operation.value.trim();

      if (
        before.length >= 80 &&
        after.length < Math.floor(before.length * 0.85) &&
        before.startsWith(after)
      ) {
        errors.push(
          `Refusing potentially truncated update at ${operation.path}; fetch full section and retry with complete value.`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

export function applyPatch(
  source: CmsDocument,
  patch: CmsPatch,
  options: PatchApplicationOptions
): PatchApplyResult {
  const validation = validatePatch(patch, source, options);
  if (!validation.valid) {
    throw new Error(validation.errors.join("\n"));
  }

  const document = cloneDocument(source);

  for (const operation of patch.operations) {
    const ok = writeByPath(document, operation.path, operation.value);
    if (!ok) {
      throw new Error(`Failed to apply operation at path ${operation.path}`);
    }
  }

  return {
    document,
    warnings: validation.warnings,
  };
}

export function applyThemeTokenPatch(
  source: CmsDocument,
  patch: ThemeTokenPatch
): ThemeApplyResult {
  const document = cloneDocument(source);
  const warnings: string[] = [];

  for (const [tokenKey, tokenValue] of Object.entries(
    patch
  ) as Array<[keyof ThemeTokens, string | undefined]>) {
    if (typeof tokenValue !== "string") {
      warnings.push(`Theme token ${tokenKey} ignored because value is not a string.`);
      continue;
    }

    if (!tokenValue.trim()) {
      warnings.push(`Theme token ${tokenKey} ignored because value is empty.`);
      continue;
    }

    document.themeTokens[tokenKey] = tokenValue;
  }

  return { document, warnings };
}
