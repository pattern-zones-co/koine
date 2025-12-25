"""Streaming module for Koine SDK.

This module provides streaming text generation capabilities.
Currently supports HTTP/SSE transport, with future support planned
for WebSocket and other transport mechanisms.
"""

from .http import stream_text

__all__ = ["stream_text"]
