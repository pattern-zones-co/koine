/**
 * Tests for CLI execution module (cli.ts).
 *
 * Tests the core Claude CLI subprocess execution, argument building,
 * and output parsing functionality.
 */

import { spawn } from "node:child_process";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
	ClaudeCliError,
	buildClaudeEnv,
	executeClaudeCli,
} from "../src/cli.js";
import {
	createCliResultJson,
	createMockChildProcess,
	simulateCliError,
	simulateCliSuccess,
	simulateSpawnError,
} from "./helpers.js";

// Mock node:child_process
vi.mock("node:child_process", () => ({
	spawn: vi.fn(),
}));

const mockSpawn = vi.mocked(spawn);

describe("CLI Module", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("buildClaudeEnv", () => {
		const originalEnv = process.env;

		beforeEach(() => {
			// Reset environment for each test
			process.env = { ...originalEnv };
		});

		afterAll(() => {
			process.env = originalEnv;
		});

		it("returns process.env when no API key is set", () => {
			process.env.ANTHROPIC_API_KEY = undefined;
			process.env.CLAUDE_CODE_OAUTH_TOKEN = "oauth-token";

			const env = buildClaudeEnv();

			expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe("oauth-token");
		});

		it("clears OAuth token when API key is present", () => {
			process.env.ANTHROPIC_API_KEY = "test-api-key";
			process.env.CLAUDE_CODE_OAUTH_TOKEN = "oauth-token";

			const env = buildClaudeEnv();

			expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
			expect(env.ANTHROPIC_API_KEY).toBe("test-api-key");
		});
	});

	describe("executeClaudeCli", () => {
		it("executes CLI with basic prompt and returns result", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const resultPromise = executeClaudeCli({ prompt: "Hello" });

			// Simulate successful CLI output
			simulateCliSuccess(
				mockProc,
				createCliResultJson({ result: "Hi there!" }),
			);

			const result = await resultPromise;

			expect(result.text).toBe("Hi there!");
			expect(result.usage).toEqual({
				inputTokens: 10,
				outputTokens: 15,
				totalTokens: 25,
			});
			expect(result.sessionId).toBe("test-session-123");
		});

		it("builds correct CLI arguments for basic prompt", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			executeClaudeCli({ prompt: "Test prompt" });

			expect(mockSpawn).toHaveBeenCalledWith(
				"claude",
				["--print", "--output-format", "json", "Test prompt"],
				expect.objectContaining({ stdio: ["pipe", "pipe", "pipe"] }),
			);
		});

		it("includes --system-prompt when system option is provided", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			executeClaudeCli({ prompt: "Test", system: "You are helpful" });

			expect(mockSpawn).toHaveBeenCalledWith(
				"claude",
				expect.arrayContaining(["--system-prompt", "You are helpful"]),
				expect.any(Object),
			);
		});

		it("includes --resume when sessionId is provided", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			executeClaudeCli({ prompt: "Test", sessionId: "session-abc" });

			expect(mockSpawn).toHaveBeenCalledWith(
				"claude",
				expect.arrayContaining(["--resume", "session-abc"]),
				expect.any(Object),
			);
		});

		it("includes --model when model option is provided", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			executeClaudeCli({ prompt: "Test", model: "sonnet" });

			expect(mockSpawn).toHaveBeenCalledWith(
				"claude",
				expect.arrayContaining(["--model", "sonnet"]),
				expect.any(Object),
			);
		});

		it("includes --json-schema when jsonSchema option is provided", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const schema = {
				type: "object",
				properties: { name: { type: "string" } },
			};

			executeClaudeCli({ prompt: "Test", jsonSchema: schema });

			expect(mockSpawn).toHaveBeenCalledWith(
				"claude",
				expect.arrayContaining(["--json-schema", JSON.stringify(schema)]),
				expect.any(Object),
			);
		});

		it("includes --allowedTools when allowedTools option is provided", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			executeClaudeCli({
				prompt: "Test",
				allowedTools: ["Read", "Glob", "Bash(git log:*)"],
			});

			expect(mockSpawn).toHaveBeenCalledWith(
				"claude",
				expect.arrayContaining([
					"--allowedTools",
					"Read",
					"Glob",
					"Bash(git log:*)",
				]),
				expect.any(Object),
			);
		});

		it("does not include --allowedTools when empty array", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			executeClaudeCli({ prompt: "Test", allowedTools: [] });

			const calledArgs = mockSpawn.mock.calls[0][1] as string[];
			expect(calledArgs).not.toContain("--allowedTools");
		});

		it("does not include --allowedTools when undefined", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			executeClaudeCli({ prompt: "Test" });

			const calledArgs = mockSpawn.mock.calls[0][1] as string[];
			expect(calledArgs).not.toContain("--allowedTools");
		});

		it("throws ClaudeCliError on non-zero exit code", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const resultPromise = executeClaudeCli({ prompt: "Test" });

			simulateCliError(mockProc, "Something went wrong", 1);

			await expect(resultPromise).rejects.toThrow(ClaudeCliError);
			await expect(resultPromise).rejects.toMatchObject({
				code: "CLI_EXIT_ERROR",
				message: expect.stringContaining("exited with code 1"),
			});
		});

		it("throws ClaudeCliError on spawn error", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const resultPromise = executeClaudeCli({ prompt: "Test" });

			simulateSpawnError(mockProc, new Error("ENOENT: command not found"));

			await expect(resultPromise).rejects.toThrow(ClaudeCliError);
			await expect(resultPromise).rejects.toMatchObject({
				code: "SPAWN_ERROR",
				message: expect.stringContaining("Failed to spawn"),
			});
		});

		it("times out and kills process when execution exceeds timeout", async () => {
			vi.useFakeTimers();
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const resultPromise = executeClaudeCli({
				prompt: "Test",
				timeoutMs: 1000,
			});

			// Advance time past the timeout
			vi.advanceTimersByTime(1001);

			await expect(resultPromise).rejects.toThrow(ClaudeCliError);
			await expect(resultPromise).rejects.toMatchObject({
				code: "TIMEOUT_ERROR",
				message: expect.stringContaining("timed out"),
			});

			expect(mockProc.kill).toHaveBeenCalledWith("SIGTERM");

			vi.useRealTimers();
		});

		it("parses multi-line output and finds result object", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const resultPromise = executeClaudeCli({ prompt: "Test" });

			// Simulate output with multiple JSON lines (like streaming mode might produce)
			const multiLineOutput = [
				'{"type":"assistant","message":"thinking..."}',
				createCliResultJson({ result: "Final answer" }),
			].join("\n");

			simulateCliSuccess(mockProc, multiLineOutput);

			const result = await resultPromise;
			expect(result.text).toBe("Final answer");
		});

		it("throws when no result object found in output", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const resultPromise = executeClaudeCli({ prompt: "Test" });

			// Simulate output with no result type
			simulateCliSuccess(
				mockProc,
				'{"type":"assistant","message":"thinking..."}',
			);

			await expect(resultPromise).rejects.toThrow(ClaudeCliError);
			await expect(resultPromise).rejects.toMatchObject({
				code: "PARSE_ERROR",
				message: expect.stringContaining("No valid result found"),
			});
		});

		it("closes stdin after spawn", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			executeClaudeCli({ prompt: "Test" });

			expect(mockProc.stdin.end).toHaveBeenCalled();
		});

		it("generates session ID when not provided in result", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const resultPromise = executeClaudeCli({ prompt: "Test" });

			// Result without session_id
			simulateCliSuccess(
				mockProc,
				JSON.stringify({
					type: "result",
					result: "Hello",
					usage: { input_tokens: 5, output_tokens: 5 },
				}),
			);

			const result = await resultPromise;

			// Should generate a UUID
			expect(result.sessionId).toMatch(
				/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
			);
		});

		it("uses structured_output when present (--json-schema response)", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const resultPromise = executeClaudeCli({
				prompt: "Generate a person",
				jsonSchema: {
					type: "object",
					properties: { name: { type: "string" } },
				},
			});

			// CLI returns structured_output when --json-schema is used
			simulateCliSuccess(
				mockProc,
				JSON.stringify({
					type: "result",
					structured_output: { name: "Alice", age: 30 },
					usage: { input_tokens: 15, output_tokens: 20 },
					session_id: "structured-session-123",
				}),
			);

			const result = await resultPromise;

			// structured_output should be stringified
			expect(result.text).toBe('{"name":"Alice","age":30}');
			expect(result.usage.inputTokens).toBe(15);
			expect(result.usage.outputTokens).toBe(20);
			expect(result.sessionId).toBe("structured-session-123");
		});

		it("falls back to result when structured_output is not present", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const resultPromise = executeClaudeCli({ prompt: "Test" });

			// Standard result without structured_output
			simulateCliSuccess(
				mockProc,
				JSON.stringify({
					type: "result",
					result: "Plain text response",
					usage: { input_tokens: 5, output_tokens: 10 },
				}),
			);

			const result = await resultPromise;

			expect(result.text).toBe("Plain text response");
		});

		it("handles structured_output with complex nested objects", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const resultPromise = executeClaudeCli({
				prompt: "Generate user",
				jsonSchema: { type: "object" },
			});

			const complexObject = {
				user: {
					name: "Bob",
					addresses: [
						{ street: "123 Main St", city: "Springfield" },
						{ street: "456 Oak Ave", city: "Shelbyville" },
					],
				},
			};

			simulateCliSuccess(
				mockProc,
				JSON.stringify({
					type: "result",
					structured_output: complexObject,
					usage: { input_tokens: 10, output_tokens: 25 },
				}),
			);

			const result = await resultPromise;

			expect(JSON.parse(result.text)).toEqual(complexObject);
		});

		it("handles structured_output with array values", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const resultPromise = executeClaudeCli({
				prompt: "Generate list",
				jsonSchema: { type: "array" },
			});

			simulateCliSuccess(
				mockProc,
				JSON.stringify({
					type: "result",
					structured_output: ["one", "two", "three"],
					usage: { input_tokens: 5, output_tokens: 5 },
				}),
			);

			const result = await resultPromise;

			expect(JSON.parse(result.text)).toEqual(["one", "two", "three"]);
		});
	});

	describe("ClaudeCliError", () => {
		it("preserves error code and raw output", () => {
			const error = new ClaudeCliError(
				"Test error",
				"INTERNAL_ERROR",
				"raw output",
			);

			expect(error.message).toBe("Test error");
			expect(error.code).toBe("INTERNAL_ERROR");
			expect(error.rawOutput).toBe("raw output");
			expect(error.name).toBe("ClaudeCliError");
		});
	});
});
