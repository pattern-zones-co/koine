import { spawn } from "node:child_process";
import { type Request, type Response, Router } from "express";
import { Allow, parse } from "partial-json";
import { v4 as uuidv4 } from "uuid";
import { buildClaudeEnv } from "../cli.js";
import { withConcurrencyLimit } from "../concurrency.js";
import { logger } from "../logger.js";
import {
	type CliUsageInfo,
	createUsageInfo,
	streamObjectRequestSchema,
} from "../types.js";

/** Default streaming timeout: 10 minutes (longer than non-streaming due to interactive nature) */
const DEFAULT_STREAM_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Type definitions for Claude CLI stream-json output format.
 * These types match the JSON objects emitted by `claude --output-format stream-json`.
 */
interface StreamResultMessage {
	type: "result";
	session_id?: string;
	usage?: CliUsageInfo;
	structured_output?: unknown;
}

/**
 * Stream event for partial message chunks (with --include-partial-messages).
 * These provide progressive text deltas as tokens arrive.
 */
interface StreamEventMessage {
	type: "stream_event";
	event?: {
		type: string;
		delta?: {
			type: string;
			text?: string;
		};
	};
}

type StreamMessage = StreamResultMessage | StreamEventMessage;

const router: Router = Router();

/**
 * POST /stream-object
 *
 * Streams partial JSON objects from Claude CLI using Server-Sent Events (SSE).
 * Uses prompt injection to instruct Claude to output JSON, then parses partial
 * objects as tokens arrive using the partial-json library.
 *
 * NOTE: We use prompt injection rather than --json-schema because when using
 * the CLI's --json-schema flag with streaming, JSON tokens are not emitted in
 * stream events - only the final object is provided in result.structured_output.
 * See: https://github.com/anthropics/claude-code/issues/15511
 *
 * Trade-off: Since we use prompt injection rather than constrained decoding,
 * the model may occasionally output non-JSON content or wrap JSON in markdown.
 * The parseJsonResponse() function includes fallback strategies to handle this.
 *
 * Features:
 * - Real-time partial JSON parsing with partial-json library
 * - Execution timeout (10 minutes default)
 * - Line buffering for TCP chunk handling
 * - Proper cleanup on client disconnect
 */
router.post(
	"/stream-object",
	withConcurrencyLimit("streaming", async (req: Request, res: Response) => {
		const parseResult = streamObjectRequestSchema.safeParse(req.body);

		if (!parseResult.success) {
			res.status(400).json({
				error: "Invalid request body",
				code: "VALIDATION_ERROR",
				rawText: JSON.stringify(parseResult.error.issues),
			});
			return;
		}

		const { prompt, system, sessionId, model, userEmail, schema } =
			parseResult.data;

		// Set up SSE headers
		res.setHeader("Content-Type", "text/event-stream");
		res.setHeader("Cache-Control", "no-cache");
		res.setHeader("Connection", "keep-alive");
		res.setHeader("X-Accel-Buffering", "no");
		res.flushHeaders(); // Important: send headers immediately for SSE

		// Disable Nagle's algorithm for immediate write transmission
		// This prevents TCP from batching small writes together
		if (res.socket) {
			res.socket.setNoDelay(true);
		}

		// Track response state to prevent writes after close
		let isResponseClosed = false;
		let timeoutId: NodeJS.Timeout | undefined;

		// Build CLI arguments with prompt injection for JSON output
		const args = buildStreamObjectArgs({
			prompt,
			system,
			sessionId,
			model,
			schema,
		});

		logger.info("Spawning Claude CLI for stream-object", { args });

		const claude = spawn("claude", args, {
			stdio: ["pipe", "pipe", "pipe"],
			env: buildClaudeEnv({ userEmail }),
		});

		const currentSessionId = sessionId || uuidv4();

		// Safe event sender that checks response state
		const safeSendEvent = (event: string, data: unknown): boolean => {
			if (isResponseClosed) {
				logger.warn("Attempted to send event after response closed", { event });
				return false;
			}
			try {
				// Combine into single write for efficiency
				const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
				res.write(message);

				// Flush if available (compression middleware compatibility)
				const flushable = res as { flush?: () => void };
				if (flushable.flush) {
					flushable.flush();
				}

				return true;
			} catch (error) {
				logger.error("Failed to write SSE event", {
					event,
					error: error instanceof Error ? error.message : String(error),
				});
				isResponseClosed = true;
				return false;
			}
		};

		// Cleanup function to properly terminate everything
		const cleanup = (reason: string) => {
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutId = undefined;
			}
			if (claude.exitCode === null && !claude.killed) {
				logger.info("Killing Claude CLI process", { reason });
				try {
					claude.kill("SIGTERM");
				} catch (killError) {
					logger.warn("Failed to send SIGTERM to CLI", {
						reason,
						error:
							killError instanceof Error
								? killError.message
								: String(killError),
					});
					return;
				}
				// Force kill after 1 second if still running
				const forceKillTimeout = setTimeout(() => {
					if (claude.exitCode === null && !claude.killed) {
						logger.warn(
							"CLI did not terminate after SIGTERM, sending SIGKILL",
							{ reason },
						);
						try {
							claude.kill("SIGKILL");
						} catch (killError) {
							logger.error("Failed to send SIGKILL to CLI", {
								reason,
								error:
									killError instanceof Error
										? killError.message
										: String(killError),
							});
						}
					}
				}, 1000);
				// Clear the force kill timeout if process exits normally
				claude.once("close", () => clearTimeout(forceKillTimeout));
			}
		};

		// Set up execution timeout
		timeoutId = setTimeout(() => {
			logger.error("Stream execution timed out", {
				timeoutMs: DEFAULT_STREAM_TIMEOUT_MS,
				sessionId: currentSessionId,
			});
			safeSendEvent("error", {
				error: `Stream timed out after ${DEFAULT_STREAM_TIMEOUT_MS / 1000} seconds`,
				code: "TIMEOUT_ERROR",
			});
			cleanup("timeout");
			safeSendEvent("done", {
				code: null,
				signal: "SIGTERM",
				reason: "timeout",
			});
			isResponseClosed = true;
			res.end();
		}, DEFAULT_STREAM_TIMEOUT_MS);

		// Send initial event with session info
		safeSendEvent("session", { sessionId: currentSessionId });

		// Line buffer for handling TCP chunking
		let lineBuffer = "";

		// Accumulated JSON string for partial parsing
		let accumulatedJson = "";

		// Track last successfully parsed object to avoid duplicate events
		let lastParsedJson = "";

		// Track if we've sent the final object event
		let objectEventSent = false;

		// Collect stderr for error reporting (but don't spam events)
		let stderrOutput = "";

		claude.stdout.on("data", (data: Buffer) => {
			// Append to buffer to handle partial lines from TCP chunking
			lineBuffer += data.toString();

			// Process complete lines only
			const lines = lineBuffer.split("\n");
			// Keep the last potentially incomplete line in the buffer
			lineBuffer = lines.pop() || "";

			for (const line of lines) {
				if (!line.trim()) continue;

				try {
					const parsed = JSON.parse(line) as StreamMessage;

					if (parsed.type === "stream_event") {
						// Log if we get a content_block_delta without text (unexpected structure)
						if (
							parsed.event?.type === "content_block_delta" &&
							!parsed.event.delta?.text
						) {
							logger.warn("content_block_delta missing text field", {
								delta: parsed.event.delta,
							});
						}
					}

					if (
						parsed.type === "stream_event" &&
						parsed.event?.type === "content_block_delta" &&
						parsed.event.delta?.text
					) {
						// Accumulate JSON text
						accumulatedJson += parsed.event.delta.text;

						// Try to parse as partial JSON
						try {
							const partialObject = parse(accumulatedJson, Allow.ALL);
							const partialJsonStr = JSON.stringify(partialObject);

							// Only send if parsing succeeded and object changed
							if (
								partialObject !== undefined &&
								partialJsonStr !== lastParsedJson
							) {
								lastParsedJson = partialJsonStr;
								safeSendEvent("partial-object", {
									partial: accumulatedJson,
									parsed: partialObject,
								});
							}
						} catch (parseError) {
							// SyntaxError is expected when JSON is incomplete - continue accumulating
							// Log unexpected errors (e.g., TypeError from stringify)
							if (!(parseError instanceof SyntaxError)) {
								logger.warn("Unexpected error during partial JSON parsing", {
									error:
										parseError instanceof Error
											? parseError.message
											: String(parseError),
									accumulatedLength: accumulatedJson.length,
								});
							}
						}
					} else if (parsed.type === "result") {
						// Final result - parse the accumulated JSON text
						if (accumulatedJson && !objectEventSent) {
							try {
								const { object: finalObject, strategy } =
									parseJsonResponse(accumulatedJson);
								// Warn if fallback extraction was needed (non-clean JSON)
								if (strategy !== "direct") {
									logger.warn("JSON required fallback extraction", {
										strategy,
										accumulatedLength: accumulatedJson.length,
									});
									safeSendEvent("warning", {
										message: `JSON extraction used fallback strategy: ${strategy}`,
										code: "EXTRACTION_FALLBACK",
									});
								}
								safeSendEvent("object", {
									object: finalObject,
								});
								objectEventSent = true;
							} catch (parseError) {
								logger.warn("Failed to parse final accumulated JSON", {
									accumulatedLength: accumulatedJson.length,
									error:
										parseError instanceof Error
											? parseError.message
											: String(parseError),
								});
								safeSendEvent("error", {
									error: "Failed to parse final JSON object",
									code: "PARSE_ERROR",
								});
							}
						} else if (!objectEventSent) {
							logger.warn("Result received without accumulated JSON");
							safeSendEvent("error", {
								error: "No object data received from CLI",
								code: "PARSE_ERROR",
							});
						}

						safeSendEvent("result", {
							sessionId: parsed.session_id || currentSessionId,
							usage: createUsageInfo(parsed.usage),
						});
					}
				} catch (error) {
					if (error instanceof SyntaxError) {
						// Non-JSON line from CLI - log but continue processing
						logger.warn("Stream-object: non-JSON line received", {
							linePreview: line.slice(0, 100),
						});
					} else {
						// Unexpected error - log and notify client, but continue stream
						logger.error("Unexpected error processing stream line", {
							error: error instanceof Error ? error.message : String(error),
							linePreview: line.slice(0, 100),
						});
						safeSendEvent("error", {
							error: `Stream processing error: ${error instanceof Error ? error.message : String(error)}`,
							code: "INTERNAL_ERROR",
						});
					}
				}
			}
		});

		claude.stderr.on("data", (data: Buffer) => {
			const stderrChunk = data.toString();
			stderrOutput += stderrChunk;
			logger.warn("Claude CLI stderr", { stderr: stderrChunk });
			// Don't send every stderr chunk as an error event - aggregate and report on close
		});

		claude.on("close", (code, signal) => {
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutId = undefined;
			}

			logger.info("Claude CLI closed", { code, signal, stderrOutput });

			// Process any remaining data in line buffer
			if (lineBuffer.trim()) {
				try {
					const parsed = JSON.parse(lineBuffer) as StreamMessage;
					if (parsed.type === "result") {
						// If we haven't sent the object yet, parse accumulated JSON
						if (accumulatedJson && !objectEventSent) {
							try {
								const { object: finalObject, strategy } =
									parseJsonResponse(accumulatedJson);
								// Warn if fallback extraction was needed (non-clean JSON)
								if (strategy !== "direct") {
									logger.warn("JSON required fallback extraction", {
										strategy,
										accumulatedLength: accumulatedJson.length,
									});
									safeSendEvent("warning", {
										message: `JSON extraction used fallback strategy: ${strategy}`,
										code: "EXTRACTION_FALLBACK",
									});
								}
								safeSendEvent("object", { object: finalObject });
								objectEventSent = true;
							} catch (parseError) {
								logger.error("Failed to parse final object in close handler", {
									accumulatedLength: accumulatedJson.length,
									accumulatedPreview: accumulatedJson.slice(0, 200),
									error:
										parseError instanceof Error
											? parseError.message
											: String(parseError),
								});
								safeSendEvent("error", {
									error: "Failed to parse final JSON object",
									code: "PARSE_ERROR",
								});
							}
						}
						safeSendEvent("result", {
							sessionId: parsed.session_id || currentSessionId,
							usage: createUsageInfo(parsed.usage),
						});
					}
				} catch (bufferError) {
					// Incomplete buffer is expected during interrupts (non-zero exit or signal)
					// but may indicate a real error on clean exit
					const isInterrupt = code !== 0 || signal !== null;
					if (isInterrupt) {
						logger.info(
							"Final buffer parse incomplete (expected during interrupts)",
							{
								code,
								signal,
								bufferLength: lineBuffer.length,
								bufferPreview: lineBuffer.slice(0, 100),
							},
						);
					} else {
						// Clean exit but unparseable buffer - this is unexpected
						// Notify client about potential data loss
						logger.warn("Unparseable data in buffer after clean CLI exit", {
							bufferLength: lineBuffer.length,
							bufferPreview: lineBuffer.slice(0, 100),
							error:
								bufferError instanceof Error
									? bufferError.message
									: String(bufferError),
						});
						safeSendEvent("warning", {
							message: "Some CLI output could not be processed",
							code: "BUFFER_PARSE_WARNING",
						});
					}
				}
			}

			if (code !== 0 && !isResponseClosed) {
				const errorParts = [`CLI exited with code ${code}`];
				if (signal) errorParts.push(`signal: ${signal}`);
				if (stderrOutput) errorParts.push(stderrOutput.trim());

				safeSendEvent("error", {
					error: errorParts.join(" - "),
					code: "CLI_EXIT_ERROR",
				});
			}

			safeSendEvent("done", { code, signal });
			isResponseClosed = true;
			res.end();
		});

		claude.on("error", (error) => {
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutId = undefined;
			}

			logger.error("Claude CLI spawn error", { error: error.message });
			safeSendEvent("error", {
				error: error.message,
				code: "SPAWN_ERROR",
			});
			safeSendEvent("done", {
				code: null,
				signal: null,
				reason: "spawn_error",
			});
			isResponseClosed = true;
			res.end();
		});

		// Handle client disconnect - use res.on("close") for SSE
		// Note: req.on("close") fires immediately in some Express configurations
		res.on("close", () => {
			logger.info("Response closed event fired", {
				cliExitCode: claude.exitCode,
				cliKilled: claude.killed,
			});
			isResponseClosed = true;
			cleanup("client_disconnect");
		});

		claude.stdin.end();
	}),
);

/**
 * Result from parseJsonResponse including extraction metadata.
 */
interface ParsedJsonResult {
	object: unknown;
	/** Extraction strategy used: "direct", "markdown-block", "object-extraction", "array-extraction" */
	strategy: string;
}

/**
 * Attempts to parse JSON from Claude's response.
 * Since we use prompt injection rather than constrained decoding, Claude may
 * wrap JSON in markdown code blocks or include preamble text. This function
 * tries multiple extraction strategies in order of preference.
 *
 * Returns both the parsed object and the extraction strategy used, so callers
 * can warn users when fallback extraction was necessary.
 */
function parseJsonResponse(text: string): ParsedJsonResult {
	const parseAttempts: Array<{ strategy: string; error: string }> = [];

	// Try direct parse first
	try {
		return { object: JSON.parse(text), strategy: "direct" };
	} catch (error) {
		if (!(error instanceof SyntaxError)) {
			throw error; // Don't hide non-parse errors (TypeError, etc.)
		}
		parseAttempts.push({ strategy: "direct", error: error.message });
	}

	// Strip markdown code blocks if present
	const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (jsonBlockMatch) {
		try {
			return {
				object: JSON.parse(jsonBlockMatch[1].trim()),
				strategy: "markdown-block",
			};
		} catch (error) {
			if (!(error instanceof SyntaxError)) {
				throw error;
			}
			parseAttempts.push({ strategy: "markdown-block", error: error.message });
		}
	}

	// Try to find JSON object in the response
	const objectMatch = text.match(/\{[\s\S]*\}/);
	if (objectMatch) {
		try {
			return {
				object: JSON.parse(objectMatch[0]),
				strategy: "object-extraction",
			};
		} catch (error) {
			if (!(error instanceof SyntaxError)) {
				throw error;
			}
			parseAttempts.push({
				strategy: "object-extraction",
				error: error.message,
			});
		}
	}

	// Try to find JSON array in the response
	const arrayMatch = text.match(/\[[\s\S]*\]/);
	if (arrayMatch) {
		try {
			return {
				object: JSON.parse(arrayMatch[0]),
				strategy: "array-extraction",
			};
		} catch (error) {
			if (!(error instanceof SyntaxError)) {
				throw error;
			}
			parseAttempts.push({
				strategy: "array-extraction",
				error: error.message,
			});
		}
	}

	// Include diagnostic information in error
	const attemptsStr = parseAttempts
		.map((a) => `${a.strategy}: ${a.error}`)
		.join("; ");
	const preview = text.length > 200 ? `${text.slice(0, 200)}...` : text;
	throw new Error(
		`Failed to parse JSON from response. Attempts: [${attemptsStr}]. Preview: ${preview}`,
	);
}

/**
 * Builds CLI arguments for stream-object mode.
 * Uses prompt injection to instruct Claude to output JSON matching the schema.
 *
 * Note: --verbose is required when using --output-format stream-json with --print.
 * Without it, the CLI may not emit stream_event messages for partial content.
 */
function buildStreamObjectArgs(options: {
	prompt: string;
	system?: string;
	sessionId?: string;
	model?: string;
	schema: Record<string, unknown>;
}): string[] {
	// Build enhanced prompt that instructs Claude to output JSON matching schema
	const schemaString = JSON.stringify(options.schema, null, 2);
	const enhancedPrompt = `${options.prompt}

IMPORTANT: You MUST respond with ONLY valid JSON that matches this schema. No markdown, no explanations, no code blocks, just the raw JSON object.

JSON Schema:
${schemaString}`;

	const enhancedSystem = options.system
		? `${options.system}\n\nYou are a JSON generator. Always respond with valid JSON matching the provided schema. Output ONLY the JSON object, nothing else.`
		: "You are a JSON generator. Always respond with valid JSON matching the provided schema. Output ONLY the JSON object, nothing else.";

	// --verbose is required for stream-json output with --print
	// --include-partial-messages enables progressive token streaming
	const args: string[] = [
		"--print",
		"--verbose",
		"--output-format",
		"stream-json",
		"--include-partial-messages",
	];

	// Model selection (alias like 'sonnet' or full name)
	if (options.model) {
		args.push("--model", options.model);
	}

	args.push("--system-prompt", enhancedSystem);

	// Resume specific session by ID
	if (options.sessionId) {
		args.push("--resume", options.sessionId);
	}

	args.push(enhancedPrompt);

	return args;
}

export default router;
