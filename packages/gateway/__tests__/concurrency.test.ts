/**
 * Tests for concurrency limiting module (concurrency.ts).
 *
 * Tests the acquire/release counting logic and the withConcurrencyLimit wrapper.
 * Note: This is a counting-based limiter (reject when full), not a queuing semaphore.
 */

import { spawn } from "node:child_process";
import express, {
	type NextFunction,
	type Request,
	type Response,
} from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	acquireSlot,
	getConfig,
	getStatus,
	releaseSlot,
	resetState,
	setConfig,
	withConcurrencyLimit,
} from "../src/concurrency.js";
import generateRouter from "../src/routes/generate.js";
import streamRouter from "../src/routes/stream.js";
import {
	afterSpawnCalled,
	createCliResultJson,
	createMockChildProcess,
	simulateCliSuccess,
} from "./helpers.js";

// Mock node:child_process
vi.mock("node:child_process", () => ({
	spawn: vi.fn(),
}));

const mockSpawn = vi.mocked(spawn);

const DEFAULT_CONFIG = {
	maxStreamingConcurrent: 3,
	maxNonStreamingConcurrent: 5,
};

describe("Concurrency Module", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetState();
		setConfig(DEFAULT_CONFIG);
	});

	describe("acquireSlot / releaseSlot", () => {
		it("acquires slot when under limit", () => {
			expect(acquireSlot("streaming")).toBe(true);
			expect(acquireSlot("nonStreaming")).toBe(true);
		});

		it("returns false when at streaming limit", () => {
			setConfig({ maxStreamingConcurrent: 2, maxNonStreamingConcurrent: 5 });

			expect(acquireSlot("streaming")).toBe(true);
			expect(acquireSlot("streaming")).toBe(true);
			expect(acquireSlot("streaming")).toBe(false);
		});

		it("returns false when at non-streaming limit", () => {
			setConfig({ maxStreamingConcurrent: 3, maxNonStreamingConcurrent: 2 });

			expect(acquireSlot("nonStreaming")).toBe(true);
			expect(acquireSlot("nonStreaming")).toBe(true);
			expect(acquireSlot("nonStreaming")).toBe(false);
		});

		it("releases slot allowing subsequent acquire", () => {
			setConfig({ maxStreamingConcurrent: 1, maxNonStreamingConcurrent: 5 });

			expect(acquireSlot("streaming")).toBe(true);
			expect(acquireSlot("streaming")).toBe(false);

			releaseSlot("streaming");

			expect(acquireSlot("streaming")).toBe(true);
		});

		it("streaming and non-streaming have independent limits", () => {
			setConfig({ maxStreamingConcurrent: 1, maxNonStreamingConcurrent: 1 });

			expect(acquireSlot("streaming")).toBe(true);
			expect(acquireSlot("nonStreaming")).toBe(true);

			// Both at limit now
			expect(acquireSlot("streaming")).toBe(false);
			expect(acquireSlot("nonStreaming")).toBe(false);

			// Release streaming, non-streaming still at limit
			releaseSlot("streaming");
			expect(acquireSlot("streaming")).toBe(true);
			expect(acquireSlot("nonStreaming")).toBe(false);
		});

		it("release does not go below zero", () => {
			releaseSlot("streaming");
			releaseSlot("streaming");
			releaseSlot("streaming");

			const status = getStatus();
			expect(status.streaming.active).toBe(0);
		});
	});

	describe("getStatus", () => {
		it("returns current active counts and limits", () => {
			setConfig({ maxStreamingConcurrent: 3, maxNonStreamingConcurrent: 5 });

			acquireSlot("streaming");
			acquireSlot("streaming");
			acquireSlot("nonStreaming");

			const status = getStatus();
			expect(status).toEqual({
				streaming: { active: 2, limit: 3 },
				nonStreaming: { active: 1, limit: 5 },
			});
		});
	});

	describe("getConfig / setConfig", () => {
		it("returns current configuration", () => {
			setConfig({ maxStreamingConcurrent: 10, maxNonStreamingConcurrent: 20 });

			const config = getConfig();
			expect(config.maxStreamingConcurrent).toBe(10);
			expect(config.maxNonStreamingConcurrent).toBe(20);
		});

		it("allows partial config updates", () => {
			setConfig({ maxStreamingConcurrent: 10, maxNonStreamingConcurrent: 20 });
			setConfig({ maxStreamingConcurrent: 5 });

			const config = getConfig();
			expect(config.maxStreamingConcurrent).toBe(5);
			expect(config.maxNonStreamingConcurrent).toBe(20);
		});

		it("throws on negative streaming limit", () => {
			expect(() => setConfig({ maxStreamingConcurrent: -1 })).toThrow(
				"Invalid maxStreamingConcurrent: -1. Must be a non-negative integer.",
			);
		});

		it("throws on negative non-streaming limit", () => {
			expect(() => setConfig({ maxNonStreamingConcurrent: -5 })).toThrow(
				"Invalid maxNonStreamingConcurrent: -5. Must be a non-negative integer.",
			);
		});

		it("throws on NaN streaming limit", () => {
			expect(() => setConfig({ maxStreamingConcurrent: Number.NaN })).toThrow(
				"Invalid maxStreamingConcurrent: NaN. Must be a non-negative integer.",
			);
		});

		it("throws on float streaming limit", () => {
			expect(() => setConfig({ maxStreamingConcurrent: 3.5 })).toThrow(
				"Invalid maxStreamingConcurrent: 3.5. Must be a non-negative integer.",
			);
		});

		it("allows zero as valid limit", () => {
			setConfig({ maxStreamingConcurrent: 0 });
			expect(getConfig().maxStreamingConcurrent).toBe(0);
		});
	});

	describe("withConcurrencyLimit", () => {
		function createTestApp(): express.Express {
			const app = express();
			app.use(express.json());
			app.post(
				"/test",
				withConcurrencyLimit(
					"nonStreaming",
					async (_req: Request, res: Response) => {
						res.json({ success: true });
					},
				),
			);
			return app;
		}

		it("allows request when under limit", async () => {
			const app = createTestApp();

			const res = await request(app).post("/test").send({});

			expect(res.status).toBe(200);
			expect(res.body).toEqual({ success: true });
		});

		it("returns 429 when at limit", async () => {
			setConfig({ maxStreamingConcurrent: 3, maxNonStreamingConcurrent: 0 });
			const app = createTestApp();

			const res = await request(app).post("/test").send({});

			expect(res.status).toBe(429);
			expect(res.body).toMatchObject({
				error: "Concurrency limit exceeded",
				code: "CONCURRENCY_LIMIT_ERROR",
			});
			expect(res.headers["retry-after"]).toBe("5");
		});

		it("releases slot after response completes", async () => {
			setConfig({ maxStreamingConcurrent: 3, maxNonStreamingConcurrent: 1 });
			const app = createTestApp();

			// First request should succeed
			const res1 = await request(app).post("/test").send({});
			expect(res1.status).toBe(200);

			// Slot should be released, second request should also succeed
			const res2 = await request(app).post("/test").send({});
			expect(res2.status).toBe(200);
		});

		it("releases slot when handler throws an error", async () => {
			setConfig({ maxStreamingConcurrent: 3, maxNonStreamingConcurrent: 1 });

			let errorCaught = false;
			const app = express();
			app.use(express.json());
			app.post(
				"/test",
				withConcurrencyLimit("nonStreaming", async (_req, _res, next) => {
					// Simulate an error that gets passed to next() - this is how Express
					// async error handling works when properly wrapped
					next(new Error("Handler failed"));
				}),
			);
			app.use(
				(err: Error, _req: Request, res: Response, _next: NextFunction) => {
					errorCaught = true;
					res.status(500).json({ error: err.message });
				},
			);

			const res = await request(app).post("/test").send({});

			expect(res.status).toBe(500);
			expect(res.body.error).toBe("Handler failed");
			expect(errorCaught).toBe(true);

			// Verify slot was released - status should show 0 active
			const status = getStatus();
			expect(status.nonStreaming.active).toBe(0);
		});

		it("rejects requests when slots are exhausted", async () => {
			// Test that third request is rejected when two slots are occupied
			setConfig({ maxStreamingConcurrent: 3, maxNonStreamingConcurrent: 2 });

			// Manually occupy two slots
			acquireSlot("nonStreaming");
			acquireSlot("nonStreaming");
			expect(getStatus().nonStreaming.active).toBe(2);

			const app = express();
			app.use(express.json());
			app.post(
				"/test",
				withConcurrencyLimit("nonStreaming", async (_req, res) => {
					res.json({ success: true });
				}),
			);

			// This request should be rejected because both slots are occupied
			const res = await request(app).post("/test").send({});

			expect(res.status).toBe(429);
			expect(res.body.code).toBe("CONCURRENCY_LIMIT_ERROR");

			// Release one slot and verify next request succeeds
			releaseSlot("nonStreaming");
			const res2 = await request(app).post("/test").send({});
			expect(res2.status).toBe(200);
		});

		it("releases slot on response close event (client disconnect)", async () => {
			setConfig({ maxStreamingConcurrent: 3, maxNonStreamingConcurrent: 1 });

			// Track events
			let finishFired = false;
			let closeFired = false;

			const app = express();
			app.use(express.json());
			app.post(
				"/test",
				withConcurrencyLimit("nonStreaming", async (_req, res) => {
					// Track when events fire
					res.on("finish", () => {
						finishFired = true;
					});
					res.on("close", () => {
						closeFired = true;
					});
					res.json({ success: true });
				}),
			);

			const res = await request(app).post("/test").send({});

			expect(res.status).toBe(200);
			// Both events should fire for a normal response
			expect(finishFired).toBe(true);
			expect(closeFired).toBe(true);

			// Slot should be released
			const status = getStatus();
			expect(status.nonStreaming.active).toBe(0);
		});
	});

	describe("Integration with generate routes", () => {
		function createGenerateApp(): express.Express {
			const app = express();
			app.use(express.json());
			app.use(generateRouter);
			return app;
		}

		it("returns 429 when limit is zero (verifies wrapper is applied)", async () => {
			setConfig({ maxNonStreamingConcurrent: 0 });

			const app = createGenerateApp();

			const res = await request(app)
				.post("/generate-text")
				.send({ prompt: "Hello" });

			expect(res.status).toBe(429);
			expect(res.body.code).toBe("CONCURRENCY_LIMIT_ERROR");
			expect(res.headers["retry-after"]).toBe("5");
		});

		it("allows request when under limit (verifies wrapper is applied)", async () => {
			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const app = createGenerateApp();

			const p = request(app).post("/generate-text").send({ prompt: "Hello" });
			afterSpawnCalled(mockSpawn, () => {
				simulateCliSuccess(mockProc, createCliResultJson());
			});
			const res = await p;

			expect(res.status).toBe(200);
		});
	});

	describe("Integration with stream routes", () => {
		function createStreamApp(): express.Express {
			const app = express();
			app.use(express.json());
			app.use(streamRouter);
			return app;
		}

		it("returns 429 when streaming limit is zero (verifies wrapper is applied)", async () => {
			setConfig({ maxStreamingConcurrent: 0 });

			const app = createStreamApp();

			const res = await request(app).post("/stream").send({ prompt: "Hello" });

			expect(res.status).toBe(429);
			expect(res.body.code).toBe("CONCURRENCY_LIMIT_ERROR");
			expect(res.headers["retry-after"]).toBe("5");
		});

		it("uses streaming pool not non-streaming pool", async () => {
			// Non-streaming at 0, streaming at 1
			setConfig({ maxStreamingConcurrent: 1, maxNonStreamingConcurrent: 0 });

			const mockProc = createMockChildProcess();
			mockSpawn.mockReturnValue(mockProc as never);

			const app = createStreamApp();

			const p = request(app).post("/stream").send({ prompt: "Hello" });
			afterSpawnCalled(mockSpawn, () => {
				// Send a minimal stream response
				mockProc.stdout.emit(
					"data",
					Buffer.from(
						`${JSON.stringify({
							type: "result",
							subtype: "success",
							result: "Hi",
							session_id: "test-session",
						})}\n`,
					),
				);
				mockProc.emit("close", 0);
			});
			const res = await p;

			// Should succeed because it uses streaming pool (limit 1), not non-streaming (limit 0)
			expect(res.status).toBe(200);
		});
	});
});
