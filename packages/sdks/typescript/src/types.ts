/**
 * Configuration for connecting to a Koine gateway service.
 */
export interface KoineConfig {
  /** Base URL of the gateway service (e.g., "http://localhost:3100") */
  baseUrl: string;
  /** Request timeout in milliseconds */
  timeout: number;
  /** Authentication key for the gateway service (required) */
  authKey: string;
  /** Model alias (e.g., 'sonnet', 'haiku') or full model name */
  model?: string;
}

/**
 * Usage information from Koine gateway service.
 */
export interface KoineUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Response from generate-text endpoint.
 */
export interface GenerateTextResponse {
  text: string;
  usage: KoineUsage;
  sessionId: string;
}

/**
 * Response from generate-object endpoint.
 */
export interface GenerateObjectResponse {
  object: unknown;
  rawText: string;
  usage: KoineUsage;
  sessionId: string;
}

/**
 * Error response from Koine gateway service.
 */
export interface ErrorResponse {
  error: string;
  code: string;
  rawText?: string;
}

/**
 * Result from streaming text generation.
 */
export interface KoineStreamResult {
  /** ReadableStream of text chunks as they arrive */
  textStream: ReadableStream<string>;
  /** Session ID for conversation continuity (resolves early in stream, after session event) */
  sessionId: Promise<string>;
  /** Usage stats (resolves when stream completes via result event) */
  usage: Promise<KoineUsage>;
  /** Full accumulated text (resolves when stream completes) */
  text: Promise<string>;
}

/**
 * SSE event types from Koine gateway /stream endpoint.
 */
export interface SSETextEvent {
  text: string;
}

export interface SSEResultEvent {
  sessionId: string;
  usage: KoineUsage;
}

export interface SSEErrorEvent {
  error: string;
  code?: string;
}
