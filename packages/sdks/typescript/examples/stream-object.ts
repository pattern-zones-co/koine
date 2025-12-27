/**
 * stream-object.ts - streamObject example with real-time partial objects
 *
 * Demonstrates streaming structured data with progressive updates.
 * Watch as the travel itinerary builds incrementally - you'll see
 * partial objects grow as more days and activities are added.
 *
 * Run from packages/sdks/typescript:
 *   bun run example:stream-object
 */

import {
	type KoineConfig,
	KoineError,
	createKoine,
} from "@patternzones/koine-sdk";
import { z } from "zod";

const authKey = process.env.CLAUDE_CODE_GATEWAY_API_KEY;
if (!authKey) {
	throw new Error("CLAUDE_CODE_GATEWAY_API_KEY is required in .env");
}

const config: KoineConfig = {
	baseUrl: `http://localhost:${process.env.GATEWAY_PORT || "3100"}`,
	authKey,
	timeout: 300000,
};

const koine = createKoine(config);

// A complex schema that requires generating substantial content
const TravelItinerarySchema = z.object({
	destination: z.string().describe("The travel destination"),
	duration: z.string().describe("Trip duration (e.g., '5 days')"),
	bestTimeToVisit: z.string().describe("Recommended season or months"),
	days: z
		.array(
			z.object({
				day: z.number().describe("Day number"),
				title: z.string().describe("Theme for the day"),
				activities: z
					.array(
						z.object({
							time: z.string().describe("Time of day"),
							activity: z.string().describe("What to do"),
							location: z.string().describe("Where"),
							tips: z.string().describe("Helpful tips"),
						}),
					)
					.describe("Activities for the day"),
			}),
		)
		.describe("Day-by-day itinerary"),
	packingList: z.array(z.string()).describe("Essential items to pack"),
	estimatedBudget: z.string().describe("Approximate budget range"),
});

async function main() {
	console.log("Streaming travel itinerary...\n");
	console.log("Watch as the itinerary builds incrementally:\n");

	const result = await koine.streamObject({
		prompt: `Create a detailed 5-day travel itinerary for Tokyo, Japan.
Include 3-4 activities per day with specific times, locations, and practical tips.
Make sure to include a packing list and budget estimate.`,
		schema: TravelItinerarySchema,
	});

	// Watch partial objects as they arrive - show progress indicator
	let updateCount = 0;
	let lastDayCount = 0;

	for await (const partial of result.partialObjectStream) {
		updateCount++;

		// Skip null/non-object partials (can happen during early parsing)
		if (!partial || typeof partial !== "object") {
			continue;
		}

		// Show a summary of what we have so far
		const currentDays = (partial as { days?: unknown[] }).days?.length ?? 0;
		const destination = (partial as { destination?: string }).destination;
		const packingItems =
			(partial as { packingList?: unknown[] }).packingList?.length ?? 0;

		// Only log when something meaningful changes
		if (currentDays !== lastDayCount || updateCount === 1) {
			console.log(`[Update ${updateCount}] Building itinerary...`);
			if (destination) console.log(`  Destination: ${destination}`);
			if (currentDays > 0) console.log(`  Days planned: ${currentDays}/5`);
			if (packingItems > 0) console.log(`  Packing items: ${packingItems}`);
			console.log();
			lastDayCount = currentDays;
		}
	}

	// Get the final validated object
	const itinerary = await result.object;

	console.log(`\n${"=".repeat(60)}`);
	console.log("COMPLETE TRAVEL ITINERARY");
	console.log(`${"=".repeat(60)}\n`);

	console.log(`Destination: ${itinerary.destination}`);
	console.log(`Duration: ${itinerary.duration}`);
	console.log(`Best time to visit: ${itinerary.bestTimeToVisit}`);
	console.log(`Estimated budget: ${itinerary.estimatedBudget}\n`);

	for (const day of itinerary.days) {
		console.log(`--- Day ${day.day}: ${day.title} ---`);
		for (const activity of day.activities) {
			console.log(`  ${activity.time} - ${activity.activity}`);
			console.log(`    Location: ${activity.location}`);
			console.log(`    Tip: ${activity.tips}`);
		}
		console.log();
	}

	console.log("Packing list:");
	for (const item of itinerary.packingList) {
		console.log(`  - ${item}`);
	}

	const usage = await result.usage;
	console.log(
		`\n[${updateCount} streaming updates, ${usage.totalTokens} tokens]`,
	);
}

main().catch((error) => {
	if (error instanceof KoineError) {
		console.error(`\nKoine Error [${error.code}]: ${error.message}`);
		if (error.code === "VALIDATION_ERROR") {
			console.error("  -> The response didn't match the expected schema");
			if (error.rawText) {
				console.error(`  -> Raw response: ${error.rawText}`);
			}
		}
	} else if (error?.cause?.code === "ECONNREFUSED") {
		console.error("\nConnection refused. Is the gateway running?");
	} else {
		console.error("\nUnexpected error:", error);
	}
	process.exit(1);
});
