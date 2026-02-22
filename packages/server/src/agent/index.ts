import { type ModelMessage, generateText, stepCountIs, tool } from "ai";
import { z } from "zod";

import {
  type CmsPageId,
  type CmsDocument,
  type PatchOperation,
  requiresStrictImageValidation,
  type SelectedElementContext,
  type ThemeTokens,
} from "@webmaster-droid/contracts";
import { CmsService, createPatchFromAgentOperations } from "../core";
import { resolveMutationPolicy } from "./intent";
import { resolveModel } from "./model";
import {
  formatSelectedElementContext,
  getByPath,
  inferPageIdFromPath,
  previewDocument,
  searchDocument,
  toHistoryModelMessages,
} from "./document";
import {
  DEFAULT_GENERATED_IMAGE_CACHE_CONTROL,
  type GenerateImageMode,
  type GenerateImageQuality,
  type GeminiInlineImagePayload,
  fetchReferenceImageAsInlineData,
  generateGeminiImage,
  normalizePublicBaseUrl,
  resolveReferenceImageUrl,
} from "./gemini-image";
import { buildSystemPrompt } from "./prompt";

export interface AgentRunnerInput {
  prompt: string;
  actor?: string;
  includeThinking?: boolean;
  modelId?: string;
  currentPath?: string;
  selectedElement?: SelectedElementContext;
  history?: Array<{ role: "user" | "assistant"; text: string }>;
  onThinkingEvent?: (note: string) => void;
  onToolEvent?: (event: { tool: string; summary: string }) => void;
}

export interface AgentRunnerResult {
  text: string;
  thinking: string[];
  toolEvents: Array<{ tool: string; summary: string }>;
  updatedDraft: CmsDocument;
  mutationsApplied: boolean;
}

const STATIC_TOOL_NAMES = [
  "patch_content",
  "patch_theme_tokens",
  "get_page",
  "get_section",
  "search_content",
  "generate_image",
] as const;

export type StaticToolName = (typeof STATIC_TOOL_NAMES)[number];

export function listStaticToolNames(): StaticToolName[] {
  return [...STATIC_TOOL_NAMES];
}

const CHECKPOINT_REASON_MAX_LENGTH = 96;
const IMAGE_URL_REGEX = /https:\/\/[^\s<>"'`]+/gi;
const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/i;
const VISION_INPUT_LIMIT = 3;

interface VisionInputImage {
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

function collectVisionInputImages(input: {
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


function clampCheckpointReason(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= CHECKPOINT_REASON_MAX_LENGTH) {
    return compact;
  }

  return `${compact.slice(0, CHECKPOINT_REASON_MAX_LENGTH - 3).trimEnd()}...`;
}

function normalizeCheckpointReasonHint(value: string | undefined): string | null {
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

function resolveCheckpointReason(input: {
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

const STYLE_CONTROL_PATTERNS: Array<{ control: string; pattern: RegExp }> = [
  { control: "line-height", pattern: /\b(line[\s-]?height|leading)\b/i },
  { control: "font-size", pattern: /\b(font[\s-]?size|text[\s-]?size)\b/i },
  { control: "letter-spacing", pattern: /\b(letter[\s-]?spacing|tracking)\b/i },
  { control: "typography", pattern: /\btypography\b/i },
];

const STYLE_FOLLOW_UP_PATTERN = /^\s*(here|this|that|all|everywhere|site[-\s]?wide|same|yes|1|2|3|a|b|c)\b/i;

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

function inferRequestedStyleControls(
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

function isStyleControlSupported(control: string, themeTokenKeys: string[]): boolean {
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

function pageHasComponentToken(pageValue: unknown, token: string): boolean {
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

function normalizeAssistantReply(
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

export async function runAgentTurn(
  service: CmsService,
  input: AgentRunnerInput
): Promise<AgentRunnerResult> {
  const draft = await service.getContent("draft");
  const currentPageId = inferPageIdFromPath(input.currentPath, draft);
  const currentPage = currentPageId ? draft.pages[currentPageId] : null;
  const modelConfig = service.getModelConfig();
  const model = resolveModel(input.modelId ?? modelConfig.defaultModelId, modelConfig);
  const mutationPolicy = await resolveMutationPolicy(model, input.prompt, input.history);
  const turnWriteMode = mutationPolicy.allowWrites ? "write-enabled" : "read-only";
  const thinking: string[] = [];
  const toolEvents: Array<{ tool: string; summary: string }> = [];
  const stagedContentOperations: PatchOperation[] = [];
  const stagedThemeTokens: Partial<ThemeTokens> = {};
  const stagedCheckpointReasonHints: string[] = [];
  const themeTokenKeys = Object.keys(draft.themeTokens);
  const allowedThemeTokenKeys = new Set(themeTokenKeys);
  const blockedThemeTokenKeys = new Set<string>();
  const blockedContentPaths = new Set<string>();
  const requestedStyleControls = inferRequestedStyleControls(input.prompt, input.history);
  const unsupportedStyleControls = requestedStyleControls.filter(
    (control) => !isStyleControlSupported(control, themeTokenKeys)
  );
  const currentPageHasForm = currentPage ? pageHasComponentToken(currentPage, "form") : false;
  const publicBaseUrl = normalizePublicBaseUrl(service.getPublicAssetBaseUrl());

  const pushThinking = (note: string) => {
    if (!input.includeThinking) {
      return;
    }

    thinking.push(note);
    input.onThinkingEvent?.(note);
  };

  const pushToolEvent = (event: { tool: string; summary: string }) => {
    toolEvents.push(event);
    input.onToolEvent?.(event);
  };

  const visionInputImages = collectVisionInputImages({
    draft,
    prompt: input.prompt,
    selectedElement: input.selectedElement,
    publicBaseUrl,
    currentPageId,
  });
  const hasVisionInputs = visionInputImages.length > 0;

  if (hasVisionInputs) {
    pushThinking(
      `Attached ${visionInputImages.length} image input(s) for this turn (${visionInputImages
        .map((item) => item.source)
        .join(", ")}).`
    );
    pushToolEvent({
      tool: "vision_input",
      summary: `Attached ${visionInputImages.length} image input(s) for visual analysis.`,
    });
  }

  const promptSections = [
      "User request:",
      input.prompt,
      "Turn write mode:",
      turnWriteMode,
      `Write gate reason: ${mutationPolicy.reason}`,
      "Admin current page context:",
      `path: ${input.currentPath ?? "unknown"}`,
      `pageId: ${currentPageId ?? "unknown"}`,
      "Selected element context:",
      formatSelectedElementContext(input.selectedElement),
      "Current draft overview:",
      previewDocument(draft),
      "Theme token capability snapshot:",
      `availableThemeTokenKeys: ${themeTokenKeys.join(", ") || "none"}`,
      unsupportedStyleControls.length > 0
        ? [
            `Unsupported style capability for this turn: ${unsupportedStyleControls.join(", ")}.`,
            "Do not ask follow-up questions or offer workaround options for this style request.",
            "State the limitation directly and route user to Superadmin.",
          ].join(" ")
        : "",
      "Use tools for all concrete edits.",
      "Use read tools get_page, get_section, and search_content for precise context fetches.",
      "Use layout paths for header/footer/shared UI copy and media.",
      "Use generate_image for image creation and image modifications.",
      "For fully new images, call generate_image with mode='new'. For edits to an existing image, call generate_image with mode='edit'.",
      "For mutating tool calls, include a short reason that will be used as the checkpoint message.",
      mutationPolicy.allowWrites
        ? "This turn allows edits when needed."
        : "This turn is read-only. Do not call patch_content, patch_theme_tokens, or generate_image. Answer only. Ask whether we should apply changes only if user is discussing potential edits; for pure greetings or small talk, reply naturally and briefly.",
    ];

  if (hasVisionInputs) {
    promptSections.push(
      [
        "Vision inputs attached below as image parts.",
        "You can inspect image pixels directly in this turn.",
        "Do not claim you are unable to view image contents.",
        "Use these images only when the user asks for visual interpretation or image-grounded edits.",
        "If the user request is not visual, ignore image inputs.",
      ].join(" ")
    );
    promptSections.push(
      `Attached image URLs: ${visionInputImages.map((item) => item.url).join(", ")}`
    );
  }

  const promptText = promptSections.join("\n\n");
  const historyMessages = toHistoryModelMessages(input.history);

  const buildTurnMessages = (includeVisionInputs: boolean): ModelMessage[] => {
    const userContent: Array<{ type: "text"; text: string } | { type: "image"; image: URL }> = [
      {
        type: "text",
        text: promptText,
      },
    ];

    if (includeVisionInputs) {
      for (const item of visionInputImages) {
        userContent.push({
          type: "image",
          image: new URL(item.url),
        });
      }
    }

    return [
      ...historyMessages,
      {
        role: "user",
        content: userContent,
      },
    ];
  };

  const runModelTurn = (includeVisionInputs: boolean) =>
    generateText({
      model,
      system: buildSystemPrompt(),
      messages: buildTurnMessages(includeVisionInputs),
      stopWhen: stepCountIs(5),
      tools: {
      get_page: tool({
        description: "Read-only. Returns a single page payload and matching SEO entry by pageId.",
        inputSchema: z.object({
          pageId: z.string().min(1).max(120),
        }),
        execute: async ({ pageId }) => {
          const current = await service.getContent("draft");
          const typedPageId = pageId.trim();
          const hasPage = Object.prototype.hasOwnProperty.call(
            current.pages,
            typedPageId
          );
          if (!hasPage) {
            return {
              pageId: typedPageId,
              found: false,
              page: null,
              seo: null,
              availablePageIds: Object.keys(current.pages),
            };
          }

          pushToolEvent({
            tool: "get_page",
            summary: `Read page '${typedPageId}'.`,
          });

          pushThinking(`Fetched page content for ${typedPageId}.`);

          return {
            pageId: typedPageId,
            found: true,
            page: current.pages[typedPageId],
            seo: current.seo[typedPageId] ?? null,
            availablePageIds: Object.keys(current.pages),
          };
        },
      }),
      get_section: tool({
        description:
          "Read-only. Returns value at a JSON path (dot notation with optional [index]), e.g. pages.about.sections[0].title.",
        inputSchema: z.object({
          path: z.string().min(1).max(300),
        }),
        execute: async ({ path }) => {
          const current = await service.getContent("draft");
          const value = getByPath(current, path);
          pushToolEvent({
            tool: "get_section",
            summary: `Read section '${path}'.`,
          });

          pushThinking(`Fetched section at path ${path}.`);

          return {
            path,
            found: value !== undefined,
            value: value ?? null,
          };
        },
      }),
      search_content: tool({
        description:
          "Read-only. Searches text and returns matching paths with snippets. Snippets can be truncated; call get_section(path) before editing.",
        inputSchema: z.object({
          query: z.string().min(2).max(120),
        }),
        execute: async ({ query }) => {
          const current = await service.getContent("draft");
          const results = searchDocument(current, query);
          pushToolEvent({
            tool: "search_content",
            summary: `Searched '${query}' and found ${results.length} match(es).`,
          });

          pushThinking(`Searched content for '${query}' and found ${results.length} match(es).`);

          return {
            query,
            totalMatches: results.length,
            results,
          };
        },
      }),
      generate_image: tool({
        description:
          "Generates an image with Gemini Image Preview, uploads it to S3, and stages a CMS image URL update. Edit-mode references must be JPEG or PNG.",
        inputSchema: z.object({
          targetPath: z.string().min(3).max(320),
          prompt: z.string().min(3).max(2500),
          mode: z.enum(["new", "edit"]),
          quality: z.enum(["1K", "2K", "4K"]).optional(),
          reason: z.string().min(3).max(300).optional(),
        }),
        execute: async ({ targetPath, prompt, mode, quality, reason }) => {
          if (!mutationPolicy.allowWrites) {
            pushThinking(`Blocked image generation attempt: ${mutationPolicy.reason}`);
            return {
              blocked: true,
              reason: mutationPolicy.reason,
              stagedOperations: 0,
              totalStagedOperations: stagedContentOperations.length,
            };
          }

          if (!modelConfig.geminiEnabled) {
            pushToolEvent({
              tool: "generate_image",
              summary: "Blocked image generation: Gemini provider is disabled.",
            });
            pushThinking("Blocked image generation attempt: Gemini provider is disabled.");
            return {
              blocked: true,
              reason: "Gemini provider is disabled.",
              stagedOperations: 0,
              totalStagedOperations: stagedContentOperations.length,
            };
          }

          const current = await service.getContent("draft");
          const currentValue = getByPath(current, targetPath);
          if (currentValue === undefined) {
            blockedContentPaths.add(targetPath);
            pushToolEvent({
              tool: "generate_image",
              summary: `Blocked image generation: target path not found (${targetPath}).`,
            });
            pushThinking(`Blocked image generation attempt: missing target path (${targetPath}).`);
            return {
              blocked: true,
              reason: "Target path does not exist in current schema.",
              stagedOperations: 0,
              totalStagedOperations: stagedContentOperations.length,
            };
          }

          if (!requiresStrictImageValidation(targetPath)) {
            pushToolEvent({
              tool: "generate_image",
              summary: `Blocked image generation: target path is not an image field (${targetPath}).`,
            });
            pushThinking(
              `Blocked image generation attempt: non-image target path (${targetPath}).`
            );
            return {
              blocked: true,
              reason: "Target path is not an image field.",
              stagedOperations: 0,
              totalStagedOperations: stagedContentOperations.length,
            };
          }

          let referenceImage: GeminiInlineImagePayload | undefined;
          if (mode === "edit") {
            if (typeof currentValue !== "string" || !currentValue.trim()) {
              pushToolEvent({
                tool: "generate_image",
                summary:
                  "Blocked image generation: current image value is missing; cannot use edit mode.",
              });
              pushThinking("Blocked image edit attempt: missing current image URL.");
              return {
                blocked: true,
                reason: "Current image value is missing for edit mode.",
                stagedOperations: 0,
                totalStagedOperations: stagedContentOperations.length,
              };
            }

            const referenceUrl = resolveReferenceImageUrl(currentValue, publicBaseUrl);
            if (!referenceUrl) {
              pushToolEvent({
                tool: "generate_image",
                summary:
                  "Blocked image generation: existing image URL is not a supported reference format.",
              });
              pushThinking(
                "Blocked image edit attempt: existing image URL is not a supported reference."
              );
              return {
                blocked: true,
                reason: "Existing image URL is not a supported reference.",
                stagedOperations: 0,
                totalStagedOperations: stagedContentOperations.length,
              };
            }

            try {
              referenceImage = await fetchReferenceImageAsInlineData(referenceUrl);
            } catch (error) {
              const detail = error instanceof Error ? error.message : "Unknown reference fetch error.";
              pushToolEvent({
                tool: "generate_image",
                summary: `Image generation failed: ${detail}`,
              });
              pushThinking(`Image edit reference fetch failed: ${detail}`);
              return {
                blocked: true,
                reason: detail,
                stagedOperations: 0,
                totalStagedOperations: stagedContentOperations.length,
              };
            }
          }

          try {
            const generated = await generateGeminiImage({
              prompt,
              mode: mode as GenerateImageMode,
              quality: (quality ?? "1K") as GenerateImageQuality,
              referenceImage,
            });
            const saved = await service.saveGeneratedImage({
              targetPath,
              data: generated.bytes,
              contentType: generated.mimeType,
              cacheControl: DEFAULT_GENERATED_IMAGE_CACHE_CONTROL,
            });
            const patch = createPatchFromAgentOperations([
              {
                path: targetPath,
                value: saved.url,
              },
            ]);

            stagedContentOperations.push(...patch.operations);
            const reasonHint = normalizeCheckpointReasonHint(reason);
            if (reasonHint) {
              stagedCheckpointReasonHints.push(reasonHint);
            }

            pushToolEvent({
              tool: "generate_image",
              summary: `Generated image for ${targetPath} and staged URL update (${saved.key}).`,
            });
            pushThinking(
              `Generated image and prepared one content operation for ${targetPath} (${saved.key}).`
            );

            return {
              stagedOperations: patch.operations.length,
              totalStagedOperations: stagedContentOperations.length,
              targetPath,
              generatedUrl: saved.url,
              generatedKey: saved.key,
              reason: reason ?? "agent-image-generate",
            };
          } catch (error) {
            const detail = error instanceof Error ? error.message : "Unknown image generation error.";
            pushToolEvent({
              tool: "generate_image",
              summary: `Image generation failed: ${detail}`,
            });
            pushThinking(`Image generation failed: ${detail}`);
            return {
              blocked: true,
              reason: detail,
              stagedOperations: 0,
              totalStagedOperations: stagedContentOperations.length,
            };
          }
        },
      }),
      patch_content: tool({
        description:
          "Stage content edits to editable paths. Backend applies staged edits once at end of this user request.",
        inputSchema: z.object({
          reason: z.string().min(3).max(300).optional(),
          operations: z
            .array(
              z.object({
                path: z.string().min(3),
                value: z.unknown(),
              })
            )
            .min(1)
            .max(20),
        }),
        execute: async ({ operations, reason }) => {
          if (!mutationPolicy.allowWrites) {
            pushThinking(`Blocked write attempt: ${mutationPolicy.reason}`);
            return {
              blocked: true,
              reason: mutationPolicy.reason,
              stagedOperations: 0,
              totalStagedOperations: stagedContentOperations.length,
            };
          }

          const current = await service.getContent("draft");
          const missingPaths = operations
            .map((operation) => operation.path)
            .filter((path) => getByPath(current, path) === undefined);

          if (missingPaths.length > 0) {
            for (const path of missingPaths) {
              blockedContentPaths.add(path);
            }
            pushToolEvent({
              tool: "patch_content",
              summary: `Blocked ${missingPaths.length} content operation(s): target path not found.`,
            });
            pushThinking(
              `Blocked write attempt: target path not found (${missingPaths.join(", ")}).`
            );
            return {
              blocked: true,
              reason: "One or more target paths do not exist in current schema.",
              missingPaths,
              stagedOperations: 0,
              totalStagedOperations: stagedContentOperations.length,
            };
          }

          const patch = createPatchFromAgentOperations(
            operations as Array<{ path: string; value: unknown }>
          );

          stagedContentOperations.push(...patch.operations);
          const reasonHint = normalizeCheckpointReasonHint(reason);
          if (reasonHint) {
            stagedCheckpointReasonHints.push(reasonHint);
          }
          pushToolEvent({
            tool: "patch_content",
            summary: `Prepared ${operations.length} content operation(s).`,
          });

          pushThinking(`Prepared ${operations.length} content operation(s) for end-of-turn apply.`);

          return {
            stagedOperations: operations.length,
            totalStagedOperations: stagedContentOperations.length,
            reason: reason ?? "agent-content-edit",
          };
        },
      }),
      patch_theme_tokens: tool({
        description:
          "Stage small theme token updates. Backend applies staged token edits once at end of this user request.",
        inputSchema: z.object({
          reason: z.string().min(3).max(300).optional(),
          tokens: z.record(z.string(), z.string().min(1)),
        }),
        execute: async ({ tokens, reason }) => {
          if (!mutationPolicy.allowWrites) {
            pushThinking(`Blocked write attempt: ${mutationPolicy.reason}`);
            return {
              blocked: true,
              reason: mutationPolicy.reason,
              stagedThemeTokenCount: 0,
              totalStagedThemeTokenCount: Object.keys(stagedThemeTokens).length,
            };
          }

          const unknownTokenKeys = Object.keys(tokens).filter(
            (tokenKey) => !allowedThemeTokenKeys.has(tokenKey)
          );
          if (unknownTokenKeys.length > 0) {
            for (const tokenKey of unknownTokenKeys) {
              blockedThemeTokenKeys.add(tokenKey);
            }
            pushToolEvent({
              tool: "patch_theme_tokens",
              summary: `Blocked ${unknownTokenKeys.length} theme token change(s): token not found; route to Superadmin.`,
            });
            pushThinking(
              `Blocked write attempt: unknown theme token(s): ${unknownTokenKeys.join(", ")}.`
            );
            return {
              blocked: true,
              reason:
                "One or more theme token keys do not exist in current schema. Route to Superadmin.",
              unknownTokenKeys,
              stagedThemeTokenCount: 0,
              totalStagedThemeTokenCount: Object.keys(stagedThemeTokens).length,
            };
          }

          Object.assign(stagedThemeTokens, tokens as Partial<ThemeTokens>);
          const reasonHint = normalizeCheckpointReasonHint(reason);
          if (reasonHint) {
            stagedCheckpointReasonHints.push(reasonHint);
          }
          pushToolEvent({
            tool: "patch_theme_tokens",
            summary: `Prepared ${Object.keys(tokens).length} theme token change(s).`,
          });

          pushThinking(
            `Prepared ${Object.keys(tokens).length} theme token change(s) for end-of-turn apply.`
          );

          return {
            stagedThemeTokenCount: Object.keys(tokens).length,
            totalStagedThemeTokenCount: Object.keys(stagedThemeTokens).length,
            reason: reason ?? "agent-theme-edit",
          };
        },
      }),
    },
  });

  let response;
  try {
    response = await runModelTurn(hasVisionInputs);
  } catch (error) {
    if (!hasVisionInputs) {
      throw error;
    }

    const detail = error instanceof Error ? error.message : "Unknown model error.";
    pushThinking(`Vision input processing failed (${detail}). Retrying without vision inputs.`);
    response = await runModelTurn(false);
  }

  const hasContentChanges = stagedContentOperations.length > 0;
  const hasThemeChanges = Object.keys(stagedThemeTokens).length > 0;
  const mutationsApplied = hasContentChanges || hasThemeChanges;

  let updatedDraft: CmsDocument;
  if (mutationsApplied) {
    const checkpointReason = resolveCheckpointReason({
      reasonHints: stagedCheckpointReasonHints,
      contentOperations: stagedContentOperations,
      themeTokens: stagedThemeTokens,
    });
    const mutationResult = await service.mutateDraftBatch({
      patch: hasContentChanges ? { operations: stagedContentOperations } : undefined,
      themePatch: hasThemeChanges ? stagedThemeTokens : undefined,
      actor: input.actor,
      reason: checkpointReason,
    });
    updatedDraft = mutationResult.document;

    pushThinking(
      `Committed ${stagedContentOperations.length} content operation(s) and ${Object.keys(stagedThemeTokens).length} theme token change(s) in one checkpoint for this request.`
    );

    pushToolEvent({
      tool: "commit_draft",
      summary: `Committed ${stagedContentOperations.length} content op(s) and ${Object.keys(stagedThemeTokens).length} theme token change(s) in one checkpoint.`,
    });
  } else {
    updatedDraft = await service.getContent("draft");
  }

  return {
    text: normalizeAssistantReply(response.text, {
      mutationsApplied,
      blockedThemeTokenCount: blockedThemeTokenKeys.size,
      blockedContentPathCount: blockedContentPaths.size,
      unsupportedStyleControls,
      currentPageId,
      currentPageHasForm,
    }),
    thinking,
    toolEvents,
    updatedDraft,
    mutationsApplied,
  };
}
