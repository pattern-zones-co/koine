/**
 * Tests for generateText function.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateText } from "../src/client.js";
import { createMockResponse, originalFetch, testConfig } from "./helpers.js";

describe("generateText", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	afterEach(() => {
		global.fetch = originalFetch;
	});

	it("should make POST request with correct headers and body", async () => {
		const mockResponse = createMockResponse({
			text: "Hello, world!",
			usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
			sessionId: "session-123",
		});

		const mockFetch = vi.fn().mockResolvedValue(mockResponse);
		global.fetch = mockFetch;

		await generateText(testConfig, {
			system: "You are helpful",
			prompt: "Say hello",
		});

		expect(mockFetch).toHaveBeenCalledTimes(1);
		const [url, options] = mockFetch.mock.calls[0];

		expect(url).toBe("http://localhost:3100/generate-text");
		expect(options.method).toBe("POST");
		expect(options.headers["Content-Type"]).toBe("application/json");
		expect(options.headers.Authorization).toBe("Bearer test-auth-key-12345");

		const body = JSON.parse(options.body);
		expect(body.system).toBe("You are helpful");
		expect(body.prompt).toBe("Say hello");
	});

	it("should return text, usage, and sessionId on success", async () => {
		const mockResponse = createMockResponse({
			text: "Generated response",
			usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
			sessionId: "sess-abc",
		});

		global.fetch = vi.fn().mockResolvedValue(mockResponse);

		const result = await generateText(testConfig, {
			prompt: "Test prompt",
		});

		expect(result.text).toBe("Generated response");
		expect(result.usage).toEqual({
			inputTokens: 100,
			outputTokens: 50,
			totalTokens: 150,
		});
		expect(result.sessionId).toBe("sess-abc");
	});

	it("should pass sessionId when provided", async () => {
		const mockResponse = createMockResponse({
			text: "Continued response",
			usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
			sessionId: "existing-session",
		});

		const mockFetch = vi.fn().mockResolvedValue(mockResponse);
		global.fetch = mockFetch;

		await generateText(testConfig, {
			prompt: "Continue",
			sessionId: "existing-session",
		});

		const body = JSON.parse(mockFetch.mock.calls[0][1].body);
		expect(body.sessionId).toBe("existing-session");
	});

	it("should throw KoineError on HTTP 4xx error with error body", async () => {
		const errorResponse = createMockResponse(
			{
				error: "Invalid request parameters",
				code: "INVALID_PARAMS",
			},
			{ status: 400, statusText: "Bad Request", ok: false },
		);

		global.fetch = vi.fn().mockResolvedValue(errorResponse);

		await expect(
			generateText(testConfig, { prompt: "test" }),
		).rejects.toMatchObject({
			name: "KoineError",
			message: "Invalid request parameters",
			code: "INVALID_PARAMS",
		});
	});

	it("should throw KoineError on 401 unauthorized", async () => {
		const errorResponse = createMockResponse(
			{ error: "Invalid authentication key", code: "UNAUTHORIZED" },
			{ status: 401, statusText: "Unauthorized", ok: false },
		);

		global.fetch = vi.fn().mockResolvedValue(errorResponse);

		await expect(
			generateText(testConfig, { prompt: "test" }),
		).rejects.toMatchObject({
			message: "Invalid authentication key",
			code: "UNAUTHORIZED",
		});
	});

	it("should throw KoineError on HTTP 5xx error", async () => {
		const errorResponse = createMockResponse(
			{ error: "Internal server error", code: "SERVER_ERROR" },
			{ status: 500, statusText: "Internal Server Error", ok: false },
		);

		global.fetch = vi.fn().mockResolvedValue(errorResponse);

		await expect(
			generateText(testConfig, { prompt: "test" }),
		).rejects.toMatchObject({
			message: "Internal server error",
			code: "SERVER_ERROR",
		});
	});

	it("should handle non-JSON error response gracefully", async () => {
		const errorResponse = createMockResponse("Bad Gateway", {
			status: 502,
			statusText: "Bad Gateway",
			ok: false,
		});

		global.fetch = vi.fn().mockResolvedValue(errorResponse);

		await expect(
			generateText(testConfig, { prompt: "test" }),
		).rejects.toMatchObject({
			message: "HTTP 502 Bad Gateway",
			code: "HTTP_ERROR",
		});
	});

	it("should throw KoineError when response is not valid JSON", async () => {
		const invalidResponse = createMockResponse("not valid json at all");
		global.fetch = vi.fn().mockResolvedValue(invalidResponse);

		await expect(
			generateText(testConfig, { prompt: "test" }),
		).rejects.toMatchObject({
			message: "Invalid response from Koine gateway: expected JSON",
			code: "INVALID_RESPONSE",
		});
	});

	it("should include timeout signal in fetch call", async () => {
		const mockResponse = createMockResponse({
			text: "response",
			usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
			sessionId: "s",
		});

		const mockFetch = vi.fn().mockResolvedValue(mockResponse);
		global.fetch = mockFetch;

		await generateText(testConfig, { prompt: "test" });

		const [, options] = mockFetch.mock.calls[0];
		expect(options.signal).toBeDefined();
		expect(options.signal).toBeInstanceOf(AbortSignal);
	});

	it("should handle network errors", async () => {
		global.fetch = vi.fn().mockRejectedValue(new Error("Network failure"));

		await expect(generateText(testConfig, { prompt: "test" })).rejects.toThrow(
			"Network failure",
		);
	});

	it("should throw abort error when request times out", async () => {
		const abortError = new DOMException(
			"The operation was aborted.",
			"AbortError",
		);
		global.fetch = vi.fn().mockRejectedValue(abortError);

		await expect(generateText(testConfig, { prompt: "test" })).rejects.toThrow(
			"Request aborted",
		);
	});

	it("should handle empty text response", async () => {
		const mockResponse = createMockResponse({
			text: "",
			usage: { inputTokens: 10, outputTokens: 0, totalTokens: 10 },
			sessionId: "empty-session",
		});

		global.fetch = vi.fn().mockResolvedValue(mockResponse);

		const result = await generateText(testConfig, {
			prompt: "test",
		});

		expect(result.text).toBe("");
		expect(result.usage.outputTokens).toBe(0);
	});
});
