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
import type {
	ErrorResponse,
	GenerateObjectResponse,
	KoineConfig,
	KoineUsage,
} from "./types.js";

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
		allowedTools?: string[];
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

/**
 * Request options for structured object generation.
 */
export interface GenerateObjectOptions<T> {
	/** The user prompt describing what to extract */
	prompt: string;
	/** Zod schema defining the expected response structure */
	schema: z.ZodSchema<T>;
	/** Optional system prompt for context */
	system?: string;
	/** Optional session ID to continue a conversation */
	sessionId?: string;
	/** Optional list of tools to allow for this request */
	allowedTools?: string[];
	/** Optional AbortSignal for cancellation */
	signal?: AbortSignal;
}

/**
 * Structured object generation result.
 */
export interface GenerateObjectResult<T> {
	readonly object: T;
	readonly rawText: string;
	readonly usage: KoineUsage;
	readonly sessionId: string;
}
