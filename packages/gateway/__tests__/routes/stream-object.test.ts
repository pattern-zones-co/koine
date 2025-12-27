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

		it("passes schema to CLI as --json-schema", async () => {
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

			expect(mockSpawn).toHaveBeenCalledWith(
				"claude",
				expect.arrayContaining(["--json-schema", JSON.stringify(validSchema)]),
				expect.any(Object),
			);
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

		it("emits object event with final structured output", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const app = createTestApp();
			const responsePromise = request(app)
				.post("/stream-object")
				.send({ prompt: "Extract info", schema: validSchema });

			afterSpawnCalled(mockSpawn, () => {
				mockProc.stdout.emit(
					"data",
					Buffer.from(
						`${createStreamResultMessage({
							structured_output: { name: "Bob", age: 25 },
						})}\n`,
					),
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
				mockProc.stdout.emit(
					"data",
					Buffer.from(
						`${createStreamResultMessage({
							usage: { input_tokens: 15, output_tokens: 25 },
							structured_output: { name: "Test", age: 20 },
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
					Buffer.from(
						`${createStreamResultMessage({
							structured_output: { name: "Test" },
						})}\n`,
					),
				);
				mockProc.emit("close", 0, null);
			});

			const res = await responsePromise;
			const events = parseSSEResponse(res.text);

			const partialEvents = events.filter((e) => e.event === "partial-object");
			expect(partialEvents.length).toBeGreaterThan(0);
		});

		it("falls back to accumulated JSON when structured_output is missing", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const app = createTestApp();
			const responsePromise = request(app)
				.post("/stream-object")
				.send({ prompt: "Extract info", schema: validSchema });

			afterSpawnCalled(mockSpawn, () => {
				// Stream JSON without structured_output in result
				mockProc.stdout.emit(
					"data",
					Buffer.from(
						`${createStreamEventDelta('{"name": "Fallback", "age": 99}')}\n`,
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
			).toEqual({ name: "Fallback", age: 99 });
		});

		it("includes system prompt when provided", async () => {
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

			expect(mockSpawn).toHaveBeenCalledWith(
				"claude",
				expect.arrayContaining(["--system-prompt", "Be helpful"]),
				expect.any(Object),
			);
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
					Buffer.from(
						`${createStreamResultMessage({
							structured_output: { name: "Same" },
						})}\n`,
					),
				);
				mockProc.emit("close", 0, null);
			});

			const res = await responsePromise;
			const events = parseSSEResponse(res.text);

			const partialEvents = events.filter((e) => e.event === "partial-object");
			// Should only have one partial-object event since empty delta doesn't change state
			expect(partialEvents.length).toBe(1);
		});
	});
});
