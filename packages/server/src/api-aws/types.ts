export interface ApiGatewayProxyEvent {
  httpMethod: string;
  path: string;
  rawPath?: string;
  headers: Record<string, string | undefined> | null;
  body: string | null;
  isBase64Encoded?: boolean;
  queryStringParameters?: Record<string, string | undefined> | null;
}

export interface ApiGatewayProxyResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}
