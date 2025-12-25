# SDK Examples

Examples demonstrating how to use Koine SDKs.

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

## TypeScript Examples

Using `@patternzones/koine-sdk`. Run from the project root:

```bash
bun run docs/examples/typescript/hello.ts
bun run docs/examples/typescript/extract-recipe.ts
bun run docs/examples/typescript/stream.ts
bun run docs/examples/typescript/conversation.ts
```

| Example | Description |
|---------|-------------|
| `hello.ts` | Basic `generateText` usage |
| `extract-recipe.ts` | Structured output with Zod schemas |
| `stream.ts` | Real-time streaming with `streamText` |
| `conversation.ts` | Multi-turn conversations with `sessionId` |

## Python Examples

Coming soon.
