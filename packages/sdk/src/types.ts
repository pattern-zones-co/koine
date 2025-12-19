/**
 * Configuration for connecting to a Claude Code Gateway service.
 */
export interface ClaudeCodeGatewayConfig {
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
 * Usage information from Claude Code gateway service.
 */
export interface ClaudeCodeUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Response from generate-text endpoint.
 */
export interface GenerateTextResponse {
  text: string;
  usage: ClaudeCodeUsage;
  sessionId: string;
}

/**
 * Response from generate-object endpoint.
 */
export interface GenerateObjectResponse {
  object: unknown;
  rawText: string;
  usage: ClaudeCodeUsage;
  sessionId: string;
}

/**
 * Error response from Claude Code gateway service.
 */
export interface ErrorResponse {
  error: string;
  code: string;
  rawText?: string;
}

/**
 * Result from streaming text generation.
 */
export interface ClaudeCodeStreamResult {
  /** ReadableStream of text chunks as they arrive */
  textStream: ReadableStream<string>;
  /** Session ID for conversation continuity (resolves early in stream, after session event) */
  sessionId: Promise<string>;
  /** Usage stats (resolves when stream completes via result event) */
  usage: Promise<ClaudeCodeUsage>;
  /** Full accumulated text (resolves when stream completes) */
  text: Promise<string>;
}

/**
 * SSE event types from Claude Code gateway /stream endpoint.
 */
export interface SSETextEvent {
  text: string;
}

export interface SSEResultEvent {
  sessionId: string;
  usage: ClaudeCodeUsage;
}

export interface SSEErrorEvent {
  error: string;
  code?: string;
}
