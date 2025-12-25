# @patternzones/koine-sdk

TypeScript SDK for [Koine](https://github.com/pattern-zones-co/koine) — the HTTP gateway for Claude Code CLI.

## Running the Gateway

```bash
docker run -d -p 3100:3100 \
  -e CLAUDE_CODE_GATEWAY_API_KEY=your-key \
  -e CLAUDE_CODE_OAUTH_TOKEN=your-token \
  ghcr.io/pattern-zones-co/koine:latest
```

See [Docker Deployment](https://github.com/pattern-zones-co/koine/blob/main/docs/docker-deployment.md) for version pinning and production setup.

## Installation

```bash
npm install @patternzones/koine-sdk
```

## Quick Start

```typescript
import { generateText, KoineConfig } from '@patternzones/koine-sdk';

const config: KoineConfig = {
  baseUrl: 'http://localhost:3100',
  authKey: 'your-api-key',
};

const result = await generateText(config, {
  prompt: 'Hello, how are you?',
});

console.log(result.text);
```

## Features

- **Text Generation** — `generateText()` for simple prompts
- **Streaming** — `streamText()` with async iterators
- **Structured Output** — `generateObject()` with Zod schema validation
- **Type Safety** — Full TypeScript types for all requests and responses
- **Error Handling** — `KoineError` class with status codes

## API

### Functions

| Function | Description |
|----------|-------------|
| `generateText(config, request)` | Generate text from a prompt |
| `streamText(config, request)` | Stream text via Server-Sent Events |
| `generateObject(config, request)` | Extract structured data using a Zod schema |

### Types

| Type | Description |
|------|-------------|
| `KoineConfig` | Client configuration (baseUrl, authKey, timeout, model) |
| `GenerateTextRequest` | Text generation request options |
| `GenerateTextResponse` | Text generation response with usage stats |
| `GenerateObjectRequest` | Object extraction request with Zod schema |
| `GenerateObjectResponse` | Object extraction response |
| `KoineStreamResult` | Streaming result with async iterators |
| `KoineError` | Error class with status and code |

## Documentation

See the [SDK Guide](https://github.com/pattern-zones-co/koine/blob/main/docs/sdk-guide.md) for:

- Configuration options
- Streaming examples
- Structured output with Zod
- Error handling
- Multi-turn conversations

## Examples

Runnable examples are available in the [`examples/`](https://github.com/pattern-zones-co/koine/tree/main/packages/sdks/typescript/examples) directory. Run from the SDK directory using the npm scripts (which load `.env` from the project root):

```bash
cd packages/sdks/typescript
bun run example:hello        # Basic text generation
bun run example:recipe       # Structured output with Zod
bun run example:stream       # Real-time streaming
bun run example:conversation # Multi-turn sessions
```

## License

Dual-licensed under [AGPL-3.0 or commercial license](https://github.com/pattern-zones-co/koine/blob/main/LICENSE).
