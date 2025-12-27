import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { KoineError } from "./errors.js";
import {
	createAbortSignal,
	safeFetch,
	safeJsonParse,
	toErrorCode,
	validateConfig,
} from "./http.js";
import { createSSEParser } from "./stream/sse.js";
import type {
	ErrorResponse,
	KoineConfig,
	KoineStreamObjectResult,
	KoineUsage,
	SSEErrorEvent,
	SSEObjectEvent,
	SSEPartialObjectEvent,
	SSEResultEvent,
} from "./types.js";

/** Events where parse errors must propagate (vs partial-object which can log and continue) */
const CRITICAL_EVENTS = new Set([
	"session",
	"result",
	"error",
	"done",
	"object",
]);

/**
 * Streams structured JSON objects from Koine gateway service.
 *
 * @typeParam T - The type of the expected response object, inferred from schema
 * @param config - Client configuration including baseUrl, authKey, and timeout
 * @param options - Request options
 * @param options.prompt - The user prompt describing what to extract
 * @param options.schema - Zod schema defining the expected response structure
 * @param options.system - Optional system prompt for context
 * @param options.sessionId - Optional session ID to continue a conversation
 * @param options.signal - Optional AbortSignal for cancellation
 * @returns KoineStreamObjectResult containing:
 *   - partialObjectStream: ReadableStream of partial objects (async iterable)
 *   - object: Promise that resolves to final validated object
 *   - sessionId: Promise that resolves early when session event arrives
 *   - usage: Promise that resolves when stream completes
 * @throws {KoineError} When connection fails or stream encounters an error
 * @throws {KoineError} With code 'VALIDATION_ERROR' if final object fails schema validation
 * @throws {KoineError} With code 'NO_OBJECT' if stream ends without receiving final object
 */
export async function streamObject<T>(
	config: KoineConfig,
	options: StreamObjectOptions<T>,
): Promise<KoineStreamObjectResult<T>> {
	validateConfig(config);

	// Convert Zod schema to JSON Schema for the gateway service
	const jsonSchema = zodToJsonSchema(options.schema, {
		$refStrategy: "none",
		target: "jsonSchema7",
	});

	const response = await safeFetch(
		`${config.baseUrl}/stream-object`,
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

	if (!response.body) {
		throw new KoineError(
			"No response body from Koine gateway",
			"NO_RESPONSE_BODY",
		);
	}

	// Set up promises for session, usage, and final object
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

	let resolveObject: (value: T) => void;
	let rejectObject: (error: Error) => void;
	const objectPromise = new Promise<T>((resolve, reject) => {
		resolveObject = resolve;
		rejectObject = reject;
	});

	let sessionIdReceived = false;
	let usageReceived = false;
	let objectReceived = false;

	// Transform SSE events into partial objects
	const partialObjectStream = response.body
		.pipeThrough(createSSEParser())
		.pipeThrough(
			new TransformStream<{ event: string; data: string }, T>({
				transform(sseEvent, controller) {
					const isCriticalEvent = CRITICAL_EVENTS.has(sseEvent.event);

					try {
						switch (sseEvent.event) {
							case "session": {
								const parsed = JSON.parse(sseEvent.data) as {
									sessionId: string;
								};
								if (!sessionIdReceived) {
									sessionIdReceived = true;
									resolveSessionId(parsed.sessionId);
								}
								break;
							}
							case "partial-object": {
								const parsed = JSON.parse(
									sseEvent.data,
								) as SSEPartialObjectEvent;
								// Skip null/non-object partials (can happen during early JSON parsing)
								if (
									parsed.parsed === null ||
									typeof parsed.parsed !== "object"
								) {
									break;
								}
								// Try to validate partial object with Zod (warn on failure, don't stop)
								const partialResult = options.schema.safeParse(parsed.parsed);
								if (partialResult.success) {
									controller.enqueue(partialResult.data);
								} else {
									// Partial objects may not fully validate during streaming - expected.
									// Enqueue raw parsed data for consumers to handle incrementally.
									controller.enqueue(parsed.parsed as T);
								}
								break;
							}
							case "object": {
								const parsed = JSON.parse(sseEvent.data) as SSEObjectEvent;
								// Validate final object strictly with Zod
								const finalResult = options.schema.safeParse(parsed.object);
								if (finalResult.success) {
									objectReceived = true;
									resolveObject(finalResult.data);
								} else {
									const error = new KoineError(
										`Response validation failed: ${finalResult.error.message}`,
										"VALIDATION_ERROR",
										JSON.stringify(parsed.object),
									);
									objectReceived = true;
									rejectObject(error);
								}
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
								usageReceived = true;
								rejectUsage(error);
								if (!objectReceived) {
									objectReceived = true;
									rejectObject(error);
								}
								if (!sessionIdReceived) {
									rejectSessionId(error);
								}
								controller.error(error);
								break;
							}
							case "done": {
								break;
							}
						}
					} catch (parseError) {
						const parseErrorMessage =
							parseError instanceof Error
								? parseError.message
								: String(parseError);

						if (isCriticalEvent) {
							const error = new KoineError(
								`Failed to parse critical SSE event '${sseEvent.event}': ${parseErrorMessage}`,
								"SSE_PARSE_ERROR",
								sseEvent.data,
							);
							if (!usageReceived) {
								usageReceived = true;
								rejectUsage(error);
							}
							if (!objectReceived) {
								objectReceived = true;
								rejectObject(error);
							}
							if (!sessionIdReceived) {
								rejectSessionId(error);
							}
							controller.error(error);
						} else {
							// Non-critical event (partial-object) - log warning but continue
							console.warn(
								`[Koine SDK] Failed to parse SSE partial-object event: ${parseErrorMessage}. Raw data: ${sseEvent.data?.substring(0, 100)}`,
							);
						}
					}
				},
				flush() {
					// Handle promises that were never resolved/rejected
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
					if (!objectReceived) {
						rejectObject(
							new KoineError("Stream ended without final object", "NO_OBJECT"),
						);
					}
				},
			}),
		);

	// Augment the stream with Symbol.asyncIterator for ergonomic for-await-of usage
	const iterablePartialObjectStream = Object.assign(partialObjectStream, {
		async *[Symbol.asyncIterator](): AsyncGenerator<T> {
			const reader = partialObjectStream.getReader();
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) return;
					yield value;
				}
			} finally {
				reader.releaseLock();
			}
		},
	});

	return {
		partialObjectStream: iterablePartialObjectStream,
		object: objectPromise,
		sessionId: sessionIdPromise,
		usage: usagePromise,
	};
}

/**
 * Request options for streaming object generation.
 */
export interface StreamObjectOptions<T> {
	/** The user prompt describing what to extract */
	prompt: string;
	/** Zod schema defining the expected response structure */
	schema: z.ZodSchema<T>;
	/** Optional system prompt for context */
	system?: string;
	/** Optional session ID to continue a conversation */
	sessionId?: string;
	/** Optional AbortSignal for cancellation */
	signal?: AbortSignal;
}
