import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type {
  KoineConfig,
  KoineUsage,
  KoineStreamResult,
  GenerateTextResponse,
  GenerateObjectResponse,
  ErrorResponse,
  SSETextEvent,
  SSEResultEvent,
  SSEErrorEvent,
} from "./types.js";
import { KoineError } from "./errors.js";

/**
 * Safely parses JSON from a response, handling non-JSON bodies gracefully.
 */
async function safeJsonParse<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * Generates plain text response from Koine gateway service.
 */
export async function generateText(
  config: KoineConfig,
  options: {
    system?: string;
    prompt: string;
    sessionId?: string;
  },
): Promise<{
  text: string;
  usage: KoineUsage;
  sessionId: string;
}> {
  const response = await fetch(`${config.baseUrl}/generate-text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.authKey}`,
    },
    body: JSON.stringify({
      system: options.system,
      prompt: options.prompt,
      sessionId: options.sessionId,
      model: config.model,
    }),
    signal: AbortSignal.timeout(config.timeout),
  });

  if (!response.ok) {
    const errorBody = await safeJsonParse<ErrorResponse>(response);
    throw new KoineError(
      errorBody?.error || `HTTP ${response.status} ${response.statusText}`,
      errorBody?.code || "HTTP_ERROR",
      errorBody?.rawText,
    );
  }

  const result = await safeJsonParse<GenerateTextResponse>(response);
  if (!result) {
    throw new KoineError(
      "Invalid response from Koine gateway: expected JSON",
      "INVALID_RESPONSE",
    );
  }

  return {
    text: result.text,
    usage: result.usage,
    sessionId: result.sessionId,
  };
}

/**
 * Parses SSE events from a ReadableStream.
 * SSE format: "event: name\ndata: {...}\n\n"
 */
function createSSEParser(): TransformStream<
  Uint8Array,
  { event: string; data: string }
> {
  let buffer = "";
  // Reuse decoder with stream mode to correctly handle multi-byte UTF-8 chars spanning chunks
  const decoder = new TextDecoder();

  return new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });

      // SSE events are separated by double newlines
      const events = buffer.split("\n\n");
      // Keep the last potentially incomplete event in the buffer
      buffer = events.pop() || "";

      for (const eventStr of events) {
        if (!eventStr.trim()) continue;

        const lines = eventStr.split("\n");
        let eventType = "";
        let data = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7);
          } else if (line.startsWith("data: ")) {
            data = line.slice(6);
          }
        }

        if (eventType && data) {
          controller.enqueue({ event: eventType, data });
        }
      }
    },
    flush(controller) {
      // Process any remaining data in buffer
      if (buffer.trim()) {
        const lines = buffer.split("\n");
        let eventType = "";
        let data = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7);
          } else if (line.startsWith("data: ")) {
            data = line.slice(6);
          }
        }

        if (eventType && data) {
          controller.enqueue({ event: eventType, data });
        }
      }
    },
  });
}

/**
 * Streams text response from Koine gateway service.
 * Returns a ReadableStream of text chunks that can be consumed as they arrive.
 */
export async function streamText(
  config: KoineConfig,
  options: {
    system?: string;
    prompt: string;
    sessionId?: string;
  },
): Promise<KoineStreamResult> {
  const response = await fetch(`${config.baseUrl}/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.authKey}`,
    },
    body: JSON.stringify({
      system: options.system,
      prompt: options.prompt,
      sessionId: options.sessionId,
      model: config.model,
    }),
    signal: AbortSignal.timeout(config.timeout),
  });

  if (!response.ok) {
    const errorBody = await safeJsonParse<ErrorResponse>(response);
    throw new KoineError(
      errorBody?.error || `HTTP ${response.status} ${response.statusText}`,
      errorBody?.code || "HTTP_ERROR",
      errorBody?.rawText,
    );
  }

  if (!response.body) {
    throw new KoineError(
      "No response body from Koine gateway",
      "NO_RESPONSE_BODY",
    );
  }

  // Set up promises for session, usage, and accumulated text
  let resolveSessionId: (value: string) => void;
  let rejectSessionId: (error: Error) => void;
  const sessionIdPromise = new Promise<string>((resolve, reject) => {
    resolveSessionId = resolve;
    rejectSessionId = reject;
  });

  let resolveUsage: (value: KoineUsage) => void;
  let rejectUsage: (error: Error) => void;
  const usagePromise = new Promise<KoineUsage>((resolve, reject) => {
    resolveUsage = resolve;
    rejectUsage = reject;
  });

  let resolveText: (value: string) => void;
  let rejectText: (error: Error) => void;
  const textPromise = new Promise<string>((resolve, reject) => {
    resolveText = resolve;
    rejectText = reject;
  });

  let accumulatedText = "";
  let sessionIdReceived = false;
  let usageReceived = false;

  // Transform SSE events into text chunks
  const textStream = response.body.pipeThrough(createSSEParser()).pipeThrough(
    new TransformStream<{ event: string; data: string }, string>({
      transform(sseEvent, controller) {
        // Critical events (session, result, error, done) must propagate parse errors
        // Text events can log and continue - degraded content is better than total failure
        const isCriticalEvent = ["session", "result", "error", "done"].includes(
          sseEvent.event,
        );

        try {
          switch (sseEvent.event) {
            case "session": {
              const parsed = JSON.parse(sseEvent.data) as { sessionId: string };
              if (!sessionIdReceived) {
                sessionIdReceived = true;
                resolveSessionId(parsed.sessionId);
              }
              break;
            }
            case "text": {
              const parsed = JSON.parse(sseEvent.data) as SSETextEvent;
              accumulatedText += parsed.text;
              controller.enqueue(parsed.text);
              break;
            }
            case "result": {
              const parsed = JSON.parse(sseEvent.data) as SSEResultEvent;
              usageReceived = true;
              resolveUsage(parsed.usage);
              if (!sessionIdReceived) {
                sessionIdReceived = true;
                resolveSessionId(parsed.sessionId);
              }
              break;
            }
            case "error": {
              const parsed = JSON.parse(sseEvent.data) as SSEErrorEvent;
              const error = new KoineError(
                parsed.error,
                parsed.code || "STREAM_ERROR",
              );
              usageReceived = true; // Prevent double rejection in flush
              rejectUsage(error);
              rejectText(error);
              if (!sessionIdReceived) {
                rejectSessionId(error);
              }
              controller.error(error);
              break;
            }
            case "done": {
              // Stream complete, resolve the text promise
              resolveText(accumulatedText);
              break;
            }
          }
        } catch (parseError) {
          if (isCriticalEvent) {
            // Critical event parse failure - propagate error
            const error = new KoineError(
              `Failed to parse critical SSE event: ${sseEvent.event}`,
              "SSE_PARSE_ERROR",
            );
            if (!usageReceived) {
              usageReceived = true;
              rejectUsage(error);
            }
            rejectText(error);
            if (!sessionIdReceived) {
              rejectSessionId(error);
            }
            controller.error(error);
          }
          // Non-critical event (text) - continue stream silently
        }
      },
      flush() {
        // Handle promises that were never resolved/rejected during stream
        if (!sessionIdReceived) {
          rejectSessionId(
            new KoineError(
              "Stream ended without session ID",
              "NO_SESSION",
            ),
          );
        }
        if (!usageReceived) {
          rejectUsage(
            new KoineError(
              "Stream ended without usage information",
              "NO_USAGE",
            ),
          );
        }
        resolveText(accumulatedText);
      },
    }),
  );

  return {
    textStream,
    sessionId: sessionIdPromise,
    usage: usagePromise,
    text: textPromise,
  };
}

/**
 * Generates structured JSON response from Koine gateway service.
 * Converts Zod schema to JSON Schema for the gateway service.
 */
export async function generateObject<T>(
  config: KoineConfig,
  options: {
    system?: string;
    prompt: string;
    schema: z.ZodSchema<T>;
    sessionId?: string;
  },
): Promise<{
  object: T;
  rawText: string;
  usage: KoineUsage;
  sessionId: string;
}> {
  // Convert Zod schema to JSON Schema for the gateway service
  const jsonSchema = zodToJsonSchema(options.schema, {
    $refStrategy: "none",
    target: "jsonSchema7",
  });

  const response = await fetch(`${config.baseUrl}/generate-object`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.authKey}`,
    },
    body: JSON.stringify({
      system: options.system,
      prompt: options.prompt,
      schema: jsonSchema,
      sessionId: options.sessionId,
      model: config.model,
    }),
    signal: AbortSignal.timeout(config.timeout),
  });

  if (!response.ok) {
    const errorBody = await safeJsonParse<ErrorResponse>(response);
    throw new KoineError(
      errorBody?.error || `HTTP ${response.status} ${response.statusText}`,
      errorBody?.code || "HTTP_ERROR",
      errorBody?.rawText,
    );
  }

  const result = await safeJsonParse<GenerateObjectResponse>(response);
  if (!result) {
    throw new KoineError(
      "Invalid response from Koine gateway: expected JSON",
      "INVALID_RESPONSE",
    );
  }

  // Validate the response against the Zod schema
  const parseResult = options.schema.safeParse(result.object);
  if (!parseResult.success) {
    throw new KoineError(
      `Response validation failed: ${parseResult.error.message}`,
      "VALIDATION_ERROR",
      result.rawText,
    );
  }

  return {
    object: parseResult.data,
    rawText: result.rawText,
    usage: result.usage,
    sessionId: result.sessionId,
  };
}
