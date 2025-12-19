# Koine

> The common language for your services.

An HTTP gateway that exposes [Claude Code CLI](https://github.com/anthropics/claude-code) as a REST API, plus a TypeScript SDK for easy integration.

Named after **Koine Greek** — the "common tongue" that connected the ancient Mediterranean — Koine sits between your clients and backends, translating protocols and managing requests so your services don't have to know about each other.

[![codecov](https://codecov.io/gh/pattern-zones-co/koine/graph/badge.svg)](https://codecov.io/gh/pattern-zones-co/koine)
## Packages

| Package | Description |
|---------|-------------|
| `@pattern-zones-co/koine` | HTTP gateway server wrapping Claude Code CLI |
| `@pattern-zones-co/koine-sdk` | TypeScript SDK for gateway clients |

> [!WARNING]
> **Review Anthropic's Terms of Service**
>
> This gateway supports two authentication methods for Claude CLI:
> - **Subscription plans** (Claude Pro/Max) via OAuth token
> - **API keys** via Anthropic API
>
> These have **different terms of use and allowable applications**. Subscription plans may have restrictions on commercial use, automation, or other use cases that do not apply to API key usage.
>
> **You are responsible for reviewing and complying with [Anthropic's Terms of Service](https://www.anthropic.com/legal/consumer-terms) and the specific terms of your subscription or API agreement before using this gateway.**

## Overview

Koine provides:

- **REST API endpoints** for text generation, object extraction, and streaming
- **Session management** for multi-turn conversations
- **Health monitoring** with CLI availability checks
- **Extensible skills system** for domain-specific capabilities
- **Docker deployment** with hardened security configuration
- **TypeScript SDK** for type-safe client integration

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Your Application                                                       │
│  (Using SDK or HTTP client)                                             │
└─────────────────────────────────────────────────────────────────────────┘
                            │
                            ▼ HTTP REST API
┌─────────────────────────────────────────────────────────────────────────┐
│  Koine (this service)                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ Core HTTP Server (Express)                                          ││
│  │ - /generate-text    → Text generation                               ││
│  │ - /generate-object  → Structured object extraction                  ││
│  │ - /stream           → Server-Sent Events streaming                  ││
│  │ - /health           → Health check with CLI status                  ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                           │                                             │
│                           ▼ Subprocess                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ Claude Code CLI                                                     ││
│  │ + Skills (loaded from claude-assets/)                               ││
│  └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
koine/
├── packages/
│   ├── gateway/               # HTTP gateway server
│   │   ├── src/
│   │   │   ├── index.ts       # Express app setup, auth middleware
│   │   │   ├── cli.ts         # Claude CLI subprocess management
│   │   │   ├── types.ts       # Request/response type definitions
│   │   │   ├── logger.ts      # Logging utilities
│   │   │   └── routes/
│   │   │       ├── generate.ts  # /generate-text and /generate-object
│   │   │       ├── stream.ts    # /stream (SSE streaming)
│   │   │       └── health.ts    # /health endpoint
│   │   └── __tests__/
│   └── sdk/                   # TypeScript client SDK
│       ├── src/
│       │   ├── client.ts      # HTTP client functions
│       │   ├── types.ts       # Type definitions
│       │   ├── errors.ts      # Custom error classes
│       │   └── index.ts       # Public exports
│       └── __tests__/
├── claude-assets/             # Skills and commands for the Docker container
│   ├── skills/
│   └── commands/
├── Dockerfile                 # Hardened container build
├── docker-compose.yml         # Docker deployment example
└── pnpm-workspace.yaml        # Monorepo configuration
```

## Quick Start

### Using the SDK

```typescript
import { generateText, KoineConfig } from '@pattern-zones-co/koine-sdk';

const config: KoineConfig = {
  baseUrl: 'http://localhost:3100',
  timeout: 300000,
  authKey: 'your-api-key',
  model: 'sonnet',
};

const result = await generateText(config, {
  prompt: 'Hello, how are you?',
  system: 'You are a helpful assistant.',
});

console.log(result.text);
console.log(result.usage);
```

### Streaming

```typescript
import { streamText } from '@pattern-zones-co/koine-sdk';

const result = await streamText(config, {
  prompt: 'Write a short story',
});

// Stream text chunks as they arrive
for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}

// Get final results
const fullText = await result.text;
const usage = await result.usage;
```

### Structured Output

```typescript
import { generateObject } from '@pattern-zones-co/koine-sdk';
import { z } from 'zod';

const PersonSchema = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string().email(),
});

const result = await generateObject(config, {
  prompt: 'Extract person info: John is 30 years old, email: john@example.com',
  schema: PersonSchema,
});

console.log(result.object); // { name: "John", age: 30, email: "john@example.com" }
```

## API Reference

### Authentication

All endpoints (except `/health`) require Bearer token authentication:

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" http://localhost:3100/generate-text
```

### `POST /generate-text`

Generate text from a prompt.

**Request:**
```json
{
  "prompt": "Explain quantum computing in simple terms",
  "system": "You are a helpful science teacher",
  "sessionId": "optional-session-id",
  "model": "sonnet"
}
```

**Response:**
```json
{
  "text": "Quantum computing is...",
  "usage": {
    "inputTokens": 25,
    "outputTokens": 150,
    "totalTokens": 175
  },
  "sessionId": "session-uuid"
}
```

### `POST /generate-object`

Extract structured data using a JSON schema.

**Request:**
```json
{
  "prompt": "Extract the person's name and age from: John is 30 years old",
  "schema": {
    "type": "object",
    "properties": {
      "name": { "type": "string" },
      "age": { "type": "number" }
    }
  }
}
```

**Response:**
```json
{
  "object": { "name": "John", "age": 30 },
  "rawText": "{\"name\": \"John\", \"age\": 30}",
  "usage": { "inputTokens": 40, "outputTokens": 20, "totalTokens": 60 },
  "sessionId": "session-uuid"
}
```

### `POST /stream`

Stream responses via Server-Sent Events (SSE).

**Request:**
```json
{
  "prompt": "Write a short story about a robot",
  "system": "You are a creative writer"
}
```

**Response (SSE events):**
```
event: session
data: {"sessionId": "session-uuid"}

event: text
data: {"text": "Once upon"}

event: text
data: {"text": " a time..."}

event: result
data: {"sessionId": "session-uuid", "usage": {...}}

event: done
data: {"code": 0, "signal": null}
```

### `GET /health`

Health check endpoint (no authentication required).

**Response:**
```json
{
  "status": "healthy",
  "cli": {
    "available": true,
    "version": "1.0.34"
  }
}
```

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `CLAUDE_CODE_GATEWAY_API_KEY` | Bearer token for authenticating API requests |

### Claude Authentication (one required)

| Variable | Description |
|----------|-------------|
| `CLAUDE_CODE_OAUTH_TOKEN` | OAuth token (for Claude Max subscribers) |
| `ANTHROPIC_API_KEY` | API key (used if OAuth token not present) |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `GATEWAY_PORT` | `3100` | HTTP server port |

## Development

### Prerequisites

- Node.js >= 20 or Bun >= 1.1
- pnpm (for workspace management)
- Claude Code CLI installed (`bun install -g @anthropic-ai/claude-code`)

### Setup

```bash
# Install dependencies
pnpm install

# Set required environment variables
cp .env.example .env
# Edit .env with your values

# Run gateway in development mode
pnpm dev

# Run tests
pnpm test

# Build all packages
pnpm build
```

## Docker Deployment

### Using Docker Compose

```bash
# Copy and edit environment file
cp .env.example .env

# Start the gateway
docker compose up -d gateway

# Check health
curl http://localhost:3100/health
```

### Build and Run Manually

```bash
# Build
docker build -t koine .

# Run
docker run -d \
  -p 3100:3100 \
  -e CLAUDE_CODE_GATEWAY_API_KEY=your-api-key \
  -e ANTHROPIC_API_KEY=your-anthropic-key \
  koine
```

### Security Features

The Docker image includes several hardening measures:

- Multi-stage build (smaller attack surface)
- Non-root user execution (`bun` user, UID 1000)
- Minimal base image (Bun slim ~100MB)
- Security options: `no-new-privileges`, `cap_drop: ALL`
- Health check endpoint
- Read-only filesystem with tmpfs for temporary files

## Skills System

Claude Code supports **skills** - markdown files that teach Claude how to use domain-specific tools. Skills are placed in `claude-assets/skills/` and copied into the Docker container at build time.

### Adding Custom Skills

1. Create a skill directory: `claude-assets/skills/your-skill-name/`
2. Add a `SKILL.md` file with:
   - YAML frontmatter (`name`, `description`, `allowed-tools`)
   - Instructions for Claude on when and how to use the skill
   - API documentation, examples, and best practices

## Error Codes

| Code | Description |
|------|-------------|
| `TIMEOUT_ERROR` | CLI execution timed out |
| `CLI_EXIT_ERROR` | CLI exited with non-zero code |
| `SPAWN_ERROR` | Failed to spawn CLI process |
| `PARSE_ERROR` | Failed to parse CLI output |

## License

See [LICENSE](LICENSE) for details.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.
