"""HTTP/SSE streaming object implementation for Koine SDK."""

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from types import TracebackType
from typing import Any, Generic, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from .._types import (
    SSEErrorEvent,
    SSEObjectEvent,
    SSEPartialObjectEvent,
    SSEResultEvent,
    SSESessionEvent,
)
from ..errors import KoineError, to_error_code
from ..http import (
    build_headers,
    build_request_body,
    parse_error_response,
    validate_config,
)
from ..types import KoineConfig, KoineUsage, StreamObjectResult
from .sse import parse_sse_stream

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

# Events where parse errors must propagate (vs partial-object which logs and continues)
CRITICAL_EVENTS = frozenset(["session", "result", "error", "done", "object"])


async def process_object_sse_stream(
    response: httpx.Response,
    schema: type[T],
    session_id_future: asyncio.Future[str],
    usage_future: asyncio.Future[KoineUsage],
    object_future: asyncio.Future[T],
) -> AsyncIterator[T]:
    """Process SSE stream for object generation, yielding partials and futures.

    Args:
        response: The httpx response with SSE stream
        schema: Pydantic model class for validation
        session_id_future: Future to resolve with session ID
        usage_future: Future to resolve with usage stats
        object_future: Future to resolve with final validated object

    Yields:
        Partial objects as they arrive. These may be raw dicts if they don't
        fully validate against the schema (expected for incomplete streaming data).
    """
    try:
        async for sse_event in parse_sse_stream(response):
            is_critical = sse_event.event in CRITICAL_EVENTS

            try:
                if sse_event.event == "session":
                    parsed = SSESessionEvent.model_validate(json.loads(sse_event.data))
                    if not session_id_future.done():
                        session_id_future.set_result(parsed.sessionId)

                elif sse_event.event == "partial-object":
                    parsed_event = SSEPartialObjectEvent.model_validate(
                        json.loads(sse_event.data)
                    )
                    # Skip null partials (happens during early JSON parsing)
                    partial_data = parsed_event.parsed
                    if partial_data is None:
                        continue
                    # Try to validate partial with Pydantic (best-effort)
                    try:
                        validated = schema.model_validate(partial_data)
                        yield validated
                    except ValidationError:
                        # Partial objects may not fully validate during streaming.
                        # Yield raw dict for consumers to handle incrementally.
                        yield partial_data  # type: ignore[misc]

                elif sse_event.event == "object":
                    parsed = SSEObjectEvent.model_validate(json.loads(sse_event.data))
                    # Validate final object strictly with Pydantic
                    try:
                        validated = schema.model_validate(parsed.object)
                        if not object_future.done():
                            object_future.set_result(validated)
                    except ValidationError as e:
                        error = KoineError(
                            f"Response validation failed: {e}",
                            "VALIDATION_ERROR",
                            json.dumps(parsed.object),
                        )
                        if not object_future.done():
                            object_future.set_exception(error)

                elif sse_event.event == "result":
                    parsed = SSEResultEvent.model_validate(json.loads(sse_event.data))
                    if not usage_future.done():
                        usage_future.set_result(parsed.usage)
                    if not session_id_future.done():
                        session_id_future.set_result(parsed.sessionId)

                elif sse_event.event == "error":
                    parsed = SSEErrorEvent.model_validate(json.loads(sse_event.data))
                    error = KoineError(
                        parsed.error,
                        to_error_code(parsed.code, "STREAM_ERROR"),
                    )
                    # Reject all unresolved futures
                    if not usage_future.done():
                        usage_future.set_exception(error)
                    if not object_future.done():
                        object_future.set_exception(error)
                    if not session_id_future.done():
                        session_id_future.set_exception(error)
                    raise error

                elif sse_event.event == "done":
                    pass

            except (json.JSONDecodeError, ValidationError) as e:
                if is_critical:
                    error = KoineError(
                        f"Failed to parse critical SSE event: {sse_event.event}",
                        "SSE_PARSE_ERROR",
                    )
                    if not usage_future.done():
                        usage_future.set_exception(error)
                    if not object_future.done():
                        object_future.set_exception(error)
                    if not session_id_future.done():
                        session_id_future.set_exception(error)
                    raise error from e
                # Non-critical event (partial-object) - log warning but continue
                raw_preview = sse_event.data[:100] if sse_event.data else ""
                logger.warning(
                    "[Koine SDK] Failed to parse partial-object: %s. Data: %s",
                    e,
                    raw_preview,
                )

    except httpx.ReadTimeout as e:
        error = KoineError(f"Stream read timeout: {e}", "TIMEOUT")
        if not usage_future.done():
            usage_future.set_exception(error)
        if not object_future.done():
            object_future.set_exception(error)
        if not session_id_future.done():
            session_id_future.set_exception(error)
        raise error from e

    except httpx.RemoteProtocolError as e:
        error = KoineError(f"Server disconnected unexpectedly: {e}", "NETWORK_ERROR")
        if not usage_future.done():
            usage_future.set_exception(error)
        if not object_future.done():
            object_future.set_exception(error)
        if not session_id_future.done():
            session_id_future.set_exception(error)
        raise error from e

    except httpx.ReadError as e:
        error = KoineError(f"Stream read error: {e}", "NETWORK_ERROR")
        if not usage_future.done():
            usage_future.set_exception(error)
        if not object_future.done():
            object_future.set_exception(error)
        if not session_id_future.done():
            session_id_future.set_exception(error)
        raise error from e

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
        if not object_future.done():
            object_future.set_exception(
                KoineError("Stream ended without final object", "NO_OBJECT")
            )


class HTTPObjectStreamContext(Generic[T]):
    """Async context manager for HTTP/SSE streaming object responses.

    Handles resource cleanup (HTTP client and response) automatically.
    """

    def __init__(
        self,
        config: KoineConfig,
        prompt: str,
        schema: type[T],
        system: str | None,
        session_id: str | None,
        allowed_tools: list[str] | None,
    ) -> None:
        self._config = config
        self._prompt = prompt
        self._schema = schema
        self._system = system
        self._session_id = session_id
        self._allowed_tools = allowed_tools
        self._client: httpx.AsyncClient | None = None
        self._response: httpx.Response | None = None

    async def __aenter__(self) -> StreamObjectResult[T]:
        """Set up the streaming connection and return the result."""
        validate_config(self._config)

        # Convert Pydantic model to JSON Schema
        json_schema: dict[str, Any] = self._schema.model_json_schema()

        self._client = httpx.AsyncClient(timeout=self._config.timeout)

        try:
            self._response = await self._client.send(
                self._client.build_request(
                    "POST",
                    f"{self._config.base_url}/stream-object",
                    headers=build_headers(self._config.auth_key),
                    json=build_request_body(
                        system=self._system,
                        prompt=self._prompt,
                        schema=json_schema,
                        sessionId=self._session_id,
                        model=self._config.model,
                        allowedTools=self._allowed_tools,
                    ),
                ),
                stream=True,
            )
        except httpx.ReadTimeout as e:
            await self._client.aclose()
            raise KoineError(f"Request timeout: {e}", "TIMEOUT") from e
        except httpx.RemoteProtocolError as e:
            await self._client.aclose()
            raise KoineError(f"Protocol error: {e}", "NETWORK_ERROR") from e
        except httpx.ReadError as e:
            await self._client.aclose()
            raise KoineError(f"Connection error: {e}", "NETWORK_ERROR") from e

        if not self._response.is_success:
            await self._response.aread()
            await self._client.aclose()
            raise parse_error_response(self._response)

        loop = asyncio.get_running_loop()
        session_id_future: asyncio.Future[str] = loop.create_future()
        usage_future: asyncio.Future[KoineUsage] = loop.create_future()
        object_future: asyncio.Future[T] = loop.create_future()

        # Capture references for closure (self may change during iteration)
        response = self._response
        schema = self._schema

        async def partial_object_stream_generator() -> AsyncIterator[T]:
            async for partial in process_object_sse_stream(
                response,
                schema,
                session_id_future,
                usage_future,
                object_future,
            ):
                yield partial

        return StreamObjectResult[T](
            partial_object_stream=partial_object_stream_generator(),
            _session_id_future=session_id_future,
            _usage_future=usage_future,
            _object_future=object_future,
        )

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        """Clean up HTTP resources."""
        if self._response is not None:
            await self._response.aclose()
        if self._client is not None:
            await self._client.aclose()


def stream_object(
    config: KoineConfig,
    *,
    prompt: str,
    schema: type[T],
    system: str | None = None,
    session_id: str | None = None,
    allowed_tools: list[str] | None = None,
) -> HTTPObjectStreamContext[T]:
    """Stream structured JSON objects from Koine gateway service via HTTP/SSE.

    Must be used as an async context manager to ensure proper resource cleanup:

        async with stream_object(config, prompt="Extract...", schema=MyModel) as result:
            async for partial in result.partial_object_stream:
                print(partial)

    The result provides:
    - partial_object_stream: AsyncIterator of partial objects as they arrive
    - session_id(): Resolves early in stream
    - usage(): Resolves when stream completes
    - object(): Final validated object, resolves when stream completes

    Important: You must consume partial_object_stream for the futures to resolve.

    Args:
        config: Gateway configuration
        prompt: The user prompt describing what to extract
        schema: Pydantic model class for response validation
        system: Optional system prompt
        session_id: Optional session ID for conversation continuity
        allowed_tools: Optional list of tools to allow for this request

    Returns:
        Async context manager that yields StreamObjectResult[T]

    Raises:
        KoineError: On HTTP errors, stream errors, or validation failures
    """
    return HTTPObjectStreamContext(
        config, prompt, schema, system, session_id, allowed_tools
    )
