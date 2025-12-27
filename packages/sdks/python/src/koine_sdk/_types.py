"""Internal type definitions for gateway responses (not part of public API)."""

from typing import Any

from pydantic import BaseModel, ConfigDict

from .types import KoineUsage


class GatewayTextResponse(BaseModel):
    """Response from generate-text endpoint (internal)."""

    text: str
    usage: KoineUsage
    sessionId: str


class GatewayObjectResponse(BaseModel):
    """Response from generate-object endpoint (internal)."""

    object: object
    rawText: str
    usage: KoineUsage
    sessionId: str


class GatewayErrorResponse(BaseModel):
    """Error response from Koine gateway service (internal)."""

    error: str
    code: str
    rawText: str | None = None


class SSETextEvent(BaseModel):
    """SSE text event from stream endpoint (internal)."""

    text: str


class SSESessionEvent(BaseModel):
    """SSE session event from stream endpoint (internal)."""

    sessionId: str


class SSEResultEvent(BaseModel):
    """SSE result event from stream endpoint (internal)."""

    sessionId: str
    usage: KoineUsage


class SSEErrorEvent(BaseModel):
    """SSE error event from stream endpoint (internal)."""

    error: str
    code: str | None = None


class SSEPartialObjectEvent(BaseModel):
    """SSE partial-object event from stream-object endpoint (internal)."""

    model_config = ConfigDict(frozen=True)

    partial: str
    parsed: dict[str, Any] | None


class SSEObjectEvent(BaseModel):
    """SSE object event from stream-object endpoint (internal)."""

    model_config = ConfigDict(frozen=True)

    object: dict[str, Any]
