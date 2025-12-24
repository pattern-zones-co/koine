import { describe, expect, it } from "vitest";
import { generateOpenAPIDocument } from "../../src/openapi/index.js";

describe("OpenAPI Generation", () => {
	const doc = generateOpenAPIDocument();

	it("should generate a valid OpenAPI 3.1 document", () => {
		expect(doc.openapi).toBe("3.1.0");
		expect(doc.info.title).toBe("Koine Gateway API");
		expect(doc.info.version).toBe("1.0.0");
	});

	it("should include all endpoints", () => {
		expect(doc.paths).toHaveProperty("/health");
		expect(doc.paths).toHaveProperty("/generate-text");
		expect(doc.paths).toHaveProperty("/generate-object");
		expect(doc.paths).toHaveProperty("/stream");
	});

	it("should include security scheme", () => {
		expect(doc.components?.securitySchemes).toHaveProperty("BearerAuth");
		expect(doc.components?.securitySchemes?.BearerAuth).toEqual({
			type: "http",
			scheme: "bearer",
			description:
				"API key for authentication. Generate with: openssl rand -hex 32",
		});
	});

	it("should include all registered schemas", () => {
		const schemas = doc.components?.schemas;
		expect(schemas).toHaveProperty("GenerateTextRequest");
		expect(schemas).toHaveProperty("GenerateObjectRequest");
		expect(schemas).toHaveProperty("StreamRequest");
		expect(schemas).toHaveProperty("GenerateTextResponse");
		expect(schemas).toHaveProperty("GenerateObjectResponse");
		expect(schemas).toHaveProperty("ErrorResponse");
		expect(schemas).toHaveProperty("HealthResponse");
		expect(schemas).toHaveProperty("UsageInfo");
	});

	it("should require authentication for generation endpoints", () => {
		const generateTextPath = doc.paths?.["/generate-text"]?.post;
		const generateObjectPath = doc.paths?.["/generate-object"]?.post;
		const streamPath = doc.paths?.["/stream"]?.post;

		expect(generateTextPath?.security).toEqual([{ BearerAuth: [] }]);
		expect(generateObjectPath?.security).toEqual([{ BearerAuth: [] }]);
		expect(streamPath?.security).toEqual([{ BearerAuth: [] }]);
	});

	it("should not require authentication for health endpoint", () => {
		const healthPath = doc.paths?.["/health"]?.get;
		expect(healthPath?.security).toBeUndefined();
	});

	it("should include proper tags", () => {
		expect(doc.tags).toContainEqual({
			name: "Health",
			description: "Health check endpoints",
		});
		expect(doc.tags).toContainEqual({
			name: "Generation",
			description: "Text and object generation endpoints",
		});
		expect(doc.tags).toContainEqual({
			name: "Streaming",
			description: "Server-Sent Events streaming endpoints",
		});
	});

	it("should include server configuration", () => {
		expect(doc.servers).toContainEqual({
			url: "http://localhost:3100",
			description: "Local development server",
		});
	});
});
