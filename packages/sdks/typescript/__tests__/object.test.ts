/**
 * Tests for generateObject function.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { generateObject } from "../src/client.js";
import { KoineError } from "../src/errors.js";
import { createMockResponse, originalFetch, testConfig } from "./helpers.js";

const testSchema = z.object({
	name: z.string(),
	age: z.number(),
	active: z.boolean().optional(),
});

describe("generateObject", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	afterEach(() => {
		global.fetch = originalFetch;
	});

	it("should convert Zod schema to JSON Schema in request", async () => {
		const mockResponse = createMockResponse({
			object: { name: "John", age: 30 },
			rawText: '{"name": "John", "age": 30}',
			usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
			sessionId: "session-123",
		});

		const mockFetch = vi.fn().mockResolvedValue(mockResponse);
		global.fetch = mockFetch;

		await generateObject(testConfig, {
			prompt: "Generate a person",
			schema: testSchema,
		});

		const body = JSON.parse(mockFetch.mock.calls[0][1].body);
		expect(body.schema).toBeDefined();
		expect(body.schema.type).toBe("object");
		expect(body.schema.properties).toHaveProperty("name");
		expect(body.schema.properties).toHaveProperty("age");
		expect(body.schema.properties).toHaveProperty("active");
		expect(body.schema.required).toContain("name");
		expect(body.schema.required).toContain("age");
	});

	it("should return validated object on success", async () => {
		const mockResponse = createMockResponse({
			object: { name: "Alice", age: 25, active: true },
			rawText: '{"name": "Alice", "age": 25, "active": true}',
			usage: { inputTokens: 50, outputTokens: 20, totalTokens: 70 },
			sessionId: "obj-session",
		});

		global.fetch = vi.fn().mockResolvedValue(mockResponse);

		const result = await generateObject(testConfig, {
			prompt: "Generate person",
			schema: testSchema,
		});

		expect(result.object).toEqual({ name: "Alice", age: 25, active: true });
		expect(result.rawText).toBe('{"name": "Alice", "age": 25, "active": true}');
		expect(result.usage.totalTokens).toBe(70);
		expect(result.sessionId).toBe("obj-session");
	});

	it("should throw VALIDATION_ERROR when response fails Zod validation", async () => {
		const mockResponse = createMockResponse({
			object: { name: "Bob", age: "not-a-number" }, // age should be number
			rawText: '{"name": "Bob", "age": "not-a-number"}',
			usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
			sessionId: "session",
		});

		global.fetch = vi.fn().mockResolvedValue(mockResponse);

		await expect(
			generateObject(testConfig, {
				prompt: "test",
				schema: testSchema,
			}),
		).rejects.toMatchObject({
			code: "VALIDATION_ERROR",
		});
	});

	it("should include rawText in validation error for debugging", async () => {
		const mockResponse = createMockResponse({
			object: { invalid: "data" },
			rawText: '{"invalid": "data"}',
			usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
			sessionId: "session",
		});

		global.fetch = vi.fn().mockResolvedValue(mockResponse);

		try {
			await generateObject(testConfig, {
				prompt: "test",
				schema: testSchema,
			});
			expect.fail("Should have thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(KoineError);
			expect((error as KoineError).rawText).toBe('{"invalid": "data"}');
		}
	});

	it("should throw KoineError on HTTP error", async () => {
		const errorResponse = createMockResponse(
			{ error: "Schema parse error", code: "SCHEMA_ERROR", rawText: "..." },
			{ status: 422, statusText: "Unprocessable Entity", ok: false },
		);

		global.fetch = vi.fn().mockResolvedValue(errorResponse);

		await expect(
			generateObject(testConfig, {
				prompt: "test",
				schema: testSchema,
			}),
		).rejects.toMatchObject({
			message: "Schema parse error",
			code: "SCHEMA_ERROR",
		});
	});

	it("should handle complex nested schemas", async () => {
		const complexSchema = z.object({
			user: z.object({
				name: z.string(),
				emails: z.array(z.string().email()),
			}),
			settings: z.object({
				notifications: z.boolean(),
				theme: z.enum(["light", "dark"]),
			}),
		});

		const responseData = {
			user: { name: "Test", emails: ["test@example.com"] },
			settings: { notifications: true, theme: "dark" },
		};

		const mockResponse = createMockResponse({
			object: responseData,
			rawText: JSON.stringify(responseData),
			usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
			sessionId: "complex-session",
		});

		global.fetch = vi.fn().mockResolvedValue(mockResponse);

		const result = await generateObject(testConfig, {
			prompt: "Generate complex object",
			schema: complexSchema,
		});

		expect(result.object).toEqual(responseData);
	});

	it("should send Authorization header", async () => {
		const mockResponse = createMockResponse({
			object: { name: "Test", age: 20 },
			rawText: "{}",
			usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
			sessionId: "s",
		});

		const mockFetch = vi.fn().mockResolvedValue(mockResponse);
		global.fetch = mockFetch;

		await generateObject(testConfig, {
			prompt: "test",
			schema: testSchema,
		});

		const headers = mockFetch.mock.calls[0][1].headers;
		expect(headers.Authorization).toBe("Bearer test-auth-key-12345");
	});

	it("should call correct endpoint", async () => {
		const mockResponse = createMockResponse({
			object: { name: "Test", age: 20 },
			rawText: "{}",
			usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
			sessionId: "s",
		});

		const mockFetch = vi.fn().mockResolvedValue(mockResponse);
		global.fetch = mockFetch;

		await generateObject(testConfig, {
			prompt: "test",
			schema: testSchema,
		});

		const url = mockFetch.mock.calls[0][0];
		expect(url).toBe("http://localhost:3100/generate-object");
	});

	it("should throw INVALID_RESPONSE when response is not valid JSON", async () => {
		const invalidResponse = createMockResponse("not json");
		global.fetch = vi.fn().mockResolvedValue(invalidResponse);

		await expect(
			generateObject(testConfig, {
				prompt: "test",
				schema: testSchema,
			}),
		).rejects.toMatchObject({
			message: "Invalid response from Koine gateway: expected JSON",
			code: "INVALID_RESPONSE",
		});
	});
});
