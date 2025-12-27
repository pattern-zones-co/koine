import { spawn } from "node:child_process";
import { v4 as uuidv4 } from "uuid";
import { logger } from "./logger.js";
import {
	type ClaudeCliOutput,
	type ErrorCode,
	type UsageInfo,
	createUsageInfo,
} from "./types.js";

/**
 * Builds environment variables for Claude CLI with auth precedence.
 * Prefers API key over OAuth token when both are present.
 *
 * CLAUDE_CODE_OAUTH_TOKEN is an undocumented fallback for personal testing only.
 * OAuth tokens (Claude Pro/Max) operate under Anthropic's Consumer Terms which
 * prohibit automated access. Use ANTHROPIC_API_KEY for all automation.
 * See: https://www.anthropic.com/legal/consumer-terms
 */
export function buildClaudeEnv(): NodeJS.ProcessEnv {
	const env = { ...process.env };

	// API key takes precedence - OAuth is undocumented fallback for personal testing only.
	// OAuth tokens may violate Anthropic's Consumer Terms for automated use.
	if (env.ANTHROPIC_API_KEY) {
		env.CLAUDE_CODE_OAUTH_TOKEN = undefined;
	}

	return env;
}

/** Default CLI execution timeout: 5 minutes */
const DEFAULT_CLI_TIMEOUT_MS = 5 * 60 * 1000;

export interface ClaudeCliOptions {
	prompt: string;
	system?: string;
	sessionId?: string;
	/** Timeout in milliseconds. Default: 5 minutes */
	timeoutMs?: number;
	/** Model alias (e.g., 'sonnet', 'haiku') or full name */
	model?: string;
	/** JSON schema for constrained decoding (CLI enforces valid JSON output) */
	jsonSchema?: Record<string, unknown>;
}

export interface ClaudeCliResult {
	text: string;
	usage: UsageInfo;
	sessionId: string;
	/** Raw CLI output - always present on success (we throw on parse failure) */
	rawOutput: ClaudeCliOutput;
}

/**
 * Executes Claude CLI as a subprocess and returns the result.
 *
 * Uses `claude --print` for non-interactive execution with JSON output format
 * for structured parsing of results including token usage.
 *
 * Includes a configurable timeout (default: 5 minutes) to prevent hung processes.
 */
export async function executeClaudeCli(
	options: ClaudeCliOptions,
): Promise<ClaudeCliResult> {
	const args = buildCliArgs(options);
	const timeoutMs = options.timeoutMs ?? DEFAULT_CLI_TIMEOUT_MS;

	return new Promise((resolve, reject) => {
		let isSettled = false;
		let timeoutId: NodeJS.Timeout | undefined;

		const claude = spawn("claude", args, {
			stdio: ["pipe", "pipe", "pipe"],
			env: buildClaudeEnv(),
		});

		// Set up execution timeout
		if (timeoutMs > 0) {
			timeoutId = setTimeout(() => {
				if (!isSettled) {
					isSettled = true;
					logger.error("Claude CLI execution timed out", {
						timeoutMs,
						prompt: options.prompt.slice(0, 100),
					});
					claude.kill("SIGTERM");
					// Give it a moment to clean up, then force kill
					setTimeout(() => claude.kill("SIGKILL"), 1000);
					reject(
						new ClaudeCliError(
							`Claude CLI execution timed out after ${timeoutMs}ms`,
							"TIMEOUT_ERROR",
						),
					);
				}
			}, timeoutMs);
		}

		let stdout = "";
		let stderr = "";

		claude.stdout.on("data", (data: Buffer) => {
			stdout += data.toString();
		});

		claude.stderr.on("data", (data: Buffer) => {
			stderr += data.toString();
		});

		claude.on("close", (code) => {
			if (isSettled) return; // Already handled by timeout
			isSettled = true;
			if (timeoutId) clearTimeout(timeoutId);

			if (code !== 0) {
				// Log the full error details for debugging
				logger.error("Claude CLI exited with non-zero code", {
					code,
					stderr: stderr.slice(0, 1000),
					stdout: stdout.slice(0, 1000),
					prompt: options.prompt.slice(0, 100),
					model: options.model,
				});
				reject(
					new ClaudeCliError(
						`Claude CLI exited with code ${code}`,
						"CLI_EXIT_ERROR",
						stderr || stdout,
					),
				);
				return;
			}

			try {
				const result = parseCliOutput(stdout, {
					existingSessionId: options.sessionId,
					jsonSchemaProvided: !!options.jsonSchema,
				});
				resolve(result);
			} catch (error) {
				reject(
					new ClaudeCliError(
						`Failed to parse CLI output: ${error instanceof Error ? error.message : "Unknown error"}`,
						"PARSE_ERROR",
						stdout,
					),
				);
			}
		});

		claude.on("error", (error) => {
			if (isSettled) return; // Already handled by timeout
			isSettled = true;
			if (timeoutId) clearTimeout(timeoutId);

			reject(
				new ClaudeCliError(
					`Failed to spawn Claude CLI: ${error.message}`,
					"SPAWN_ERROR",
				),
			);
		});

		// Send prompt via stdin if needed (for complex prompts)
		claude.stdin.end();
	});
}

/**
 * Builds command-line arguments for Claude CLI invocation.
 */
function buildCliArgs(options: ClaudeCliOptions): string[] {
	const args: string[] = ["--print", "--output-format", "json"];

	// Model selection (alias like 'sonnet' or full name)
	if (options.model) {
		args.push("--model", options.model);
	}

	// System prompt
	if (options.system) {
		args.push("--system-prompt", options.system);
	}

	// Resume specific session by ID
	// Note: --continue resumes the most recent session, --resume <id> resumes a specific session
	if (options.sessionId) {
		args.push("--resume", options.sessionId);
	}

	// Note: --max-tokens is not supported by Claude CLI
	// Use --max-budget-usd for budget control if needed in future

	// JSON schema for constrained decoding
	if (options.jsonSchema) {
		args.push("--json-schema", JSON.stringify(options.jsonSchema));
	}

	// The prompt itself
	args.push(options.prompt);

	return args;
}

interface ParseOptions {
	existingSessionId?: string;
	jsonSchemaProvided?: boolean;
}

/**
 * Parses JSON output from Claude CLI into structured result.
 * Throws an error if no valid result is found - callers should handle this
 * rather than receiving fabricated usage data.
 */
function parseCliOutput(
	stdout: string,
	options: ParseOptions,
): ClaudeCliResult {
	const { existingSessionId, jsonSchemaProvided } = options;
	// Handle multiple JSON objects (streaming output produces multiple lines)
	const lines = stdout.trim().split("\n").filter(Boolean);

	// Find the final result object
	let resultOutput: ClaudeCliOutput | null = null;
	let parseErrorCount = 0;

	for (const line of lines) {
		try {
			const parsed = JSON.parse(line) as ClaudeCliOutput;
			if (parsed.type === "result") {
				resultOutput = parsed;
			}
		} catch (error) {
			parseErrorCount++;
			// Log at debug level since non-JSON lines are expected in some outputs
			logger.warn("Failed to parse CLI output line as JSON", {
				line: line.slice(0, 200),
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	}

	if (!resultOutput) {
		// Don't silently return fabricated data - throw so callers know something's wrong
		logger.error("No result object found in Claude CLI output", {
			lineCount: lines.length,
			parseErrorCount,
			stdoutPreview: stdout.slice(0, 500),
		});
		throw new Error(
			`No valid result found in CLI output (${lines.length} lines, ${parseErrorCount} parse errors). ` +
				`Output preview: ${stdout.slice(0, 200)}`,
		);
	}

	// For structured output (--json-schema), use the structured_output field
	// Otherwise, fall back to the result field
	const hasStructuredOutput = resultOutput.structured_output !== undefined;

	// Warn if jsonSchema was provided but CLI didn't return structured_output
	// This could indicate a CLI version mismatch or unexpected response format
	if (jsonSchemaProvided && !hasStructuredOutput) {
		logger.warn(
			"jsonSchema was provided but CLI response lacks structured_output field",
			{
				resultKeys: Object.keys(resultOutput),
				hasResult: "result" in resultOutput,
			},
		);
	}

	const text = hasStructuredOutput
		? JSON.stringify(resultOutput.structured_output)
		: resultOutput.result || "";

	return {
		text,
		usage: createUsageInfo(resultOutput.usage),
		sessionId: resultOutput.session_id || existingSessionId || uuidv4(),
		rawOutput: resultOutput,
	};
}

/**
 * Custom error class for Claude CLI errors with additional context.
 */
export class ClaudeCliError extends Error {
	code: ErrorCode;
	rawOutput?: string;

	constructor(message: string, code: ErrorCode, rawOutput?: string) {
		super(message);
		this.name = "ClaudeCliError";
		this.code = code;
		this.rawOutput = rawOutput;
	}
}
