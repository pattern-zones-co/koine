# Claude Code Gateway

HTTP gateway for [Claude Code CLI](https://github.com/anthropics/claude-code) with optional TypeScript SDK.

**Turn Claude Code into a REST API** that any application can call with a simple HTTP request.

> ⚠️ **Important: Review Anthropic's Terms of Service**
>
> This gateway supports two authentication methods for Claude CLI:
> - **Subscription plans** (Claude Pro/Max) via OAuth token
> - **API keys** via Anthropic API
>
> These have **different terms of use and allowable applications**. Subscription plans may have restrictions on commercial use, automation, or other use cases that do not apply to API key usage.
>
> **You are responsible for reviewing and complying with [Anthropic's Terms of Service](https://www.anthropic.com/legal/consumer-terms) and the specific terms of your subscription or API agreement before using this gateway.**

## Quick Start

### 1. Start the Gateway

```bash
# Clone the repository
git clone https://github.com/pattern-zones-co/claude-code-gateway.git
cd claude-code-gateway

# Install dependencies
pnpm install

# Set your API key (generate with: openssl rand -hex 32)
export CLAUDE_CODE_GATEWAY_API_KEY="your-secret-key"

# Start the gateway
pnpm dev
```

The gateway runs on `http://localhost:3100` by default.

### 2. Make a Request

**Using fetch (any language):**

```javascript
const response = await fetch('http://localhost:3100/generate-text', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-secret-key'
  },
  body: JSON.stringify({
    prompt: 'Explain recursion in one sentence'
  })
});

const { text } = await response.json();
console.log(text);
```

**Using the TypeScript SDK (type-safe):**

```typescript
import { z } from 'zod';
import { ClaudeCodeClient } from '@pattern-zones-co/claude-code-gateway-sdk';

const client = new ClaudeCodeClient({
  baseUrl: 'http://localhost:3100',
  authKey: 'your-secret-key'
});

// Generate text
const { text } = await client.generateText({
  prompt: 'Explain recursion'
});

// Generate a typed object
const UserSchema = z.object({
  name: z.string(),
  email: z.string().email()
});

const { object } = await client.generateObject({
  prompt: 'Extract: John at john@example.com',
  schema: UserSchema
});
// object is typed as { name: string; email: string }
```

## Packages

| Package | Description |
|---------|-------------|
| [`@pattern-zones-co/claude-code-gateway`](./packages/gateway) | HTTP gateway server |
| [`@pattern-zones-co/claude-code-gateway-sdk`](./packages/sdk) | TypeScript client SDK |

## API Reference

### Authentication

All endpoints (except `/health`) require Bearer token authentication:

```
Authorization: Bearer <CLAUDE_CODE_GATEWAY_API_KEY>
```

### Endpoints

#### `GET /health`

Health check endpoint (no auth required).

```bash
curl http://localhost:3100/health
```

#### `POST /generate-text`

Generate plain text response.

```bash
curl -X POST http://localhost:3100/generate-text \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-key" \
  -d '{
    "prompt": "Explain quantum computing",
    "system": "Be concise",
    "model": "sonnet"
  }'
```

**Response:**
```json
{
  "text": "Quantum computing uses...",
  "usage": { "inputTokens": 10, "outputTokens": 50, "totalTokens": 60 },
  "sessionId": "abc-123"
}
```

#### `POST /generate-object`

Generate structured JSON matching a schema.

```bash
curl -X POST http://localhost:3100/generate-object \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-key" \
  -d '{
    "prompt": "Extract: Meeting with John at 3pm",
    "schema": {
      "type": "object",
      "properties": {
        "person": { "type": "string" },
        "time": { "type": "string" }
      },
      "required": ["person", "time"]
    }
  }'
```

**Response:**
```json
{
  "object": { "person": "John", "time": "3pm" },
  "rawText": "{\"person\":\"John\",\"time\":\"3pm\"}",
  "usage": { "inputTokens": 20, "outputTokens": 15, "totalTokens": 35 },
  "sessionId": "abc-123"
}
```

#### `POST /stream`

Stream text response via Server-Sent Events.

```bash
curl -X POST http://localhost:3100/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-key" \
  -d '{"prompt": "Write a poem"}'
```

**SSE Events:**
- `session` - `{ sessionId: "..." }` (first event)
- `text` - `{ text: "chunk..." }` (content chunks)
- `result` - `{ sessionId: "...", usage: {...} }` (final stats)
- `error` - `{ error: "...", code: "..." }` (on failure)
- `done` - `{ code: 0 }` (stream complete)

## Environment Variables

### Gateway

| Variable | Required | Description |
|----------|----------|-------------|
| `CLAUDE_CODE_GATEWAY_API_KEY` | Yes | API key for authenticating requests |
| `PORT` | No | Server port (default: 3100) |
| `CLAUDE_CODE_OAUTH_TOKEN` | No | OAuth token for Claude Max subscribers |
| `ANTHROPIC_API_KEY` | No | API key (used if OAuth token not set) |
| `CLAUDE_CODE_GATEWAY_*` | No | Any env var with this prefix passes through to Claude CLI |

### Custom Environment Passthrough

Any environment variable prefixed with `CLAUDE_CODE_GATEWAY_` is automatically passed through to the Claude CLI subprocess. This enables custom Claude skills to access external services:

```bash
# These will be available in Claude CLI environment
export CLAUDE_CODE_GATEWAY_MY_API_URL="https://api.example.com"
export CLAUDE_CODE_GATEWAY_MY_API_KEY="secret"
```

## Examples

See the [examples](./examples) directory:

- [basic-fetch](./examples/basic-fetch) - Plain JavaScript with fetch
- [typescript-zod](./examples/typescript-zod) - TypeScript SDK with Zod schemas

## Architecture

```
┌─────────────────┐     HTTP      ┌──────────────────┐    subprocess    ┌─────────────┐
│  Your App       │  ─────────►   │     Gateway      │  ────────────►   │ Claude CLI  │
│  (fetch/SDK)    │  ◄─────────   │    (Express)     │  ◄────────────   │             │
└─────────────────┘    JSON       └──────────────────┘      JSON        └─────────────┘
```

The gateway spawns Claude CLI as a subprocess for each request, parsing the JSON output and returning it via HTTP. This enables:

- **Network access**: Call Claude Code from any machine or container
- **Language agnostic**: Any language with HTTP support works
- **Type safety**: Optional TypeScript SDK with Zod validation
- **Session continuity**: Multi-turn conversations via session IDs

## Development

```bash
# Install dependencies
pnpm install

# Start gateway in dev mode
pnpm dev

# Build all packages
pnpm build

# Run tests
pnpm test
```

## License

MIT
