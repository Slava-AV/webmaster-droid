import { generateObject } from "ai";
import { z } from "zod";

function normalizeIntentText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function summarizeConversationForIntent(
  history?: Array<{ role: "user" | "assistant"; text: string }>
): string {
  if (!history || history.length === 0) {
    return "No prior turns.";
  }

  return history
    .slice(-10)
    .map((turn, index) => {
      const label = turn.role === "assistant" ? "Assistant" : "User";
      const compact = turn.text.replace(/\s+/g, " ").trim().slice(0, 400);
      return `${index + 1}. ${label}: ${compact}`;
    })
    .join("\n");
}

export async function resolveMutationPolicy(
  model: Parameters<typeof generateObject>[0]["model"],
  prompt: string,
  history?: Array<{ role: "user" | "assistant"; text: string }>
): Promise<{ allowWrites: boolean; reason: string }> {
  const normalized = normalizeIntentText(prompt);
  if (!normalized) {
    return {
      allowWrites: false,
      reason: "Empty request.",
    };
  }

  try {
    const classification = await generateObject({
      model,
      schema: z.object({
        decision: z.enum(["allow_writes", "read_only"]),
        reason: z.string().min(3).max(220),
      }),
      prompt: [
        "Classify whether the latest user turn explicitly requests that we apply CMS edits now.",
        "Use intent and conversation meaning, not keyword matching.",
        "Return allow_writes only when the user clearly asks us to execute edits now.",
        "Return read_only for questions, exploration, greetings, declines, deferment, or ambiguous intent.",
        "If unsure, choose read_only.",
        "Recent conversation:",
        summarizeConversationForIntent(history),
        "Latest user turn:",
        prompt,
      ].join("\n\n"),
    });

    return {
      allowWrites: classification.object.decision === "allow_writes",
      reason: classification.object.reason,
    };
  } catch {
    return {
      allowWrites: false,
      reason: "Intent classification unavailable. Confirmation is required before edits.",
    };
  }
}
