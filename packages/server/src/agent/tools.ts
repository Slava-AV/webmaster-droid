import { tool } from "ai";
import { z } from "zod";

import {
  type ModelProviderConfig,
  type PatchOperation,
  requiresStrictImageValidation,
  type ThemeTokens,
} from "@webmaster-droid/contracts";

import { CmsService, createPatchFromAgentOperations } from "../core";
import { normalizeCheckpointReasonHint } from "./checkpoint";
import { getByPath, searchDocument } from "./document";
import {
  DEFAULT_GENERATED_IMAGE_CACHE_CONTROL,
  fetchReferenceImageAsInlineData,
  generateGeminiImage,
  type GenerateImageMode,
  type GenerateImageQuality,
  type GeminiInlineImagePayload,
  resolveReferenceImageUrl,
} from "./gemini-image";

export interface AgentToolEvent {
  tool: string;
  summary: string;
}

export interface BuildAgentToolsInput {
  service: CmsService;
  mutationPolicy: { allowWrites: boolean; reason: string };
  modelConfig: ModelProviderConfig;
  stagedContentOperations: PatchOperation[];
  stagedThemeTokens: Partial<ThemeTokens>;
  stagedCheckpointReasonHints: string[];
  allowedThemeTokenKeys: Set<string>;
  blockedThemeTokenKeys: Set<string>;
  blockedContentPaths: Set<string>;
  publicBaseUrl: string | null;
  pushThinking: (note: string) => void;
  pushToolEvent: (event: AgentToolEvent) => void;
}

export function buildAgentTools(input: BuildAgentToolsInput) {
  const {
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
  } = input;

  return {
    get_page: tool({
      description: "Read-only. Returns a single page payload and matching SEO entry by pageId.",
      inputSchema: z.object({
        pageId: z.string().min(1).max(120),
      }),
      execute: async ({ pageId }) => {
        const current = await service.getContent("draft");
        const typedPageId = pageId.trim();
        const hasPage = Object.prototype.hasOwnProperty.call(current.pages, typedPageId);
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
  };
}
