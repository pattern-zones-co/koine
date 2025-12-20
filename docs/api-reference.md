# API Reference

> **TODO**: Generate OpenAPI spec from Zod schemas. See [#17](https://github.com/pattern-zones-co/koine/issues/17).

## Authentication

All endpoints except `/health` require Bearer token authentication:

```bash
curl -H "Authorization: Bearer $CLAUDE_CODE_GATEWAY_API_KEY" \
  http://localhost:3100/generate-text
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (no auth) |
| POST | `/generate-text` | Generate text |
| POST | `/generate-object` | Extract structured JSON |
| POST | `/stream` | Stream via SSE |

## Sessions

Omit `sessionId` to start new. Include previous `sessionId` to continue conversation.
