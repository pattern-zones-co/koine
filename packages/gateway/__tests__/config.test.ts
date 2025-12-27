/**
 * Tests for config module (config.ts).
 *
 * Tests the parseToolList function and gateway configuration parsing.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// We need to test parseToolList before gatewayConfig is read
// So we mock the env and re-import

describe("Config Module", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		vi.resetModules();
		process.env = { ...originalEnv };
	});

	afterAll(() => {
		process.env = originalEnv;
	});

	describe("parseToolList", () => {
		it("returns undefined for undefined env var", async () => {
			const { parseToolList } = await import("../src/config.js");
			expect(parseToolList(undefined)).toBeUndefined();
		});

		it("returns undefined for empty string", async () => {
			const { parseToolList } = await import("../src/config.js");
			expect(parseToolList("")).toBeUndefined();
		});

		it("parses single tool JSON array", async () => {
			const { parseToolList } = await import("../src/config.js");
			expect(parseToolList('["Read"]')).toEqual(["Read"]);
		});

		it("parses multiple tools JSON array", async () => {
			const { parseToolList } = await import("../src/config.js");
			expect(parseToolList('["Read","Glob","Grep"]')).toEqual([
				"Read",
				"Glob",
				"Grep",
			]);
		});

		it("parses tools with special characters", async () => {
			const { parseToolList } = await import("../src/config.js");
			expect(
				parseToolList('["Bash(git log:*)","Bash(git diff:*)","Read"]'),
			).toEqual(["Bash(git log:*)", "Bash(git diff:*)", "Read"]);
		});

		it("returns undefined for invalid JSON", async () => {
			const consoleSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});
			const { parseToolList } = await import("../src/config.js");

			expect(parseToolList("not json")).toBeUndefined();
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining("Failed to parse tool list as JSON"),
			);

			consoleSpy.mockRestore();
		});

		it("returns undefined for non-array JSON", async () => {
			const consoleSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});
			const { parseToolList } = await import("../src/config.js");

			expect(parseToolList('{"tool": "Read"}')).toBeUndefined();
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining("Invalid tool list format (expected array)"),
			);

			consoleSpy.mockRestore();
		});

		it("filters out non-string values from array", async () => {
			const { parseToolList } = await import("../src/config.js");
			expect(parseToolList('["Read", 123, null, "Glob"]')).toEqual([
				"Read",
				"Glob",
			]);
		});

		it("returns undefined for empty array", async () => {
			const { parseToolList } = await import("../src/config.js");
			expect(parseToolList("[]")).toBeUndefined();
		});

		it("returns undefined for array with only non-strings", async () => {
			const { parseToolList } = await import("../src/config.js");
			expect(parseToolList("[123, null, true]")).toBeUndefined();
		});
	});

	describe("gatewayConfig", () => {
		it("loads allowedTools from env var", async () => {
			process.env.KOINE_ALLOWED_TOOLS = '["Read","Glob"]';
			process.env.KOINE_DISALLOWED_TOOLS = undefined;

			const { gatewayConfig } = await import("../src/config.js");

			expect(gatewayConfig.allowedTools).toEqual(["Read", "Glob"]);
			expect(gatewayConfig.disallowedTools).toBeUndefined();
		});

		it("loads disallowedTools from env var", async () => {
			process.env.KOINE_ALLOWED_TOOLS = undefined;
			process.env.KOINE_DISALLOWED_TOOLS = '["Write","Bash(rm:*)"]';

			const { gatewayConfig } = await import("../src/config.js");

			expect(gatewayConfig.allowedTools).toBeUndefined();
			expect(gatewayConfig.disallowedTools).toEqual(["Write", "Bash(rm:*)"]);
		});

		it("loads both allowed and disallowed tools", async () => {
			process.env.KOINE_ALLOWED_TOOLS = '["Read","Glob","Grep"]';
			process.env.KOINE_DISALLOWED_TOOLS = '["Write"]';

			const { gatewayConfig } = await import("../src/config.js");

			expect(gatewayConfig.allowedTools).toEqual(["Read", "Glob", "Grep"]);
			expect(gatewayConfig.disallowedTools).toEqual(["Write"]);
		});
	});
});
