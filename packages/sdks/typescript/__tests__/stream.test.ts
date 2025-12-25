/**
 * Tests for streamText function.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { streamText } from "../src/client.js";
import {
	createMockResponse,
	createMockSSEResponse,
	originalFetch,
	testConfig,
} from "./helpers.js";

describe("streamText", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	afterEach(() => {
		global.fetch = originalFetch;
	});

	it("should make POST request to /stream endpoint", async () => {
		const events = [
			{ event: "session", data: { sessionId: "stream-session-123" } },
			{ event: "text", data: { text: "Hello" } },
			{
				event: "result",
				data: {
					sessionId: "stream-session-123",
					usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
				},
			},
			{ event: "done", data: { code: 0 } },
		];

		const mockFetch = vi.fn().mockResolvedValue(createMockSSEResponse(events));
		global.fetch = mockFetch;

		await streamText(testConfig, {
			system: "You are helpful",
			prompt: "Say hello",
		});

		expect(mockFetch).toHaveBeenCalledTimes(1);
		const [url, options] = mockFetch.mock.calls[0];

		expect(url).toBe("http://localhost:3100/stream");
		expect(options.method).toBe("POST");
		expect(options.headers["Content-Type"]).toBe("application/json");
		expect(options.headers.Authorization).toBe("Bearer test-auth-key-12345");

		const body = JSON.parse(options.body);
		expect(body.system).toBe("You are helpful");
		expect(body.prompt).toBe("Say hello");
	});

	it("should return textStream that yields text chunks", async () => {
		const events = [
			{ event: "session", data: { sessionId: "session-abc" } },
			{ event: "text", data: { text: "Hello" } },
			{ event: "text", data: { text: " world" } },
			{ event: "text", data: { text: "!" } },
			{
				event: "result",
				data: {
					sessionId: "session-abc",
					usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
				},
			},
			{ event: "done", data: { code: 0 } },
		];

		global.fetch = vi.fn().mockResolvedValue(createMockSSEResponse(events));

		const result = await streamText(testConfig, {
			prompt: "Test prompt",
		});

		// Collect all chunks from the stream
		const chunks: string[] = [];
		const reader = result.textStream.getReader();
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
		}

		expect(chunks).toEqual(["Hello", " world", "!"]);
	});

	it("should resolve text promise with accumulated text", async () => {
		const events = [
			{ event: "session", data: { sessionId: "session-xyz" } },
			{ event: "text", data: { text: "First " } },
			{ event: "text", data: { text: "Second " } },
			{ event: "text", data: { text: "Third" } },
			{
				event: "result",
				data: {
					sessionId: "session-xyz",
					usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
				},
			},
			{ event: "done", data: { code: 0 } },
		];

		global.fetch = vi.fn().mockResolvedValue(createMockSSEResponse(events));

		const result = await streamText(testConfig, {
			prompt: "Test",
		});

		// Consume the stream to trigger text accumulation
		const reader = result.textStream.getReader();
		while (true) {
			const { done } = await reader.read();
			if (done) break;
		}

		const text = await result.text;
		expect(text).toBe("First Second Third");
	});

	it("should resolve usage promise with token counts", async () => {
		const events = [
			{ event: "session", data: { sessionId: "session-usage" } },
			{ event: "text", data: { text: "Response" } },
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

		const result = await streamText(testConfig, {
			prompt: "Test",
		});

		// Consume stream
		const reader = result.textStream.getReader();
		while (true) {
			const { done } = await reader.read();
			if (done) break;
		}

		const usage = await result.usage;
		expect(usage).toEqual({
			inputTokens: 100,
			outputTokens: 50,
			totalTokens: 150,
		});
	});

	it("should resolve sessionId promise from session event", async () => {
		const events = [
			{ event: "session", data: { sessionId: "early-session-id" } },
			{ event: "text", data: { text: "Content" } },
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

		const result = await streamText(testConfig, {
			prompt: "Test",
		});

		// Consume stream to process SSE events
		const reader = result.textStream.getReader();
		while (true) {
			const { done } = await reader.read();
			if (done) break;
		}

		const sessionId = await result.sessionId;
		expect(sessionId).toBe("early-session-id");
	});

	it("should pass sessionId when provided for continuation", async () => {
		const events = [
			{ event: "session", data: { sessionId: "continued-session" } },
			{ event: "text", data: { text: "Continued" } },
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

		await streamText(testConfig, {
			prompt: "Continue the conversation",
			sessionId: "existing-session-123",
		});

		const body = JSON.parse(mockFetch.mock.calls[0][1].body);
		expect(body.sessionId).toBe("existing-session-123");
	});

	it("should throw KoineError on HTTP error", async () => {
		const errorResponse = createMockResponse(
			{ error: "Rate limit exceeded", code: "RATE_LIMITED" },
			{ status: 429, statusText: "Too Many Requests", ok: false },
		);

		global.fetch = vi.fn().mockResolvedValue(errorResponse);

		await expect(
			streamText(testConfig, { prompt: "test" }),
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
			streamText(testConfig, { prompt: "test" }),
		).rejects.toMatchObject({
			message: "No response body from Koine gateway",
			code: "NO_RESPONSE_BODY",
		});
	});

	it("should handle error SSE event and reject promises", async () => {
		const events = [
			{ event: "session", data: { sessionId: "error-session" } },
			{ event: "text", data: { text: "Partial" } },
			{
				event: "error",
				data: { error: "Context window exceeded", code: "CONTEXT_OVERFLOW" },
			},
		];

		global.fetch = vi.fn().mockResolvedValue(createMockSSEResponse(events));

		const result = await streamText(testConfig, {
			prompt: "Very long prompt...",
		});

		// Consume stream - should encounter error
		const reader = result.textStream.getReader();

		await expect(async () => {
			while (true) {
				const { done } = await reader.read();
				if (done) break;
			}
		}).rejects.toMatchObject({
			message: "Context window exceeded",
			code: "CONTEXT_OVERFLOW",
		});

		// Also verify that the usage and text promises reject
		await expect(result.usage).rejects.toMatchObject({
			message: "Context window exceeded",
			code: "CONTEXT_OVERFLOW",
		});
		await expect(result.text).rejects.toMatchObject({
			message: "Context window exceeded",
			code: "CONTEXT_OVERFLOW",
		});
	});

	it("should handle network errors", async () => {
		global.fetch = vi.fn().mockRejectedValue(new Error("Connection refused"));

		await expect(streamText(testConfig, { prompt: "test" })).rejects.toThrow(
			"Connection refused",
		);
	});

	it("should include timeout signal in fetch call", async () => {
		const events = [
			{ event: "session", data: { sessionId: "s" } },
			{ event: "text", data: { text: "test" } },
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

		await streamText(testConfig, { prompt: "test" });

		const [, options] = mockFetch.mock.calls[0];
		expect(options.signal).toBeDefined();
		expect(options.signal).toBeInstanceOf(AbortSignal);
	});

	it("should pass model in request body", async () => {
		const events = [
			{ event: "session", data: { sessionId: "model-session" } },
			{ event: "text", data: { text: "Output" } },
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
		await streamText(configWithModel, { prompt: "test" });

		const body = JSON.parse(mockFetch.mock.calls[0][1].body);
		expect(body.model).toBe("haiku");
	});

	it("should handle empty text events gracefully", async () => {
		const events = [
			{ event: "session", data: { sessionId: "empty-session" } },
			{ event: "text", data: { text: "" } },
			{ event: "text", data: { text: "Content" } },
			{ event: "text", data: { text: "" } },
			{
				event: "result",
				data: {
					sessionId: "empty-session",
					usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
				},
			},
			{ event: "done", data: { code: 0 } },
		];

		global.fetch = vi.fn().mockResolvedValue(createMockSSEResponse(events));

		const result = await streamText(testConfig, {
			prompt: "Test",
		});

		const chunks: string[] = [];
		const reader = result.textStream.getReader();
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
		}

		// Empty strings are valid text events and should be emitted
		expect(chunks).toEqual(["", "Content", ""]);

		const text = await result.text;
		expect(text).toBe("Content");
	});
});
