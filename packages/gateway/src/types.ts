import { z } from "zod";

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Base request fields shared across all endpoints.
 */
const baseRequestSchema = z.object({
	system: z.string().optional(),
	prompt: z.string(),
	sessionId: z.string().optional(),
	model: z.string().optional(),
	/** User email for tool proxy access (enables Claude skills to call Inbox Zero tools) */
	userEmail: z.string().email().optional(),
});

export const generateTextRequestSchema = baseRequestSchema.extend({
	/**
	 * Maximum tokens to generate.
	 * Note: Not currently used - Claude CLI does not support --max-tokens.
	 * Kept for API compatibility; use model selection for output control.
	 */
	maxTokens: z.number().int().positive().optional(),
});

export const generateObjectRequestSchema = baseRequestSchema.extend({
	schema: z.record(z.unknown()),
	/**
	 * Maximum tokens to generate.
	 * Note: Not currently used - Claude CLI does not support --max-tokens.
	 * Kept for API compatibility; use model selection for output control.
	 */
	maxTokens: z.number().int().positive().optional(),
});

export const streamRequestSchema = baseRequestSchema;

export const streamObjectRequestSchema = baseRequestSchema.extend({
	schema: z.record(z.unknown()),
});

// Inferred types
export type GenerateTextRequest = z.infer<typeof generateTextRequestSchema>;
export type GenerateObjectRequest = z.infer<typeof generateObjectRequestSchema>;
export type StreamRequest = z.infer<typeof streamRequestSchema>;
export type StreamObjectRequest = z.infer<typeof streamObjectRequestSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

export const usageInfoSchema = z
	.object({
		inputTokens: z.number().int().nonnegative(),
		outputTokens: z.number().int().nonnegative(),
		totalTokens: z.number().int().nonnegative(),
	})
	.refine((data) => data.totalTokens === data.inputTokens + data.outputTokens, {
		message: "totalTokens must equal inputTokens + outputTokens",
	});

export const generateTextResponseSchema = z.object({
	text: z.string(),
	usage: usageInfoSchema,
	sessionId: z.string(),
});

export const generateObjectResponseSchema = z.object({
	object: z.unknown(),
	rawText: z.string(),
	usage: usageInfoSchema,
	sessionId: z.string(),
});

/**
 * Error codes used by the Claude Code wrapper.
 * Shared between ErrorResponse and ClaudeCliError for type safety.
 */
export const errorCodeSchema = z.enum([
	"VALIDATION_ERROR",
	"INTERNAL_ERROR",
	"UNKNOWN_ERROR",
	"TIMEOUT_ERROR",
	"CLI_EXIT_ERROR",
	"SPAWN_ERROR",
	"PARSE_ERROR",
	"CONCURRENCY_LIMIT_ERROR",
]);

export const errorResponseSchema = z.object({
	error: z.string(),
	code: errorCodeSchema,
	rawText: z.string().optional(),
});

const concurrencyPoolSchema = z
	.object({
		active: z.number().int().nonnegative(),
		limit: z.number().int().nonnegative(),
	})
	.refine((data) => data.active <= data.limit, {
		message: "active cannot exceed limit",
	});

export const healthResponseSchema = z.object({
	status: z.enum(["healthy", "unhealthy"]),
	claudeCli: z.enum(["available", "unavailable"]),
	timestamp: z.string(),
	error: z.string().optional(),
	concurrency: z
		.object({
			streaming: concurrencyPoolSchema,
			nonStreaming: concurrencyPoolSchema,
		})
		.optional(),
});

// Response types (derived from schemas)
export type UsageInfo = z.infer<typeof usageInfoSchema>;
export type GenerateTextResponse = z.infer<typeof generateTextResponseSchema>;
export type GenerateObjectResponse = z.infer<
	typeof generateObjectResponseSchema
>;
export type ErrorCode = z.infer<typeof errorCodeSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;

// =============================================================================
// CLI Types
// =============================================================================

/**
 * Usage info as returned by Claude CLI (snake_case).
 * Shared across ClaudeCliOutput and streaming messages.
 */
export interface CliUsageInfo {
	input_tokens?: number;
	output_tokens?: number;
	cache_creation_input_tokens?: number;
	cache_read_input_tokens?: number;
}

/**
 * Converts CLI usage info (snake_case) to API usage info (camelCase).
 * Provides consistent calculation with safe defaults for missing values.
 */
export function createUsageInfo(cliUsage?: CliUsageInfo): UsageInfo {
	const inputTokens = cliUsage?.input_tokens ?? 0;
	const outputTokens = cliUsage?.output_tokens ?? 0;
	return {
		inputTokens,
		outputTokens,
		totalTokens: inputTokens + outputTokens,
	};
}

/** Claude CLI output structure (from --output-format json) */
export interface ClaudeCliOutput {
	type: "result" | "error";
	subtype?: string;
	result?: string;
	total_cost_usd?: number;
	duration_ms?: number;
	duration_api_ms?: number;
	is_error?: boolean;
	session_id?: string;
	num_turns?: number;
	usage?: CliUsageInfo;
	/** Structured output from --json-schema flag */
	structured_output?: unknown;
}
