import {
  type CmsDocument,
  type CmsPageId,
  type SelectedElementContext,
} from "@webmaster-droid/contracts";

import { getByPath } from "./document";
import { resolveReferenceImageUrl } from "./gemini-image";

const IMAGE_URL_REGEX = /https:\/\/[^\s<>"'`]+/gi;
const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/i;
const VISION_INPUT_LIMIT = 3;

export interface VisionInputImage {
  url: string;
  source: "selected-element" | "prompt-url" | "inferred-context";
}

function trimTrailingUrlPunctuation(value: string): string {
  return value.replace(/[),.;!?]+$/g, "");
}

function normalizeVisionImageUrl(value: string, publicBaseUrl: string | null): string | null {
  const cleaned = trimTrailingUrlPunctuation(value.trim());
  if (!cleaned) {
    return null;
  }

  const resolved = resolveReferenceImageUrl(cleaned, publicBaseUrl);
  if (!resolved) {
    return null;
  }

  try {
    const parsed = new URL(resolved);
    if (parsed.protocol !== "https:") {
      return null;
    }

    if (!IMAGE_EXTENSION_PATTERN.test(parsed.pathname.toLowerCase())) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

export function collectVisionInputImages(input: {
  draft: CmsDocument;
  prompt: string;
  selectedElement?: SelectedElementContext;
  publicBaseUrl: string | null;
  currentPageId?: CmsPageId | null;
}): VisionInputImage[] {
  const items: VisionInputImage[] = [];
  const seen = new Set<string>();

  const push = (url: string, source: VisionInputImage["source"]) => {
    if (items.length >= VISION_INPUT_LIMIT || seen.has(url)) {
      return;
    }

    seen.add(url);
    items.push({ url, source });
  };

  if (input.selectedElement?.kind === "image") {
    const candidatePaths = [
      input.selectedElement.path,
      ...(input.selectedElement.relatedPaths ?? []),
    ];

    for (const candidatePath of candidatePaths) {
      const value = getByPath(input.draft, candidatePath);
      if (typeof value !== "string") {
        continue;
      }

      const normalized = normalizeVisionImageUrl(value, input.publicBaseUrl);
      if (normalized) {
        push(normalized, "selected-element");
        break;
      }
    }

    if (items.length === 0 && input.selectedElement.preview) {
      const previewUrl = normalizeVisionImageUrl(
        input.selectedElement.preview,
        input.publicBaseUrl
      );
      if (previewUrl) {
        push(previewUrl, "selected-element");
      }
    }
  }

  for (const match of input.prompt.matchAll(IMAGE_URL_REGEX)) {
    if (items.length >= VISION_INPUT_LIMIT) {
      break;
    }

    const normalized = normalizeVisionImageUrl(match[0], input.publicBaseUrl);
    if (!normalized) {
      continue;
    }

    push(normalized, "prompt-url");
  }

  if (items.length > 0) {
    return items;
  }

  const wantsVisualInspection = /\b(image|photo|picture|visual|looks?\s+like)\b/i.test(
    input.prompt
  );
  if (!wantsVisualInspection) {
    return items;
  }

  const mentionsHero = /\bhero\b/i.test(input.prompt);
  const candidatePaths: string[] = [];
  if (mentionsHero) {
    if (input.currentPageId) {
      candidatePaths.push(`pages.${input.currentPageId}.hero.image`);
    }
    candidatePaths.push("pages.home.hero.image");
  } else if (input.currentPageId) {
    candidatePaths.push(`pages.${input.currentPageId}.hero.image`);
  }

  candidatePaths.push("layout.shared.pageIntro.image");

  for (const path of candidatePaths) {
    const value = getByPath(input.draft, path);
    if (typeof value !== "string") {
      continue;
    }

    const normalized = normalizeVisionImageUrl(value, input.publicBaseUrl);
    if (!normalized) {
      continue;
    }

    push(normalized, "inferred-context");
  }

  return items;
}
