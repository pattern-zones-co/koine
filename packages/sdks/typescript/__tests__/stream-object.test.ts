/**
 * Tests for streamObject function.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { streamObject } from "../src/client.js";
import {
	createDelayedMockSSEResponse,
	createMockResponse,
	createMockSSEResponse,
	originalFetch,
	testConfig,
} from "./helpers.js";

const testSchema = z.object({
	name: z.string(),
	age: z.number(),
});

describe("streamObject", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	afterEach(() => {
		global.fetch = originalFetch;
	});

	it("should make POST request to /stream-object endpoint with JSON schema", async () => {
		const events = [
			{ event: "session", data: { sessionId: "stream-obj-session" } },
			{
				event: "partial-object",
				data: { partial: '{"name":', parsed: { name: "" } },
			},
			{ event: "object", data: { object: { name: "Alice", age: 30 } } },
			{
				event: "result",
				data: {
					sessionId: "stream-obj-session",
					usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
				},
			},
			{ event: "done", data: { code: 0 } },
		];

		const mockFetch = vi.fn().mockResolvedValue(createMockSSEResponse(events));
		global.fetch = mockFetch;

		await streamObject(testConfig, {
			prompt: "Generate a person",
			schema: testSchema,
		});

		expect(mockFetch).toHaveBeenCalledTimes(1);
		const [url, options] = mockFetch.mock.calls[0];

		expect(url).toBe("http://localhost:3100/stream-object");
		expect(options.method).toBe("POST");
		expect(options.headers["Content-Type"]).toBe("application/json");
		expect(options.headers.Authorization).toBe("Bearer test-auth-key-12345");

		const body = JSON.parse(options.body);
		expect(body.prompt).toBe("Generate a person");
		expect(body.schema).toBeDefined();
		expect(body.schema.type).toBe("object");
		expect(body.schema.properties).toHaveProperty("name");
		expect(body.schema.properties).toHaveProperty("age");
	});

	it("should yield partial objects via async iterator", async () => {
		const events = [
			{ event: "session", data: { sessionId: "s" } },
			{
				event: "partial-object",
				data: { partial: '{"name":"Al', parsed: { name: "Al" } },
			},
			{
				event: "partial-object",
				data: { partial: '{"name":"Alice"', parsed: { name: "Alice" } },
			},
			{
				event: "partial-object",
				data: {
					partial: '{"name":"Alice","age":30}',
					parsed: { name: "Alice", age: 30 },
				},
			},
			{ event: "object", data: { object: { name: "Alice", age: 30 } } },
			{
				event: "result",
				data: {
					sessionId: "s",
					usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
				},
			},
			{ event: "done", data: { code: 0 } },
		];

		global.fetch = vi.fn().mockResolvedValue(createMockSSEResponse(events));

		const result = await streamObject(testConfig, {
			prompt: "test",
			schema: testSchema,
		});

		const partials: Array<{ name?: string; age?: number }> = [];
		for await (const partial of result.partialObjectStream) {
			partials.push(partial);
		}

		expect(partials.length).toBe(3);
		expect(partials[2]).toEqual({ name: "Alice", age: 30 });
	});

	it("should yield partial objects via getReader", async () => {
		const events = [
			{ event: "session", data: { sessionId: "s" } },
			{
				event: "partial-object",
				data: { partial: '{"name":"Bob"', parsed: { name: "Bob" } },
			},
			{
				event: "partial-object",
				data: {
					partial: '{"name":"Bob","age":25}',
					parsed: { name: "Bob", age: 25 },
				},
			},
			{ event: "object", data: { object: { name: "Bob", age: 25 } } },
			{
				event: "result",
				data: {
					sessionId: "s",
					usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
				},
			},
			{ event: "done", data: { code: 0 } },
		];

		global.fetch = vi.fn().mockResolvedValue(createMockSSEResponse(events));

		const result = await streamObject(testConfig, {
			prompt: "test",
			schema: testSchema,
		});

		const partials: Array<{ name?: string; age?: number }> = [];
		const reader = result.partialObjectStream.getReader();
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			partials.push(value);
		}

		expect(partials.length).toBe(2);
		expect(partials[1]).toEqual({ name: "Bob", age: 25 });
	});

	it("should resolve object promise with validated final object", async () => {
		const events = [
			{ event: "session", data: { sessionId: "s" } },
			{ event: "object", data: { object: { name: "Bob", age: 25 } } },
			{
				event: "result",
				data: {
					sessionId: "s",
					usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
				},
			},
			{ event: "done", data: { code: 0 } },
		];

		global.fetch = vi.fn().mockResolvedValue(createMockSSEResponse(events));

		const result = await streamObject(testConfig, {
			prompt: "test",
			schema: testSchema,
		});

		// Consume stream
		for await (const _ of result.partialObjectStream) {
		}

		const obj = await result.object;
		expect(obj).toEqual({ name: "Bob", age: 25 });
	});

	it("should reject object promise if final object fails validation", async () => {
		const events = [
			{ event: "session", data: { sessionId: "s" } },
			{
				event: "object",
				data: { object: { name: "Bob", age: "not-a-number" } },
			},
			{
				event: "result",
				data: {
					sessionId: "s",
					usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
				},
			},
			{ event: "done", data: { code: 0 } },
		];

		global.fetch = vi.fn().mockResolvedValue(createMockSSEResponse(events));

		const result = await streamObject(testConfig, {
			prompt: "test",
			schema: testSchema,
		});

		// Consume stream
		for await (const _ of result.partialObjectStream) {
		}

		await expect(result.object).rejects.toMatchObject({
			code: "VALIDATION_ERROR",
		});
	});

	it("should resolve sessionId promise from session event", async () => {
		const events = [
			{ event: "session", data: { sessionId: "early-session-id" } },
			{ event: "object", data: { object: { name: "Test", age: 1 } } },
			{
				event: "result",
				data: {
					sessionId: "early-session-id",
					usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
				},
			},
			{ event: "done", data: { code: 0 } },
		];

		global.fetch = vi.fn().mockResolvedValue(createMockSSEResponse(events));

		const result = await streamObject(testConfig, {
			prompt: "Test",
			schema: testSchema,
		});

		// Consume stream to process SSE events
		for await (const _ of result.partialObjectStream) {
		}

		const sessionId = await result.sessionId;
		expect(sessionId).toBe("early-session-id");
	});

	it("should resolve usage promise with token counts", async () => {
		const events = [
			{ event: "session", data: { sessionId: "session-usage" } },
			{ event: "object", data: { object: { name: "Test", age: 99 } } },
			{
				event: "result",
				data: {
					sessionId: "session-usage",
					usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
				},
			},
			{ event: "done", data: { code: 0 } },
		];

		global.fetch = vi.fn().mockResolvedValue(createMockSSEResponse(events));

		const result = await streamObject(testConfig, {
			prompt: "Test",
			schema: testSchema,
		});

		// Consume stream
		for await (const _ of result.partialObjectStream) {
		}

		const usage = await result.usage;
		expect(usage).toEqual({
			inputTokens: 100,
			outputTokens: 50,
			totalTokens: 150,
		});
	});

	it("should handle error SSE event and reject promises", async () => {
		const events = [
			{ event: "session", data: { sessionId: "error-session" } },
			{
				event: "error",
				data: { error: "Schema parsing failed", code: "SCHEMA_ERROR" },
			},
		];

		global.fetch = vi.fn().mockResolvedValue(createMockSSEResponse(events));

		const result = await streamObject(testConfig, {
			prompt: "test",
			schema: testSchema,
		});

		await expect(async () => {
			for await (const _ of result.partialObjectStream) {
			}
		}).rejects.toMatchObject({
			message: "Schema parsing failed",
			code: "SCHEMA_ERROR",
		});

		await expect(result.object).rejects.toMatchObject({ code: "SCHEMA_ERROR" });
		await expect(result.usage).rejects.toMatchObject({ code: "SCHEMA_ERROR" });
	});

	it("should throw KoineError on HTTP error", async () => {
		const errorResponse = createMockResponse(
			{ error: "Rate limit exceeded", code: "RATE_LIMITED" },
			{ status: 429, statusText: "Too Many Requests", ok: false },
		);

		global.fetch = vi.fn().mockResolvedValue(errorResponse);

		await expect(
			streamObject(testConfig, { prompt: "test", schema: testSchema }),
		).rejects.toMatchObject({
			message: "Rate limit exceeded",
			code: "RATE_LIMITED",
		});
	});

	it("should throw KoineError when response body is null", async () => {
		const noBodyResponse = {
			ok: true,
			status: 200,
			statusText: "OK",
			headers: new Headers(),
			body: null,
			text: vi.fn().mockResolvedValue(""),
			json: vi.fn(),
			redirected: false,
			type: "basic",
			url: "",
			clone: vi.fn(),
			bodyUsed: false,
			arrayBuffer: vi.fn(),
			blob: vi.fn(),
			formData: vi.fn(),
			bytes: vi.fn(),
		} as unknown as Response;

		global.fetch = vi.fn().mockResolvedValue(noBodyResponse);

		await expect(
			streamObject(testConfig, { prompt: "test", schema: testSchema }),
		).rejects.toMatchObject({
			message: "No response body from Koine gateway",
			code: "NO_RESPONSE_BODY",
		});
	});

	it("should pass sessionId when provided for continuation", async () => {
		const events = [
			{ event: "session", data: { sessionId: "continued-session" } },
			{ event: "object", data: { object: { name: "Test", age: 1 } } },
			{
				event: "result",
				data: {
					sessionId: "continued-session",
					usage: { inputTokens: 15, outputTokens: 8, totalTokens: 23 },
				},
			},
			{ event: "done", data: { code: 0 } },
		];

		const mockFetch = vi.fn().mockResolvedValue(createMockSSEResponse(events));
		global.fetch = mockFetch;

		await streamObject(testConfig, {
			prompt: "Continue the conversation",
			schema: testSchema,
			sessionId: "existing-session-123",
		});

		const body = JSON.parse(mockFetch.mock.calls[0][1].body);
		expect(body.sessionId).toBe("existing-session-123");
	});

	it("should pass model in request body", async () => {
		const events = [
			{ event: "session", data: { sessionId: "model-session" } },
			{ event: "object", data: { object: { name: "Test", age: 1 } } },
			{
				event: "result",
				data: {
					sessionId: "model-session",
					usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
				},
			},
			{ event: "done", data: { code: 0 } },
		];

		const mockFetch = vi.fn().mockResolvedValue(createMockSSEResponse(events));
		global.fetch = mockFetch;

		const configWithModel = { ...testConfig, model: "haiku" };
		await streamObject(configWithModel, {
			prompt: "test",
			schema: testSchema,
		});

		const body = JSON.parse(mockFetch.mock.calls[0][1].body);
		expect(body.model).toBe("haiku");
	});

	it("should pass system prompt in request body", async () => {
		const events = [
			{ event: "session", data: { sessionId: "system-session" } },
			{ event: "object", data: { object: { name: "Test", age: 1 } } },
			{
				event: "result",
				data: {
					sessionId: "system-session",
					usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
				},
			},
			{ event: "done", data: { code: 0 } },
		];

		const mockFetch = vi.fn().mockResolvedValue(createMockSSEResponse(events));
		global.fetch = mockFetch;

		await streamObject(testConfig, {
			prompt: "test",
			schema: testSchema,
			system: "You are a data extractor",
		});

		const body = JSON.parse(mockFetch.mock.calls[0][1].body);
		expect(body.system).toBe("You are a data extractor");
	});

	it("should include timeout signal in fetch call", async () => {
		const events = [
			{ event: "session", data: { sessionId: "s" } },
			{ event: "object", data: { object: { name: "Test", age: 1 } } },
			{
				event: "result",
				data: {
					sessionId: "s",
					usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
				},
			},
			{ event: "done", data: { code: 0 } },
		];

		const mockFetch = vi.fn().mockResolvedValue(createMockSSEResponse(events));
		global.fetch = mockFetch;

		await streamObject(testConfig, {
			prompt: "test",
			schema: testSchema,
		});

		const [, options] = mockFetch.mock.calls[0];
		expect(options.signal).toBeDefined();
		expect(options.signal).toBeInstanceOf(AbortSignal);
	});

	it("should handle network errors", async () => {
		global.fetch = vi.fn().mockRejectedValue(new Error("Connection refused"));

		await expect(
			streamObject(testConfig, { prompt: "test", schema: testSchema }),
		).rejects.toThrow("Connection refused");
	});

	it("should still emit partial objects that fail Zod validation (best-effort)", async () => {
		// Partial objects might not match the full schema
		const events = [
			{ event: "session", data: { sessionId: "s" } },
			{
				event: "partial-object",
				data: { partial: '{"name":"Al', parsed: { name: "Al" } }, // Missing age - doesn't match schema
			},
			{
				event: "partial-object",
				data: {
					partial: '{"name":"Alice","age":30}',
					parsed: { name: "Alice", age: 30 },
				},
			},
			{ event: "object", data: { object: { name: "Alice", age: 30 } } },
			{
				event: "result",
				data: {
					sessionId: "s",
					usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
				},
			},
			{ event: "done", data: { code: 0 } },
		];

		global.fetch = vi.fn().mockResolvedValue(createMockSSEResponse(events));

		const result = await streamObject(testConfig, {
			prompt: "test",
			schema: testSchema,
		});

		const partials: unknown[] = [];
		for await (const partial of result.partialObjectStream) {
			partials.push(partial);
		}

		// Should emit both partials - the first one as best-effort even though it doesn't validate
		expect(partials.length).toBe(2);
		expect(partials[0]).toEqual({ name: "Al" }); // Emitted as best-effort
		expect(partials[1]).toEqual({ name: "Alice", age: 30 });
	});

	it("should reject all promises when stream ends without final object", async () => {
		const events = [
			{ event: "session", data: { sessionId: "s" } },
			{
				event: "partial-object",
				data: { partial: '{"name":"Al', parsed: { name: "Al" } },
			},
			{
				event: "result",
				data: {
					sessionId: "s",
					usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
				},
			},
			{ event: "done", data: { code: 0 } },
			// Missing object event!
		];

		global.fetch = vi.fn().mockResolvedValue(createMockSSEResponse(events));

		const result = await streamObject(testConfig, {
			prompt: "test",
			schema: testSchema,
		});

		// Consume stream
		for await (const _ of result.partialObjectStream) {
		}

		await expect(result.object).rejects.toMatchObject({
			code: "NO_OBJECT",
			message: "Stream ended without final object",
		});
	});

	it("should abort stream when signal is triggered mid-stream", async () => {
		const controller = new AbortController();

		// Create a slow stream with many events and delays
		const events = [
			{ event: "session", data: { sessionId: "abort-session" } },
			{
				event: "partial-object",
				data: { partial: '{"name":"A', parsed: { name: "A" } },
			},
			{
				event: "partial-object",
				data: { partial: '{"name":"Ab', parsed: { name: "Ab" } },
			},
			{
				event: "partial-object",
				data: { partial: '{"name":"Abo', parsed: { name: "Abo" } },
			},
			{
				event: "partial-object",
				data: { partial: '{"name":"Abor', parsed: { name: "Abor" } },
			},
			{
				event: "partial-object",
				data: { partial: '{"name":"Abort', parsed: { name: "Abort" } },
			},
			{ event: "object", data: { object: { name: "Aborted", age: 99 } } },
			{
				event: "result",
				data: {
					sessionId: "abort-session",
					usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
				},
			},
			{ event: "done", data: { code: 0 } },
		];

		// Use delayed mock that respects abort signal
		// Pass the abort signal to the mock so it can react to abortion
		global.fetch = vi.fn().mockImplementation((_url, options) => {
			return Promise.resolve(
				createDelayedMockSSEResponse(events, 50, options?.signal),
			);
		});

		const result = await streamObject(testConfig, {
			prompt: "test",
			schema: testSchema,
			signal: controller.signal,
		});

		// Collect partial objects and abort after receiving a couple
		const partials: unknown[] = [];
		let abortError: Error | null = null;

		try {
			for await (const partial of result.partialObjectStream) {
				partials.push(partial);
				// Abort after receiving 2 partial objects
				if (partials.length >= 2) {
					controller.abort();
				}
			}
		} catch (error) {
			abortError = error as Error;
		}

		// Should have received some partial objects before abort
		expect(partials.length).toBeGreaterThanOrEqual(2);

		// Stream iteration should have thrown due to abort
		expect(abortError).toBeDefined();
		expect(abortError?.name).toBe("AbortError");
	});

	it("should abort when timeout is exceeded", async () => {
		// Create a stream with long delays that will exceed timeout
		const events = [
			{ event: "session", data: { sessionId: "timeout-session" } },
			{
				event: "partial-object",
				data: { partial: '{"name":"Slow', parsed: { name: "Slow" } },
			},
			{ event: "object", data: { object: { name: "Slow", age: 1 } } },
			{
				event: "result",
				data: {
					sessionId: "timeout-session",
					usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
				},
			},
			{ event: "done", data: { code: 0 } },
		];

		// Use delayed mock with 500ms delay per event (will exceed 100ms timeout)
		global.fetch = vi.fn().mockImplementation((_url, options) => {
			return Promise.resolve(
				createDelayedMockSSEResponse(events, 500, options?.signal),
			);
		});

		const shortTimeoutConfig = { ...testConfig, timeout: 100 };

		const result = await streamObject(shortTimeoutConfig, {
			prompt: "test",
			schema: testSchema,
		});

		// Stream should abort due to timeout
		let timeoutError: Error | null = null;
		try {
			for await (const _ of result.partialObjectStream) {
				// Should not complete normally
			}
		} catch (error) {
			timeoutError = error as Error;
		}

		expect(timeoutError).toBeDefined();
		expect(timeoutError?.name).toBe("AbortError");
	});

	it("should skip partial-object when parsed is null", async () => {
		const events = [
			{ event: "session", data: { sessionId: "s" } },
			{
				event: "partial-object",
				data: { partial: '{"name":', parsed: null }, // null parsed value
			},
			{
				event: "partial-object",
				data: { partial: '{"name":"Alice"', parsed: { name: "Alice" } },
			},
			{ event: "object", data: { object: { name: "Alice", age: 30 } } },
			{
				event: "result",
				data: {
					sessionId: "s",
					usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
				},
			},
			{ event: "done", data: { code: 0 } },
		];

		global.fetch = vi.fn().mockResolvedValue(createMockSSEResponse(events));

		const result = await streamObject(testConfig, {
			prompt: "test",
			schema: testSchema,
		});

		const partials: unknown[] = [];
		for await (const partial of result.partialObjectStream) {
			partials.push(partial);
		}

		// Should only have 1 partial - the null parsed one should be skipped
		expect(partials.length).toBe(1);
		expect(partials[0]).toEqual({ name: "Alice" });
	});

	it("should skip partial-object when parsed is not an object", async () => {
		const events = [
			{ event: "session", data: { sessionId: "s" } },
			{
				event: "partial-object",
				data: { partial: '"just a string"', parsed: "just a string" }, // string, not object
			},
			{
				event: "partial-object",
				data: { partial: '{"name":"Bob"', parsed: { name: "Bob" } },
			},
			{ event: "object", data: { object: { name: "Bob", age: 25 } } },
			{
				event: "result",
				data: {
					sessionId: "s",
					usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
				},
			},
			{ event: "done", data: { code: 0 } },
		];

		global.fetch = vi.fn().mockResolvedValue(createMockSSEResponse(events));

		const result = await streamObject(testConfig, {
			prompt: "test",
			schema: testSchema,
		});

		const partials: unknown[] = [];
		for await (const partial of result.partialObjectStream) {
			partials.push(partial);
		}

		// Should only have 1 partial - the string parsed one should be skipped
		expect(partials.length).toBe(1);
		expect(partials[0]).toEqual({ name: "Bob" });
	});

	it("should resolve sessionId from result event when no session event received", async () => {
		const events = [
			// No session event!
			{
				event: "partial-object",
				data: { partial: '{"name":"Test"', parsed: { name: "Test" } },
			},
			{ event: "object", data: { object: { name: "Test", age: 1 } } },
			{
				event: "result",
				data: {
					sessionId: "result-session-id",
					usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
				},
			},
			{ event: "done", data: { code: 0 } },
		];

		global.fetch = vi.fn().mockResolvedValue(createMockSSEResponse(events));

		const result = await streamObject(testConfig, {
			prompt: "test",
			schema: testSchema,
		});

		// Consume stream
		for await (const _ of result.partialObjectStream) {
		}

		// sessionId should be resolved from result event
		const sessionId = await result.sessionId;
		expect(sessionId).toBe("result-session-id");
	});

	it("should reject sessionId when error occurs before session event", async () => {
		const events = [
			// No session event before error!
			{
				event: "error",
				data: { error: "Early failure", code: "STREAM_ERROR" },
			},
		];

		global.fetch = vi.fn().mockResolvedValue(createMockSSEResponse(events));

		const result = await streamObject(testConfig, {
			prompt: "test",
			schema: testSchema,
		});

		// Consume stream (will throw)
		await expect(async () => {
			for await (const _ of result.partialObjectStream) {
			}
		}).rejects.toMatchObject({ code: "STREAM_ERROR" });

		// All promises should be rejected with the same error
		await expect(result.sessionId).rejects.toMatchObject({
			code: "STREAM_ERROR",
		});
		await expect(result.object).rejects.toMatchObject({
			code: "STREAM_ERROR",
		});
		await expect(result.usage).rejects.toMatchObject({
			code: "STREAM_ERROR",
		});
	});

	it("should reject all promises when critical SSE event has malformed JSON", async () => {
		// Create a stream that sends malformed JSON in a session event
		const encoder = new TextEncoder();
		const sseData = "event: session\ndata: {invalid json}\n\n";

		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encoder.encode(sseData));
				controller.close();
			},
		});

		const mockResponse = {
			ok: true,
			status: 200,
			statusText: "OK",
			headers: new Headers({ "Content-Type": "text/event-stream" }),
			body: stream,
			text: vi.fn(),
			json: vi.fn(),
			redirected: false,
			type: "basic",
			url: "",
			clone: vi.fn(),
			bodyUsed: false,
			arrayBuffer: vi.fn(),
			blob: vi.fn(),
			formData: vi.fn(),
			bytes: vi.fn(),
		} as unknown as Response;

		global.fetch = vi.fn().mockResolvedValue(mockResponse);

		const result = await streamObject(testConfig, {
			prompt: "test",
			schema: testSchema,
		});

		// Stream should throw SSE_PARSE_ERROR
		await expect(async () => {
			for await (const _ of result.partialObjectStream) {
			}
		}).rejects.toMatchObject({ code: "SSE_PARSE_ERROR" });

		// All promises should be rejected
		await expect(result.sessionId).rejects.toMatchObject({
			code: "SSE_PARSE_ERROR",
		});
		await expect(result.object).rejects.toMatchObject({
			code: "SSE_PARSE_ERROR",
		});
		await expect(result.usage).rejects.toMatchObject({
			code: "SSE_PARSE_ERROR",
		});
	});

	it("should continue streaming when partial-object has malformed JSON", async () => {
		// Create a stream with malformed partial-object followed by valid events
		const encoder = new TextEncoder();
		const events = [
			`event: session\ndata: ${JSON.stringify({ sessionId: "s" })}\n\n`,
			"event: partial-object\ndata: {malformed json\n\n", // Malformed
			`event: partial-object\ndata: ${JSON.stringify({ partial: '{"name":"Bob"', parsed: { name: "Bob" } })}\n\n`,
			`event: object\ndata: ${JSON.stringify({ object: { name: "Bob", age: 25 } })}\n\n`,
			`event: result\ndata: ${JSON.stringify({ sessionId: "s", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } })}\n\n`,
			`event: done\ndata: ${JSON.stringify({ code: 0 })}\n\n`,
		];

		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				for (const event of events) {
					controller.enqueue(encoder.encode(event));
				}
				controller.close();
			},
		});

		const mockResponse = {
			ok: true,
			status: 200,
			statusText: "OK",
			headers: new Headers({ "Content-Type": "text/event-stream" }),
			body: stream,
			text: vi.fn(),
			json: vi.fn(),
			redirected: false,
			type: "basic",
			url: "",
			clone: vi.fn(),
			bodyUsed: false,
			arrayBuffer: vi.fn(),
			blob: vi.fn(),
			formData: vi.fn(),
			bytes: vi.fn(),
		} as unknown as Response;

		global.fetch = vi.fn().mockResolvedValue(mockResponse);

		// Spy on console.warn to verify warning is logged
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const result = await streamObject(testConfig, {
			prompt: "test",
			schema: testSchema,
		});

		const partials: unknown[] = [];
		for await (const partial of result.partialObjectStream) {
			partials.push(partial);
		}

		// Should have received the valid partial
		expect(partials.length).toBe(1);
		expect(partials[0]).toEqual({ name: "Bob" });

		// Should have logged a warning for the malformed partial
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining(
				"[Koine SDK] Failed to parse SSE partial-object event",
			),
		);

		// Final object should still resolve
		const obj = await result.object;
		expect(obj).toEqual({ name: "Bob", age: 25 });

		warnSpy.mockRestore();
	});

	it("should reject sessionId with NO_SESSION when stream ends without session", async () => {
		// Create a stream that ends without session or result events
		const encoder = new TextEncoder();
		const events = [
			`event: object\ndata: ${JSON.stringify({ object: { name: "Test", age: 1 } })}\n\n`,
			`event: done\ndata: ${JSON.stringify({ code: 0 })}\n\n`,
		];

		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				for (const event of events) {
					controller.enqueue(encoder.encode(event));
				}
				controller.close();
			},
		});

		const mockResponse = {
			ok: true,
			status: 200,
			statusText: "OK",
			headers: new Headers({ "Content-Type": "text/event-stream" }),
			body: stream,
			text: vi.fn(),
			json: vi.fn(),
			redirected: false,
			type: "basic",
			url: "",
			clone: vi.fn(),
			bodyUsed: false,
			arrayBuffer: vi.fn(),
			blob: vi.fn(),
			formData: vi.fn(),
			bytes: vi.fn(),
		} as unknown as Response;

		global.fetch = vi.fn().mockResolvedValue(mockResponse);

		const result = await streamObject(testConfig, {
			prompt: "test",
			schema: testSchema,
		});

		// Consume stream
		for await (const _ of result.partialObjectStream) {
		}

		// sessionId should reject with NO_SESSION
		await expect(result.sessionId).rejects.toMatchObject({
			code: "NO_SESSION",
			message: "Stream ended without session ID",
		});

		// Also consume the other rejected promises to prevent unhandled rejections
		await expect(result.usage).rejects.toMatchObject({ code: "NO_USAGE" });
	});

	it("should reject usage with NO_USAGE when stream ends without result", async () => {
		// Create a stream that has object but no result event
		const encoder = new TextEncoder();
		const events = [
			`event: session\ndata: ${JSON.stringify({ sessionId: "s" })}\n\n`,
			`event: object\ndata: ${JSON.stringify({ object: { name: "Test", age: 1 } })}\n\n`,
			`event: done\ndata: ${JSON.stringify({ code: 0 })}\n\n`,
			// No result event!
		];

		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				for (const event of events) {
					controller.enqueue(encoder.encode(event));
				}
				controller.close();
			},
		});

		const mockResponse = {
			ok: true,
			status: 200,
			statusText: "OK",
			headers: new Headers({ "Content-Type": "text/event-stream" }),
			body: stream,
			text: vi.fn(),
			json: vi.fn(),
			redirected: false,
			type: "basic",
			url: "",
			clone: vi.fn(),
			bodyUsed: false,
			arrayBuffer: vi.fn(),
			blob: vi.fn(),
			formData: vi.fn(),
			bytes: vi.fn(),
		} as unknown as Response;

		global.fetch = vi.fn().mockResolvedValue(mockResponse);

		const result = await streamObject(testConfig, {
			prompt: "test",
			schema: testSchema,
		});

		// Consume stream
		for await (const _ of result.partialObjectStream) {
		}

		// Object should resolve (it was received)
		const obj = await result.object;
		expect(obj).toEqual({ name: "Test", age: 1 });

		// Usage should reject with NO_USAGE
		await expect(result.usage).rejects.toMatchObject({
			code: "NO_USAGE",
			message: "Stream ended without usage information",
		});
	});

	it("should handle mid-stream connection errors", async () => {
		// Create a stream that errors mid-way through
		const encoder = new TextEncoder();
		let eventIndex = 0;
		const eventsBeforeError = [
			{ event: "session", data: { sessionId: "conn-error-session" } },
			{
				event: "partial-object",
				data: { partial: '{"name":"A', parsed: { name: "A" } },
			},
		];

		const errorStream = new ReadableStream<Uint8Array>({
			pull(controller) {
				if (eventIndex < eventsBeforeError.length) {
					const { event, data } = eventsBeforeError[eventIndex];
					const sseData = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
					controller.enqueue(encoder.encode(sseData));
					eventIndex++;
				} else {
					// Simulate connection error mid-stream
					controller.error(new Error("Connection reset by peer"));
				}
			},
		});

		const errorResponse = {
			ok: true,
			status: 200,
			statusText: "OK",
			headers: new Headers({ "Content-Type": "text/event-stream" }),
			body: errorStream,
			text: vi.fn(),
			json: vi.fn(),
			redirected: false,
			type: "basic",
			url: "",
			clone: vi.fn(),
			bodyUsed: false,
			arrayBuffer: vi.fn(),
			blob: vi.fn(),
			formData: vi.fn(),
			bytes: vi.fn(),
		} as unknown as Response;

		global.fetch = vi.fn().mockResolvedValue(errorResponse);

		const result = await streamObject(testConfig, {
			prompt: "test",
			schema: testSchema,
		});

		const partials: unknown[] = [];
		let connectionError: Error | null = null;

		try {
			for await (const partial of result.partialObjectStream) {
				partials.push(partial);
			}
		} catch (error) {
			connectionError = error as Error;
		}

		// Should have received partial before connection error
		expect(partials.length).toBe(1);
		expect(partials[0]).toEqual({ name: "A" });

		// Should have caught the connection error
		expect(connectionError).toBeDefined();
		expect(connectionError?.message).toBe("Connection reset by peer");
	});
});
