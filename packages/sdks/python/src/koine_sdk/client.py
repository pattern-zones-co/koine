"""Client functions for Koine gateway service."""

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Any, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from .errors import KoineError
from .types import (
    GatewayErrorResponse,
    GatewayObjectResponse,
    GatewayTextResponse,
    GenerateObjectResult,
    GenerateTextResult,
    KoineConfig,
    KoineUsage,
    SSEErrorEvent,
    SSEResultEvent,
    SSESessionEvent,
    SSETextEvent,
    StreamTextResult,
)

T = TypeVar("T", bound=BaseModel)


def _parse_error_response(response: httpx.Response) -> KoineError:
    """Parse error response from gateway, handling non-JSON gracefully."""
    try:
        data = response.json()
        error_resp = GatewayErrorResponse.model_validate(data)
        return KoineError(
            error_resp.error,
            error_resp.code,
            error_resp.rawText,
        )
    except (json.JSONDecodeError, ValidationError):
        return KoineError(
            f"HTTP {response.status_code} {response.reason_phrase}",
            "HTTP_ERROR",
        )


def _build_request_body(**kwargs: Any) -> dict[str, Any]:
    """Build request body, omitting None values."""
    return {k: v for k, v in kwargs.items() if v is not None}


async def generate_text(
    config: KoineConfig,
    *,
    prompt: str,
    system: str | None = None,
    session_id: str | None = None,
) -> GenerateTextResult:
    """Generate plain text response from Koine gateway service.

    Args:
        config: Gateway configuration
        prompt: The user prompt to send
        system: Optional system prompt
        session_id: Optional session ID for conversation continuity

    Returns:
        GenerateTextResult with text, usage, and session_id

    Raises:
        KoineError: On HTTP errors or invalid responses
    """
    async with httpx.AsyncClient(timeout=config.timeout) as client:
        response = await client.post(
            f"{config.base_url}/generate-text",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {config.auth_key}",
            },
            json=_build_request_body(
                system=system,
                prompt=prompt,
                sessionId=session_id,
                model=config.model,
            ),
        )

        if not response.is_success:
            raise _parse_error_response(response)

        try:
            data = response.json()
            result = GatewayTextResponse.model_validate(data)
        except (ValueError, ValidationError) as e:
            raise KoineError(
                f"Invalid response from Koine gateway: {e}",
                "INVALID_RESPONSE",
            ) from e

        return GenerateTextResult(
            text=result.text,
            usage=result.usage,
            session_id=result.sessionId,
        )


async def generate_object(
    config: KoineConfig,
    *,
    prompt: str,
    schema: type[T],
    system: str | None = None,
    session_id: str | None = None,
) -> GenerateObjectResult[T]:
    """Generate structured JSON response from Koine gateway service.

    Converts the Pydantic schema to JSON Schema for the gateway service,
    then validates the response against the original schema.

    Args:
        config: Gateway configuration
        prompt: The user prompt to send
        schema: Pydantic model class for response validation
        system: Optional system prompt
        session_id: Optional session ID for conversation continuity

    Returns:
        GenerateObjectResult with validated object, rawText, usage, and session_id

    Raises:
        KoineError: On HTTP errors, invalid responses, or validation failures
    """
    # Convert Pydantic model to JSON Schema
    json_schema: dict[str, Any] = schema.model_json_schema()

    async with httpx.AsyncClient(timeout=config.timeout) as client:
        response = await client.post(
            f"{config.base_url}/generate-object",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {config.auth_key}",
            },
            json=_build_request_body(
                system=system,
                prompt=prompt,
                schema=json_schema,
                sessionId=session_id,
                model=config.model,
            ),
        )

        if not response.is_success:
            raise _parse_error_response(response)

        try:
            data = response.json()
            result = GatewayObjectResponse.model_validate(data)
        except (ValueError, ValidationError) as e:
            raise KoineError(
                f"Invalid response from Koine gateway: {e}",
                "INVALID_RESPONSE",
            ) from e

        # Validate response object against the Pydantic schema
        try:
            validated_object = schema.model_validate(result.object)
        except ValidationError as e:
            raise KoineError(
                f"Response validation failed: {e}",
                "VALIDATION_ERROR",
                result.rawText,
            ) from e

        return GenerateObjectResult[T](
            object=validated_object,
            raw_text=result.rawText,
            usage=result.usage,
            session_id=result.sessionId,
        )


async def _parse_sse_stream(
    response: httpx.Response,
) -> AsyncIterator[tuple[str, str]]:
    """Parse SSE events from response stream.

    SSE format: "event: name\\ndata: {...}\\n\\n"

    Yields:
        Tuples of (event_type, data_json)
    """
    buffer = ""
    async for chunk in response.aiter_text():
        buffer += chunk

        # SSE events are separated by double newlines
        while "\n\n" in buffer:
            event_str, buffer = buffer.split("\n\n", 1)
            if not event_str.strip():
                continue

            event_type = ""
            data = ""
            for line in event_str.split("\n"):
                if line.startswith("event: "):
                    event_type = line[7:]
                elif line.startswith("data: "):
                    data = line[6:]

            if event_type and data:
                yield event_type, data

    # Process any remaining data in buffer
    if buffer.strip():
        event_type = ""
        data = ""
        for line in buffer.split("\n"):
            if line.startswith("event: "):
                event_type = line[7:]
            elif line.startswith("data: "):
                data = line[6:]

        if event_type and data:
            yield event_type, data


async def _process_sse_stream(
    response: httpx.Response,
    session_id_future: asyncio.Future[str],
    usage_future: asyncio.Future[KoineUsage],
    text_future: asyncio.Future[str],
) -> AsyncIterator[str]:
    """Process SSE stream, yielding text and resolving futures.

    Yields:
        Text chunks as they arrive
    """
    accumulated_text = ""

    try:
        async for event_type, data in _parse_sse_stream(response):
            # Critical events must propagate parse errors
            is_critical = event_type in ("session", "result", "error", "done")

            try:
                if event_type == "session":
                    parsed = SSESessionEvent.model_validate(json.loads(data))
                    if not session_id_future.done():
                        session_id_future.set_result(parsed.sessionId)

                elif event_type == "text":
                    parsed = SSETextEvent.model_validate(json.loads(data))
                    accumulated_text += parsed.text
                    yield parsed.text

                elif event_type == "result":
                    parsed = SSEResultEvent.model_validate(json.loads(data))
                    usage_future.set_result(parsed.usage)
                    if not session_id_future.done():
                        session_id_future.set_result(parsed.sessionId)

                elif event_type == "error":
                    parsed = SSEErrorEvent.model_validate(json.loads(data))
                    error = KoineError(
                        parsed.error,
                        parsed.code or "STREAM_ERROR",
                    )
                    # Reject all unresolved futures
                    if not usage_future.done():
                        usage_future.set_exception(error)
                    if not text_future.done():
                        text_future.set_exception(error)
                    if not session_id_future.done():
                        session_id_future.set_exception(error)
                    raise error

                elif event_type == "done":
                    # Stream complete, resolve the text future
                    if not text_future.done():
                        text_future.set_result(accumulated_text)

            except (json.JSONDecodeError, ValidationError) as e:
                if is_critical:
                    error = KoineError(
                        f"Failed to parse critical SSE event: {event_type}",
                        "SSE_PARSE_ERROR",
                    )
                    if not usage_future.done():
                        usage_future.set_exception(error)
                    if not text_future.done():
                        text_future.set_exception(error)
                    if not session_id_future.done():
                        session_id_future.set_exception(error)
                    raise error from e
                # Non-critical event (text) - continue stream silently

    finally:
        # Handle stream ending without expected events
        if not session_id_future.done():
            session_id_future.set_exception(
                KoineError("Stream ended without session ID", "NO_SESSION")
            )
        if not usage_future.done():
            usage_future.set_exception(
                KoineError("Stream ended without usage information", "NO_USAGE")
            )
        if not text_future.done():
            text_future.set_result(accumulated_text)


async def stream_text(
    config: KoineConfig,
    *,
    prompt: str,
    system: str | None = None,
    session_id: str | None = None,
) -> StreamTextResult:
    """Stream text response from Koine gateway service.

    Returns a StreamTextResult with:
    - text_stream: AsyncIterator of text chunks as they arrive
    - session_id(): Resolves early in stream
    - usage(): Resolves when stream completes
    - text(): Full accumulated text, resolves when stream completes

    Important: You must consume text_stream for the futures to resolve.

    Args:
        config: Gateway configuration
        prompt: The user prompt to send
        system: Optional system prompt
        session_id: Optional session ID for conversation continuity

    Returns:
        StreamTextResult for streaming consumption

    Raises:
        KoineError: On HTTP errors or stream errors
    """
    # Create the HTTP client - we keep it open for streaming
    client = httpx.AsyncClient(timeout=config.timeout)

    response = await client.send(
        client.build_request(
            "POST",
            f"{config.base_url}/stream",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {config.auth_key}",
            },
            json=_build_request_body(
                system=system,
                prompt=prompt,
                sessionId=session_id,
                model=config.model,
            ),
        ),
        stream=True,
    )

    if not response.is_success:
        await response.aread()
        await client.aclose()
        raise _parse_error_response(response)

    # Set up futures for session, usage, and accumulated text
    loop = asyncio.get_running_loop()
    session_id_future: asyncio.Future[str] = loop.create_future()
    usage_future: asyncio.Future[KoineUsage] = loop.create_future()
    text_future: asyncio.Future[str] = loop.create_future()

    # Create the text stream generator
    async def text_stream_generator() -> AsyncIterator[str]:
        try:
            async for text_chunk in _process_sse_stream(
                response,
                session_id_future,
                usage_future,
                text_future,
            ):
                yield text_chunk
        finally:
            await response.aclose()
            await client.aclose()

    return StreamTextResult(
        text_stream=text_stream_generator(),
        _session_id_future=session_id_future,
        _usage_future=usage_future,
        _text_future=text_future,
    )
