const DEFAULT_GEMINI_IMAGE_MODEL_ID = "gemini-3-pro-image-preview";
const DEFAULT_GEMINI_IMAGE_REQUEST_TIMEOUT_MS = 285_000;
const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_REFERENCE_MIME_TYPES = new Set(["image/jpeg", "image/png"]);

export const DEFAULT_GENERATED_IMAGE_CACHE_CONTROL = "public,max-age=31536000,immutable";

export type GenerateImageMode = "new" | "edit";
export type GenerateImageQuality = "1K" | "2K" | "4K";

export interface GeminiInlineImagePayload {
  mimeType: string;
  data: string;
}

function geminiImageRequestTimeoutMs(): number {
  const raw = process.env.GEMINI_IMAGE_REQUEST_TIMEOUT_MS;
  if (!raw) {
    return DEFAULT_GEMINI_IMAGE_REQUEST_TIMEOUT_MS;
  }

  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1_000) {
    return DEFAULT_GEMINI_IMAGE_REQUEST_TIMEOUT_MS;
  }

  return parsed;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function normalizePublicBaseUrl(value?: string | null): string | null {
  const raw = value?.trim();
  if (!raw) {
    return null;
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") {
      return null;
    }

    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function parseImageMimeType(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase().split(";", 1)[0];
  const canonical =
    normalized === "image/jpg" || normalized === "image/pjpeg"
      ? "image/jpeg"
      : normalized;

  if (!canonical.startsWith("image/")) {
    return null;
  }

  return canonical;
}

function isGeminiReferenceMimeType(value: string): boolean {
  return GEMINI_REFERENCE_MIME_TYPES.has(value);
}

export function resolveReferenceImageUrl(
  rawValue: string,
  publicBaseUrl: string | null
): string | null {
  const value = rawValue.trim();
  if (!value) {
    return null;
  }

  if (value.startsWith("https://")) {
    return value;
  }

  if (value.startsWith("/") && publicBaseUrl) {
    return `${publicBaseUrl}${value}`;
  }

  if (
    publicBaseUrl &&
    /^[a-z0-9][a-z0-9/_-]*\.(png|jpg|jpeg|webp|gif|bmp|svg)$/i.test(value)
  ) {
    return `${publicBaseUrl}/${value.replace(/^\/+/, "")}`;
  }

  return null;
}

function parseGeminiErrorBody(payload: unknown): string | null {
  const root = toRecord(payload);
  const error = toRecord(root?.error);
  if (!error) {
    return null;
  }

  const message = error.message;
  if (typeof message !== "string" || !message.trim()) {
    return null;
  }

  return message.trim();
}

function extractGeminiInlineImage(payload: unknown): GeminiInlineImagePayload | null {
  const root = toRecord(payload);
  if (!root || !Array.isArray(root.candidates)) {
    return null;
  }

  for (const candidate of root.candidates) {
    const candidateRecord = toRecord(candidate);
    const content = toRecord(candidateRecord?.content);
    const parts = Array.isArray(content?.parts) ? content.parts : [];

    for (const part of parts) {
      const partRecord = toRecord(part);
      if (!partRecord) {
        continue;
      }

      const inlineData =
        toRecord(partRecord.inlineData) ?? toRecord(partRecord.inline_data);
      if (!inlineData) {
        continue;
      }

      const mimeTypeRaw =
        typeof inlineData.mimeType === "string"
          ? inlineData.mimeType
          : typeof inlineData.mime_type === "string"
            ? inlineData.mime_type
            : null;
      const mimeType = parseImageMimeType(mimeTypeRaw);
      const data = typeof inlineData.data === "string" ? inlineData.data : "";
      if (!mimeType || !data) {
        continue;
      }

      return {
        mimeType,
        data,
      };
    }
  }

  return null;
}

export async function fetchReferenceImageAsInlineData(
  url: string
): Promise<GeminiInlineImagePayload> {
  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch reference image (${response.status}).`);
  }

  const mimeType = parseImageMimeType(response.headers.get("content-type"));
  if (!mimeType) {
    throw new Error("Reference image content type is not an image.");
  }

  if (!isGeminiReferenceMimeType(mimeType)) {
    throw new Error(
      `Gemini image edit references support only JPEG or PNG (got ${mimeType}).`
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0) {
    throw new Error("Reference image is empty.");
  }

  return {
    mimeType,
    data: Buffer.from(bytes).toString("base64"),
  };
}

export async function generateGeminiImage(input: {
  prompt: string;
  mode: GenerateImageMode;
  quality: GenerateImageQuality;
  referenceImage?: GeminiInlineImagePayload;
}): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not configured.");
  }

  const modelId = process.env.GEMINI_IMAGE_MODEL_ID?.trim() || DEFAULT_GEMINI_IMAGE_MODEL_ID;
  const endpoint = `${GEMINI_API_BASE_URL}/${encodeURIComponent(modelId)}:generateContent`;
  const timeoutMs = geminiImageRequestTimeoutMs();

  const parts: Array<Record<string, unknown>> = [];
  if (input.mode === "edit" && input.referenceImage) {
    parts.push({
      inlineData: {
        mimeType: input.referenceImage.mimeType,
        data: input.referenceImage.data,
      },
    });
  }

  parts.push({
    text: input.prompt,
  });

  const requestBody = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      imageConfig: {
        imageSize: input.quality,
      },
    },
  };

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error(
        `Gemini image request timed out after ${Math.ceil(timeoutMs / 1000)} seconds.`
      );
    }

    const detail = error instanceof Error ? error.message : "Unknown request error.";
    throw new Error(`Gemini image request failed before response: ${detail}`);
  }

  const raw = await response.text();
  let parsed: unknown = null;
  if (raw.trim()) {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    const parsedDetail = parseGeminiErrorBody(parsed);
    const detail = (parsedDetail ?? raw.trim()) || response.statusText;
    throw new Error(`Gemini image request failed (${response.status}): ${detail}`);
  }

  const inlineImage = extractGeminiInlineImage(parsed);
  if (!inlineImage) {
    throw new Error("Gemini response did not include an image.");
  }

  const decoded = Buffer.from(inlineImage.data, "base64");
  if (decoded.length === 0) {
    throw new Error("Gemini returned an empty image payload.");
  }

  return {
    bytes: new Uint8Array(decoded),
    mimeType: inlineImage.mimeType,
  };
}
