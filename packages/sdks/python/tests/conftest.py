"""Shared test fixtures and helpers for Koine SDK tests."""

import json

import pytest

from koine_sdk import KoineConfig


@pytest.fixture
def config() -> KoineConfig:
    """Default test configuration."""
    return KoineConfig(
        base_url="http://localhost:3100",
        timeout=30.0,
        auth_key="test-key",
        model="sonnet",
    )


def sse_response(events: list[tuple[str, dict]]) -> str:
    """Helper to create SSE formatted response.

    Args:
        events: List of (event_type, data_dict) tuples

    Returns:
        SSE formatted string
    """
    lines = []
    for event_type, data in events:
        lines.append(f"event: {event_type}")
        lines.append(f"data: {json.dumps(data)}")
        lines.append("")
    return "\n".join(lines)
