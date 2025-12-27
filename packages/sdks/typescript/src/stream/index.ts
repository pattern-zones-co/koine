import { KoineError } from "../errors.js";
import {
	createAbortSignal,
	safeFetch,
	safeJsonParse,
	toErrorCode,
	validateConfig,
} from "../http.js";
import type {
	ErrorResponse,
	KoineConfig,
	KoineStreamResult,
	KoineUsage,
	SSEErrorEvent,
	SSEResultEvent,
	SSETextEvent,
} from "../types.js";
import { createSSEParser } from "./sse.js";

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
		allowedTools?: string[];
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
				allowedTools: options.allowedTools,
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

	// Augment the stream with Symbol.asyncIterator for ergonomic for-await-of usage
	const iterableTextStream = Object.assign(textStream, {
		async *[Symbol.asyncIterator](): AsyncGenerator<string> {
			const reader = textStream.getReader();
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
		textStream: iterableTextStream,
		sessionId: sessionIdPromise,
		usage: usagePromise,
		text: textPromise,
	};
}

/**
 * Request options for streaming text generation.
 */
export interface StreamTextOptions {
	/** The user prompt to send */
	prompt: string;
	/** Optional system prompt for context */
	system?: string;
	/** Optional session ID to continue a conversation */
	sessionId?: string;
	/** Optional list of tools to allow for this request */
	allowedTools?: string[];
	/** Optional AbortSignal for cancellation */
	signal?: AbortSignal;
}
