import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { registry } from "./schemas.js";
import "./paths.js"; // Side-effect: registers paths

export function generateOpenAPIDocument() {
	const generator = new OpenApiGeneratorV31(registry.definitions);

	return generator.generateDocument({
		openapi: "3.1.0",
		info: {
			title: "Koine Gateway API",
			version: "1.0.0",
			description:
				"HTTP gateway service for Claude Code CLI. Provides REST endpoints for text generation, structured object generation, and streaming responses.",
			license: {
				name: "AGPL-3.0",
				url: "https://www.gnu.org/licenses/agpl-3.0.en.html",
			},
			contact: {
				name: "Pattern Zones Co",
				url: "https://github.com/pattern-zones-co/koine",
			},
		},
		servers: [
			{
				url: "http://localhost:3100",
				description: "Local development server",
			},
		],
		tags: [
			{ name: "Health", description: "Health check endpoints" },
			{
				name: "Documentation",
				description: "API documentation and OpenAPI specification",
			},
			{
				name: "Generation",
				description: "Text and object generation endpoints",
			},
			{
				name: "Streaming",
				description: "Server-Sent Events streaming endpoints",
			},
		],
	});
}

export { registry };
