import { timingSafeEqual } from "node:crypto";
import express, { type Application } from "express";
import { logger } from "./logger.js";
import docsRouter from "./routes/docs.js";
import generateRouter from "./routes/generate.js";
import healthRouter from "./routes/health.js";
import streamRouter from "./routes/stream.js";

const app: Application = express();
const PORT = process.env.PORT || process.env.GATEWAY_PORT || 3100;
const GATEWAY_API_KEY = process.env.CLAUDE_CODE_GATEWAY_API_KEY;

// Require API key for security - prevents accidental exposure of gateway service
if (!GATEWAY_API_KEY) {
	logger.error(
		"CLAUDE_CODE_GATEWAY_API_KEY environment variable is required. " +
			"Generate one with: openssl rand -hex 32",
	);
	process.exit(1);
}

// Middleware
app.use(express.json({ limit: "10mb" }));

// API key authentication (required for all routes except health check and docs)
app.use((req, res, next) => {
	// Skip auth for health check and documentation
	if (
		req.path === "/health" ||
		req.path === "/docs" ||
		req.path === "/openapi.yaml"
	) {
		next();
		return;
	}

	const authHeader = req.headers.authorization;
	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		res.status(401).json({ error: "Missing authorization header" });
		return;
	}

	const token = authHeader.slice(7);

	// Use timing-safe comparison to prevent timing attacks
	const tokenBuffer = Buffer.from(token);
	const apiKeyBuffer = Buffer.from(GATEWAY_API_KEY);
	const isValid =
		tokenBuffer.length === apiKeyBuffer.length &&
		timingSafeEqual(tokenBuffer, apiKeyBuffer);

	if (!isValid) {
		res.status(403).json({ error: "Invalid API key" });
		return;
	}

	next();
});

// Request logging
app.use((req, _res, next) => {
	logger.info(`${req.method} ${req.path}`);
	next();
});

// Routes
app.use(healthRouter);
app.use(docsRouter);
app.use(generateRouter);
app.use(streamRouter);

// 404 handler
app.use((_req, res) => {
	res.status(404).json({ error: "Not found" });
});

// Error handler
app.use(
	(
		err: Error,
		_req: express.Request,
		res: express.Response,
		_next: express.NextFunction,
	) => {
		logger.error("Unhandled error:", err);
		res.status(500).json({
			error: "Internal server error",
			code: "INTERNAL_ERROR",
		});
	},
);

// Start server and export for test cleanup
const server = app.listen(PORT, () => {
	logger.info(`Claude Code Wrapper listening on port ${PORT}`);
	logger.info("API key authentication: enabled (required)");
});

export { server };
export default app;
