/**
 * Koine SDK
 *
 * A TypeScript client for interacting with Koine gateway services.
 *
 * @example
 * ```typescript
 * import { createKoine } from '@patternzones/koine-sdk';
 *
 * const koine = createKoine({
 *   baseUrl: 'http://localhost:3100',
 *   timeout: 300000,
 *   authKey: 'your-api-key',
 *   model: 'sonnet',
 * });
 *
 * const result = await koine.generateText({
 *   prompt: 'Hello, how are you?',
 * });
 *
 * console.log(result.text);
 * ```
 */

// Public types - only export types that users need
export type {
	KoineConfig,
	KoineUsage,
	KoineStreamResult,
	KoineStreamObjectResult,
} from "./types.js";

// Errors
export { KoineError } from "./errors.js";
export type { KoineErrorCode } from "./errors.js";

// Client factory (recommended API)
export { createKoine } from "./client.js";
export type {
	KoineClient,
	GenerateTextOptions,
	GenerateTextResult,
	StreamTextOptions,
	GenerateObjectOptions,
	GenerateObjectResult,
	StreamObjectOptions,
} from "./client.js";

// Standalone functions (legacy API - still supported)
export {
	generateText,
	streamText,
	generateObject,
	streamObject,
} from "./client.js";
