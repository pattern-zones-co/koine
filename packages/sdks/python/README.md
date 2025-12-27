# koine-sdk

Python SDK for [Koine](https://github.com/pattern-zones-co/koine) — the HTTP gateway for Claude Code CLI.

## Running the Gateway

```bash
docker run -d -p 3100:3100 \
  -e CLAUDE_CODE_GATEWAY_API_KEY=your-key \
  -e ANTHROPIC_API_KEY=your-anthropic-api-key \
  ghcr.io/pattern-zones-co/koine:latest
```

See [Docker Deployment](https://github.com/pattern-zones-co/koine/blob/main/docs/docker-deployment.md) for version pinning and production setup.

## Installation

```bash
uv pip install koine-sdk
# or: pip install koine-sdk
```

## Quick Start

```python
import asyncio
from koine_sdk import KoineConfig, create_koine

config = KoineConfig(
    base_url="http://localhost:3100",
    auth_key="your-api-key",
    timeout=300.0,
)

async def main():
    koine = create_koine(config)
    result = await koine.generate_text(prompt="Hello, how are you?")
    print(result.text)

asyncio.run(main())
```

## Features

- **Text Generation** — `koine.generate_text()` for simple prompts
- **Streaming** — `koine.stream_text()` with async iterators
- **Structured Output** — `koine.generate_object()` with Pydantic schema validation
- **Tool Restrictions** — `allowed_tools` parameter to limit CLI tool access
- **Streaming Structured Output** — `koine.stream_object()` with partial object streaming
- **Type Safety** — Full type hints for all requests and responses
- **Error Handling** — `KoineError` class with error codes

## API

### Client Factory

```python
koine = create_koine(config)
```

Creates a client instance with the given configuration. The config is validated once at creation time.

### Methods

| Method | Description |
|--------|-------------|
| `koine.generate_text(*, prompt, system?, session_id?, allowed_tools?)` | Generate text from a prompt |
| `koine.stream_text(*, prompt, system?, session_id?, allowed_tools?)` | Stream text via Server-Sent Events |
| `koine.generate_object(*, prompt, schema, system?, session_id?, allowed_tools?)` | Extract structured data using a Pydantic model |
| `koine.stream_object(*, prompt, schema, system?, session_id?, allowed_tools?)` | Stream structured data via Server-Sent Events |

### Types

| Type | Description |
|------|-------------|
| `KoineConfig` | Client configuration (base_url, auth_key, timeout, model) |
| `KoineClient` | Client interface returned by `create_koine()` |
| `GenerateTextResult` | Text generation response with usage stats |
| `GenerateObjectResult[T]` | Object extraction response (generic over schema) |
| `StreamTextResult` | Streaming result with async iterators and futures |
| `StreamObjectResult[T]` | Streaming object result with partial_object_stream |
| `KoineUsage` | Token usage information |
| `KoineError` | Error class with code and raw_text |

## Error Handling & Retries

The SDK does not automatically retry failed requests. When the gateway returns `429 Too Many Requests` (concurrency limit exceeded), your application should implement retry logic:

```python
import asyncio
from koine_sdk import KoineError

async def generate_with_retry(prompt: str, max_retries: int = 3):
    for i in range(max_retries):
        try:
            return await koine.generate_text(prompt=prompt)
        except KoineError as e:
            if e.code == "CONCURRENCY_LIMIT_ERROR":
                await asyncio.sleep(1 * (i + 1))  # Exponential backoff
                continue
            raise
    raise Exception("Max retries exceeded")
```

## Documentation

See the [SDK Guide](https://github.com/pattern-zones-co/koine/blob/main/docs/sdk-guide.md) for:

- Configuration options
- Streaming examples
- Structured output with Pydantic
- Tool restrictions
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
uv run python examples/stream_object.py   # Streaming structured output
uv run python examples/conversation.py    # Multi-turn sessions
```

## License

Dual-licensed under [AGPL-3.0 or commercial license](https://github.com/pattern-zones-co/koine/blob/main/LICENSE).
