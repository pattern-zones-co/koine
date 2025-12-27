# Python SDK Examples

## Prerequisites

1. Start the Koine gateway:
   ```bash
   docker run -d -p 3100:3100 \
     -e CLAUDE_CODE_GATEWAY_API_KEY=your-key \
     -e ANTHROPIC_API_KEY=your-anthropic-api-key \
     ghcr.io/pattern-zones-co/koine:latest
   ```

2. Set environment variables (or create `.env` in project root):
   ```bash
   export KOINE_BASE_URL=http://localhost:3100
   export KOINE_AUTH_KEY=your-key
   ```

## Running Examples

From the SDK directory (`packages/sdks/python`):

```bash
uv pip install -e ".[dev]"
uv run python examples/hello.py           # Basic text generation
uv run python examples/extract_recipe.py  # Structured output with Pydantic
uv run python examples/stream.py          # Real-time streaming
uv run python examples/stream_object.py   # Streaming structured output
uv run python examples/conversation.py    # Multi-turn sessions
```

## Examples

| File | Description |
|------|-------------|
| `hello.py` | Basic text generation |
| `extract_recipe.py` | Structured output with Pydantic schemas |
| `stream.py` | Real-time streaming with async iterators |
| `stream_object.py` | Streaming structured output with partial updates |
| `conversation.py` | Multi-turn session persistence |
