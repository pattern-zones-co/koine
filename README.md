# Koine

HTTP gateway + SDKs that expose [Claude Code CLI](https://github.com/anthropics/claude-code) as a REST API.

[![npm](https://img.shields.io/npm/v/@patternzones/koine-sdk)](https://www.npmjs.com/package/@patternzones/koine-sdk)
[![PyPI](https://img.shields.io/pypi/v/koine-sdk)](https://pypi.org/project/koine-sdk/)
[![License](https://img.shields.io/badge/license-AGPL--3.0%20%2F%20Commercial-blue)](LICENSE)

> **Koine** (koy-NAY) — the common Greek that connected the ancient Mediterranean. Koine connects your apps to Claude Code.

## Why Koine?

Claude Code is Anthropic's agentic coding assistant. It reads files, runs commands, edits code, and uses tools autonomously. But it's a CLI, not an API.

**Koine makes Claude Code callable from your applications.** Deploy it as a Docker service, call it from any language, get structured typed responses.

### Why Claude Code Instead of a Standard LLM SDK?

With a typical LLM SDK, you get text in → text out. Tool use, file access, and code execution require building your own orchestration layer.

Claude Code is that orchestration layer:

- **Agentic loop built-in**: tool calls handled automatically, no orchestration code
- **File system and bash access**: read, write, edit files and run commands
- **Skills and commands**: extend with domain knowledge and custom workflows
- **MCP support**: connect to external tools via Model Context Protocol
- **Battle-tested**: Anthropic's own agentic runtime, refined in production

### Why Koine Instead of Claude Code Directly?

| Claude Code CLI | Koine |
|-----------------|-------|
| Interactive terminal | REST API for any language |
| Manual invocation | Programmatic access with SDKs |
| Local sessions | Persistent sessions across requests |
| Local access only | Network-accessible from any service |

### Who It's For

- **Solo founders** who use Claude Code daily and want to use it in toolchains
- **Backend developers** adding AI capabilities to services and APIs
- **AI tinkerers** building agentic workflows, automation, and experiments
- **Data engineers** who need structured, typed LLM output in pipelines
- **Platform teams** exposing Claude Code to internal services

## Quick Start

```bash
# Start the gateway
docker run -d -p 3100:3100 \
  -e CLAUDE_CODE_GATEWAY_API_KEY=your-gateway-key \
  -e ANTHROPIC_API_KEY=your-anthropic-api-key \
  ghcr.io/pattern-zones-co/koine:latest

# Make your first request
curl -X POST http://localhost:3100/generate-text \
  -H "Authorization: Bearer your-gateway-key" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello!"}'
```

See [Docker Deployment](docs/docker-deployment.md) for docker-compose, version pinning, and production configuration.

## Built for Integrations

- **Interactive API docs**: Scalar-powered docs at `/docs`
- **OpenAPI spec**: generate clients for any language
- **Runnable examples**: copy-paste and go
- **Text generation**: simple prompts to full responses
- **Streaming**: real-time Server-Sent Events
- **Structured output**: type-safe extraction with Zod/Pydantic schemas
- **Session management**: multi-turn conversations with context persistence
- **TypeScript & Python SDKs**: full type safety and async support
- **Extensible**: add custom [skills and slash commands](docs/skills-and-commands.md)
- **Docker-first**: containerized deployment with security isolation
- **Concurrency limits**: configurable limits prevent resource exhaustion (clients handle retries)

## SDK Usage

```typescript
import { createKoine } from '@patternzones/koine-sdk';

const koine = createKoine({
  baseUrl: 'http://localhost:3100',
  authKey: 'your-key',
});

const result = await koine.generateText({ prompt: 'Hello!' });
console.log(result.text);
```

- [TypeScript SDK](docs/sdk-guide.md) · [examples](packages/sdks/typescript/examples/)
- [Python SDK](docs/sdk-guide.md) · [examples](packages/sdks/python/examples/)
- [REST API reference](docs/api-reference.md) · [OpenAPI spec](docs/openapi.yaml)

## Important Considerations

> [!NOTE]
> **Security & Compliance**
>
> Claude Code has full access to its environment — filesystem, shell, and network. Koine exposes this power to your applications.
>
> - **Use Docker**: containers provide essential filesystem and process isolation
> - **Internal networks only**: deploy on VPN or Docker networks, not public internet
> - **Use API keys**: Anthropic API keys operate under the [Commercial Terms](https://www.anthropic.com/legal/commercial-terms) which permit programmatic access
>
> See [Environment Variables](docs/environment-variables.md) for configuration details.

## Documentation

| Guide | Description |
|-------|-------------|
| [Getting Started](docs/README.md) | Installation and setup |
| [API Reference](docs/api-reference.md) | REST endpoints |
| [SDK Guide](docs/sdk-guide.md) | TypeScript & Python SDKs |
| [Examples](docs/examples/README.md) | Runnable SDK examples |
| [Docker Deployment](docs/docker-deployment.md) | Production deployment |
| [Skills & Commands](docs/skills-and-commands.md) | Extending Claude Code |
| [Environment Variables](docs/environment-variables.md) | Configuration |
| [Architecture](docs/architecture.md) | System design |

## Packages

| Package | Description |
|---------|-------------|
| [koine](packages/gateway) | HTTP gateway (Docker only, not on npm) |
| [@patternzones/koine-sdk](https://www.npmjs.com/package/@patternzones/koine-sdk) | TypeScript SDK |
| [koine-sdk](https://pypi.org/project/koine-sdk/) | Python SDK |

## License

Dual-licensed under AGPL-3.0 or commercial license. See [LICENSE](LICENSE) for details.

## Contributing

We're eager for collaborators! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines and roadmap.
