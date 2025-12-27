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
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly totalTokens: number;
}

/**
 * Response from generate-text endpoint (internal).
 */
export interface GenerateTextResponse {
	readonly text: string;
	readonly usage: KoineUsage;
	readonly sessionId: string;
}

/**
 * Response from generate-object endpoint (internal).
 */
export interface GenerateObjectResponse {
	readonly object: unknown;
	readonly rawText: string;
	readonly usage: KoineUsage;
	readonly sessionId: string;
}

/**
 * Error response from Koine gateway service (internal).
 */
export interface ErrorResponse {
	readonly error: string;
	readonly code: string;
	readonly rawText?: string;
}

/**
 * Result from streaming text generation.
 */
export interface KoineStreamResult {
	/** Stream of text chunks as they arrive. Supports both ReadableStream methods and async iteration. */
	readonly textStream: ReadableStream<string> & AsyncIterable<string>;
	/** Session ID for conversation continuity (resolves early in stream, after session event) */
	readonly sessionId: Promise<string>;
	/** Usage stats (resolves when stream completes via result event) */
	readonly usage: Promise<KoineUsage>;
	/** Full accumulated text (resolves when stream completes) */
	readonly text: Promise<string>;
}

/**
 * SSE event types from Koine gateway /stream endpoint (internal).
 */
export interface SSETextEvent {
	readonly text: string;
}

export interface SSEResultEvent {
	readonly sessionId: string;
	readonly usage: KoineUsage;
}

export interface SSEErrorEvent {
	readonly error: string;
	readonly code?: string;
}

/**
 * SSE event types from Koine gateway /stream-object endpoint (internal).
 */
export interface SSEPartialObjectEvent {
	readonly partial: string;
	readonly parsed: unknown;
}

export interface SSEObjectEvent {
	readonly object: unknown;
}

/**
 * Result from streaming object generation.
 */
export interface KoineStreamObjectResult<T> {
	/** Stream of partial objects as they arrive. Supports both ReadableStream methods and async iteration. */
	readonly partialObjectStream: ReadableStream<T> & AsyncIterable<T>;
	/** Final validated object (resolves when stream completes via object event, rejects with KoineError if validation fails) */
	readonly object: Promise<T>;
	/** Session ID for conversation continuity (resolves early in stream, after session event) */
	readonly sessionId: Promise<string>;
	/** Usage stats (resolves when stream completes via result event) */
	readonly usage: Promise<KoineUsage>;
}
