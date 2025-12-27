"""HTTP/SSE streaming implementation for Koine SDK."""

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass
from types import TracebackType

import httpx
from pydantic import ValidationError

from .._types import SSEErrorEvent, SSEResultEvent, SSESessionEvent, SSETextEvent
from ..errors import KoineError, to_error_code
from ..http import (
    build_headers,
    build_request_body,
    parse_error_response,
    validate_config,
)
from ..types import KoineConfig, KoineUsage, StreamTextResult

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class SSEEvent:
    """A parsed SSE event."""

    event: str
    data: str


async def parse_sse_stream(response: httpx.Response) -> AsyncIterator[SSEEvent]:
    """Parse SSE events from response stream.

    SSE format: "event: name\\ndata: {...}\\n\\n"

    Args:
        response: The httpx response with streaming body

    Yields:
        SSEEvent with event type and data string
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
                yield SSEEvent(event=event_type, data=data)

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
            yield SSEEvent(event=event_type, data=data)


async def process_sse_stream(
    response: httpx.Response,
    session_id_future: asyncio.Future[str],
    usage_future: asyncio.Future[KoineUsage],
    text_future: asyncio.Future[str],
) -> AsyncIterator[str]:
    """Process SSE stream, yielding text and resolving futures.

    Args:
        response: The httpx response with SSE stream
        session_id_future: Future to resolve with session ID
        usage_future: Future to resolve with usage stats
        text_future: Future to resolve with accumulated text

    Yields:
        Text chunks as they arrive
    """
    accumulated_text = ""
    text_resolved = False

    try:
        async for sse_event in parse_sse_stream(response):
            # Critical events must propagate parse errors
            is_critical = sse_event.event in ("session", "result", "error", "done")

            try:
                if sse_event.event == "session":
                    parsed = SSESessionEvent.model_validate(json.loads(sse_event.data))
                    if not session_id_future.done():
                        session_id_future.set_result(parsed.sessionId)

                elif sse_event.event == "text":
                    parsed = SSETextEvent.model_validate(json.loads(sse_event.data))
                    accumulated_text += parsed.text
                    yield parsed.text

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
                    if not text_future.done():
                        text_future.set_exception(error)
                    if not session_id_future.done():
                        session_id_future.set_exception(error)
                    raise error

                elif sse_event.event == "done":
                    # Stream complete, resolve the text future
                    if not text_resolved:
                        text_resolved = True
                        if not text_future.done():
                            text_future.set_result(accumulated_text)

            except (json.JSONDecodeError, ValidationError) as e:
                if is_critical:
                    error = KoineError(
                        f"Failed to parse critical SSE event: {sse_event.event}",
                        "SSE_PARSE_ERROR",
                    )
                    if not usage_future.done():
                        usage_future.set_exception(error)
                    if not text_future.done():
                        text_future.set_exception(error)
                    if not session_id_future.done():
                        session_id_future.set_exception(error)
                    raise error from e
                # Non-critical event (text) - log warning but continue
                logger.warning(
                    "[Koine SDK] Failed to parse SSE text event: %s. Raw data: %s",
                    e,
                    sse_event.data[:100],
                )

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
        if not text_resolved and not text_future.done():
            text_future.set_result(accumulated_text)


class HTTPStreamContext:
    """Async context manager for HTTP/SSE streaming text responses.

    Handles resource cleanup (HTTP client and response) automatically.
    """

    def __init__(
        self,
        config: KoineConfig,
        prompt: str,
        system: str | None,
        session_id: str | None,
        allowed_tools: list[str] | None,
    ) -> None:
        self._config = config
        self._prompt = prompt
        self._system = system
        self._session_id = session_id
        self._allowed_tools = allowed_tools
        self._client: httpx.AsyncClient | None = None
        self._response: httpx.Response | None = None

    async def __aenter__(self) -> StreamTextResult:
        """Set up the streaming connection and return the result."""
        validate_config(self._config)

        self._client = httpx.AsyncClient(timeout=self._config.timeout)

        self._response = await self._client.send(
            self._client.build_request(
                "POST",
                f"{self._config.base_url}/stream",
                headers=build_headers(self._config.auth_key),
                json=build_request_body(
                    system=self._system,
                    prompt=self._prompt,
                    sessionId=self._session_id,
                    model=self._config.model,
                    allowedTools=self._allowed_tools,
                ),
            ),
            stream=True,
        )

        if not self._response.is_success:
            await self._response.aread()
            await self._client.aclose()
            raise parse_error_response(self._response)

        loop = asyncio.get_running_loop()
        session_id_future: asyncio.Future[str] = loop.create_future()
        usage_future: asyncio.Future[KoineUsage] = loop.create_future()
        text_future: asyncio.Future[str] = loop.create_future()

        response = self._response  # Capture for closure

        async def text_stream_generator() -> AsyncIterator[str]:
            async for text_chunk in process_sse_stream(
                response,
                session_id_future,
                usage_future,
                text_future,
            ):
                yield text_chunk

        return StreamTextResult(
            text_stream=text_stream_generator(),
            _session_id_future=session_id_future,
            _usage_future=usage_future,
            _text_future=text_future,
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


def stream_text(
    config: KoineConfig,
    *,
    prompt: str,
    system: str | None = None,
    session_id: str | None = None,
    allowed_tools: list[str] | None = None,
) -> HTTPStreamContext:
    """Stream text response from Koine gateway service via HTTP/SSE.

    Must be used as an async context manager to ensure proper resource cleanup:

        async with stream_text(config, prompt="Hello") as result:
            async for chunk in result.text_stream:
                print(chunk)

    The result provides:
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
        allowed_tools: Optional list of tools to allow for this request

    Returns:
        Async context manager that yields StreamTextResult

    Raises:
        KoineError: On HTTP errors or stream errors
    """
    return HTTPStreamContext(config, prompt, system, session_id, allowed_tools)
