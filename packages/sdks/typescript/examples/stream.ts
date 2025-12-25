/**
 * stream.ts - streamText example with real-time output
 *
 * Demonstrates streaming responses with typewriter effect.
 * Text appears progressively as tokens arrive from the API.
 *
 * Run from packages/sdks/typescript:
 *   bun run example:stream
 */

import {
	type KoineConfig,
	KoineError,
	streamText,
} from "@patternzones/koine-sdk";

// Bun automatically loads .env from current working directory
const authKey = process.env.CLAUDE_CODE_GATEWAY_API_KEY;
if (!authKey) {
	throw new Error("CLAUDE_CODE_GATEWAY_API_KEY is required in .env");
}

const config: KoineConfig = {
	baseUrl: `http://localhost:${process.env.GATEWAY_PORT || "3100"}`,
	authKey,
	timeout: 300000,
};

async function main() {
	console.log("Streaming response:\n");

	const result = await streamText(config, {
		prompt:
			"Write a limerick about a programmer who loves coffee. Just the limerick, no explanation.",
	});

	// Display text in real-time as chunks arrive
	let chunkCount = 0;

	for await (const chunk of result.textStream) {
		process.stdout.write(chunk); // Print immediately (no newline)
		chunkCount++;
	}

	// Wait for final stats
	const usage = await result.usage;
	console.log(
		`\n\n--- Streamed in ${chunkCount} chunk${chunkCount === 1 ? "" : "s"} ---`,
	);
	console.log(
		`Usage: ${usage.totalTokens} tokens (input: ${usage.inputTokens}, output: ${usage.outputTokens})`,
	);
}

main().catch((error) => {
	if (error instanceof KoineError) {
		console.error(`\nKoine Error [${error.code}]: ${error.message}`);
		if (error.code === "HTTP_ERROR" && error.message.includes("401")) {
			console.error("  → Check that CLAUDE_CODE_GATEWAY_API_KEY is correct");
		} else if (error.code === "STREAM_ERROR") {
			console.error("  → The stream was interrupted");
		}
	} else if (error?.cause?.code === "ECONNREFUSED") {
		console.error("\nConnection refused. Is the gateway running?");
		console.error(
			"  → Start it with: docker run -d --env-file .env -p 3100:3100 ghcr.io/pattern-zones-co/koine:latest",
		);
	} else {
		console.error("\nUnexpected error:", error);
	}
	process.exit(1);
});
