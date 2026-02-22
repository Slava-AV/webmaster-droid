import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";

import { type ModelProviderConfig } from "@webmaster-droid/contracts";

export function normalizeModelId(modelId: string): string {
  if (modelId.includes(":")) {
    return modelId;
  }

  return modelId.startsWith("gemini") ? `gemini:${modelId}` : `openai:${modelId}`;
}

export function resolveModel(modelId: string, config: ModelProviderConfig) {
  const normalized = normalizeModelId(modelId || config.defaultModelId);

  if (normalized.startsWith("openai:")) {
    if (!config.openaiEnabled) {
      throw new Error("OpenAI provider is disabled.");
    }

    return openai(normalized.replace("openai:", ""));
  }

  if (normalized.startsWith("gemini:")) {
    if (!config.geminiEnabled) {
      throw new Error("Gemini provider is disabled.");
    }

    return google(normalized.replace("gemini:", ""));
  }

  throw new Error(`Unsupported model identifier: ${normalized}`);
}
