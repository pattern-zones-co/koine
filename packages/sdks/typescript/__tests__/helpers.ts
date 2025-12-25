/**
 * Shared test utilities for Koine SDK tests.
 */

import { vi } from "vitest";
import type { KoineConfig } from "../src/types.js";

// Store original fetch to restore later
export const originalFetch = global.fetch;

// Default test config
export const testConfig: KoineConfig = {
	baseUrl: "http://localhost:3100",
	timeout: 30_000,
	authKey: "test-auth-key-12345",
};

// Helper to create mock Response objects
export function createMockResponse(
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

/**
 * Creates a mock SSE ReadableStream that emits events in SSE format.
 * Used to simulate the gateway's /stream endpoint response.
 */
export function createSSEStream(
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
export function createMockSSEResponse(
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
