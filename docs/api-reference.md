# API Reference

The gateway provides interactive API documentation at the `/docs` endpoint powered by [Scalar](https://scalar.com/). The raw OpenAPI 3.1 specification is available at the `/openapi.yaml` endpoint (see [openapi.yaml](openapi.yaml) for the full specification).

## Authentication

All endpoints except `/health`, `/docs`, and `/openapi.yaml` require Bearer token authentication:

```bash
curl -H "Authorization: Bearer $CLAUDE_CODE_GATEWAY_API_KEY" \
  http://localhost:3100/generate-text
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (no auth) |
| GET | `/docs` | Interactive API docs (no auth) |
| GET | `/openapi.yaml` | OpenAPI spec (no auth) |
| POST | `/generate-text` | Generate text |
| POST | `/generate-object` | Extract structured JSON |
| POST | `/stream` | Stream text via SSE |
| POST | `/stream-object` | Stream structured JSON via SSE |

## Sessions

Omit `sessionId` to start new. Include previous `sessionId` to continue conversation.

## Concurrency Limits

The gateway limits concurrent requests to prevent resource exhaustion. When limits are exceeded:

- **Status**: `429 Too Many Requests`
- **Header**: `Retry-After: 5`
- **Body**: `{ "error": "Concurrency limit exceeded", "code": "CONCURRENCY_LIMIT_ERROR" }`

Default limits:
- `/stream`, `/stream-object`: 3 concurrent requests
- `/generate-text`, `/generate-object`: 5 concurrent requests

See [Environment Variables](environment-variables.md) to configure limits.

## Tool Restrictions

All POST endpoints accept an optional `allowedTools` parameter to restrict which Claude CLI tools can be used:

```json
{
  "prompt": "Read the README file",
  "allowedTools": ["Read", "Glob"]
}
```

**Behavior:**
- Gateway-level restrictions (`KOINE_ALLOWED_TOOLS`, `KOINE_DISALLOWED_TOOLS`) are the primary control
- Request `allowedTools` can only further restrict, never expand beyond gateway limits
- Gateway `KOINE_DISALLOWED_TOOLS` cannot be bypassed by requests
- If all requested tools are blocked, returns `400` with code `NO_TOOLS_AVAILABLE`

See [Environment Variables](environment-variables.md#tool-restrictions) for gateway configuration.
