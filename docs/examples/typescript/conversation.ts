/**
 * conversation.ts - Multi-turn conversation with session persistence
 *
 * Demonstrates how to maintain context across multiple requests using sessionId.
 * The model remembers information from previous turns in the conversation.
 *
 * Run from project root:
 *   bun run docs/examples/typescript/conversation.ts
 */

import {
	type KoineConfig,
	KoineError,
	generateText,
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
	console.log("=== Multi-turn Conversation Example ===\n");

	// Turn 1: Introduce ourselves
	console.log("Turn 1: Introducing myself...");
	const turn1 = await generateText(config, {
		prompt:
			"My name is Alice and my favorite color is blue. Please acknowledge this.",
	});
	console.log(`Assistant: ${turn1.text}\n`);

	// Turn 2: Ask a follow-up question using the same session
	console.log("Turn 2: Testing if the model remembers...");
	const turn2 = await generateText(config, {
		prompt: "What's my name and what's my favorite color?",
		sessionId: turn1.sessionId, // Continue the conversation
	});
	console.log(`Assistant: ${turn2.text}\n`);

	// Turn 3: Add more context and ask another question
	console.log("Turn 3: Adding more context...");
	const turn3 = await generateText(config, {
		prompt:
			"I also have a cat named Whiskers. Now tell me everything you know about me.",
		sessionId: turn1.sessionId, // Same session continues
	});
	console.log(`Assistant: ${turn3.text}\n`);

	console.log("---");
	console.log(`Session ID: ${turn1.sessionId}`);
	console.log(
		`Total tokens: ${turn1.usage.totalTokens + turn2.usage.totalTokens + turn3.usage.totalTokens}`,
	);
}

main().catch((error) => {
	if (error instanceof KoineError) {
		console.error(`\nKoine Error [${error.code}]: ${error.message}`);
		if (error.code === "HTTP_ERROR" && error.message.includes("401")) {
			console.error("  → Check that CLAUDE_CODE_GATEWAY_API_KEY is correct");
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
