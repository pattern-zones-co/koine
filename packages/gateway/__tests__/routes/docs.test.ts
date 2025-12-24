import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import docsRouter from "../../src/routes/docs.js";

// Create test app with just the docs router
function createTestApp() {
	const app = express();
	app.use(docsRouter);
	return app;
}

describe("Documentation Routes", () => {
	describe("GET /openapi.yaml", () => {
		it("returns OpenAPI spec", async () => {
			const app = createTestApp();
			const response = await request(app).get("/openapi.yaml");

			expect(response.status).toBe(200);
			expect(response.type).toBe("text/yaml");
			expect(response.text).toContain("openapi: 3.1.0");
			expect(response.text).toContain("Koine Gateway API");
		});

		it("contains all expected paths", async () => {
			const app = createTestApp();
			const response = await request(app).get("/openapi.yaml");

			expect(response.text).toContain("/health:");
			expect(response.text).toContain("/docs:");
			expect(response.text).toContain("/openapi.yaml:");
			expect(response.text).toContain("/generate-text:");
			expect(response.text).toContain("/generate-object:");
			expect(response.text).toContain("/stream:");
		});
	});

	describe("GET /docs", () => {
		it("returns Scalar documentation page", async () => {
			const app = createTestApp();
			const response = await request(app).get("/docs");

			expect(response.status).toBe(200);
			expect(response.type).toBe("text/html");
			expect(response.text).toContain("Scalar");
		});
	});
});
