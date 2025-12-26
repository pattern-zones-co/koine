import type { NextFunction, Request, RequestHandler, Response } from "express";
import { logger } from "./logger.js";

export interface ConcurrencyConfig {
	maxStreamingConcurrent: number;
	maxNonStreamingConcurrent: number;
}

export type RequestType = "streaming" | "nonStreaming";

const DEFAULT_STREAMING_LIMIT = 3;
const DEFAULT_NONSTREAMING_LIMIT = 5;
const RETRY_AFTER_SECONDS = "5";

/**
 * Parse and validate a concurrency limit from an environment variable.
 * Returns the default value if the env var is missing or invalid.
 */
function parseLimit(envVar: string, defaultValue: number): number {
	const envValue = process.env[envVar];
	if (envValue === undefined || envValue === "") {
		return defaultValue;
	}

	const parsed = Number.parseInt(envValue, 10);

	if (Number.isNaN(parsed)) {
		logger.error(
			`Invalid value for ${envVar}: "${envValue}" is not a valid integer. Using default: ${defaultValue}`,
		);
		return defaultValue;
	}

	if (parsed < 0) {
		logger.error(
			`Invalid value for ${envVar}: "${envValue}" must be non-negative. Using default: ${defaultValue}`,
		);
		return defaultValue;
	}

	if (parsed === 0) {
		logger.warn(
			`${envVar} is set to 0, which will reject all requests of this type`,
		);
	}

	return parsed;
}

const config: ConcurrencyConfig = {
	maxStreamingConcurrent: parseLimit(
		"KOINE_MAX_STREAMING_CONCURRENT",
		DEFAULT_STREAMING_LIMIT,
	),
	maxNonStreamingConcurrent: parseLimit(
		"KOINE_MAX_NONSTREAMING_CONCURRENT",
		DEFAULT_NONSTREAMING_LIMIT,
	),
};

// Module-scoped state (safe because JavaScript's event loop is single-threaded)
let streamingCount = 0;
let nonStreamingCount = 0;

/**
 * Attempt to acquire a concurrency slot.
 * Returns true if slot acquired, false if at limit.
 */
export function acquireSlot(type: RequestType): boolean {
	const isStreaming = type === "streaming";
	const current = isStreaming ? streamingCount : nonStreamingCount;
	const limit = isStreaming
		? config.maxStreamingConcurrent
		: config.maxNonStreamingConcurrent;

	if (current >= limit) {
		return false;
	}

	if (isStreaming) {
		streamingCount++;
	} else {
		nonStreamingCount++;
	}
	return true;
}

/**
 * Release a concurrency slot.
 */
export function releaseSlot(type: RequestType): void {
	if (type === "streaming") {
		streamingCount = Math.max(0, streamingCount - 1);
	} else {
		nonStreamingCount = Math.max(0, nonStreamingCount - 1);
	}
}

/**
 * Get current concurrency status for health endpoint.
 */
export function getStatus(): {
	streaming: { active: number; limit: number };
	nonStreaming: { active: number; limit: number };
} {
	return {
		streaming: {
			active: streamingCount,
			limit: config.maxStreamingConcurrent,
		},
		nonStreaming: {
			active: nonStreamingCount,
			limit: config.maxNonStreamingConcurrent,
		},
	};
}

/**
 * Reset state for testing.
 */
export function resetState(): void {
	streamingCount = 0;
	nonStreamingCount = 0;
}

/**
 * Get current configuration (useful for testing).
 */
export function getConfig(): ConcurrencyConfig {
	return { ...config };
}

/**
 * Set configuration (useful for testing).
 * Validates that values are non-negative integers.
 */
export function setConfig(newConfig: Partial<ConcurrencyConfig>): void {
	if (newConfig.maxStreamingConcurrent !== undefined) {
		if (
			!Number.isInteger(newConfig.maxStreamingConcurrent) ||
			newConfig.maxStreamingConcurrent < 0
		) {
			throw new Error(
				`Invalid maxStreamingConcurrent: ${newConfig.maxStreamingConcurrent}. Must be a non-negative integer.`,
			);
		}
		config.maxStreamingConcurrent = newConfig.maxStreamingConcurrent;
	}
	if (newConfig.maxNonStreamingConcurrent !== undefined) {
		if (
			!Number.isInteger(newConfig.maxNonStreamingConcurrent) ||
			newConfig.maxNonStreamingConcurrent < 0
		) {
			throw new Error(
				`Invalid maxNonStreamingConcurrent: ${newConfig.maxNonStreamingConcurrent}. Must be a non-negative integer.`,
			);
		}
		config.maxNonStreamingConcurrent = newConfig.maxNonStreamingConcurrent;
	}
}

/**
 * Wrap an Express request handler with concurrency limiting.
 * Returns 429 with Retry-After header if at limit.
 * Otherwise executes handler and releases slot on response completion
 * (via 'finish' or 'close' events) or if the handler throws.
 */
export function withConcurrencyLimit(
	type: RequestType,
	handler: RequestHandler,
): RequestHandler {
	return async (req: Request, res: Response, next: NextFunction) => {
		if (!acquireSlot(type)) {
			const status = getStatus();
			const pool =
				type === "streaming" ? status.streaming : status.nonStreaming;
			logger.warn(`Concurrency limit exceeded for ${type} request`, {
				path: req.path,
				active: pool.active,
				limit: pool.limit,
			});
			res.setHeader("Retry-After", RETRY_AFTER_SECONDS);
			return res.status(429).json({
				error: "Concurrency limit exceeded",
				code: "CONCURRENCY_LIMIT_ERROR",
			});
		}

		// Track whether we've released to prevent double-release
		let released = false;
		function release(): void {
			if (released) return;
			released = true;
			releaseSlot(type);
		}

		// Release slot when response completes:
		// - 'finish' fires when response is flushed to the OS
		// - 'close' fires when the underlying connection closes (including client disconnect)
		res.on("finish", release);
		res.on("close", release);

		try {
			await handler(req, res, next);
		} catch (error) {
			release();
			logger.error(`Error in ${type} handler, slot released`, {
				path: req.path,
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
	};
}
