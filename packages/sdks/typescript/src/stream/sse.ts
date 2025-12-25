/**
 * Parses SSE events from a ReadableStream.
 * SSE format: "event: name\ndata: {...}\n\n"
 */
export function createSSEParser(): TransformStream<
	Uint8Array,
	{ event: string; data: string }
> {
	let buffer = "";
	// Reuse decoder with stream mode to correctly handle multi-byte UTF-8 chars spanning chunks
	const decoder = new TextDecoder();

	return new TransformStream({
		transform(chunk, controller) {
			buffer += decoder.decode(chunk, { stream: true });

			// SSE events are separated by double newlines
			const events = buffer.split("\n\n");
			// Keep the last potentially incomplete event in the buffer
			buffer = events.pop() || "";

			for (const eventStr of events) {
				if (!eventStr.trim()) continue;

				const lines = eventStr.split("\n");
				let eventType = "";
				let data = "";

				for (const line of lines) {
					if (line.startsWith("event: ")) {
						eventType = line.slice(7);
					} else if (line.startsWith("data: ")) {
						data = line.slice(6);
					}
				}

				if (eventType && data) {
					controller.enqueue({ event: eventType, data });
				}
			}
		},
		flush(controller) {
			// Process any remaining data in buffer
			if (buffer.trim()) {
				const lines = buffer.split("\n");
				let eventType = "";
				let data = "";

				for (const line of lines) {
					if (line.startsWith("event: ")) {
						eventType = line.slice(7);
					} else if (line.startsWith("data: ")) {
						data = line.slice(6);
					}
				}

				if (eventType && data) {
					controller.enqueue({ event: eventType, data });
				}
			}
		},
	});
}
