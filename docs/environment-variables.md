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
| `KOINE_MAX_STREAMING_CONCURRENT` | `3` | Maximum concurrent `/stream` requests |
| `KOINE_MAX_NONSTREAMING_CONCURRENT` | `5` | Maximum concurrent `/generate-text` and `/generate-object` requests |

### Concurrency Limits

The gateway limits concurrent requests to prevent resource exhaustion. Streaming requests (which are long-running) have a separate, lower limit than non-streaming requests.

When limits are exceeded, the gateway returns `429 Too Many Requests` with a `Retry-After` header. Clients should implement retry logic with exponential backoff.

## Example

```bash
# .env
CLAUDE_CODE_GATEWAY_API_KEY=your-secure-api-key
ANTHROPIC_API_KEY=sk-ant-...
GATEWAY_PORT=3100

# Optional: adjust concurrency limits (defaults shown)
# KOINE_MAX_STREAMING_CONCURRENT=3
# KOINE_MAX_NONSTREAMING_CONCURRENT=5
```

## Terms

Anthropic API keys operate under [Anthropic's Commercial Terms](https://www.anthropic.com/legal/commercial-terms) which explicitly permit programmatic access.
