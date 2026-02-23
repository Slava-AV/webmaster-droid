const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type,authorization,accept,cache-control",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};

const SSE_BASE_HEADERS: Record<string, string> = {
  ...CORS_HEADERS,
  "content-type": "text/event-stream",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
};

export function jsonResponse(
  statusCode: number,
  body: unknown,
  headers?: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      ...CORS_HEADERS,
      "content-type": "application/json",
      ...headers,
    },
  });
}

export function sseHeaders(headers?: Record<string, string>): Record<string, string> {
  return {
    ...SSE_BASE_HEADERS,
    ...headers,
  };
}

export function sseEvent(event: string, data: unknown): string {
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  return `event: ${event}\ndata: ${payload}\n\n`;
}

export async function parseJsonBody<T>(request: Request): Promise<T> {
  const raw = await request.text();
  if (!raw) {
    throw new Error("Request body is required.");
  }

  return JSON.parse(raw) as T;
}

export function normalizePath(path: string): string {
  return path.replace(/\/+$/, "") || "/";
}
