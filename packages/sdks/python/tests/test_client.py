"""Tests for Koine SDK client functions."""

import json

import pytest
from pydantic import BaseModel
from pytest_httpx import HTTPXMock

from koine_sdk import (
    GenerateObjectResult,
    GenerateTextResult,
    KoineConfig,
    KoineError,
    generate_object,
    generate_text,
    stream_text,
)


# Test fixtures
@pytest.fixture
def config() -> KoineConfig:
    return KoineConfig(
        base_url="http://localhost:3100",
        timeout=30.0,
        auth_key="test-key",
        model="sonnet",
    )


class TestKoineError:
    def test_construction(self):
        error = KoineError("Something went wrong", "TEST_ERROR")
        assert str(error) == "Something went wrong"
        assert error.code == "TEST_ERROR"
        assert error.raw_text is None

    def test_with_raw_text(self):
        error = KoineError("Validation failed", "VALIDATION_ERROR", "raw output")
        assert error.raw_text == "raw output"
        assert repr(error) == "KoineError('VALIDATION_ERROR', 'Validation failed')"


class TestGenerateText:
    async def test_success(self, httpx_mock: HTTPXMock, config: KoineConfig):
        httpx_mock.add_response(
            url="http://localhost:3100/generate-text",
            json={
                "text": "Hello, world!",
                "usage": {"inputTokens": 10, "outputTokens": 5, "totalTokens": 15},
                "sessionId": "session-123",
            },
        )

        result = await generate_text(config, prompt="Say hello")

        assert isinstance(result, GenerateTextResult)
        assert result.text == "Hello, world!"
        assert result.session_id == "session-123"
        assert result.usage.input_tokens == 10
        assert result.usage.output_tokens == 5

    async def test_with_system_prompt(self, httpx_mock: HTTPXMock, config: KoineConfig):
        httpx_mock.add_response(
            url="http://localhost:3100/generate-text",
            json={
                "text": "Bonjour!",
                "usage": {"inputTokens": 15, "outputTokens": 3, "totalTokens": 18},
                "sessionId": "session-456",
            },
        )

        result = await generate_text(
            config,
            prompt="Say hello",
            system="You are a French assistant",
        )

        assert result.text == "Bonjour!"
        # Verify request included system prompt
        request = httpx_mock.get_request()
        assert request is not None
        body = json.loads(request.content)
        assert body["system"] == "You are a French assistant"

    async def test_http_error(self, httpx_mock: HTTPXMock, config: KoineConfig):
        httpx_mock.add_response(
            url="http://localhost:3100/generate-text",
            status_code=401,
            json={"error": "Invalid API key", "code": "UNAUTHORIZED"},
        )

        with pytest.raises(KoineError) as exc_info:
            await generate_text(config, prompt="test")

        assert exc_info.value.code == "UNAUTHORIZED"
        assert "Invalid API key" in str(exc_info.value)

    async def test_http_error_non_json(
        self, httpx_mock: HTTPXMock, config: KoineConfig
    ):
        httpx_mock.add_response(
            url="http://localhost:3100/generate-text",
            status_code=500,
            text="Internal Server Error",
        )

        with pytest.raises(KoineError) as exc_info:
            await generate_text(config, prompt="test")

        assert exc_info.value.code == "HTTP_ERROR"
        assert "500" in str(exc_info.value)

    async def test_invalid_response(self, httpx_mock: HTTPXMock, config: KoineConfig):
        httpx_mock.add_response(
            url="http://localhost:3100/generate-text",
            json={"unexpected": "format"},
        )

        with pytest.raises(KoineError) as exc_info:
            await generate_text(config, prompt="test")

        assert exc_info.value.code == "INVALID_RESPONSE"


class TestGenerateObject:
    class Person(BaseModel):
        name: str
        age: int

    async def test_success(self, httpx_mock: HTTPXMock, config: KoineConfig):
        httpx_mock.add_response(
            url="http://localhost:3100/generate-object",
            json={
                "object": {"name": "Alice", "age": 30},
                "rawText": '{"name": "Alice", "age": 30}',
                "usage": {"inputTokens": 20, "outputTokens": 10, "totalTokens": 30},
                "sessionId": "session-789",
            },
        )

        result = await generate_object(
            config,
            prompt="Create a person",
            schema=self.Person,
        )

        assert isinstance(result, GenerateObjectResult)
        assert isinstance(result.object, self.Person)
        assert result.object.name == "Alice"
        assert result.object.age == 30
        assert result.raw_text == '{"name": "Alice", "age": 30}'
        assert result.session_id == "session-789"

    async def test_schema_sent_as_json_schema(
        self, httpx_mock: HTTPXMock, config: KoineConfig
    ):
        httpx_mock.add_response(
            url="http://localhost:3100/generate-object",
            json={
                "object": {"name": "Bob", "age": 25},
                "rawText": "{}",
                "usage": {"inputTokens": 1, "outputTokens": 1, "totalTokens": 2},
                "sessionId": "s",
            },
        )

        await generate_object(config, prompt="test", schema=self.Person)

        request = httpx_mock.get_request()
        assert request is not None
        body = json.loads(request.content)
        # Verify JSON Schema was sent
        assert "schema" in body
        assert body["schema"]["type"] == "object"
        assert "name" in body["schema"]["properties"]
        assert "age" in body["schema"]["properties"]

    async def test_validation_error(self, httpx_mock: HTTPXMock, config: KoineConfig):
        httpx_mock.add_response(
            url="http://localhost:3100/generate-object",
            json={
                "object": {"name": "Alice"},  # Missing required field 'age'
                "rawText": '{"name": "Alice"}',
                "usage": {"inputTokens": 1, "outputTokens": 1, "totalTokens": 2},
                "sessionId": "s",
            },
        )

        with pytest.raises(KoineError) as exc_info:
            await generate_object(config, prompt="test", schema=self.Person)

        assert exc_info.value.code == "VALIDATION_ERROR"
        assert exc_info.value.raw_text == '{"name": "Alice"}'

    async def test_http_error(self, httpx_mock: HTTPXMock, config: KoineConfig):
        httpx_mock.add_response(
            url="http://localhost:3100/generate-object",
            status_code=400,
            json={"error": "Invalid schema", "code": "BAD_REQUEST"},
        )

        with pytest.raises(KoineError) as exc_info:
            await generate_object(config, prompt="test", schema=self.Person)

        assert exc_info.value.code == "BAD_REQUEST"

    async def test_with_session_id(self, httpx_mock: HTTPXMock, config: KoineConfig):
        httpx_mock.add_response(
            url="http://localhost:3100/generate-object",
            json={
                "object": {"name": "Carol", "age": 35},
                "rawText": "{}",
                "usage": {"inputTokens": 1, "outputTokens": 1, "totalTokens": 2},
                "sessionId": "continued-session",
            },
        )

        await generate_object(
            config,
            prompt="test",
            schema=self.Person,
            session_id="existing-session",
        )

        request = httpx_mock.get_request()
        assert request is not None
        body = json.loads(request.content)
        assert body["sessionId"] == "existing-session"


class TestStreamText:
    def _sse_response(self, events: list[tuple[str, dict]]) -> str:
        """Helper to create SSE formatted response."""
        lines = []
        for event_type, data in events:
            lines.append(f"event: {event_type}")
            lines.append(f"data: {json.dumps(data)}")
            lines.append("")
        return "\n".join(lines)

    async def test_basic_stream(self, httpx_mock: HTTPXMock, config: KoineConfig):
        usage = {"inputTokens": 5, "outputTokens": 3, "totalTokens": 8}
        sse_data = self._sse_response(
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

        result = await stream_text(config, prompt="Say hello")

        chunks = []
        async for chunk in result.text_stream:
            chunks.append(chunk)

        assert chunks == ["Hello", ", world!"]
        assert await result.session_id() == "stream-session"
        assert await result.text() == "Hello, world!"

        usage = await result.usage()
        assert usage.input_tokens == 5
        assert usage.output_tokens == 3

    async def test_session_id_early(self, httpx_mock: HTTPXMock, config: KoineConfig):
        usage = {"inputTokens": 1, "outputTokens": 1, "totalTokens": 2}
        sse_data = self._sse_response(
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

        result = await stream_text(config, prompt="test")

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
        sse_data = self._sse_response(
            [
                ("session", {"sessionId": "error-session"}),
                ("text", {"text": "Partial"}),
                ("error", {"error": "Rate limit exceeded", "code": "RATE_LIMIT"}),
            ]
        )

        httpx_mock.add_response(
            url="http://localhost:3100/stream",
            text=sse_data,
            headers={"content-type": "text/event-stream"},
        )

        result = await stream_text(config, prompt="test")

        with pytest.raises(KoineError) as exc_info:
            async for _ in result.text_stream:
                pass

        assert exc_info.value.code == "RATE_LIMIT"
        assert "Rate limit exceeded" in str(exc_info.value)

        # Consume the futures to avoid "Future exception was never retrieved" warning
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

        with pytest.raises(KoineError) as exc_info:
            await stream_text(config, prompt="test")

        assert exc_info.value.code == "UNAUTHORIZED"

    async def test_incomplete_stream(self, httpx_mock: HTTPXMock, config: KoineConfig):
        # Stream ends without result event
        sse_data = self._sse_response(
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

        result = await stream_text(config, prompt="test")

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
        sse_data = self._sse_response(
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

        result = await stream_text(
            config,
            prompt="test prompt",
            system="system prompt",
            session_id="existing-session",
        )

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
        sse_data = self._sse_response(
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

        result = await stream_text(config, prompt="test")
        async for _ in result.text_stream:
            pass

        request = httpx_mock.get_request()
        assert request is not None
        assert request.headers["authorization"] == "Bearer test-key"
