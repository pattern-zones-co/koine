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
| `KOINE_ALLOWED_TOOLS` | (none) | JSON array of tools to allow (e.g., `'["Read","Glob","Grep"]'`) |
| `KOINE_DISALLOWED_TOOLS` | (none) | JSON array of tools to block (e.g., `'["Write","Edit"]'`) |

### Tool Restrictions

The gateway supports restricting which Claude CLI tools are available. This is the primary mechanism for controlling tool access—configure restrictions at the gateway level, and SDK clients can only further restrict (never expand) access.

**Gateway-level configuration:**
- `KOINE_ALLOWED_TOOLS`: Base set of allowed tools. If not set, all tools are allowed by default.
- `KOINE_DISALLOWED_TOOLS`: Tools to block. These are always enforced—SDK requests cannot bypass this list.

**SDK-level configuration:**
- Clients can pass `allowedTools` in requests to further restrict which tools are used.
- The effective tools are the intersection of gateway allowed tools and request allowed tools, minus gateway disallowed tools.

**Example scenarios:**
- Gateway allows `["Read", "Glob", "Write"]`, disallows `["Bash"]` → Client can use Read, Glob, or Write
- Client requests `["Read", "Write"]` → Only Read and Write are used (Glob excluded by client)
- Client requests `["Bash"]` → Returns `400 NO_TOOLS_AVAILABLE` (Bash is gateway-disallowed)

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

# Optional: restrict available tools (JSON array format)
# KOINE_ALLOWED_TOOLS='["Read","Glob","Grep","Bash(git:*)"]'
# KOINE_DISALLOWED_TOOLS='["Write","Edit","Bash(rm:*)"]'
```

## Terms

Anthropic API keys operate under [Anthropic's Commercial Terms](https://www.anthropic.com/legal/commercial-terms) which explicitly permit programmatic access.
