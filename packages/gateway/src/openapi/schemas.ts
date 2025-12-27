import {
	OpenAPIRegistry,
	extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import {
	errorResponseSchema,
	generateObjectRequestSchema,
	generateObjectResponseSchema,
	generateTextRequestSchema,
	generateTextResponseSchema,
	healthResponseSchema,
	streamObjectRequestSchema,
	streamRequestSchema,
	usageInfoSchema,
} from "../types.js";

// Extend Zod with OpenAPI methods
extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

// Register request schemas
registry.register("GenerateTextRequest", generateTextRequestSchema);
registry.register("GenerateObjectRequest", generateObjectRequestSchema);
registry.register("StreamRequest", streamRequestSchema);
registry.register("StreamObjectRequest", streamObjectRequestSchema);

// Register response schemas
registry.register("UsageInfo", usageInfoSchema);
registry.register("GenerateTextResponse", generateTextResponseSchema);
registry.register("GenerateObjectResponse", generateObjectResponseSchema);
registry.register("ErrorResponse", errorResponseSchema);
registry.register("HealthResponse", healthResponseSchema);

// Register security scheme
registry.registerComponent("securitySchemes", "BearerAuth", {
	type: "http",
	scheme: "bearer",
	description:
		"API key for authentication. Generate with: openssl rand -hex 32",
});
