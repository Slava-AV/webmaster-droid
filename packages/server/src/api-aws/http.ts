import type { ApiGatewayProxyResult } from "./types";

export function jsonResponse(statusCode: number, body: unknown): ApiGatewayProxyResult {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type,authorization,accept,cache-control",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

export function sseResponse(
  statusCode: number,
  events: Array<{ event: string; data: unknown }>
): ApiGatewayProxyResult {
  const body = events
    .map((item) => {
      const payload = typeof item.data === "string" ? item.data : JSON.stringify(item.data);
      return `event: ${item.event}\ndata: ${payload}\n\n`;
    })
    .join("");

  return {
    statusCode,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type,authorization,accept,cache-control",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    },
    body,
  };
}

export function parseJsonBody<T>(raw: string | null): T {
  if (!raw) {
    throw new Error("Request body is required.");
  }

  return JSON.parse(raw) as T;
}

export function normalizePath(path: string): string {
  return path.replace(/\/+$/, "") || "/";
}
