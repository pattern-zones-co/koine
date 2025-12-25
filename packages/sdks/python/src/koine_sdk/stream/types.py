"""Stream types for transport-agnostic event handling.

This module defines abstract types that can be implemented by different
transport mechanisms (HTTP/SSE, WebSocket, Socket, etc.) in the future.
"""

from dataclasses import dataclass
from typing import Literal, Protocol

# Event types that can be emitted by any stream transport
StreamEventType = Literal["text", "session", "result", "error", "done"]


@dataclass(frozen=True, slots=True)
class StreamEvent:
    """A parsed stream event from any transport.

    Attributes:
        event: The type of event (text, session, result, error, done)
        data: The raw JSON string data for the event
    """

    event: StreamEventType
    data: str


class StreamTransport(Protocol):
    """Protocol for stream transport implementations.

    This protocol defines the interface that different transport
    implementations (HTTP/SSE, WebSocket, etc.) must follow.
    """

    async def connect(self) -> None:
        """Establish the streaming connection."""
        ...

    async def __aiter__(self) -> "StreamTransport":
        """Return self as async iterator."""
        ...

    async def __anext__(self) -> StreamEvent:
        """Get the next event from the stream."""
        ...

    async def close(self) -> None:
        """Close the streaming connection."""
        ...
