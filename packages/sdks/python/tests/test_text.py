"""Tests for text generation."""

import json

import pytest
from pytest_httpx import HTTPXMock

from koine_sdk import GenerateTextResult, KoineConfig, KoineError, create_koine


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

        koine = create_koine(config)
        result = await koine.generate_text(prompt="Say hello")

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

        koine = create_koine(config)
        result = await koine.generate_text(
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

        koine = create_koine(config)
        with pytest.raises(KoineError) as exc_info:
            await koine.generate_text(prompt="test")

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

        koine = create_koine(config)
        with pytest.raises(KoineError) as exc_info:
            await koine.generate_text(prompt="test")

        assert exc_info.value.code == "HTTP_ERROR"
        assert "500" in str(exc_info.value)

    async def test_invalid_response(self, httpx_mock: HTTPXMock, config: KoineConfig):
        httpx_mock.add_response(
            url="http://localhost:3100/generate-text",
            json={"unexpected": "format"},
        )

        koine = create_koine(config)
        with pytest.raises(KoineError) as exc_info:
            await koine.generate_text(prompt="test")

        assert exc_info.value.code == "INVALID_RESPONSE"

    async def test_with_session_id(self, httpx_mock: HTTPXMock, config: KoineConfig):
        httpx_mock.add_response(
            url="http://localhost:3100/generate-text",
            json={
                "text": "Continued response",
                "usage": {"inputTokens": 10, "outputTokens": 5, "totalTokens": 15},
                "sessionId": "continued-session",
            },
        )

        koine = create_koine(config)
        await koine.generate_text(
            prompt="Continue the conversation",
            session_id="existing-session",
        )

        request = httpx_mock.get_request()
        assert request is not None
        body = json.loads(request.content)
        assert body["sessionId"] == "existing-session"

    async def test_auth_header(self, httpx_mock: HTTPXMock, config: KoineConfig):
        httpx_mock.add_response(
            url="http://localhost:3100/generate-text",
            json={
                "text": "Response",
                "usage": {"inputTokens": 1, "outputTokens": 1, "totalTokens": 2},
                "sessionId": "s",
            },
        )

        koine = create_koine(config)
        await koine.generate_text(prompt="test")

        request = httpx_mock.get_request()
        assert request is not None
        assert request.headers["authorization"] == "Bearer test-key"
