# @pattern-zones-co/claude-code-gateway

HTTP gateway server for Claude Code CLI.

## Installation

```bash
npm install @pattern-zones-co/claude-code-gateway
```

## Usage

### As a standalone server

```bash
# Set required environment variable
export CLAUDE_CODE_GATEWAY_API_KEY=$(openssl rand -hex 32)

# Start the server
npx @pattern-zones-co/claude-code-gateway
```

### With Docker

```dockerfile
FROM node:20-slim

# Install Claude CLI
RUN npm install -g @anthropic/claude-code

# Install the gateway
RUN npm install -g @pattern-zones-co/claude-code-gateway

ENV PORT=3100
EXPOSE 3100

CMD ["claude-code-gateway"]
```

## API Endpoints

- `GET /health` - Health check (no auth)
- `POST /generate-text` - Generate plain text
- `POST /generate-object` - Generate structured JSON
- `POST /stream` - Stream text via SSE

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CLAUDE_CODE_GATEWAY_API_KEY` | Yes | API key for authentication |
| `PORT` | No | Server port (default: 3100) |
| `CLAUDE_CODE_GATEWAY_*` | No | Passes through to Claude CLI |

## License

See repository root.
