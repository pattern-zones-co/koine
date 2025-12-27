/**
 * Tests for tools module (tools.ts).
 *
 * Tests the resolveAllowedTools function that combines gateway-level
 * and request-level tool restrictions.
 */

import { describe, expect, it } from "vitest";
import { resolveAllowedTools } from "../src/tools.js";

describe("Tools Module", () => {
	describe("resolveAllowedTools", () => {
		describe("gateway allowed only", () => {
			it("returns gateway allowed when no request tools", () => {
				const result = resolveAllowedTools(
					["Read", "Glob", "Grep"],
					undefined,
					undefined,
				);
				expect(result).toEqual(["Read", "Glob", "Grep"]);
			});

			it("returns undefined when gateway allows all (undefined)", () => {
				const result = resolveAllowedTools(undefined, undefined, undefined);
				expect(result).toBeUndefined();
			});
		});

		describe("gateway disallowed only", () => {
			it("returns undefined when gateway allows all but disallows some", () => {
				// When gateway allows all (undefined) and has disallowed,
				// without request, we can't create a meaningful allowed list
				const result = resolveAllowedTools(undefined, ["Write"], undefined);
				expect(result).toBeUndefined();
			});

			it("removes disallowed from allowed list", () => {
				const result = resolveAllowedTools(
					["Read", "Glob", "Grep", "Write"],
					["Write"],
					undefined,
				);
				expect(result).toEqual(["Read", "Glob", "Grep"]);
			});

			it("removes multiple disallowed tools", () => {
				const result = resolveAllowedTools(
					["Read", "Glob", "Grep", "Write", "Edit"],
					["Write", "Edit"],
					undefined,
				);
				expect(result).toEqual(["Read", "Glob", "Grep"]);
			});
		});

		describe("request allowed only", () => {
			it("uses request allowed when gateway allows all", () => {
				const result = resolveAllowedTools(undefined, undefined, [
					"Read",
					"Glob",
				]);
				expect(result).toEqual(["Read", "Glob"]);
			});

			it("respects gateway disallowed even with request", () => {
				const result = resolveAllowedTools(
					undefined,
					["Write"],
					["Read", "Write", "Glob"],
				);
				expect(result).toEqual(["Read", "Glob"]);
			});
		});

		describe("intersection behavior", () => {
			it("returns intersection of gateway and request allowed", () => {
				const result = resolveAllowedTools(
					["Read", "Glob", "Grep"],
					undefined,
					["Read", "Write", "Glob"],
				);
				expect(result).toEqual(["Read", "Glob"]);
			});

			it("request cannot expand beyond gateway allowed", () => {
				const result = resolveAllowedTools(["Read", "Glob"], undefined, [
					"Read",
					"Glob",
					"Grep",
					"Write",
				]);
				expect(result).toEqual(["Read", "Glob"]);
			});

			it("returns empty array as undefined when no intersection", () => {
				const result = resolveAllowedTools(["Read", "Glob"], undefined, [
					"Write",
					"Edit",
				]);
				// Empty result becomes undefined
				expect(result).toBeUndefined();
			});
		});

		describe("combined gateway allowed, disallowed, and request", () => {
			it("applies full resolution chain", () => {
				// Gateway allows: Read, Glob, Grep, Write
				// Gateway disallows: Write
				// Request allows: Read, Glob, Write
				// Step 1: effective = [Read, Glob, Grep, Write]
				// Step 2: remove disallowed = [Read, Glob, Grep]
				// Step 3: intersect with request = [Read, Glob]
				// Step 4: apply disallowed again = [Read, Glob]
				const result = resolveAllowedTools(
					["Read", "Glob", "Grep", "Write"],
					["Write"],
					["Read", "Glob", "Write"],
				);
				expect(result).toEqual(["Read", "Glob"]);
			});

			it("request cannot bypass gateway disallowed", () => {
				// Even if request explicitly asks for Write, it's blocked at gateway
				const result = resolveAllowedTools(
					["Read", "Glob", "Write"],
					["Write"],
					["Write"],
				);
				// Request only asked for Write, which is disallowed
				expect(result).toBeUndefined();
			});

			it("handles complex tool patterns", () => {
				const result = resolveAllowedTools(
					["Read", "Glob", "Bash(git log:*)", "Bash(git diff:*)"],
					["Bash(rm:*)"],
					["Read", "Bash(git log:*)", "Bash(rm:*)"],
				);
				expect(result).toEqual(["Read", "Bash(git log:*)"]);
			});
		});

		describe("edge cases", () => {
			it("handles empty gateway allowed array", () => {
				const result = resolveAllowedTools([], undefined, ["Read"]);
				// Empty gateway allowed means nothing is allowed
				expect(result).toBeUndefined();
			});

			it("handles empty request allowed array", () => {
				const result = resolveAllowedTools(["Read", "Glob"], undefined, []);
				// Empty request means no tools
				expect(result).toBeUndefined();
			});

			it("handles empty gateway disallowed array", () => {
				const result = resolveAllowedTools(["Read", "Glob"], [], undefined);
				expect(result).toEqual(["Read", "Glob"]);
			});

			it("preserves order from gateway allowed", () => {
				const result = resolveAllowedTools(
					["Glob", "Read", "Grep"],
					undefined,
					["Read", "Grep", "Glob"],
				);
				// Order should match gateway allowed
				expect(result).toEqual(["Glob", "Read", "Grep"]);
			});
		});
	});
});
