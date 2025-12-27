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
 * Accumulates JSON tokens and parses partial objects as they arrive.
 *
 * Features:
 * - Partial JSON parsing with partial-json library
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

		// Build CLI arguments
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
						} catch {
							// Partial JSON not yet parseable, continue accumulating
						}
					} else if (parsed.type === "result") {
						// Final result - emit the complete object
						if (parsed.structured_output !== undefined) {
							safeSendEvent("object", {
								object: parsed.structured_output,
							});
						} else if (accumulatedJson) {
							// Fall back to parsing accumulated JSON
							try {
								const finalObject = JSON.parse(accumulatedJson);
								safeSendEvent("object", {
									object: finalObject,
								});
							} catch {
								logger.warn("Failed to parse final accumulated JSON", {
									accumulatedLength: accumulatedJson.length,
								});
							}
						}

						safeSendEvent("result", {
							sessionId: parsed.session_id || currentSessionId,
							usage: createUsageInfo(parsed.usage),
						});
					}
				} catch (error) {
					// Only catch JSON parse errors - other errors should propagate
					if (error instanceof SyntaxError) {
						logger.warn("Stream-object: non-JSON line received", {
							linePreview: line.slice(0, 100),
						});
					} else {
						throw error;
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
						if (parsed.structured_output !== undefined) {
							safeSendEvent("object", {
								object: parsed.structured_output,
							});
						}
						safeSendEvent("result", {
							sessionId: parsed.session_id || currentSessionId,
							usage: createUsageInfo(parsed.usage),
						});
					}
				} catch {
					// Log but don't fail - incomplete JSON in final buffer is expected
					// when the CLI exits mid-stream (e.g., user cancellation)
					logger.info(
						"Final buffer parse incomplete (expected during interrupts)",
						{
							bufferLength: lineBuffer.length,
							bufferPreview: lineBuffer.slice(0, 100),
						},
					);
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
 * Builds CLI arguments for stream-object mode.
 * Note: --verbose is required when using --output-format stream-json with --print
 */
function buildStreamObjectArgs(options: {
	prompt: string;
	system?: string;
	sessionId?: string;
	model?: string;
	schema: Record<string, unknown>;
}): string[] {
	// --verbose is required for stream-json output with --print
	// --include-partial-messages enables progressive token streaming
	const args: string[] = [
		"--print",
		"--verbose",
		"--output-format",
		"stream-json",
		"--include-partial-messages",
		"--json-schema",
		JSON.stringify(options.schema),
	];

	// Model selection (alias like 'sonnet' or full name)
	if (options.model) {
		args.push("--model", options.model);
	}

	if (options.system) {
		args.push("--system-prompt", options.system);
	}

	// Resume specific session by ID
	if (options.sessionId) {
		args.push("--resume", options.sessionId);
	}

	args.push(options.prompt);

	return args;
}

export default router;
