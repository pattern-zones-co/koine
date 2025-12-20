# Environment Variables

## Required

| Variable | Description |
|----------|-------------|
| `CLAUDE_CODE_GATEWAY_API_KEY` | Bearer token for gateway API requests |

## Claude Authentication (one required)

| Variable | Description |
|----------|-------------|
| `CLAUDE_CODE_OAUTH_TOKEN` | OAuth token (Claude Max). Takes precedence if both set. |
| `ANTHROPIC_API_KEY` | Anthropic API key |

## Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `GATEWAY_PORT` | `3100` | HTTP server port |

## Example

```bash
# .env
CLAUDE_CODE_GATEWAY_API_KEY=your-secure-api-key
ANTHROPIC_API_KEY=sk-ant-...
# CLAUDE_CODE_OAUTH_TOKEN=your-oauth-token
GATEWAY_PORT=3100
```
