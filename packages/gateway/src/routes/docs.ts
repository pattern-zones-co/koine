import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { apiReference } from "@scalar/express-api-reference";
import { Router } from "express";

const router = Router();

// Resolve path relative to dist directory (compiled output)
const specPath = resolve(__dirname, "../../../../docs/openapi.yaml");

// Serve raw OpenAPI spec
router.get("/openapi.yaml", (_req, res) => {
	const spec = readFileSync(specPath, "utf-8");
	res.type("text/yaml").send(spec);
});

// Serve Scalar API reference
router.use(
	"/docs",
	apiReference({
		url: "/openapi.yaml",
		theme: "deepSpace",
	}),
);

export default router;
