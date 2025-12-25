import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { KoineError, type KoineErrorCode } from "./errors.js";
import type {
	ErrorResponse,
	GenerateObjectResponse,
	GenerateTextResponse,
	KoineConfig,
	KoineStreamResult,
	KoineUsage,
	SSEErrorEvent,
	SSEResultEvent,
	SSETextEvent,
} from "./types.js";

/**
 * Known error codes for type-safe validation.
 */
const KNOWN_ERROR_CODES = new Set<KoineErrorCode>([
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
function toErrorCode(
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
function validateConfig(config: KoineConfig): void {
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
function createAbortSignal(
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
async function safeFetch(
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
async function safeJsonParse<T>(response: Response): Promise<T | null> {
	const text = await response.text();
	try {
		return JSON.parse(text) as T;
	} catch {
		return null;
	}
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
	options: {
		system?: string;
		prompt: string;
		sessionId?: string;
		signal?: AbortSignal;
	},
): Promise<{
	text: string;
	usage: KoineUsage;
	sessionId: string;
}> {
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

/**
 * Parses SSE events from a ReadableStream.
 * SSE format: "event: name\ndata: {...}\n\n"
 */
function createSSEParser(): TransformStream<
	Uint8Array,
	{ event: string; data: string }
> {
	let buffer = "";
	// Reuse decoder with stream mode to correctly handle multi-byte UTF-8 chars spanning chunks
	const decoder = new TextDecoder();

	return new TransformStream({
		transform(chunk, controller) {
			buffer += decoder.decode(chunk, { stream: true });

			// SSE events are separated by double newlines
			const events = buffer.split("\n\n");
			// Keep the last potentially incomplete event in the buffer
			buffer = events.pop() || "";

			for (const eventStr of events) {
				if (!eventStr.trim()) continue;

				const lines = eventStr.split("\n");
				let eventType = "";
				let data = "";

				for (const line of lines) {
					if (line.startsWith("event: ")) {
						eventType = line.slice(7);
					} else if (line.startsWith("data: ")) {
						data = line.slice(6);
					}
				}

				if (eventType && data) {
					controller.enqueue({ event: eventType, data });
				}
			}
		},
		flush(controller) {
			// Process any remaining data in buffer
			if (buffer.trim()) {
				const lines = buffer.split("\n");
				let eventType = "";
				let data = "";

				for (const line of lines) {
					if (line.startsWith("event: ")) {
						eventType = line.slice(7);
					} else if (line.startsWith("data: ")) {
						data = line.slice(6);
					}
				}

				if (eventType && data) {
					controller.enqueue({ event: eventType, data });
				}
			}
		},
	});
}

/**
 * Streams text response from Koine gateway service.
 *
 * @param config - Client configuration including baseUrl, authKey, and timeout
 * @param options - Request options
 * @param options.prompt - The user prompt to send
 * @param options.system - Optional system prompt for context
 * @param options.sessionId - Optional session ID to continue a conversation
 * @param options.signal - Optional AbortSignal for cancellation
 * @returns KoineStreamResult containing:
 *   - textStream: ReadableStream of text chunks (async iterable)
 *   - sessionId: Promise that resolves early when session event arrives
 *   - usage: Promise that resolves when stream completes
 *   - text: Promise containing full accumulated text
 * @throws {KoineError} When connection fails or stream encounters an error
 */
export async function streamText(
	config: KoineConfig,
	options: {
		system?: string;
		prompt: string;
		sessionId?: string;
		signal?: AbortSignal;
	},
): Promise<KoineStreamResult> {
	validateConfig(config);

	const response = await safeFetch(
		`${config.baseUrl}/stream`,
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

	if (!response.body) {
		throw new KoineError(
			"No response body from Koine gateway",
			"NO_RESPONSE_BODY",
		);
	}

	// Set up promises for session, usage, and accumulated text
	let resolveSessionId: (value: string) => void;
	let rejectSessionId: (error: Error) => void;
	const sessionIdPromise = new Promise<string>((resolve, reject) => {
		resolveSessionId = resolve;
		rejectSessionId = reject;
	});

	let resolveUsage: (value: KoineUsage) => void;
	let rejectUsage: (error: Error) => void;
	const usagePromise = new Promise<KoineUsage>((resolve, reject) => {
		resolveUsage = resolve;
		rejectUsage = reject;
	});

	let resolveText: (value: string) => void;
	let rejectText: (error: Error) => void;
	const textPromise = new Promise<string>((resolve, reject) => {
		resolveText = resolve;
		rejectText = reject;
	});

	let accumulatedText = "";
	let sessionIdReceived = false;
	let usageReceived = false;
	let textResolved = false;

	// Transform SSE events into text chunks
	const textStream = response.body.pipeThrough(createSSEParser()).pipeThrough(
		new TransformStream<{ event: string; data: string }, string>({
			transform(sseEvent, controller) {
				// Critical events (session, result, error, done) must propagate parse errors
				// Text events can log and continue - degraded content is better than total failure
				const isCriticalEvent = ["session", "result", "error", "done"].includes(
					sseEvent.event,
				);

				try {
					switch (sseEvent.event) {
						case "session": {
							const parsed = JSON.parse(sseEvent.data) as { sessionId: string };
							if (!sessionIdReceived) {
								sessionIdReceived = true;
								resolveSessionId(parsed.sessionId);
							}
							break;
						}
						case "text": {
							const parsed = JSON.parse(sseEvent.data) as SSETextEvent;
							accumulatedText += parsed.text;
							controller.enqueue(parsed.text);
							break;
						}
						case "result": {
							const parsed = JSON.parse(sseEvent.data) as SSEResultEvent;
							usageReceived = true;
							resolveUsage(parsed.usage);
							if (!sessionIdReceived) {
								sessionIdReceived = true;
								resolveSessionId(parsed.sessionId);
							}
							break;
						}
						case "error": {
							const parsed = JSON.parse(sseEvent.data) as SSEErrorEvent;
							const error = new KoineError(
								parsed.error,
								toErrorCode(parsed.code, "STREAM_ERROR"),
							);
							usageReceived = true; // Prevent double rejection in flush
							rejectUsage(error);
							rejectText(error);
							if (!sessionIdReceived) {
								rejectSessionId(error);
							}
							controller.error(error);
							break;
						}
						case "done": {
							// Stream complete, resolve the text promise
							if (!textResolved) {
								textResolved = true;
								resolveText(accumulatedText);
							}
							break;
						}
					}
				} catch (parseError) {
					const parseErrorMessage =
						parseError instanceof Error
							? parseError.message
							: String(parseError);

					if (isCriticalEvent) {
						// Critical event parse failure - propagate error
						const error = new KoineError(
							`Failed to parse critical SSE event '${sseEvent.event}': ${parseErrorMessage}`,
							"SSE_PARSE_ERROR",
							sseEvent.data,
						);
						if (!usageReceived) {
							usageReceived = true;
							rejectUsage(error);
						}
						if (!textResolved) {
							textResolved = true;
							rejectText(error);
						}
						if (!sessionIdReceived) {
							rejectSessionId(error);
						}
						controller.error(error);
					} else {
						// Non-critical event (text) - log warning but continue stream
						// Degraded content is better than total failure
						console.warn(
							`[Koine SDK] Failed to parse SSE text event: ${parseErrorMessage}. Raw data: ${sseEvent.data?.substring(0, 100)}`,
						);
					}
				}
			},
			flush() {
				// Handle promises that were never resolved/rejected during stream
				if (!sessionIdReceived) {
					rejectSessionId(
						new KoineError("Stream ended without session ID", "NO_SESSION"),
					);
				}
				if (!usageReceived) {
					rejectUsage(
						new KoineError(
							"Stream ended without usage information",
							"NO_USAGE",
						),
					);
				}
				if (!textResolved) {
					resolveText(accumulatedText);
				}
			},
		}),
	);

	return {
		textStream,
		sessionId: sessionIdPromise,
		usage: usagePromise,
		text: textPromise,
	};
}

/**
 * Generates structured JSON response from Koine gateway service.
 * Converts the provided Zod schema to JSON Schema format for the gateway.
 *
 * @typeParam T - The type of the expected response object, inferred from schema
 * @param config - Client configuration including baseUrl, authKey, and timeout
 * @param options - Request options
 * @param options.prompt - The user prompt describing what to extract
 * @param options.schema - Zod schema defining the expected response structure
 * @param options.system - Optional system prompt for context
 * @param options.sessionId - Optional session ID to continue a conversation
 * @param options.signal - Optional AbortSignal for cancellation
 * @returns Object containing parsed and validated response, raw text, usage, and sessionId
 * @throws {KoineError} With code 'VALIDATION_ERROR' if response doesn't match schema
 * @throws {KoineError} With code 'HTTP_ERROR' for network/authentication failures
 */
export async function generateObject<T>(
	config: KoineConfig,
	options: {
		system?: string;
		prompt: string;
		schema: z.ZodSchema<T>;
		sessionId?: string;
		signal?: AbortSignal;
	},
): Promise<{
	object: T;
	rawText: string;
	usage: KoineUsage;
	sessionId: string;
}> {
	validateConfig(config);

	// Convert Zod schema to JSON Schema for the gateway service
	const jsonSchema = zodToJsonSchema(options.schema, {
		$refStrategy: "none",
		target: "jsonSchema7",
	});

	const response = await safeFetch(
		`${config.baseUrl}/generate-object`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${config.authKey}`,
			},
			body: JSON.stringify({
				system: options.system,
				prompt: options.prompt,
				schema: jsonSchema,
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

	const result = await safeJsonParse<GenerateObjectResponse>(response);
	if (!result) {
		throw new KoineError(
			"Invalid response from Koine gateway: expected JSON",
			"INVALID_RESPONSE",
		);
	}

	// Validate the response against the Zod schema
	const parseResult = options.schema.safeParse(result.object);
	if (!parseResult.success) {
		throw new KoineError(
			`Response validation failed: ${parseResult.error.message}`,
			"VALIDATION_ERROR",
			result.rawText,
		);
	}

	return {
		object: parseResult.data,
		rawText: result.rawText,
		usage: result.usage,
		sessionId: result.sessionId,
	};
}
