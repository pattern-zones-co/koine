/**
 * Integration tests for Koine SDK with real HTTP requests.
 *
 * Tests SDK → HTTP → Gateway flow with mocked CLI subprocess.
 * The SDK makes real fetch() calls (NOT mocked) to the gateway.
 * The CLI subprocess is mocked for deterministic responses.
 */

import { spawn } from "node:child_process";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { z } from "zod";
import {
	afterSpawnCalled,
	createCliResultJson,
	createMockChildProcess,
	createStreamAssistantMessage,
	createStreamResultMessage,
} from "../helpers.js";

// Set env vars BEFORE any gateway imports (using vi.hoisted for earliest execution)
const TEST_API_KEY = vi.hoisted(() => {
	const key = "sdk-integration-test-key-12345";
	process.env.CLAUDE_CODE_GATEWAY_API_KEY = key;
	// Use port 0 to let OS assign an available port (avoids conflicts in parallel runs)
	process.env.PORT = "0";
	return key;
});

// Mock CLI subprocess (NOT the HTTP layer - SDK makes real fetch calls)
vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
const mockSpawn = vi.mocked(spawn);

describe("SDK Integration Tests", () => {
	let baseUrl: string;
	let server: Server;

	// SDK functions (imported dynamically)
	// biome-ignore lint/suspicious/noExplicitAny: assigned from dynamic import
	let generateText: any;
	// biome-ignore lint/suspicious/noExplicitAny: assigned from dynamic import
	let generateObject: any;
	// biome-ignore lint/suspicious/noExplicitAny: assigned from dynamic import
	let streamText: any;
	// biome-ignore lint/suspicious/noExplicitAny: assigned from dynamic import
	let KoineError: any;

	beforeAll(async () => {
		// Import SDK
		const sdk = await import("@patternzones/koine-sdk");
		generateText = sdk.generateText;
		generateObject = sdk.generateObject;
		streamText = sdk.streamText;
		KoineError = sdk.KoineError;

		// Import gateway to start the server (after env vars and mocks are set)
		const gateway = await import("../../src/index.js");
		server = gateway.server;

		// Get the actual port assigned by the OS
		const address = server.address() as AddressInfo;
		baseUrl = `http://localhost:${address.port}`;
	});

	afterAll(async () => {
		// Close the server to prevent resource leaks and port conflicts
		await new Promise<void>((resolve, reject) => {
			server.close((err) => (err ? reject(err) : resolve()));
		});
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	const getConfig = () => ({
		baseUrl,
		timeout: 30_000,
		authKey: TEST_API_KEY,
	});

	describe("generateText", () => {
		it("makes real HTTP request and returns text response", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const promise = generateText(getConfig(), {
				prompt: "Hello",
			});

			// Simulate CLI response after spawn is called
			afterSpawnCalled(mockSpawn, () => {
				mockProc.stdout.emit(
					"data",
					Buffer.from(
						createCliResultJson({
							result: "Hello from Claude!",
							total_tokens_in: 10,
							total_tokens_out: 5,
						}),
					),
				);
				mockProc.exitCode = 0;
				mockProc.emit("close", 0, null);
			});

			const result = await promise;

			expect(result.text).toBe("Hello from Claude!");
			expect(result.usage.inputTokens).toBe(10);
			expect(result.usage.outputTokens).toBe(5);
			expect(result.usage.totalTokens).toBe(15);
			expect(result.sessionId).toBeDefined();
		});

		it("includes system prompt in request", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const promise = generateText(getConfig(), {
				system: "You are a helpful assistant.",
				prompt: "Hello",
			});

			afterSpawnCalled(mockSpawn, () => {
				mockProc.stdout.emit(
					"data",
					Buffer.from(createCliResultJson({ result: "Hi there!" })),
				);
				mockProc.exitCode = 0;
				mockProc.emit("close", 0, null);
			});

			const result = await promise;

			expect(result.text).toBe("Hi there!");
			// Verify system prompt was passed to CLI
			expect(mockSpawn).toHaveBeenCalled();
			const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
			expect(spawnArgs).toContain("--system-prompt");
		});

		it("throws KoineError on authentication failure", async () => {
			const badConfig = {
				...getConfig(),
				authKey: "wrong-api-key",
			};

			await expect(
				generateText(badConfig, { prompt: "test" }),
			).rejects.toBeInstanceOf(KoineError);
		});
	});

	describe("generateObject", () => {
		it("validates response against Zod schema", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const personSchema = z.object({
				name: z.string(),
				age: z.number(),
			});

			const promise = generateObject(getConfig(), {
				prompt: "Generate a person",
				schema: personSchema,
			});

			afterSpawnCalled(mockSpawn, () => {
				mockProc.stdout.emit(
					"data",
					Buffer.from(
						createCliResultJson({
							result: '{"name": "Alice", "age": 30}',
						}),
					),
				);
				mockProc.exitCode = 0;
				mockProc.emit("close", 0, null);
			});

			const result = await promise;

			expect(result.object).toEqual({ name: "Alice", age: 30 });
			expect(result.rawText).toBe('{"name": "Alice", "age": 30}');
			expect(result.usage).toBeDefined();
			expect(result.sessionId).toBeDefined();
		});

		it("handles complex nested schemas", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const addressSchema = z.object({
				user: z.object({
					name: z.string(),
					address: z.object({
						street: z.string(),
						city: z.string(),
					}),
				}),
			});

			const promise = generateObject(getConfig(), {
				prompt: "Generate a user with address",
				schema: addressSchema,
			});

			afterSpawnCalled(mockSpawn, () => {
				mockProc.stdout.emit(
					"data",
					Buffer.from(
						createCliResultJson({
							result: JSON.stringify({
								user: {
									name: "Bob",
									address: { street: "123 Main St", city: "Springfield" },
								},
							}),
						}),
					),
				);
				mockProc.exitCode = 0;
				mockProc.emit("close", 0, null);
			});

			const result = await promise;

			expect(result.object.user.name).toBe("Bob");
			expect(result.object.user.address.city).toBe("Springfield");
		});
	});

	describe("streamText", () => {
		it("streams text chunks via SSE", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const promise = streamText(getConfig(), {
				prompt: "Count to 3",
			});

			// Simulate streaming response using newline-delimited JSON (NDJSON)
			// Each JSON object must end with a newline for the gateway's line parser
			afterSpawnCalled(mockSpawn, () => {
				// Text chunks (assistant messages with newlines)
				mockProc.stdout.emit(
					"data",
					Buffer.from(`${createStreamAssistantMessage("One ")}\n`),
				);
				mockProc.stdout.emit(
					"data",
					Buffer.from(`${createStreamAssistantMessage("Two ")}\n`),
				);
				mockProc.stdout.emit(
					"data",
					Buffer.from(`${createStreamAssistantMessage("Three")}\n`),
				);
				// Result event (with newline)
				mockProc.stdout.emit(
					"data",
					Buffer.from(
						`${createStreamResultMessage({ session_id: "stream-session-123" })}\n`,
					),
				);
				mockProc.exitCode = 0;
				mockProc.emit("close", 0, null);
			});

			const result = await promise;

			// Collect all text chunks
			const chunks: string[] = [];
			const reader = result.textStream.getReader();
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				chunks.push(value);
			}

			// Verify streaming worked
			expect(chunks.length).toBeGreaterThan(0);

			// Verify final text
			const text = await result.text;
			expect(text).toBe(chunks.join(""));

			// Verify usage
			const usage = await result.usage;
			expect(usage.inputTokens).toBe(10);
			expect(usage.outputTokens).toBe(15);

			// Verify session ID - the gateway sends session event first, then result event updates it
			const sessionId = await result.sessionId;
			expect(sessionId).toBeDefined();
		});
	});

	describe("error handling", () => {
		it("handles CLI timeout gracefully", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const shortTimeoutConfig = {
				...getConfig(),
				timeout: 100, // Very short timeout
			};

			// Don't emit any response - let it timeout
			await expect(
				generateText(shortTimeoutConfig, { prompt: "test" }),
			).rejects.toThrow();
		});

		it("handles CLI errors", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const promise = generateText(getConfig(), {
				prompt: "test",
			});

			afterSpawnCalled(mockSpawn, () => {
				mockProc.stderr.emit("data", Buffer.from("CLI error occurred"));
				mockProc.exitCode = 1;
				mockProc.emit("close", 1, null);
			});

			await expect(promise).rejects.toBeInstanceOf(KoineError);
		});
	});
});
