"""
stream.py - stream_text example with real-time output

Demonstrates streaming responses with typewriter effect.
Text appears progressively as tokens arrive from the API.

Run from packages/sdks/python:
    uv run python examples/stream.py
"""

import asyncio
import os
import sys

from dotenv import find_dotenv, load_dotenv

from koine_sdk import KoineConfig, KoineError, stream_text

load_dotenv(find_dotenv())


async def main() -> None:
    auth_key = os.environ.get("CLAUDE_CODE_GATEWAY_API_KEY")
    if not auth_key:
        raise RuntimeError("CLAUDE_CODE_GATEWAY_API_KEY is required in .env")

    config = KoineConfig(
        base_url=f"http://localhost:{os.environ.get('GATEWAY_PORT', '3100')}",
        auth_key=auth_key,
        timeout=300.0,
    )

    print("Streaming response:\n")

    async with stream_text(
        config,
        prompt=(
            "Write a limerick about a programmer who loves coffee. "
            "Just the limerick, no explanation."
        ),
    ) as result:
        # Display text in real-time as chunks arrive
        chunk_count = 0
        async for chunk in result.text_stream:
            print(chunk, end="", flush=True)  # Print immediately (no newline)
            chunk_count += 1

        # Wait for final stats
        usage = await result.usage()
        suffix = "s" if chunk_count != 1 else ""
        print(f"\n\n--- Streamed in {chunk_count} chunk{suffix} ---")
        print(
            f"Usage: {usage.total_tokens} tokens "
            f"(input: {usage.input_tokens}, output: {usage.output_tokens})"
        )


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KoineError as e:
        print(f"\nKoine Error [{e.code}]: {e}", file=sys.stderr)
        if e.code == "HTTP_ERROR" and "401" in str(e):
            print(
                "  → Check that CLAUDE_CODE_GATEWAY_API_KEY is correct", file=sys.stderr
            )
        elif e.code == "STREAM_ERROR":
            print("  → The stream was interrupted", file=sys.stderr)
        sys.exit(1)
    except ConnectionRefusedError:
        print("\nConnection refused. Is the gateway running?", file=sys.stderr)
        print(
            "  → Start it with: docker run -d --env-file .env -p 3100:3100 "
            "ghcr.io/pattern-zones-co/koine:latest",
            file=sys.stderr,
        )
        sys.exit(1)
