import { type Request, type Response, Router } from "express";
import { ClaudeCliError, executeClaudeCli } from "../cli.js";
import { withConcurrencyLimit } from "../concurrency.js";
import { logger } from "../logger.js";
import {
	type ErrorResponse,
	type GenerateObjectResponse,
	type GenerateTextResponse,
	generateObjectRequestSchema,
	generateTextRequestSchema,
} from "../types.js";

const router: Router = Router();

/**
 * POST /generate-text
 *
 * Generates plain text response from Claude CLI.
 */
router.post(
	"/generate-text",
	withConcurrencyLimit(
		"nonStreaming",
		async (
			req: Request,
			res: Response<GenerateTextResponse | ErrorResponse>,
		) => {
			const parseResult = generateTextRequestSchema.safeParse(req.body);

			if (!parseResult.success) {
				res.status(400).json({
					error: "Invalid request body",
					code: "VALIDATION_ERROR",
					rawText: JSON.stringify(parseResult.error.issues),
				});
				return;
			}

			const { prompt, system, sessionId, model } = parseResult.data;

			logger.info("generate-text", {
				model: model || "default",
				hasSystem: !!system,
				promptLength: prompt.length,
			});

			try {
				const result = await executeClaudeCli({
					prompt,
					system,
					sessionId,
					model,
				});

				res.json({
					text: result.text,
					usage: result.usage,
					sessionId: result.sessionId,
				});
			} catch (error) {
				handleCliError(error, res);
			}
		},
	),
);

/**
 * POST /generate-object
 *
 * Generates structured JSON response from Claude CLI.
 * Uses the --json-schema flag for constrained decoding at the model level.
 */
router.post(
	"/generate-object",
	withConcurrencyLimit(
		"nonStreaming",
		async (
			req: Request,
			res: Response<GenerateObjectResponse | ErrorResponse>,
		) => {
			const parseResult = generateObjectRequestSchema.safeParse(req.body);

			if (!parseResult.success) {
				res.status(400).json({
					error: "Invalid request body",
					code: "VALIDATION_ERROR",
					rawText: JSON.stringify(parseResult.error.issues),
				});
				return;
			}

			const { prompt, system, schema, sessionId, model } = parseResult.data;

			logger.info("generate-object", {
				model: model || "default",
				hasSystem: !!system,
				promptLength: prompt.length,
			});

			try {
				const result = await executeClaudeCli({
					prompt,
					system,
					sessionId,
					model,
					jsonSchema: schema,
				});

				// Parse the JSON response (CLI constrained decoding enforces valid JSON)
				const parsedObject = parseJsonResponse(result.text);

				res.json({
					object: parsedObject,
					rawText: result.text,
					usage: result.usage,
					sessionId: result.sessionId,
				});
			} catch (error) {
				handleCliError(error, res);
			}
		},
	),
);

/**
 * Parses JSON from Claude's response.
 * With --json-schema constrained decoding, the CLI enforces valid JSON output.
 */
function parseJsonResponse(text: string): unknown {
	return JSON.parse(text);
}

/**
 * Handles CLI errors and sends appropriate HTTP response.
 */
function handleCliError(error: unknown, res: Response<ErrorResponse>): void {
	if (error instanceof ClaudeCliError) {
		// Don't include rawOutput in response - may contain sensitive data
		res.status(500).json({
			error: error.message,
			code: error.code,
		});
		return;
	}

	if (error instanceof Error) {
		res.status(500).json({
			error: error.message,
			code: "INTERNAL_ERROR",
		});
		return;
	}

	res.status(500).json({
		error: "Unknown error occurred",
		code: "UNKNOWN_ERROR",
	});
}

export default router;
