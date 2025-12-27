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
 * NOTE: We use prompt injection rather than --json-schema because the CLI's
 * constrained decoding mode doesn't stream JSON tokens incrementally - it only
 * provides the complete object at the end. See:
 * https://github.com/anthropics/claude-code/issues/15511
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
		const { args } = buildStreamObjectArgs({
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
				claude.kill("SIGTERM");
				// Force kill after 1 second if still running
				setTimeout(() => {
					if (claude.exitCode === null && !claude.killed) {
						claude.kill("SIGKILL");
					}
				}, 1000);
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
								const finalObject = parseJsonResponse(accumulatedJson);
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
								const finalObject = parseJsonResponse(accumulatedJson);
								safeSendEvent("object", { object: finalObject });
								objectEventSent = true;
							} catch {
								// Error already logged in main handler
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
						logger.warn("Unparseable data in buffer after clean CLI exit", {
							bufferLength: lineBuffer.length,
							bufferPreview: lineBuffer.slice(0, 100),
							error:
								bufferError instanceof Error
									? bufferError.message
									: String(bufferError),
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
 * Attempts to parse JSON from Claude's response.
 * Handles common edge cases like markdown code blocks.
 */
function parseJsonResponse(text: string): unknown {
	// Try direct parse first
	try {
		return JSON.parse(text);
	} catch {
		// Continue to fallback strategies
	}

	// Strip markdown code blocks if present
	const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (jsonBlockMatch) {
		try {
			return JSON.parse(jsonBlockMatch[1].trim());
		} catch {
			// Continue to next strategy
		}
	}

	// Try to find JSON object in the response
	const objectMatch = text.match(/\{[\s\S]*\}/);
	if (objectMatch) {
		try {
			return JSON.parse(objectMatch[0]);
		} catch {
			// Continue to next strategy
		}
	}

	// Try to find JSON array in the response
	const arrayMatch = text.match(/\[[\s\S]*\]/);
	if (arrayMatch) {
		try {
			return JSON.parse(arrayMatch[0]);
		} catch {
			// Fall through to error
		}
	}

	throw new Error("Failed to parse JSON from response");
}

/**
 * Builds CLI arguments for stream-object mode.
 * Uses prompt injection to instruct Claude to output JSON matching the schema.
 * Note: --verbose is required when using --output-format stream-json with --print
 */
function buildStreamObjectArgs(options: {
	prompt: string;
	system?: string;
	sessionId?: string;
	model?: string;
	schema: Record<string, unknown>;
}): { args: string[]; enhancedPrompt: string; enhancedSystem: string } {
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

	return { args, enhancedPrompt, enhancedSystem };
}

export default router;
