"""Tests for streaming text generation."""

import json

import pytest
from pytest_httpx import HTTPXMock

from koine_sdk import KoineConfig, KoineError, create_koine

from .conftest import sse_response


class TestStreamText:
    async def test_basic_stream(self, httpx_mock: HTTPXMock, config: KoineConfig):
        usage = {"inputTokens": 5, "outputTokens": 3, "totalTokens": 8}
        sse_data = sse_response(
            [
                ("session", {"sessionId": "stream-session"}),
                ("text", {"text": "Hello"}),
                ("text", {"text": ", world!"}),
                ("result", {"sessionId": "stream-session", "usage": usage}),
                ("done", {}),
            ]
        )

        httpx_mock.add_response(
            url="http://localhost:3100/stream",
            text=sse_data,
            headers={"content-type": "text/event-stream"},
        )

        koine = create_koine(config)
        async with koine.stream_text(prompt="Say hello") as result:
            chunks = []
            async for chunk in result.text_stream:
                chunks.append(chunk)

            assert chunks == ["Hello", ", world!"]
            assert await result.session_id() == "stream-session"
            assert await result.text() == "Hello, world!"

            usage_result = await result.usage()
            assert usage_result.input_tokens == 5
            assert usage_result.output_tokens == 3

    async def test_session_id_early(self, httpx_mock: HTTPXMock, config: KoineConfig):
        usage = {"inputTokens": 1, "outputTokens": 1, "totalTokens": 2}
        sse_data = sse_response(
            [
                ("session", {"sessionId": "early-session"}),
                ("text", {"text": "Hello"}),
                ("result", {"sessionId": "early-session", "usage": usage}),
                ("done", {}),
            ]
        )

        httpx_mock.add_response(
            url="http://localhost:3100/stream",
            text=sse_data,
            headers={"content-type": "text/event-stream"},
        )

        koine = create_koine(config)
        async with koine.stream_text(prompt="test") as result:
            # Start iteration but don't consume fully
            stream = result.text_stream.__aiter__()
            first_chunk = await stream.__anext__()

            # Session ID should be available after first chunk
            assert first_chunk == "Hello"
            assert await result.session_id() == "early-session"

            # Consume rest
            async for _ in stream:
                pass

    async def test_stream_error_event(self, httpx_mock: HTTPXMock, config: KoineConfig):
        sse_data = sse_response(
            [
                ("session", {"sessionId": "error-session"}),
                ("text", {"text": "Partial"}),
                ("error", {"error": "Rate limit exceeded", "code": "RATE_LIMITED"}),
            ]
        )

        httpx_mock.add_response(
            url="http://localhost:3100/stream",
            text=sse_data,
            headers={"content-type": "text/event-stream"},
        )

        koine = create_koine(config)
        async with koine.stream_text(prompt="test") as result:
            with pytest.raises(KoineError) as exc_info:
                async for _ in result.text_stream:
                    pass

            assert exc_info.value.code == "RATE_LIMITED"
            assert "Rate limit exceeded" in str(exc_info.value)

            # Consume futures to avoid "Future exception was never retrieved" warning
            with pytest.raises(KoineError):
                await result.usage()
            with pytest.raises(KoineError):
                await result.text()

    async def test_http_error(self, httpx_mock: HTTPXMock, config: KoineConfig):
        httpx_mock.add_response(
            url="http://localhost:3100/stream",
            status_code=401,
            json={"error": "Unauthorized", "code": "UNAUTHORIZED"},
        )

        koine = create_koine(config)
        with pytest.raises(KoineError) as exc_info:
            async with koine.stream_text(prompt="test"):
                pass

        assert exc_info.value.code == "UNAUTHORIZED"

    async def test_incomplete_stream(self, httpx_mock: HTTPXMock, config: KoineConfig):
        # Stream ends without result event
        sse_data = sse_response(
            [
                ("session", {"sessionId": "incomplete-session"}),
                ("text", {"text": "Partial response"}),
                # No result or done event
            ]
        )

        httpx_mock.add_response(
            url="http://localhost:3100/stream",
            text=sse_data,
            headers={"content-type": "text/event-stream"},
        )

        koine = create_koine(config)
        async with koine.stream_text(prompt="test") as result:
            chunks = []
            async for chunk in result.text_stream:
                chunks.append(chunk)

            # Text should still be accumulated
            assert await result.text() == "Partial response"
            # But usage should fail
            with pytest.raises(KoineError) as exc_info:
                await result.usage()
            assert exc_info.value.code == "NO_USAGE"

    async def test_request_includes_params(
        self, httpx_mock: HTTPXMock, config: KoineConfig
    ):
        usage = {"inputTokens": 1, "outputTokens": 1, "totalTokens": 2}
        sse_data = sse_response(
            [
                ("session", {"sessionId": "s"}),
                ("result", {"sessionId": "s", "usage": usage}),
                ("done", {}),
            ]
        )

        httpx_mock.add_response(
            url="http://localhost:3100/stream",
            text=sse_data,
            headers={"content-type": "text/event-stream"},
        )

        koine = create_koine(config)
        async with koine.stream_text(
            prompt="test prompt",
            system="system prompt",
            session_id="existing-session",
        ) as result:
            async for _ in result.text_stream:
                pass

        request = httpx_mock.get_request()
        assert request is not None
        body = json.loads(request.content)
        assert body["prompt"] == "test prompt"
        assert body["system"] == "system prompt"
        assert body["sessionId"] == "existing-session"
        assert body["model"] == "sonnet"

    async def test_auth_header(self, httpx_mock: HTTPXMock, config: KoineConfig):
        usage = {"inputTokens": 1, "outputTokens": 1, "totalTokens": 2}
        sse_data = sse_response(
            [
                ("session", {"sessionId": "s"}),
                ("result", {"sessionId": "s", "usage": usage}),
                ("done", {}),
            ]
        )

        httpx_mock.add_response(
            url="http://localhost:3100/stream",
            text=sse_data,
            headers={"content-type": "text/event-stream"},
        )

        koine = create_koine(config)
        async with koine.stream_text(prompt="test") as result:
            async for _ in result.text_stream:
                pass

        request = httpx_mock.get_request()
        assert request is not None
        assert request.headers["authorization"] == "Bearer test-key"
