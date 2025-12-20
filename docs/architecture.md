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
│  │ /stream           → Server-Sent Events                              ││
│  │ /health           → Health check                                    ││
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
│   │           └── health.ts        # /health
│   └── sdks/typescript/             # TypeScript SDK
│       └── src/
│           ├── client.ts            # generateText, streamText, generateObject
│           ├── types.ts             # Type definitions
│           └── errors.ts            # KoineError
├── claude-assets/                   # Skills and commands
├── docs/
├── Dockerfile
└── docker-compose.yml
```
