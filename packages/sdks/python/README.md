# koine-sdk

Python SDK for [Koine](https://github.com/pattern-zones-co/koine) — the HTTP gateway for Claude Code CLI.

## Running the Gateway

```bash
docker run -d -p 3100:3100 \
  -e CLAUDE_CODE_GATEWAY_API_KEY=your-key \
  -e CLAUDE_CODE_OAUTH_TOKEN=your-token \
  ghcr.io/pattern-zones-co/koine:latest
```

See [Docker Deployment](https://github.com/pattern-zones-co/koine/blob/main/docs/docker-deployment.md) for version pinning and production setup.

## Installation

```bash
pip install koine-sdk
```

## Quick Start

```python
import asyncio
from koine_sdk import KoineConfig, generate_text

config = KoineConfig(
    base_url="http://localhost:3100",
    auth_key="your-api-key",
    timeout=300.0,
)

async def main():
    result = await generate_text(config, prompt="Hello, how are you?")
    print(result.text)

asyncio.run(main())
```

## Features

- **Text Generation** — `generate_text()` for simple prompts
- **Streaming** — `stream_text()` with async iterators
- **Structured Output** — `generate_object()` with Pydantic schema validation
- **Type Safety** — Full type hints for all requests and responses
- **Error Handling** — `KoineError` class with error codes

## API

### Functions

| Function | Description |
|----------|-------------|
| `generate_text(config, *, prompt, system?, session_id?)` | Generate text from a prompt |
| `stream_text(config, *, prompt, system?, session_id?)` | Stream text via Server-Sent Events |
| `generate_object(config, *, prompt, schema, system?, session_id?)` | Extract structured data using a Pydantic model |

### Types

| Type | Description |
|------|-------------|
| `KoineConfig` | Client configuration (base_url, auth_key, timeout, model) |
| `GenerateTextResult` | Text generation response with usage stats |
| `GenerateObjectResult[T]` | Object extraction response (generic over schema) |
| `StreamTextResult` | Streaming result with async iterators and futures |
| `KoineUsage` | Token usage information |
| `KoineError` | Error class with code and raw_text |

## Documentation

See the [SDK Guide](https://github.com/pattern-zones-co/koine/blob/main/docs/sdk-guide.md) for:

- Configuration options
- Streaming examples
- Structured output with Pydantic
- Error handling
- Multi-turn conversations

## Examples

Runnable examples are available in the [`examples/`](https://github.com/pattern-zones-co/koine/tree/main/packages/sdks/python/examples) directory. Run from the SDK directory:

```bash
cd packages/sdks/python
uv pip install -e ".[dev]"
uv run python examples/hello.py           # Basic text generation
uv run python examples/extract_recipe.py  # Structured output with Pydantic
uv run python examples/stream.py          # Real-time streaming
uv run python examples/conversation.py    # Multi-turn sessions
```

## License

Dual-licensed under [AGPL-3.0 or commercial license](https://github.com/pattern-zones-co/koine/blob/main/LICENSE).
