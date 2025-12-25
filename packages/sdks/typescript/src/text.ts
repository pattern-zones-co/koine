import { KoineError } from "./errors.js";
import {
	createAbortSignal,
	safeFetch,
	safeJsonParse,
	toErrorCode,
	validateConfig,
} from "./http.js";
import type {
	ErrorResponse,
	GenerateTextResponse,
	KoineConfig,
	KoineUsage,
} from "./types.js";

/**
 * Request options for text generation.
 */
export interface GenerateTextOptions {
	/** The user prompt to send */
	prompt: string;
	/** Optional system prompt for context */
	system?: string;
	/** Optional session ID to continue a conversation */
	sessionId?: string;
	/** Optional AbortSignal for cancellation */
	signal?: AbortSignal;
}

/**
 * Text generation result.
 */
export interface GenerateTextResult {
	readonly text: string;
	readonly usage: KoineUsage;
	readonly sessionId: string;
}

/**
 * Generates plain text response from Koine gateway service.
 *
 * @param config - Client configuration including baseUrl, authKey, and timeout
 * @param options - Request options
 * @param options.prompt - The user prompt to send
 * @param options.system - Optional system prompt for context
 * @param options.sessionId - Optional session ID to continue a conversation
 * @param options.signal - Optional AbortSignal for cancellation
 * @returns Object containing response text, usage stats, and session ID
 * @throws {KoineError} When the request fails or returns invalid response
 */
export async function generateText(
	config: KoineConfig,
	options: GenerateTextOptions,
): Promise<GenerateTextResult> {
	validateConfig(config);

	const response = await safeFetch(
		`${config.baseUrl}/generate-text`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${config.authKey}`,
			},
			body: JSON.stringify({
				system: options.system,
				prompt: options.prompt,
				sessionId: options.sessionId,
				model: config.model,
			}),
			signal: createAbortSignal(config.timeout, options.signal),
		},
		config.timeout,
	);

	if (!response.ok) {
		const errorBody = await safeJsonParse<ErrorResponse>(response);
		throw new KoineError(
			errorBody?.error || `HTTP ${response.status} ${response.statusText}`,
			toErrorCode(errorBody?.code, "HTTP_ERROR"),
			errorBody?.rawText,
		);
	}

	const result = await safeJsonParse<GenerateTextResponse>(response);
	if (!result) {
		throw new KoineError(
			"Invalid response from Koine gateway: expected JSON",
			"INVALID_RESPONSE",
		);
	}

	return {
		text: result.text,
		usage: result.usage,
		sessionId: result.sessionId,
	};
}
