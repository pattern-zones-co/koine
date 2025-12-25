"""
hello.py - Basic generate_text example

Demonstrates the simplest use case: asking a question and getting a text response.

Run from packages/sdks/python:
    uv run python examples/hello.py
"""

import asyncio
import os
import sys

from dotenv import find_dotenv, load_dotenv

from koine_sdk import KoineConfig, KoineError, create_koine

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

    koine = create_koine(config)

    print("Sending request to Koine gateway...\n")

    result = await koine.generate_text(
        prompt="What are the three primary colors? Answer in one sentence.",
    )

    print(f"Response: {result.text}")
    print(
        f"\nTokens used: {result.usage.total_tokens} "
        f"(input: {result.usage.input_tokens}, output: {result.usage.output_tokens})"
    )
    print(f"Session ID: {result.session_id}")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KoineError as e:
        print(f"\nKoine Error [{e.code}]: {e}", file=sys.stderr)
        if e.code == "HTTP_ERROR" and "401" in str(e):
            print(
                "  → Check that CLAUDE_CODE_GATEWAY_API_KEY is correct", file=sys.stderr
            )
        sys.exit(1)
    except ConnectionRefusedError:
        print("\nConnection refused. Is the gateway running?", file=sys.stderr)
        print(
            "  → Start it with: docker run -d --env-file .env -p 3100:3100 "
            "ghcr.io/pattern-zones-co/koine:latest",
            file=sys.stderr,
        )
        sys.exit(1)
