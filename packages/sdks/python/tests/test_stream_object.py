"""Tests for streaming object generation."""

import json

import pytest
from pydantic import BaseModel, Field
from pytest_httpx import HTTPXMock

from koine_sdk import KoineConfig, KoineError, create_koine

from .conftest import sse_response


class Person(BaseModel):
    """Test schema for streaming."""

    name: str = Field(description="Name of the person")
    age: int = Field(description="Age of the person")


class TestStreamObject:
    async def test_basic_stream(self, httpx_mock: HTTPXMock, config: KoineConfig):
        usage = {"inputTokens": 10, "outputTokens": 5, "totalTokens": 15}
        sse_data = sse_response(
            [
                ("session", {"sessionId": "stream-obj-session"}),
                ("partial-object", {"partial": '{"name":', "parsed": {"name": ""}}),
                (
                    "partial-object",
                    {"partial": '{"name":"Alice"', "parsed": {"name": "Alice"}},
                ),
                ("object", {"object": {"name": "Alice", "age": 30}}),
                ("result", {"sessionId": "stream-obj-session", "usage": usage}),
                ("done", {"code": 0}),
            ]
        )

        httpx_mock.add_response(
            url="http://localhost:3100/stream-object",
            text=sse_data,
            headers={"content-type": "text/event-stream"},
        )

        koine = create_koine(config)
        async with koine.stream_object(
            prompt="Generate a person", schema=Person
        ) as result:
            partials = []
            async for partial in result.partial_object_stream:
                partials.append(partial)

            assert len(partials) >= 1
            assert await result.session_id() == "stream-obj-session"

            obj = await result.object()
            assert obj.name == "Alice"
            assert obj.age == 30

            usage_result = await result.usage()
            assert usage_result.total_tokens == 15

    async def test_session_id_early(self, httpx_mock: HTTPXMock, config: KoineConfig):
        usage = {"inputTokens": 1, "outputTokens": 1, "totalTokens": 2}
        sse_data = sse_response(
            [
                ("session", {"sessionId": "early-session"}),
                (
                    "partial-object",
                    {"partial": '{"name":"Bob"', "parsed": {"name": "Bob"}},
                ),
                ("object", {"object": {"name": "Bob", "age": 25}}),
                ("result", {"sessionId": "early-session", "usage": usage}),
                ("done", {"code": 0}),
            ]
        )

        httpx_mock.add_response(
            url="http://localhost:3100/stream-object",
            text=sse_data,
            headers={"content-type": "text/event-stream"},
        )

        koine = create_koine(config)
        async with koine.stream_object(prompt="test", schema=Person) as result:
            # Start iteration but don't consume fully
            stream = result.partial_object_stream.__aiter__()
            _ = await stream.__anext__()  # Get first partial

            # Session ID should be available after first partial
            assert await result.session_id() == "early-session"

            # Consume rest
            async for _ in stream:
                pass

    async def test_stream_error_event(self, httpx_mock: HTTPXMock, config: KoineConfig):
        sse_data = sse_response(
            [
                ("session", {"sessionId": "error-session"}),
                (
                    "partial-object",
                    {"partial": '{"name":"X"', "parsed": {"name": "X"}},
                ),
                ("error", {"error": "Schema parsing failed", "code": "SCHEMA_ERROR"}),
            ]
        )

        httpx_mock.add_response(
            url="http://localhost:3100/stream-object",
            text=sse_data,
            headers={"content-type": "text/event-stream"},
        )

        koine = create_koine(config)
        async with koine.stream_object(prompt="test", schema=Person) as result:
            with pytest.raises(KoineError) as exc_info:
                async for _ in result.partial_object_stream:
                    pass

            assert exc_info.value.code == "SCHEMA_ERROR"

            # Consume futures to avoid warning
            with pytest.raises(KoineError):
                await result.usage()
            with pytest.raises(KoineError):
                await result.object()

    async def test_http_error(self, httpx_mock: HTTPXMock, config: KoineConfig):
        httpx_mock.add_response(
            url="http://localhost:3100/stream-object",
            status_code=429,
            json={"error": "Rate limit exceeded", "code": "RATE_LIMITED"},
        )

        koine = create_koine(config)
        with pytest.raises(KoineError) as exc_info:
            async with koine.stream_object(prompt="test", schema=Person):
                pass

        assert exc_info.value.code == "RATE_LIMITED"

    async def test_validation_error_on_final_object(
        self, httpx_mock: HTTPXMock, config: KoineConfig
    ):
        usage = {"inputTokens": 1, "outputTokens": 1, "totalTokens": 2}
        sse_data = sse_response(
            [
                ("session", {"sessionId": "s"}),
                ("object", {"object": {"name": "Bob", "age": "not-a-number"}}),
                ("result", {"sessionId": "s", "usage": usage}),
                ("done", {"code": 0}),
            ]
        )

        httpx_mock.add_response(
            url="http://localhost:3100/stream-object",
            text=sse_data,
            headers={"content-type": "text/event-stream"},
        )

        koine = create_koine(config)
        async with koine.stream_object(prompt="test", schema=Person) as result:
            async for _ in result.partial_object_stream:
                pass

            with pytest.raises(KoineError) as exc_info:
                await result.object()

            assert exc_info.value.code == "VALIDATION_ERROR"

    async def test_incomplete_stream_no_object(
        self, httpx_mock: HTTPXMock, config: KoineConfig
    ):
        sse_data = sse_response(
            [
                ("session", {"sessionId": "incomplete-session"}),
                (
                    "partial-object",
                    {"partial": '{"name":"X"', "parsed": {"name": "X"}},
                ),
                # No object event!
            ]
        )

        httpx_mock.add_response(
            url="http://localhost:3100/stream-object",
            text=sse_data,
            headers={"content-type": "text/event-stream"},
        )

        koine = create_koine(config)
        async with koine.stream_object(prompt="test", schema=Person) as result:
            async for _ in result.partial_object_stream:
                pass

            with pytest.raises(KoineError) as exc_info:
                await result.object()

            assert exc_info.value.code == "NO_OBJECT"

            # Also test usage future fails
            with pytest.raises(KoineError) as exc_info:
                await result.usage()
            assert exc_info.value.code == "NO_USAGE"

    async def test_request_includes_schema(
        self, httpx_mock: HTTPXMock, config: KoineConfig
    ):
        usage = {"inputTokens": 1, "outputTokens": 1, "totalTokens": 2}
        sse_data = sse_response(
            [
                ("session", {"sessionId": "s"}),
                ("object", {"object": {"name": "Test", "age": 1}}),
                ("result", {"sessionId": "s", "usage": usage}),
                ("done", {"code": 0}),
            ]
        )

        httpx_mock.add_response(
            url="http://localhost:3100/stream-object",
            text=sse_data,
            headers={"content-type": "text/event-stream"},
        )

        koine = create_koine(config)
        async with koine.stream_object(
            prompt="test prompt",
            schema=Person,
            system="system prompt",
            session_id="existing-session",
        ) as result:
            async for _ in result.partial_object_stream:
                pass

        request = httpx_mock.get_request()
        assert request is not None
        body = json.loads(request.content)
        assert body["prompt"] == "test prompt"
        assert body["system"] == "system prompt"
        assert body["sessionId"] == "existing-session"
        assert body["model"] == "sonnet"
        assert body["schema"]["type"] == "object"
        assert "name" in body["schema"]["properties"]
        assert "age" in body["schema"]["properties"]

    async def test_partial_objects_best_effort(
        self, httpx_mock: HTTPXMock, config: KoineConfig
    ):
        """Partial objects that don't validate are still emitted as best-effort."""
        usage = {"inputTokens": 1, "outputTokens": 1, "totalTokens": 2}
        sse_data = sse_response(
            [
                ("session", {"sessionId": "s"}),
                # This partial is missing 'age' - won't validate but should still emit
                (
                    "partial-object",
                    {"partial": '{"name":"Al"', "parsed": {"name": "Al"}},
                ),
                (
                    "partial-object",
                    {
                        "partial": '{"name":"Alice","age":30}',
                        "parsed": {"name": "Alice", "age": 30},
                    },
                ),
                ("object", {"object": {"name": "Alice", "age": 30}}),
                ("result", {"sessionId": "s", "usage": usage}),
                ("done", {"code": 0}),
            ]
        )

        httpx_mock.add_response(
            url="http://localhost:3100/stream-object",
            text=sse_data,
            headers={"content-type": "text/event-stream"},
        )

        koine = create_koine(config)
        async with koine.stream_object(prompt="test", schema=Person) as result:
            partials = []
            async for partial in result.partial_object_stream:
                partials.append(partial)

            # Both partials should be emitted
            assert len(partials) == 2

    async def test_null_parsed_skipped(
        self, httpx_mock: HTTPXMock, config: KoineConfig
    ):
        """Partial objects with null parsed value are skipped."""
        usage = {"inputTokens": 1, "outputTokens": 1, "totalTokens": 2}
        sse_data = sse_response(
            [
                ("session", {"sessionId": "s"}),
                # null parsed should be skipped
                ("partial-object", {"partial": "{", "parsed": None}),
                (
                    "partial-object",
                    {
                        "partial": '{"name":"Alice","age":30}',
                        "parsed": {"name": "Alice", "age": 30},
                    },
                ),
                ("object", {"object": {"name": "Alice", "age": 30}}),
                ("result", {"sessionId": "s", "usage": usage}),
                ("done", {"code": 0}),
            ]
        )

        httpx_mock.add_response(
            url="http://localhost:3100/stream-object",
            text=sse_data,
            headers={"content-type": "text/event-stream"},
        )

        koine = create_koine(config)
        async with koine.stream_object(prompt="test", schema=Person) as result:
            partials = []
            async for partial in result.partial_object_stream:
                partials.append(partial)

            # Only one partial should be emitted (null skipped)
            assert len(partials) == 1

    async def test_auth_header(self, httpx_mock: HTTPXMock, config: KoineConfig):
        usage = {"inputTokens": 1, "outputTokens": 1, "totalTokens": 2}
        sse_data = sse_response(
            [
                ("session", {"sessionId": "s"}),
                ("object", {"object": {"name": "Test", "age": 1}}),
                ("result", {"sessionId": "s", "usage": usage}),
                ("done", {"code": 0}),
            ]
        )

        httpx_mock.add_response(
            url="http://localhost:3100/stream-object",
            text=sse_data,
            headers={"content-type": "text/event-stream"},
        )

        koine = create_koine(config)
        async with koine.stream_object(prompt="test", schema=Person) as result:
            async for _ in result.partial_object_stream:
                pass

        request = httpx_mock.get_request()
        assert request is not None
        assert request.headers["authorization"] == "Bearer test-key"

    async def test_cancellation_mid_stream(
        self, httpx_mock: HTTPXMock, config: KoineConfig
    ):
        """Test that stream can be cancelled mid-iteration (parity with TS abort)."""
        import asyncio

        usage = {"inputTokens": 1, "outputTokens": 1, "totalTokens": 2}
        sse_data = sse_response(
            [
                ("session", {"sessionId": "cancel-session"}),
                ("partial-object", {"partial": '{"name":"A"', "parsed": {"name": "A"}}),
                (
                    "partial-object",
                    {"partial": '{"name":"Ab"', "parsed": {"name": "Ab"}},
                ),
                (
                    "partial-object",
                    {"partial": '{"name":"Abc"', "parsed": {"name": "Abc"}},
                ),
                (
                    "partial-object",
                    {"partial": '{"name":"Abcd"', "parsed": {"name": "Abcd"}},
                ),
                ("object", {"object": {"name": "Abcde", "age": 99}}),
                ("result", {"sessionId": "cancel-session", "usage": usage}),
                ("done", {"code": 0}),
            ]
        )

        httpx_mock.add_response(
            url="http://localhost:3100/stream-object",
            text=sse_data,
            headers={"content-type": "text/event-stream"},
        )

        koine = create_koine(config)
        partials_received = []
        cancelled = False

        async with koine.stream_object(prompt="test", schema=Person) as result:
            try:
                async for partial in result.partial_object_stream:
                    partials_received.append(partial)
                    # Cancel after receiving 2 partials
                    if len(partials_received) >= 2:
                        raise asyncio.CancelledError("Simulated cancellation")
            except asyncio.CancelledError:
                cancelled = True

        # Should have received some partials before cancellation
        assert len(partials_received) >= 2
        # Should have been cancelled
        assert cancelled is True

    async def test_connection_error_before_stream(
        self, httpx_mock: HTTPXMock, config: KoineConfig
    ):
        """Test that connection errors during request propagate correctly."""
        import httpx

        # Add an exception that occurs during the request (before streaming)
        httpx_mock.add_exception(
            httpx.ReadError("Connection reset by peer"),
            url="http://localhost:3100/stream-object",
        )

        koine = create_koine(config)

        with pytest.raises(KoineError) as exc_info:
            async with koine.stream_object(prompt="test", schema=Person) as result:
                async for _ in result.partial_object_stream:
                    pass

        # httpx.ReadError should be caught and wrapped
        assert "Connection reset by peer" in str(exc_info.value)

    async def test_timeout_error_before_stream(
        self, httpx_mock: HTTPXMock, config: KoineConfig
    ):
        """Test that timeout errors during request propagate correctly."""
        import httpx

        httpx_mock.add_exception(
            httpx.ReadTimeout("Read timed out"),
            url="http://localhost:3100/stream-object",
        )

        koine = create_koine(config)

        with pytest.raises(KoineError) as exc_info:
            async with koine.stream_object(prompt="test", schema=Person) as result:
                async for _ in result.partial_object_stream:
                    pass

        assert "timed out" in str(exc_info.value).lower()

    async def test_protocol_error_before_stream(
        self, httpx_mock: HTTPXMock, config: KoineConfig
    ):
        """Test that protocol errors during request propagate correctly."""
        import httpx

        httpx_mock.add_exception(
            httpx.RemoteProtocolError("Server sent invalid response"),
            url="http://localhost:3100/stream-object",
        )

        koine = create_koine(config)

        with pytest.raises(KoineError) as exc_info:
            async with koine.stream_object(prompt="test", schema=Person) as result:
                async for _ in result.partial_object_stream:
                    pass

        assert "invalid response" in str(exc_info.value).lower()

    async def test_session_id_from_result_event(
        self, httpx_mock: HTTPXMock, config: KoineConfig
    ):
        """When no session event arrives, sessionId should be resolved from result."""
        usage = {"inputTokens": 1, "outputTokens": 1, "totalTokens": 2}
        sse_data = sse_response(
            [
                # No session event!
                (
                    "partial-object",
                    {"partial": '{"name":"Test"', "parsed": {"name": "Test"}},
                ),
                ("object", {"object": {"name": "Test", "age": 1}}),
                ("result", {"sessionId": "result-session-id", "usage": usage}),
                ("done", {"code": 0}),
            ]
        )

        httpx_mock.add_response(
            url="http://localhost:3100/stream-object",
            text=sse_data,
            headers={"content-type": "text/event-stream"},
        )

        koine = create_koine(config)
        async with koine.stream_object(prompt="test", schema=Person) as result:
            async for _ in result.partial_object_stream:
                pass

            # sessionId should be resolved from result event
            assert await result.session_id() == "result-session-id"

    async def test_session_id_rejected_on_error_before_session(
        self, httpx_mock: HTTPXMock, config: KoineConfig
    ):
        """When error arrives before session event, sessionId future should reject."""
        sse_data = sse_response(
            [
                # No session event before error!
                ("error", {"error": "Early failure", "code": "STREAM_ERROR"}),
            ]
        )

        httpx_mock.add_response(
            url="http://localhost:3100/stream-object",
            text=sse_data,
            headers={"content-type": "text/event-stream"},
        )

        koine = create_koine(config)
        async with koine.stream_object(prompt="test", schema=Person) as result:
            with pytest.raises(KoineError) as exc_info:
                async for _ in result.partial_object_stream:
                    pass

            assert exc_info.value.code == "STREAM_ERROR"

            # All futures should reject with the same error
            with pytest.raises(KoineError) as exc_info:
                await result.session_id()
            assert exc_info.value.code == "STREAM_ERROR"

            with pytest.raises(KoineError):
                await result.object()
            with pytest.raises(KoineError):
                await result.usage()

    async def test_critical_sse_parse_error(
        self, httpx_mock: HTTPXMock, config: KoineConfig
    ):
        """When critical SSE event has malformed JSON, all futures should reject."""
        # Malformed JSON in session event (critical)
        sse_data = "event: session\ndata: {invalid json}\n\n"

        httpx_mock.add_response(
            url="http://localhost:3100/stream-object",
            text=sse_data,
            headers={"content-type": "text/event-stream"},
        )

        koine = create_koine(config)
        async with koine.stream_object(prompt="test", schema=Person) as result:
            with pytest.raises(KoineError) as exc_info:
                async for _ in result.partial_object_stream:
                    pass

            assert exc_info.value.code == "SSE_PARSE_ERROR"

            # All futures should be rejected
            with pytest.raises(KoineError) as exc_info:
                await result.session_id()
            assert exc_info.value.code == "SSE_PARSE_ERROR"

            with pytest.raises(KoineError) as exc_info:
                await result.object()
            assert exc_info.value.code == "SSE_PARSE_ERROR"

            with pytest.raises(KoineError) as exc_info:
                await result.usage()
            assert exc_info.value.code == "SSE_PARSE_ERROR"

    async def test_noncritical_sse_parse_error_continues(
        self, httpx_mock: HTTPXMock, config: KoineConfig
    ):
        """When partial-object has malformed JSON, stream should continue."""
        usage = {"inputTokens": 1, "outputTokens": 1, "totalTokens": 2}
        partial_data = {"partial": '{"name":"Bob"', "parsed": {"name": "Bob"}}
        # Mix of malformed and valid events
        sse_data = (
            "event: session\n"
            + f"data: {json.dumps({'sessionId': 's'})}\n\n"
            + "event: partial-object\n"
            + "data: {malformed json\n\n"  # Malformed, should log and continue
            + "event: partial-object\n"
            + f"data: {json.dumps(partial_data)}\n\n"
            + "event: object\n"
            + f"data: {json.dumps({'object': {'name': 'Bob', 'age': 25}})}\n\n"
            + "event: result\n"
            + f"data: {json.dumps({'sessionId': 's', 'usage': usage})}\n\n"
            + "event: done\n"
            + f"data: {json.dumps({'code': 0})}\n\n"
        )

        httpx_mock.add_response(
            url="http://localhost:3100/stream-object",
            text=sse_data,
            headers={"content-type": "text/event-stream"},
        )

        koine = create_koine(config)
        async with koine.stream_object(prompt="test", schema=Person) as result:
            partials = []
            async for partial in result.partial_object_stream:
                partials.append(partial)

            # Should have received the valid partial
            assert len(partials) == 1

            # Final object should still resolve
            obj = await result.object()
            assert obj.name == "Bob"
            assert obj.age == 25

    async def test_no_session_event_no_result_event(
        self, httpx_mock: HTTPXMock, config: KoineConfig
    ):
        """When stream ends without session or result, NO_SESSION error."""
        sse_data = sse_response(
            [
                # No session event, no result event!
                ("object", {"object": {"name": "Test", "age": 1}}),
                ("done", {"code": 0}),
            ]
        )

        httpx_mock.add_response(
            url="http://localhost:3100/stream-object",
            text=sse_data,
            headers={"content-type": "text/event-stream"},
        )

        koine = create_koine(config)
        async with koine.stream_object(prompt="test", schema=Person) as result:
            async for _ in result.partial_object_stream:
                pass

            # sessionId should reject with NO_SESSION
            with pytest.raises(KoineError) as exc_info:
                await result.session_id()
            assert exc_info.value.code == "NO_SESSION"

            # usage should reject with NO_USAGE
            with pytest.raises(KoineError) as exc_info:
                await result.usage()
            assert exc_info.value.code == "NO_USAGE"
