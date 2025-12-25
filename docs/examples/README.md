# SDK Examples

These examples demonstrate how to use the `@patternzones/koine-sdk` TypeScript client.

## Prerequisites

1. **Docker gateway running**: Start the gateway with:
   ```bash
   docker run -d --env-file .env -p 3100:3100 ghcr.io/pattern-zones-co/koine:latest
   ```

2. **Environment configured**: Ensure your `.env` file has:
   ```
   CLAUDE_CODE_GATEWAY_API_KEY=your-api-key
   GATEWAY_PORT=3100  # optional, defaults to 3100
   ```

## Running Examples

Run from the project root directory:

```bash
# Basic text generation
bun run docs/examples/hello.ts

# Structured data extraction with Zod
bun run docs/examples/extract-recipe.ts

# Real-time streaming
bun run docs/examples/stream.ts
```

## Examples

### hello.ts
Basic `generateText` usage. Asks a simple question and displays the response with token usage.

### extract-recipe.ts
Uses `generateObject` with a Zod schema to extract structured recipe data from natural language. Demonstrates type-safe output validation.

### stream.ts
Uses `streamText` to show real-time streaming. Text appears as the model generates it, with a chunk counter to demonstrate streaming is working.
