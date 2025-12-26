# Environment Variables

## Required

| Variable | Description |
|----------|-------------|
| `CLAUDE_CODE_GATEWAY_API_KEY` | Bearer token for gateway API requests |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude authentication |

## Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `GATEWAY_PORT` | `3100` | HTTP server port |

## Example

```bash
# .env
CLAUDE_CODE_GATEWAY_API_KEY=your-secure-api-key
ANTHROPIC_API_KEY=sk-ant-...
GATEWAY_PORT=3100
```

## Terms

Anthropic API keys operate under [Anthropic's Commercial Terms](https://www.anthropic.com/legal/commercial-terms) which explicitly permit programmatic access.
