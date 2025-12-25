// Import and re-export functions from the new modules
import { validateConfig } from "./http.js";
import {
	type GenerateObjectOptions,
	type GenerateObjectResult,
	generateObject,
} from "./object.js";
import { type StreamTextOptions, streamText } from "./stream/index.js";
import {
	type GenerateTextOptions,
	type GenerateTextResult,
	generateText,
} from "./text.js";
import type { KoineConfig, KoineStreamResult } from "./types.js";

// Re-export functions and types for backwards compatibility
export { generateText, streamText, generateObject };
export type {
	GenerateTextOptions,
	GenerateTextResult,
	StreamTextOptions,
	GenerateObjectOptions,
	GenerateObjectResult,
};

/**
 * Koine client interface returned by createKoine.
 */
export interface KoineClient {
	/**
	 * Generates plain text response from Koine gateway service.
	 *
	 * @param options - Request options
	 * @returns Object containing response text, usage stats, and session ID
	 * @throws {KoineError} When the request fails or returns invalid response
	 */
	generateText(options: GenerateTextOptions): Promise<GenerateTextResult>;

	/**
	 * Streams text response from Koine gateway service.
	 *
	 * @param options - Request options
	 * @returns KoineStreamResult with textStream and promises for sessionId, usage, text
	 * @throws {KoineError} When connection fails or stream encounters an error
	 */
	streamText(options: StreamTextOptions): Promise<KoineStreamResult>;

	/**
	 * Generates structured JSON response from Koine gateway service.
	 *
	 * @typeParam T - The type of the expected response object, inferred from schema
	 * @param options - Request options including Zod schema
	 * @returns Object containing validated response, raw text, usage, and sessionId
	 * @throws {KoineError} With code 'VALIDATION_ERROR' if response doesn't match schema
	 */
	generateObject<T>(
		options: GenerateObjectOptions<T>,
	): Promise<GenerateObjectResult<T>>;
}

/**
 * Creates a Koine client instance with the given configuration.
 *
 * @param config - Client configuration including baseUrl, authKey, and timeout
 * @returns KoineClient with generateText, streamText, and generateObject methods
 * @throws {KoineError} With code 'INVALID_CONFIG' if config is invalid
 *
 * @example
 * ```typescript
 * import { createKoine } from '@patternzones/koine-sdk';
 *
 * const koine = createKoine({
 *   baseUrl: 'http://localhost:3100',
 *   authKey: 'your-api-key',
 *   timeout: 300000,
 * });
 *
 * const result = await koine.generateText({
 *   prompt: 'Hello, how are you?',
 * });
 *
 * console.log(result.text);
 * ```
 */
export function createKoine(config: KoineConfig): KoineClient {
	// Validate config once at creation time
	validateConfig(config);

	return {
		generateText: (options) => generateText(config, options),
		streamText: (options) => streamText(config, options),
		generateObject: <T>(options: GenerateObjectOptions<T>) =>
			generateObject(config, options),
	};
}
