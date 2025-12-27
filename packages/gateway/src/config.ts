/**
 * Gateway configuration from environment variables
 */

/**
 * Parse a JSON array environment variable into a string array.
 * Expected format: '["Read","Glob","Bash(git log:*)"]'
 *
 * @param envVar - The environment variable value to parse
 * @returns The parsed string array, or undefined if not set or invalid
 */
export function parseToolList(
	envVar: string | undefined,
): string[] | undefined {
	if (!envVar) return undefined;
	try {
		const parsed: unknown = JSON.parse(envVar);
		if (!Array.isArray(parsed)) {
			console.error(`Invalid tool list format (expected array): ${envVar}`);
			return undefined;
		}
		const tools = parsed.filter((t): t is string => typeof t === "string");
		if (tools.length === 0) {
			return undefined;
		}
		return tools;
	} catch {
		console.error(`Failed to parse tool list as JSON: ${envVar}`);
		return undefined;
	}
}

/**
 * Gateway-level tool restrictions loaded from environment variables.
 */
export const gatewayConfig = {
	allowedTools: parseToolList(process.env.KOINE_ALLOWED_TOOLS),
	disallowedTools: parseToolList(process.env.KOINE_DISALLOWED_TOOLS),
};
