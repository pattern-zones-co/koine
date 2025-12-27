/**
 * Tests for streaming object endpoint (routes/stream-object.ts).
 *
 * Tests the /stream-object endpoint which provides Server-Sent Events (SSE) streaming
 * of partial JSON objects as they're generated.
 */

import { spawn } from "node:child_process";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import streamObjectRouter from "../../src/routes/stream-object.js";
import {
	afterSpawnCalled,
	createMockChildProcess,
	createStreamEventDelta,
	createStreamResultMessage,
	parseSSEResponse,
} from "../helpers.js";

// Mock node:child_process
vi.mock("node:child_process", () => ({
	spawn: vi.fn(),
}));

const mockSpawn = vi.mocked(spawn);

// Create test app
function createTestApp() {
	const app = express();
	app.use(express.json());
	app.use(streamObjectRouter);
	return app;
}

const validSchema = {
	type: "object",
	properties: {
		name: { type: "string" },
		age: { type: "number" },
	},
	required: ["name", "age"],
};

describe("Stream Object Route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("POST /stream-object", () => {
		it("returns 400 when prompt is missing", async () => {
			const app = createTestApp();

			const res = await request(app)
				.post("/stream-object")
				.send({ schema: validSchema });

			expect(res.status).toBe(400);
			expect(res.body).toMatchObject({
				error: "Invalid request body",
				code: "VALIDATION_ERROR",
			});
		});

		it("returns 400 when schema is missing", async () => {
			const app = createTestApp();

			const res = await request(app)
				.post("/stream-object")
				.send({ prompt: "Hello" });

			expect(res.status).toBe(400);
			expect(res.body).toMatchObject({
				error: "Invalid request body",
				code: "VALIDATION_ERROR",
			});
		});

		it("sets correct SSE headers", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const app = createTestApp();
			const responsePromise = request(app)
				.post("/stream-object")
				.send({ prompt: "Hello", schema: validSchema });

			// Complete the stream after spawn is called
			afterSpawnCalled(mockSpawn, () => {
				mockProc.emit("close", 0, null);
			});

			const res = await responsePromise;

			expect(res.headers["content-type"]).toBe("text/event-stream");
			expect(res.headers["cache-control"]).toBe("no-cache");
			expect(res.headers.connection).toBe("keep-alive");
			expect(res.headers["x-accel-buffering"]).toBe("no");
		});

		it("injects schema into prompt instead of using --json-schema", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const app = createTestApp();
			const responsePromise = request(app)
				.post("/stream-object")
				.send({ prompt: "Extract info", schema: validSchema });

			afterSpawnCalled(mockSpawn, () => {
				mockProc.emit("close", 0, null);
			});

			await responsePromise;

			// Should NOT use --json-schema flag (it doesn't stream JSON tokens)
			const args = mockSpawn.mock.calls[0][1] as string[];
			expect(args).not.toContain("--json-schema");

			// Schema should be in the prompt (last argument)
			const prompt = args[args.length - 1];
			expect(prompt).toContain("Extract info");
			expect(prompt).toContain("JSON Schema:");
			expect(prompt).toContain('"type": "object"');
		});

		it("emits session event with sessionId", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const app = createTestApp();
			const responsePromise = request(app)
				.post("/stream-object")
				.send({ prompt: "Hello", schema: validSchema });

			afterSpawnCalled(mockSpawn, () => {
				mockProc.emit("close", 0, null);
			});

			const res = await responsePromise;
			const events = parseSSEResponse(res.text);

			const sessionEvent = events.find((e) => e.event === "session");
			expect(sessionEvent).toBeDefined();
			expect(
				(sessionEvent?.data as { sessionId: string }).sessionId,
			).toBeDefined();
		});

		it("emits partial-object events as JSON tokens arrive", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const app = createTestApp();
			const responsePromise = request(app)
				.post("/stream-object")
				.send({ prompt: "Extract info", schema: validSchema });

			afterSpawnCalled(mockSpawn, () => {
				// Simulate streaming JSON tokens progressively
				mockProc.stdout.emit(
					"data",
					Buffer.from(`${createStreamEventDelta('{"name": "Ali')}\n`),
				);
				mockProc.stdout.emit(
					"data",
					Buffer.from(`${createStreamEventDelta('ce", "age": 30}')}\n`),
				);
				mockProc.stdout.emit(
					"data",
					Buffer.from(
						`${createStreamResultMessage({
							structured_output: { name: "Alice", age: 30 },
						})}\n`,
					),
				);
				mockProc.emit("close", 0, null);
			});

			const res = await responsePromise;
			const events = parseSSEResponse(res.text);

			const partialEvents = events.filter((e) => e.event === "partial-object");
			expect(partialEvents.length).toBeGreaterThan(0);

			// Check that parsed partial objects are included
			const lastPartial = partialEvents[partialEvents.length - 1];
			expect(
				(lastPartial?.data as { parsed: { name: string } }).parsed.name,
			).toBe("Alice");
		});

		it("emits object event with final parsed JSON from accumulated text", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const app = createTestApp();
			const responsePromise = request(app)
				.post("/stream-object")
				.send({ prompt: "Extract info", schema: validSchema });

			afterSpawnCalled(mockSpawn, () => {
				// Stream JSON as text deltas (prompt injection approach)
				mockProc.stdout.emit(
					"data",
					Buffer.from(
						`${createStreamEventDelta('{"name": "Bob", "age": 25}')}\n`,
					),
				);
				mockProc.stdout.emit(
					"data",
					Buffer.from(`${createStreamResultMessage()}\n`),
				);
				mockProc.emit("close", 0, null);
			});

			const res = await responsePromise;
			const events = parseSSEResponse(res.text);

			const objectEvent = events.find((e) => e.event === "object");
			expect(objectEvent).toBeDefined();
			expect(
				(objectEvent?.data as { object: { name: string; age: number } }).object,
			).toEqual({ name: "Bob", age: 25 });
		});

		it("emits result event with usage data", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const app = createTestApp();
			const responsePromise = request(app)
				.post("/stream-object")
				.send({ prompt: "Extract info", schema: validSchema });

			afterSpawnCalled(mockSpawn, () => {
				// Stream JSON text, then result with usage
				mockProc.stdout.emit(
					"data",
					Buffer.from(
						`${createStreamEventDelta('{"name": "Test", "age": 20}')}\n`,
					),
				);
				mockProc.stdout.emit(
					"data",
					Buffer.from(
						`${createStreamResultMessage({
							usage: { input_tokens: 15, output_tokens: 25 },
						})}\n`,
					),
				);
				mockProc.emit("close", 0, null);
			});

			const res = await responsePromise;
			const events = parseSSEResponse(res.text);

			const resultEvent = events.find((e) => e.event === "result");
			expect(resultEvent).toBeDefined();
			expect(
				(resultEvent?.data as { usage: { inputTokens: number } }).usage
					.inputTokens,
			).toBe(15);
			expect(
				(resultEvent?.data as { usage: { outputTokens: number } }).usage
					.outputTokens,
			).toBe(25);
		});

		it("emits done event when stream completes", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const app = createTestApp();
			const responsePromise = request(app)
				.post("/stream-object")
				.send({ prompt: "Hello", schema: validSchema });

			afterSpawnCalled(mockSpawn, () => {
				mockProc.emit("close", 0, null);
			});

			const res = await responsePromise;
			const events = parseSSEResponse(res.text);

			const doneEvent = events.find((e) => e.event === "done");
			expect(doneEvent).toBeDefined();
			expect((doneEvent?.data as { code: number }).code).toBe(0);
		});

		it("emits error event on CLI non-zero exit", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const app = createTestApp();
			const responsePromise = request(app)
				.post("/stream-object")
				.send({ prompt: "Hello", schema: validSchema });

			afterSpawnCalled(mockSpawn, () => {
				mockProc.stderr.emit("data", Buffer.from("Rate limit exceeded"));
				mockProc.exitCode = 1;
				mockProc.emit("close", 1, null);
			});

			const res = await responsePromise;
			const events = parseSSEResponse(res.text);

			const errorEvent = events.find((e) => e.event === "error");
			expect(errorEvent).toBeDefined();
			expect((errorEvent?.data as { code: string }).code).toBe(
				"CLI_EXIT_ERROR",
			);
			expect((errorEvent?.data as { error: string }).error).toContain(
				"Rate limit exceeded",
			);
		});

		it("includes --verbose and --include-partial-messages flags", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const app = createTestApp();
			const responsePromise = request(app)
				.post("/stream-object")
				.send({ prompt: "Hello", schema: validSchema });

			afterSpawnCalled(mockSpawn, () => {
				mockProc.emit("close", 0, null);
			});

			await responsePromise;

			expect(mockSpawn).toHaveBeenCalledWith(
				"claude",
				expect.arrayContaining([
					"--verbose",
					"--output-format",
					"stream-json",
					"--include-partial-messages",
				]),
				expect.any(Object),
			);
		});

		it("uses --resume when sessionId is provided", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const app = createTestApp();
			const responsePromise = request(app).post("/stream-object").send({
				prompt: "Hello",
				schema: validSchema,
				sessionId: "session-xyz",
			});

			afterSpawnCalled(mockSpawn, () => {
				mockProc.emit("close", 0, null);
			});

			await responsePromise;

			expect(mockSpawn).toHaveBeenCalledWith(
				"claude",
				expect.arrayContaining(["--resume", "session-xyz"]),
				expect.any(Object),
			);
		});

		it("passes model option to CLI", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const app = createTestApp();
			const responsePromise = request(app)
				.post("/stream-object")
				.send({ prompt: "Hello", schema: validSchema, model: "sonnet" });

			afterSpawnCalled(mockSpawn, () => {
				mockProc.emit("close", 0, null);
			});

			await responsePromise;

			expect(mockSpawn).toHaveBeenCalledWith(
				"claude",
				expect.arrayContaining(["--model", "sonnet"]),
				expect.any(Object),
			);
		});

		it("emits error event on spawn failure", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const app = createTestApp();
			const responsePromise = request(app)
				.post("/stream-object")
				.send({ prompt: "Hello", schema: validSchema });

			afterSpawnCalled(mockSpawn, () => {
				mockProc.emit("error", new Error("ENOENT: command not found"));
			});

			const res = await responsePromise;
			const events = parseSSEResponse(res.text);

			const errorEvent = events.find((e) => e.event === "error");
			expect(errorEvent).toBeDefined();
			expect((errorEvent?.data as { code: string }).code).toBe("SPAWN_ERROR");
			expect((errorEvent?.data as { error: string }).error).toContain("ENOENT");

			const doneEvent = events.find((e) => e.event === "done");
			expect(doneEvent).toBeDefined();
		});

		it("handles line buffering for split JSON", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const app = createTestApp();
			const responsePromise = request(app)
				.post("/stream-object")
				.send({ prompt: "Hello", schema: validSchema });

			afterSpawnCalled(mockSpawn, () => {
				// Simulate TCP chunking - JSON split across two data events
				const fullMessage = createStreamEventDelta('{"name": "Test"}');
				mockProc.stdout.emit("data", Buffer.from(fullMessage.slice(0, 20)));
				mockProc.stdout.emit("data", Buffer.from(`${fullMessage.slice(20)}\n`));
				mockProc.stdout.emit(
					"data",
					Buffer.from(`${createStreamResultMessage()}\n`),
				);
				mockProc.emit("close", 0, null);
			});

			const res = await responsePromise;
			const events = parseSSEResponse(res.text);

			const partialEvents = events.filter((e) => e.event === "partial-object");
			expect(partialEvents.length).toBeGreaterThan(0);
		});

		it("parses accumulated JSON text from stream deltas", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const app = createTestApp();
			const responsePromise = request(app)
				.post("/stream-object")
				.send({ prompt: "Extract info", schema: validSchema });

			afterSpawnCalled(mockSpawn, () => {
				// Stream JSON as text deltas (normal prompt injection behavior)
				mockProc.stdout.emit(
					"data",
					Buffer.from(
						`${createStreamEventDelta('{"name": "Parsed", "age": 99}')}\n`,
					),
				);
				mockProc.stdout.emit(
					"data",
					Buffer.from(`${createStreamResultMessage()}\n`),
				);
				mockProc.emit("close", 0, null);
			});

			const res = await responsePromise;
			const events = parseSSEResponse(res.text);

			const objectEvent = events.find((e) => e.event === "object");
			expect(objectEvent).toBeDefined();
			expect(
				(objectEvent?.data as { object: { name: string; age: number } }).object,
			).toEqual({ name: "Parsed", age: 99 });
		});

		it("includes enhanced system prompt with JSON instructions", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const app = createTestApp();
			const responsePromise = request(app).post("/stream-object").send({
				prompt: "Hello",
				schema: validSchema,
				system: "Be helpful",
			});

			afterSpawnCalled(mockSpawn, () => {
				mockProc.emit("close", 0, null);
			});

			await responsePromise;

			// System prompt should be enhanced with JSON generator instructions
			const args = mockSpawn.mock.calls[0][1] as string[];
			const systemIdx = args.indexOf("--system-prompt");
			expect(systemIdx).toBeGreaterThan(-1);
			const systemPrompt = args[systemIdx + 1];
			expect(systemPrompt).toContain("Be helpful");
			expect(systemPrompt).toContain("JSON generator");
		});

		it("avoids duplicate partial-object events for same parsed state", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const app = createTestApp();
			const responsePromise = request(app)
				.post("/stream-object")
				.send({ prompt: "Extract", schema: validSchema });

			afterSpawnCalled(mockSpawn, () => {
				// Send the same partial twice (should only emit once)
				mockProc.stdout.emit(
					"data",
					Buffer.from(`${createStreamEventDelta('{"name": "Same"')}\n`),
				);
				mockProc.stdout.emit(
					"data",
					Buffer.from(`${createStreamEventDelta("")}\n`), // Empty delta doesn't change parsed state
				);
				mockProc.stdout.emit(
					"data",
					Buffer.from(`${createStreamEventDelta("}")}\n`), // Complete the JSON - same parsed object
				);
				mockProc.stdout.emit(
					"data",
					Buffer.from(`${createStreamResultMessage()}\n`),
				);
				mockProc.emit("close", 0, null);
			});

			const res = await responsePromise;
			const events = parseSSEResponse(res.text);

			const partialEvents = events.filter((e) => e.event === "partial-object");
			// Should only have ONE partial-object event because the parsed JSON
			// {"name": "Same"} is the same whether the closing brace is missing or not
			// (partial-json completes incomplete objects)
			expect(partialEvents.length).toBe(1);
		});

		it("processes remaining buffer data on CLI close", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const app = createTestApp();
			const responsePromise = request(app)
				.post("/stream-object")
				.send({ prompt: "Hello", schema: validSchema });

			afterSpawnCalled(mockSpawn, () => {
				// Stream JSON text first
				mockProc.stdout.emit(
					"data",
					Buffer.from(
						`${createStreamEventDelta('{"name": "BufferTest", "age": 42}')}\n`,
					),
				);
				// Send a result message without trailing newline (stays in buffer)
				const resultMessage = createStreamResultMessage();
				mockProc.stdout.emit("data", Buffer.from(resultMessage));
				mockProc.emit("close", 0, null);
			});

			const res = await responsePromise;
			const events = parseSSEResponse(res.text);

			const objectEvent = events.find((e) => e.event === "object");
			expect(objectEvent).toBeDefined();
			expect(
				(objectEvent?.data as { object: { name: string } }).object.name,
			).toBe("BufferTest");
		});

		it("handles non-JSON lines gracefully", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const app = createTestApp();
			const responsePromise = request(app)
				.post("/stream-object")
				.send({ prompt: "Hello", schema: validSchema });

			afterSpawnCalled(mockSpawn, () => {
				// Send malformed JSON line followed by valid JSON stream
				mockProc.stdout.emit("data", Buffer.from("not valid json at all\n"));
				mockProc.stdout.emit(
					"data",
					Buffer.from(
						`${createStreamEventDelta('{"name": "AfterMalformed", "age": 1}')}\n`,
					),
				);
				mockProc.stdout.emit(
					"data",
					Buffer.from(`${createStreamResultMessage()}\n`),
				);
				mockProc.emit("close", 0, null);
			});

			const res = await responsePromise;
			const events = parseSSEResponse(res.text);

			// Should still get the valid object event after malformed line
			const objectEvent = events.find((e) => e.event === "object");
			expect(objectEvent).toBeDefined();
			expect(
				(objectEvent?.data as { object: { name: string } }).object.name,
			).toBe("AfterMalformed");
		});

		it("emits error when accumulated JSON is invalid", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const app = createTestApp();
			const responsePromise = request(app)
				.post("/stream-object")
				.send({ prompt: "Hello", schema: validSchema });

			afterSpawnCalled(mockSpawn, () => {
				// Send malformed JSON delta that can't be parsed
				mockProc.stdout.emit(
					"data",
					Buffer.from(`${createStreamEventDelta("{{{invalid json")}\n`),
				);
				// Send result - should trigger parse failure on accumulated JSON
				mockProc.stdout.emit(
					"data",
					Buffer.from(`${createStreamResultMessage()}\n`),
				);
				mockProc.emit("close", 0, null);
			});

			const res = await responsePromise;
			const events = parseSSEResponse(res.text);

			// Should emit error event for parse failure
			const errorEvent = events.find((e) => e.event === "error");
			expect(errorEvent).toBeDefined();
			expect((errorEvent?.data as { code: string }).code).toBe("PARSE_ERROR");
		});

		it("calls stdin.end() after spawning CLI", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const app = createTestApp();
			const responsePromise = request(app)
				.post("/stream-object")
				.send({ prompt: "Hello", schema: validSchema });

			afterSpawnCalled(mockSpawn, () => {
				mockProc.emit("close", 0, null);
			});

			await responsePromise;

			expect(mockProc.stdin.end).toHaveBeenCalled();
		});

		it("rejects schema without valid JSON Schema keywords", async () => {
			const app = createTestApp();

			const res = await request(app)
				.post("/stream-object")
				.send({ prompt: "Hello", schema: { foo: "bar" } }); // Not a valid JSON Schema

			expect(res.status).toBe(400);
			expect(res.body).toMatchObject({
				error: "Invalid request body",
				code: "VALIDATION_ERROR",
			});
		});

		it("accepts valid JSON Schema with type property", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const app = createTestApp();
			const responsePromise = request(app)
				.post("/stream-object")
				.send({
					prompt: "Hello",
					schema: { type: "object", properties: { name: { type: "string" } } },
				});

			afterSpawnCalled(mockSpawn, () => {
				mockProc.emit("close", 0, null);
			});

			const res = await responsePromise;
			// Should not be a 400 error
			expect(res.headers["content-type"]).toBe("text/event-stream");
		});

		it("emits error when CLI produces no JSON output (empty response)", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const app = createTestApp();
			const responsePromise = request(app)
				.post("/stream-object")
				.send({ prompt: "Hello", schema: validSchema });

			afterSpawnCalled(mockSpawn, () => {
				// Only send result without any content - simulates empty response
				mockProc.stdout.emit(
					"data",
					Buffer.from(`${createStreamResultMessage()}\n`),
				);
				mockProc.emit("close", 0, null);
			});

			const res = await responsePromise;
			const events = parseSSEResponse(res.text);

			const errorEvent = events.find((e) => e.event === "error");
			expect(errorEvent).toBeDefined();
			expect((errorEvent?.data as { code: string }).code).toBe("PARSE_ERROR");
			expect((errorEvent?.data as { error: string }).error).toContain(
				"No object data",
			);
		});

		it("parses JSON wrapped in markdown code blocks", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const app = createTestApp();
			const responsePromise = request(app)
				.post("/stream-object")
				.send({ prompt: "Extract info", schema: validSchema });

			afterSpawnCalled(mockSpawn, () => {
				// Claude wraps JSON in markdown despite instructions
				mockProc.stdout.emit(
					"data",
					Buffer.from(
						`${createStreamEventDelta('```json\n{"name": "Wrapped", "age": 42}\n```')}\n`,
					),
				);
				mockProc.stdout.emit(
					"data",
					Buffer.from(`${createStreamResultMessage()}\n`),
				);
				mockProc.emit("close", 0, null);
			});

			const res = await responsePromise;
			const events = parseSSEResponse(res.text);

			const objectEvent = events.find((e) => e.event === "object");
			expect(objectEvent).toBeDefined();
			expect(
				(objectEvent?.data as { object: { name: string; age: number } }).object,
			).toEqual({ name: "Wrapped", age: 42 });
		});

		it("extracts JSON from text with surrounding content", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const app = createTestApp();
			const responsePromise = request(app)
				.post("/stream-object")
				.send({ prompt: "Extract", schema: validSchema });

			afterSpawnCalled(mockSpawn, () => {
				// Claude adds explanation despite instructions
				mockProc.stdout.emit(
					"data",
					Buffer.from(
						`${createStreamEventDelta('Here is the result: {"name": "Extracted", "age": 25} Hope this helps!')}\n`,
					),
				);
				mockProc.stdout.emit(
					"data",
					Buffer.from(`${createStreamResultMessage()}\n`),
				);
				mockProc.emit("close", 0, null);
			});

			const res = await responsePromise;
			const events = parseSSEResponse(res.text);

			const objectEvent = events.find((e) => e.event === "object");
			expect(objectEvent).toBeDefined();
			expect(
				(objectEvent?.data as { object: { name: string } }).object.name,
			).toBe("Extracted");
		});

		it("handles array schemas correctly", async () => {
			const arraySchema = {
				type: "array",
				items: {
					type: "object",
					properties: { name: { type: "string" } },
				},
			};

			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const app = createTestApp();
			const responsePromise = request(app)
				.post("/stream-object")
				.send({ prompt: "List people", schema: arraySchema });

			afterSpawnCalled(mockSpawn, () => {
				mockProc.stdout.emit(
					"data",
					Buffer.from(
						`${createStreamEventDelta('[{"name": "Alice"}, {"name": "Bob"}]')}\n`,
					),
				);
				mockProc.stdout.emit(
					"data",
					Buffer.from(`${createStreamResultMessage()}\n`),
				);
				mockProc.emit("close", 0, null);
			});

			const res = await responsePromise;
			const events = parseSSEResponse(res.text);

			const objectEvent = events.find((e) => e.event === "object");
			expect(objectEvent).toBeDefined();
			expect(
				(objectEvent?.data as { object: Array<{ name: string }> }).object,
			).toEqual([{ name: "Alice" }, { name: "Bob" }]);
		});
	});
});
