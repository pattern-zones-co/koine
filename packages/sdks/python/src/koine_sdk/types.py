"""Public type definitions for Koine SDK."""

import asyncio
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T", bound=BaseModel)


@dataclass(frozen=True)
class KoineConfig:
    """Configuration for connecting to a Koine gateway service."""

    base_url: str
    """Base URL of the gateway service (e.g., "http://localhost:3100")"""

    timeout: float
    """Request timeout in seconds"""

    auth_key: str
    """Authentication key for the gateway service (required)"""

    model: str | None = None
    """Model alias (e.g., 'sonnet', 'haiku') or full model name"""


class KoineUsage(BaseModel):
    """Usage information from Koine gateway service."""

    model_config = ConfigDict(frozen=True)

    input_tokens: int = Field(alias="inputTokens")
    output_tokens: int = Field(alias="outputTokens")
    total_tokens: int = Field(alias="totalTokens")


class GenerateTextResult(BaseModel):
    """Result from text generation."""

    model_config = ConfigDict(frozen=True)

    text: str
    usage: KoineUsage
    session_id: str


class GenerateObjectResult(BaseModel, Generic[T]):
    """Result from object generation."""

    model_config = ConfigDict(frozen=True)

    object: T
    raw_text: str
    usage: KoineUsage
    session_id: str


@dataclass
class StreamTextResult:
    """Result from streaming text generation.

    The text_stream yields text chunks as they arrive.
    session_id(), usage(), and text() are async methods that resolve
    at different times during the stream.

    Important: You must consume text_stream for the futures to resolve.
    The futures are set as SSE events are processed during iteration.
    """

    text_stream: AsyncIterator[str]
    """Async iterator of text chunks as they arrive"""

    _session_id_future: asyncio.Future[str]
    """Future that resolves with session ID (early in stream)"""

    _usage_future: asyncio.Future[KoineUsage]
    """Future that resolves with usage stats (when stream completes)"""

    _text_future: asyncio.Future[str]
    """Future that resolves with full text (when stream completes)"""

    async def session_id(self) -> str:
        """Session ID for conversation continuity.

        Resolves early in stream, after session event.
        """
        return await self._session_id_future

    async def usage(self) -> KoineUsage:
        """Usage stats. Resolves when stream completes."""
        return await self._usage_future

    async def text(self) -> str:
        """Full accumulated text. Resolves when stream completes."""
        return await self._text_future


@dataclass
class StreamObjectResult(Generic[T]):
    """Result from streaming object generation.

    The partial_object_stream yields partial objects as they arrive.
    session_id(), usage(), and object() are async methods that resolve
    at different times during the stream.

    Important: You must consume partial_object_stream for the futures to resolve.
    The futures are set as SSE events are processed during iteration.
    """

    partial_object_stream: AsyncIterator[T]
    """Async iterator of partial objects as they arrive"""

    _session_id_future: asyncio.Future[str]
    """Future that resolves with session ID (early in stream)"""

    _usage_future: asyncio.Future[KoineUsage]
    """Future that resolves with usage stats (when stream completes)"""

    _object_future: asyncio.Future[T]
    """Future resolving to final validated object, or rejecting on validation failure"""

    async def session_id(self) -> str:
        """Session ID for conversation continuity.

        Resolves early in stream, after session event.
        """
        return await self._session_id_future

    async def usage(self) -> KoineUsage:
        """Usage stats. Resolves when stream completes."""
        return await self._usage_future

    async def object(self) -> T:
        """Final validated object. Resolves when stream completes.

        Raises:
            KoineError: With code 'VALIDATION_ERROR' if final object fails validation.
        """
        return await self._object_future
