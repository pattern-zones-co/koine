# TypeScript SDK Examples

## Prerequisites

1. Start the Koine gateway:
   ```bash
   docker run -d -p 3100:3100 \
     -e CLAUDE_CODE_GATEWAY_API_KEY=your-key \
     -e ANTHROPIC_API_KEY=your-anthropic-api-key \
     ghcr.io/pattern-zones-co/koine:latest
   ```

2. Set environment variables (or create `.env` in project root):
   ```bash
   export KOINE_BASE_URL=http://localhost:3100
   export KOINE_AUTH_KEY=your-key
   ```

## Running Examples

From the SDK directory (`packages/sdks/typescript`):

```bash
bun run example:hello         # Basic text generation
bun run example:recipe        # Structured output with Zod
bun run example:stream        # Real-time streaming
bun run example:stream-object # Streaming structured output
bun run example:conversation  # Multi-turn sessions
```

## Examples

| File | Description |
|------|-------------|
| `hello.ts` | Basic text generation |
| `extract-recipe.ts` | Structured output with Zod schemas |
| `stream.ts` | Real-time streaming with async iterators |
| `stream-object.ts` | Streaming structured output with partial updates |
| `conversation.ts` | Multi-turn session persistence |
