/**
 * extract-recipe.ts - generateObject example with Zod schema
 *
 * Demonstrates structured data extraction using Zod schemas for type-safe output.
 *
 * Run from packages/sdks/typescript:
 *   bun run example:recipe
 */

import {
	type KoineConfig,
	KoineError,
	generateObject,
} from "@patternzones/koine-sdk";
import { z } from "zod";

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

// Define the schema for a recipe
const RecipeSchema = z.object({
	name: z.string().describe("Name of the recipe"),
	ingredients: z.array(z.string()).describe("List of ingredients"),
	steps: z.array(z.string()).describe("Cooking instructions"),
	prepTime: z.number().describe("Preparation time in minutes"),
	cookTime: z.number().describe("Cooking time in minutes"),
});

async function main() {
	console.log("Extracting recipe from natural language...\n");

	const result = await generateObject(config, {
		prompt: `Extract the recipe from this description:

Make classic pancakes by mixing 1 cup flour, 1 egg, 1 cup milk, and 2 tbsp melted butter.
First combine the dry ingredients, then whisk in the wet ingredients until smooth.
Heat a griddle and pour 1/4 cup batter per pancake. Cook until bubbles form, flip,
and cook until golden. Takes about 5 minutes to prep and 15 minutes to cook.`,
		schema: RecipeSchema,
	});

	console.log("Recipe extracted:");
	console.log(JSON.stringify(result.object, null, 2));
	console.log(
		`\nTokens used: ${result.usage.totalTokens} (input: ${result.usage.inputTokens}, output: ${result.usage.outputTokens})`,
	);
}

main().catch((error) => {
	if (error instanceof KoineError) {
		console.error(`\nKoine Error [${error.code}]: ${error.message}`);
		if (error.code === "VALIDATION_ERROR") {
			console.error("  → The response didn't match the expected schema");
			if (error.rawText) {
				console.error(`  → Raw response: ${error.rawText}`);
			}
		} else if (error.code === "HTTP_ERROR" && error.message.includes("401")) {
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
