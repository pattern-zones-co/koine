import { z } from "zod";
import {
	errorResponseSchema,
	generateObjectRequestSchema,
	generateObjectResponseSchema,
	generateTextRequestSchema,
	generateTextResponseSchema,
	healthResponseSchema,
	streamRequestSchema,
} from "../types.js";
import { registry } from "./schemas.js";

// GET /health (no auth required)
registry.registerPath({
	method: "get",
	path: "/health",
	summary: "Health check endpoint",
	description:
		"Verifies the service is running and Claude CLI is accessible. No authentication required.",
	tags: ["Health"],
	responses: {
		200: {
			description: "Service is healthy",
			content: {
				"application/json": {
					schema: healthResponseSchema,
				},
			},
		},
		503: {
			description: "Service is unhealthy (Claude CLI unavailable)",
			content: {
				"application/json": {
					schema: healthResponseSchema,
				},
			},
		},
	},
});

// GET /docs (no auth required)
registry.registerPath({
	method: "get",
	path: "/docs",
	summary: "API documentation",
	description:
		"Interactive API documentation powered by Scalar. No authentication required.",
	tags: ["Documentation"],
	responses: {
		200: {
			description: "HTML page with interactive API documentation",
			content: {
				"text/html": {
					schema: z.string(),
				},
			},
		},
	},
});

// GET /openapi.yaml (no auth required)
registry.registerPath({
	method: "get",
	path: "/openapi.yaml",
	summary: "OpenAPI specification",
	description:
		"Raw OpenAPI 3.1 specification in YAML format. No authentication required.",
	tags: ["Documentation"],
	responses: {
		200: {
			description: "OpenAPI specification in YAML format",
			content: {
				"text/yaml": {
					schema: z.string(),
				},
			},
		},
	},
});

// POST /generate-text
registry.registerPath({
	method: "post",
	path: "/generate-text",
	summary: "Generate text response",
	description: "Generates plain text response from Claude CLI.",
	tags: ["Generation"],
	security: [{ BearerAuth: [] }],
	request: {
		body: {
			content: {
				"application/json": {
					schema: generateTextRequestSchema,
				},
			},
		},
	},
	responses: {
		200: {
			description: "Successful text generation",
			content: {
				"application/json": {
					schema: generateTextResponseSchema,
				},
			},
		},
		400: {
			description: "Validation error",
			content: {
				"application/json": {
					schema: errorResponseSchema,
				},
			},
		},
		401: {
			description: "Missing authorization header",
			content: {
				"application/json": {
					schema: z.object({ error: z.string() }),
				},
			},
		},
		403: {
			description: "Invalid API key",
			content: {
				"application/json": {
					schema: z.object({ error: z.string() }),
				},
			},
		},
		500: {
			description: "Internal server error or CLI error",
			content: {
				"application/json": {
					schema: errorResponseSchema,
				},
			},
		},
	},
});

// POST /generate-object
registry.registerPath({
	method: "post",
	path: "/generate-object",
	summary: "Generate structured JSON response",
	description:
		"Generates structured JSON response from Claude CLI. The schema is passed in the request to instruct Claude to output valid JSON.",
	tags: ["Generation"],
	security: [{ BearerAuth: [] }],
	request: {
		body: {
			content: {
				"application/json": {
					schema: generateObjectRequestSchema,
				},
			},
		},
	},
	responses: {
		200: {
			description: "Successful object generation",
			content: {
				"application/json": {
					schema: generateObjectResponseSchema,
				},
			},
		},
		400: {
			description: "Validation error",
			content: {
				"application/json": {
					schema: errorResponseSchema,
				},
			},
		},
		401: {
			description: "Missing authorization header",
			content: {
				"application/json": {
					schema: z.object({ error: z.string() }),
				},
			},
		},
		403: {
			description: "Invalid API key",
			content: {
				"application/json": {
					schema: z.object({ error: z.string() }),
				},
			},
		},
		500: {
			description: "Internal server error or CLI error",
			content: {
				"application/json": {
					schema: errorResponseSchema,
				},
			},
		},
	},
});

// POST /stream
registry.registerPath({
	method: "post",
	path: "/stream",
	summary: "Stream text response via SSE",
	description:
		"Streams Claude CLI output using Server-Sent Events (SSE). Provides real-time streaming of Claude's response with session management and usage tracking. Event types: session (session ID), text (streaming content), result (final usage stats), error (errors), done (stream complete).",
	tags: ["Streaming"],
	security: [{ BearerAuth: [] }],
	request: {
		body: {
			content: {
				"application/json": {
					schema: streamRequestSchema,
				},
			},
		},
	},
	responses: {
		200: {
			description: "SSE stream with real-time Claude CLI output",
			content: {
				"text/event-stream": {
					schema: z.string(),
				},
			},
		},
		400: {
			description: "Validation error",
			content: {
				"application/json": {
					schema: errorResponseSchema,
				},
			},
		},
		401: {
			description: "Missing authorization header",
			content: {
				"application/json": {
					schema: z.object({ error: z.string() }),
				},
			},
		},
		403: {
			description: "Invalid API key",
			content: {
				"application/json": {
					schema: z.object({ error: z.string() }),
				},
			},
		},
	},
});
