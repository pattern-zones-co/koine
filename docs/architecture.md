# Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Your Application (SDK or HTTP client)                                  │
└─────────────────────────────────────────────────────────────────────────┘
                            │
                            ▼ HTTP REST API
┌─────────────────────────────────────────────────────────────────────────┐
│  Koine Gateway (Express)                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ /generate-text    → Text generation                                 ││
│  │ /generate-object  → Structured JSON extraction                      ││
│  │ /stream           → Stream text via SSE                             ││
│  │ /stream-object    → Stream structured JSON via SSE                  ││
│  │ /health           → Health check                                    ││
│  │ /docs             → API inspection and testing                      ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                           │ Subprocess                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ Claude Code CLI + Skills                                            ││
│  └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
koine/
├── packages/
│   ├── gateway/                     # HTTP gateway server
│   │   └── src/
│   │       ├── index.ts             # Express app, auth middleware
│   │       ├── cli.ts               # Claude CLI subprocess
│   │       ├── types.ts             # Request/response types
│   │       └── routes/
│   │           ├── generate.ts      # /generate-text, /generate-object
│   │           ├── stream.ts        # /stream (SSE)
│   │           ├── stream-object.ts # /stream-object (SSE)
│   │           └── health.ts        # /health
│   └── sdks/
│       ├── typescript/              # TypeScript SDK
│       │   └── src/
│       │       ├── index.ts         # Public exports
│       │       ├── client.ts        # createKoine factory, KoineClient
│       │       ├── text.ts          # generateText implementation
│       │       ├── object.ts        # generateObject implementation
│       │       ├── stream/          # streamText implementation (SSE)
│       │       ├── stream-object.ts # streamObject implementation (SSE)
│       │       ├── types.ts         # Type definitions
│       │       └── errors.ts        # KoineError
│       └── python/                  # Python SDK
│           └── src/koine_sdk/
│               ├── __init__.py      # Public exports
│               ├── client.py        # create_koine factory, KoineClient
│               ├── text.py          # generate_text implementation
│               ├── object.py        # generate_object implementation
│               ├── stream/          # stream_text, stream_object (SSE)
│               ├── types.py         # Type definitions
│               └── errors.py        # KoineError
├── claude-assets/                   # Skills and commands
├── docs/
├── Dockerfile
└── docker-compose.yml
```

## Implementation Notes

### Structured Output Strategies

| Endpoint | Strategy | Why |
|----------|----------|-----|
| `/generate-object` | `--json-schema` flag | Constrained decoding ensures valid JSON |
| `/stream-object` | Prompt injection | Claude Code CLI doesn't stream tokens with `--json-schema`; it only emits the final object in the result message |

When Claude Code adds streaming support for `--json-schema`, `/stream-object` can be updated to use constrained decoding. Until then, the gateway uses fallback JSON extraction strategies (markdown code block extraction, regex matching) to handle cases where the model wraps JSON in explanatory text.
