/**
 * Koine SDK
 *
 * A TypeScript client for interacting with Koine gateway services.
 *
 * @example
 * ```typescript
 * import { generateText, KoineConfig } from '@pattern-zones-co/koine-sdk';
 *
 * const config: KoineConfig = {
 *   baseUrl: 'http://localhost:3100',
 *   timeout: 300000,
 *   authKey: 'your-api-key',
 *   model: 'sonnet',
 * };
 *
 * const result = await generateText(config, {
 *   prompt: 'Hello, how are you?',
 * });
 *
 * console.log(result.text);
 * ```
 */

// Types
export type {
  KoineConfig,
  KoineUsage,
  KoineStreamResult,
  GenerateTextResponse,
  GenerateObjectResponse,
  ErrorResponse,
  SSETextEvent,
  SSEResultEvent,
  SSEErrorEvent,
} from "./types.js";

// Errors
export { KoineError } from "./errors.js";

// Client functions
export { generateText, streamText, generateObject } from "./client.js";
