import { type ModelMessage, generateText, stepCountIs } from "ai";

import {
  type CmsPageId,
  type CmsDocument,
  type PatchOperation,
  type SelectedElementContext,
  type ThemeTokens,
} from "@webmaster-droid/contracts";
import { CmsService } from "../core";
import { resolveMutationPolicy } from "./intent";
import { resolveModel } from "./model";
import {
  formatSelectedElementContext,
  inferPageIdFromPath,
  previewDocument,
  toHistoryModelMessages,
} from "./document";
import { normalizePublicBaseUrl } from "./gemini-image";
import { buildSystemPrompt } from "./prompt";
import { collectVisionInputImages } from "./vision";
import {
  inferRequestedStyleControls,
  isStyleControlSupported,
  normalizeAssistantReply,
  pageHasComponentToken,
} from "./assistant-reply";
import { resolveCheckpointReason } from "./checkpoint";
import { buildAgentTools } from "./tools";

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
  mutationSummary?: {
    contentOperations: number;
    themeTokenChanges: number;
    imageOperations: number;
  };
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

  const tools = buildAgentTools({
    service,
    mutationPolicy,
    modelConfig,
    stagedContentOperations,
    stagedThemeTokens,
    stagedCheckpointReasonHints,
    allowedThemeTokenKeys,
    blockedThemeTokenKeys,
    blockedContentPaths,
    publicBaseUrl,
    pushThinking,
    pushToolEvent,
  });

  const runModelTurn = (includeVisionInputs: boolean) =>
    generateText({
      model,
      system: buildSystemPrompt(),
      messages: buildTurnMessages(includeVisionInputs),
      stopWhen: stepCountIs(5),
      tools,
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
  const imageOperations = stagedContentOperations.filter((operation) =>
    /(?:^|[.\]])image(?:$|[.\[])/i.test(operation.path)
  ).length;

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
    mutationSummary: mutationsApplied
      ? {
          contentOperations: stagedContentOperations.length,
          themeTokenChanges: Object.keys(stagedThemeTokens).length,
          imageOperations,
        }
      : undefined,
  };
}
