import { KoineError, type KoineErrorCode } from "./errors.js";
import type { KoineConfig } from "./types.js";

/**
 * Known error codes for type-safe validation.
 */
export const KNOWN_ERROR_CODES = new Set<KoineErrorCode>([
	// SDK-generated errors
	"HTTP_ERROR",
	"INVALID_RESPONSE",
	"INVALID_CONFIG",
	"VALIDATION_ERROR",
	"STREAM_ERROR",
	"SSE_PARSE_ERROR",
	"NO_SESSION",
	"NO_USAGE",
	"NO_RESPONSE_BODY",
	"TIMEOUT",
	"NETWORK_ERROR",
	// Gateway-returned errors
	"INVALID_PARAMS",
	"AUTH_ERROR",
	"UNAUTHORIZED",
	"SERVER_ERROR",
	"SCHEMA_ERROR",
	"RATE_LIMITED",
	"CONTEXT_OVERFLOW",
]);

/**
 * Coerces an API error code to a known KoineErrorCode.
 * Falls back to the provided default if the code is unknown.
 */
export function toErrorCode(
	code: string | undefined,
	fallback: KoineErrorCode,
): KoineErrorCode {
	if (code && KNOWN_ERROR_CODES.has(code as KoineErrorCode)) {
		return code as KoineErrorCode;
	}
	return fallback;
}

/**
 * Validates config parameters before making requests.
 * @throws {KoineError} with code 'INVALID_CONFIG' if config is invalid
 */
export function validateConfig(config: KoineConfig): void {
	if (!config.baseUrl) {
		throw new KoineError("baseUrl is required", "INVALID_CONFIG");
	}
	if (!config.authKey) {
		throw new KoineError("authKey is required", "INVALID_CONFIG");
	}
	if (typeof config.timeout !== "number" || config.timeout <= 0) {
		throw new KoineError("timeout must be a positive number", "INVALID_CONFIG");
	}
}

/**
 * Creates an AbortSignal that combines timeout with optional user signal.
 */
export function createAbortSignal(
	timeout: number,
	userSignal?: AbortSignal,
): AbortSignal {
	const timeoutSignal = AbortSignal.timeout(timeout);
	if (!userSignal) {
		return timeoutSignal;
	}
	// Combine signals - abort when either triggers
	return AbortSignal.any([timeoutSignal, userSignal]);
}

/**
 * Wraps fetch errors in KoineError for consistent error handling.
 */
export async function safeFetch(
	url: string,
	options: RequestInit,
	timeout: number,
): Promise<Response> {
	try {
		return await fetch(url, options);
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") {
			// Check if it was a timeout or user cancellation
			throw new KoineError(
				`Request aborted (timeout: ${timeout}ms)`,
				"TIMEOUT",
			);
		}
		if (error instanceof TypeError) {
			// Network errors (DNS failure, connection refused, etc.)
			throw new KoineError(`Network error: ${error.message}`, "NETWORK_ERROR");
		}
		// Unknown error - wrap it
		throw new KoineError(
			`Request failed: ${error instanceof Error ? error.message : String(error)}`,
			"NETWORK_ERROR",
		);
	}
}

/**
 * Safely parses JSON from a response, handling non-JSON bodies gracefully.
 */
export async function safeJsonParse<T>(response: Response): Promise<T | null> {
	const text = await response.text();
	try {
		return JSON.parse(text) as T;
	} catch {
		return null;
	}
}
