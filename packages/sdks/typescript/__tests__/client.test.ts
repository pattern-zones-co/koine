/**
 * Tests for Koine SDK client core functionality.
 *
 * Tests KoineError class and createKoine factory function.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createKoine } from "../src/client.js";
import { KoineError } from "../src/errors.js";
import {
	createMockResponse,
	createMockSSEResponse,
	originalFetch,
	testConfig,
} from "./helpers.js";

describe("KoineError", () => {
	it("should create error with message and code", () => {
		const error = new KoineError("Something went wrong", "TEST_ERROR");

		expect(error.message).toBe("Something went wrong");
		expect(error.code).toBe("TEST_ERROR");
		expect(error.name).toBe("KoineError");
		expect(error.rawText).toBeUndefined();
	});

	it("should create error with rawText for debugging", () => {
		const error = new KoineError(
			"Parse failed",
			"PARSE_ERROR",
			"raw output from CLI",
		);

		expect(error.message).toBe("Parse failed");
		expect(error.code).toBe("PARSE_ERROR");
		expect(error.rawText).toBe("raw output from CLI");
	});

	it("should be instanceof Error", () => {
		const error = new KoineError("test", "TEST");
		expect(error).toBeInstanceOf(Error);
	});
});

describe("createKoine", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	afterEach(() => {
		global.fetch = originalFetch;
	});

	it("should create a client with generateText method", async () => {
		const mockResponse = createMockResponse({
			text: "Hello from factory!",
			usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
			sessionId: "factory-session",
		});

		global.fetch = vi.fn().mockResolvedValue(mockResponse);

		const koine = createKoine(testConfig);
		const result = await koine.generateText({ prompt: "test" });

		expect(result.text).toBe("Hello from factory!");
		expect(result.sessionId).toBe("factory-session");
	});

	it("should create a client with streamText method", async () => {
		const events = [
			{ event: "session", data: { sessionId: "stream-session" } },
			{ event: "text", data: { text: "Streamed!" } },
			{
				event: "result",
				data: {
					sessionId: "stream-session",
					usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
				},
			},
			{ event: "done", data: { code: 0 } },
		];

		global.fetch = vi.fn().mockResolvedValue(createMockSSEResponse(events));

		const koine = createKoine(testConfig);
		const result = await koine.streamText({ prompt: "test" });

		// Consume the stream first
		const reader = result.textStream.getReader();
		while (true) {
			const { done } = await reader.read();
			if (done) break;
		}

		const text = await result.text;
		expect(text).toBe("Streamed!");
	});

	it("should create a client with generateObject method", async () => {
		const schema = z.object({ name: z.string() });
		const mockResponse = createMockResponse({
			object: { name: "Factory Test" },
			rawText: '{"name":"Factory Test"}',
			usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
			sessionId: "object-session",
		});

		global.fetch = vi.fn().mockResolvedValue(mockResponse);

		const koine = createKoine(testConfig);
		const result = await koine.generateObject({ prompt: "test", schema });

		expect(result.object.name).toBe("Factory Test");
	});

	it("should validate config at creation time", () => {
		expect(() => createKoine({ ...testConfig, baseUrl: "" })).toThrow(
			KoineError,
		);
		expect(() => createKoine({ ...testConfig, authKey: "" })).toThrow(
			KoineError,
		);
		expect(() => createKoine({ ...testConfig, timeout: -1 })).toThrow(
			KoineError,
		);
	});

	it("should not validate config again on method calls", async () => {
		const mockResponse = createMockResponse({
			text: "test",
			usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
			sessionId: "s",
		});

		global.fetch = vi.fn().mockResolvedValue(mockResponse);

		const koine = createKoine(testConfig);

		// Config is validated at creation, not on each call
		// So even if we could mutate config (we can't due to closure),
		// the validation already passed
		await expect(koine.generateText({ prompt: "test" })).resolves.toBeDefined();
	});
});
