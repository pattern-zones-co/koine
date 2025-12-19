/**
 * Tests for Koine SDK client functions.
 *
 * Tests the HTTP client layer that communicates with the Koine
 * gateway service. Covers successful responses, error handling, timeouts,
 * and schema validation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import type { KoineConfig } from "../src/types.js";
import { generateText, generateObject, streamText } from "../src/client.js";
import { KoineError } from "../src/errors.js";

// Store original fetch to restore later
const originalFetch = global.fetch;

// Helper to create mock Response objects
function createMockResponse(
  body: unknown,
  options: { status?: number; statusText?: string; ok?: boolean } = {},
): Response {
  const { status = 200, statusText = "OK", ok = true } = options;
  const bodyText = typeof body === "string" ? body : JSON.stringify(body);

  return {
    ok,
    status,
    statusText,
    text: vi.fn().mockResolvedValue(bodyText),
    json: vi.fn().mockResolvedValue(body),
    headers: new Headers(),
    redirected: false,
    type: "basic",
    url: "",
    clone: vi.fn(),
    body: null,
    bodyUsed: false,
    arrayBuffer: vi.fn(),
    blob: vi.fn(),
    formData: vi.fn(),
    bytes: vi.fn(),
  } as unknown as Response;
}

// Default test config
const testConfig: KoineConfig = {
  baseUrl: "http://localhost:3100",
  timeout: 30_000,
  authKey: "test-auth-key-12345",
};

describe("Koine SDK Client", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    // Restore original fetch after each test
    global.fetch = originalFetch;
  });

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

  describe("generateText", () => {
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

      await expect(
        generateText(testConfig, { prompt: "test" }),
      ).rejects.toThrow("Network failure");
    });

    it("should throw abort error when request times out", async () => {
      const abortError = new DOMException(
        "The operation was aborted.",
        "AbortError",
      );
      global.fetch = vi.fn().mockRejectedValue(abortError);

      await expect(
        generateText(testConfig, { prompt: "test" }),
      ).rejects.toThrow("The operation was aborted");
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

  describe("generateObject", () => {
    const testSchema = z.object({
      name: z.string(),
      age: z.number(),
      active: z.boolean().optional(),
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
      expect(result.rawText).toBe(
        '{"name": "Alice", "age": 25, "active": true}',
      );
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

  describe("streamText", () => {
    /**
     * Creates a mock SSE ReadableStream that emits events in SSE format.
     * Used to simulate the gateway's /stream endpoint response.
     */
    function createSSEStream(
      events: Array<{ event: string; data: unknown }>,
    ): ReadableStream<Uint8Array> {
      const encoder = new TextEncoder();
      let index = 0;

      return new ReadableStream({
        pull(controller) {
          if (index < events.length) {
            const { event, data } = events[index];
            const sseData = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(encoder.encode(sseData));
            index++;
          } else {
            controller.close();
          }
        },
      });
    }

    /**
     * Creates a mock Response with an SSE stream body.
     */
    function createMockSSEResponse(
      events: Array<{ event: string; data: unknown }>,
      options: { status?: number; ok?: boolean } = {},
    ): Response {
      const { status = 200, ok = true } = options;
      const body = createSSEStream(events);

      return {
        ok,
        status,
        statusText: ok ? "OK" : "Error",
        headers: new Headers({ "Content-Type": "text/event-stream" }),
        body,
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
    }

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

      const mockFetch = vi
        .fn()
        .mockResolvedValue(createMockSSEResponse(events));
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

      const mockFetch = vi
        .fn()
        .mockResolvedValue(createMockSSEResponse(events));
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

      await expect(
        streamText(testConfig, { prompt: "test" }),
      ).rejects.toThrow("Connection refused");
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

      const mockFetch = vi
        .fn()
        .mockResolvedValue(createMockSSEResponse(events));
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

      const mockFetch = vi
        .fn()
        .mockResolvedValue(createMockSSEResponse(events));
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
});
