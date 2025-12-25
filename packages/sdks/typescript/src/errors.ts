/**
 * Known error codes returned by the SDK and gateway.
 */
export type KoineErrorCode =
	// SDK-generated errors
	| "HTTP_ERROR"
	| "INVALID_RESPONSE"
	| "INVALID_CONFIG"
	| "VALIDATION_ERROR"
	| "STREAM_ERROR"
	| "SSE_PARSE_ERROR"
	| "NO_SESSION"
	| "NO_USAGE"
	| "NO_RESPONSE_BODY"
	| "TIMEOUT"
	| "NETWORK_ERROR"
	// Gateway-returned errors
	| "INVALID_PARAMS"
	| "AUTH_ERROR"
	| "UNAUTHORIZED"
	| "SERVER_ERROR"
	| "SCHEMA_ERROR"
	| "RATE_LIMITED"
	| "CONTEXT_OVERFLOW";

/**
 * Custom error class for Koine client errors.
 *
 * @example
 * ```typescript
 * try {
 *   await generateText(config, { prompt: 'Hello' });
 * } catch (error) {
 *   if (error instanceof KoineError) {
 *     console.error(`[${error.code}]: ${error.message}`);
 *   }
 * }
 * ```
 */
export class KoineError extends Error {
	readonly code: KoineErrorCode;
	readonly rawText?: string;

	constructor(message: string, code: KoineErrorCode, rawText?: string) {
		super(message);
		// Fix prototype chain for proper instanceof checks in transpiled code
		Object.setPrototypeOf(this, KoineError.prototype);
		this.name = "KoineError";
		this.code = code;
		this.rawText = rawText;
	}
}
