/**
 * Claude Code Gateway SDK
 *
 * A TypeScript client for interacting with Claude Code Gateway services.
 *
 * @example
 * ```typescript
 * import { generateText, ClaudeCodeGatewayConfig } from '@pattern-zones-co/claude-code-gateway-sdk';
 *
 * const config: ClaudeCodeGatewayConfig = {
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
  ClaudeCodeGatewayConfig,
  ClaudeCodeUsage,
  ClaudeCodeStreamResult,
  GenerateTextResponse,
  GenerateObjectResponse,
  ErrorResponse,
  SSETextEvent,
  SSEResultEvent,
  SSEErrorEvent,
} from "./types.js";

// Errors
export { ClaudeCodeError } from "./errors.js";

// Client functions
export { generateText, streamText, generateObject } from "./client.js";
