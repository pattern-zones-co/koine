"""Tests for object generation."""

import json

import pytest
from pydantic import BaseModel
from pytest_httpx import HTTPXMock

from koine_sdk import GenerateObjectResult, KoineConfig, KoineError, create_koine


class Person(BaseModel):
    name: str
    age: int


class TestGenerateObject:
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

        koine = create_koine(config)
        result = await koine.generate_object(
            prompt="Create a person",
            schema=Person,
        )

        assert isinstance(result, GenerateObjectResult)
        assert isinstance(result.object, Person)
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

        koine = create_koine(config)
        await koine.generate_object(prompt="test", schema=Person)

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

        koine = create_koine(config)
        with pytest.raises(KoineError) as exc_info:
            await koine.generate_object(prompt="test", schema=Person)

        assert exc_info.value.code == "VALIDATION_ERROR"
        assert exc_info.value.raw_text == '{"name": "Alice"}'

    async def test_http_error(self, httpx_mock: HTTPXMock, config: KoineConfig):
        httpx_mock.add_response(
            url="http://localhost:3100/generate-object",
            status_code=400,
            json={"error": "Invalid schema", "code": "INVALID_PARAMS"},
        )

        koine = create_koine(config)
        with pytest.raises(KoineError) as exc_info:
            await koine.generate_object(prompt="test", schema=Person)

        assert exc_info.value.code == "INVALID_PARAMS"

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

        koine = create_koine(config)
        await koine.generate_object(
            prompt="test",
            schema=Person,
            session_id="existing-session",
        )

        request = httpx_mock.get_request()
        assert request is not None
        body = json.loads(request.content)
        assert body["sessionId"] == "existing-session"

    async def test_auth_header(self, httpx_mock: HTTPXMock, config: KoineConfig):
        httpx_mock.add_response(
            url="http://localhost:3100/generate-object",
            json={
                "object": {"name": "Test", "age": 1},
                "rawText": "{}",
                "usage": {"inputTokens": 1, "outputTokens": 1, "totalTokens": 2},
                "sessionId": "s",
            },
        )

        koine = create_koine(config)
        await koine.generate_object(prompt="test", schema=Person)

        request = httpx_mock.get_request()
        assert request is not None
        assert request.headers["authorization"] == "Bearer test-key"
