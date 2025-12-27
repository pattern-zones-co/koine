# @patternzones/koine-sdk

TypeScript SDK for [Koine](https://github.com/pattern-zones-co/koine) — the HTTP gateway for Claude Code CLI.

## Running the Gateway

```bash
docker run -d -p 3100:3100 \
  -e CLAUDE_CODE_GATEWAY_API_KEY=your-key \
  -e ANTHROPIC_API_KEY=your-anthropic-api-key \
  ghcr.io/pattern-zones-co/koine:latest
```

See [Docker Deployment](https://github.com/pattern-zones-co/koine/blob/main/docs/docker-deployment.md) for version pinning and production setup.

## Installation

```bash
bun add @patternzones/koine-sdk
# or: npm install @patternzones/koine-sdk
```

## Quick Start

```typescript
import { createKoine } from '@patternzones/koine-sdk';

const koine = createKoine({
  baseUrl: 'http://localhost:3100',
  authKey: 'your-api-key',
  timeout: 300000, // 5 minutes
});

const result = await koine.generateText({
  prompt: 'Hello, how are you?',
});

console.log(result.text);
```

## Features

- **Text Generation** — `generateText()` for simple prompts
- **Streaming** — `streamText()` with ReadableStream (async iterable)
- **Structured Output** — `generateObject()` with Zod schema validation
- **Tool Restrictions** — `allowedTools` parameter to limit CLI tool access
- **Streaming Structured Output** — `streamObject()` with partial object streaming
- **Cancellation** — AbortSignal support for all requests
- **Type Safety** — Full TypeScript types for all requests and responses
- **Error Handling** — `KoineError` class with typed error codes

## API

### Client Factory

```typescript
const koine = createKoine(config);
```

Creates a client instance with the given configuration. The config is validated once at creation time.

### Methods

| Method | Description |
|--------|-------------|
| `koine.generateText(options)` | Generate text from a prompt |
| `koine.streamText(options)` | Stream text via Server-Sent Events |
| `koine.generateObject(options)` | Extract structured data using a Zod schema |
| `koine.streamObject(options)` | Stream structured data with partial updates |

### Types

| Type | Description |
|------|-------------|
| `KoineConfig` | Client configuration (baseUrl, authKey, timeout, model) |
| `KoineClient` | Client interface returned by `createKoine()` |
| `KoineUsage` | Token usage stats (inputTokens, outputTokens, totalTokens) |
| `KoineStreamResult` | Streaming result with ReadableStream and promises |
| `KoineStreamObjectResult<T>` | Streaming object result with partialObjectStream |
| `KoineError` | Error class with typed `code` property |
| `KoineErrorCode` | Union type of all possible error codes |

## Error Handling & Retries

The SDK does not automatically retry failed requests. When the gateway returns `429 Too Many Requests` (concurrency limit exceeded), your application should implement retry logic:

```typescript
async function generateWithRetry(prompt: string, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await koine.generateText({ prompt });
    } catch (error) {
      if (error instanceof KoineError && error.code === 'CONCURRENCY_LIMIT_ERROR') {
        await new Promise(r => setTimeout(r, 1000 * (i + 1))); // Exponential backoff
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}
```

## Documentation

See the [SDK Guide](https://github.com/pattern-zones-co/koine/blob/main/docs/sdk-guide.md) for:

- Configuration options
- Streaming examples
- Structured output with Zod
- Tool restrictions
- Error handling
- Multi-turn conversations

## Examples

Runnable examples are available in the [`examples/`](https://github.com/pattern-zones-co/koine/tree/main/packages/sdks/typescript/examples) directory. Run from the SDK directory using the npm scripts (which load `.env` from the project root):

```bash
cd packages/sdks/typescript
bun run example:hello         # Basic text generation
bun run example:recipe        # Structured output with Zod
bun run example:stream        # Real-time streaming
bun run example:stream-object # Streaming structured output
bun run example:conversation  # Multi-turn sessions
```

## License

Dual-licensed under [AGPL-3.0 or commercial license](https://github.com/pattern-zones-co/koine/blob/main/LICENSE).
