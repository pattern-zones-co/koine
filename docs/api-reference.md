# API Reference

The gateway provides interactive API documentation at [`/docs`](http://localhost:3100/docs) powered by [Scalar](https://scalar.com/). The raw OpenAPI 3.1 specification is available at [`/openapi.yaml`](http://localhost:3100/openapi.yaml).

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
| GET | `/docs` | Interactive API docs (no auth) |
| GET | `/openapi.yaml` | OpenAPI spec (no auth) |
| POST | `/generate-text` | Generate text |
| POST | `/generate-object` | Extract structured JSON |
| POST | `/stream` | Stream via SSE |

## Sessions

Omit `sessionId` to start new. Include previous `sessionId` to continue conversation.
