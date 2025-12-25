"""
conversation.py - Multi-turn conversation with session persistence

Demonstrates how to maintain context across multiple requests using session_id.
The model remembers information from previous turns in the conversation.

Run from packages/sdks/python:
    uv run python examples/conversation.py
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

    print("=== Multi-turn Conversation Example ===\n")

    # Turn 1: Introduce ourselves
    print("Turn 1: Introducing myself...")
    turn1 = await koine.generate_text(
        prompt=(
            "My name is Alice and my favorite color is blue. Please acknowledge this."
        ),
    )
    print(f"Assistant: {turn1.text}\n")

    # Turn 2: Ask a follow-up question using the same session
    print("Turn 2: Testing if the model remembers...")
    turn2 = await koine.generate_text(
        prompt="What's my name and what's my favorite color?",
        session_id=turn1.session_id,  # Continue the conversation
    )
    print(f"Assistant: {turn2.text}\n")

    # Turn 3: Add more context and ask another question
    print("Turn 3: Adding more context...")
    turn3 = await koine.generate_text(
        prompt=(
            "I also have a cat named Whiskers. "
            "Now tell me everything you know about me."
        ),
        session_id=turn1.session_id,  # Same session continues
    )
    print(f"Assistant: {turn3.text}\n")

    print("---")
    print(f"Session ID: {turn1.session_id}")
    total_tokens = (
        turn1.usage.total_tokens + turn2.usage.total_tokens + turn3.usage.total_tokens
    )
    print(f"Total tokens: {total_tokens}")


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
