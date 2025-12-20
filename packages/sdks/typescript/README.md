# @patternzones/koine-sdk

TypeScript SDK for [Koine](../../../README.md) — the HTTP gateway for Claude Code CLI.

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

See the [SDK Guide](../../../docs/sdk-guide.md) for:

- Configuration options
- Streaming examples
- Structured output with Zod
- Error handling
- Multi-turn conversations

## License

[AGPL-3.0](../../../LICENSE)
