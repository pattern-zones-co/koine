/**
 * Tool resolution logic for combining gateway and request tool restrictions.
 */

/**
 * Resolve the effective allowed tools list by combining gateway-level
 * and request-level restrictions.
 *
 * Behavior:
 * - Gateway allowedTools sets the base set (undefined = all tools allowed)
 * - Gateway disallowedTools removes tools from the allowed set
 * - Request allowedTools can only further restrict (intersection with gateway set)
 * - Request cannot bypass gateway disallowedTools
 *
 * @param gatewayAllowed - Tools allowed at gateway level (undefined = all)
 * @param gatewayDisallowed - Tools disallowed at gateway level
 * @param requestAllowed - Tools requested by the client (can only restrict further)
 * @returns The effective allowed tools list, or undefined if all tools are allowed
 */
export function resolveAllowedTools(
	gatewayAllowed: string[] | undefined,
	gatewayDisallowed: string[] | undefined,
	requestAllowed: string[] | undefined,
): string[] | undefined {
	// Step 1: Start with gateway allowed (undefined = all)
	let effective = gatewayAllowed ? [...gatewayAllowed] : undefined;

	// Step 2: Remove gateway disallowed from the effective set
	if (effective && gatewayDisallowed) {
		effective = effective.filter((t) => !gatewayDisallowed.includes(t));
	}

	// Step 3: Intersect with request allowed (if specified)
	if (requestAllowed) {
		if (effective) {
			// Intersection: only tools in both lists
			effective = effective.filter((t) => requestAllowed.includes(t));
		} else {
			// Gateway allows all, so use request list as base
			effective = [...requestAllowed];
		}
	}

	// Step 4: Apply gateway disallowed to final result (ensures request can't bypass)
	if (effective && gatewayDisallowed) {
		effective = effective.filter((t) => !gatewayDisallowed.includes(t));
	}

	// Return undefined if empty (means no tools allowed, but we use undefined for "all")
	return effective?.length ? effective : undefined;
}
