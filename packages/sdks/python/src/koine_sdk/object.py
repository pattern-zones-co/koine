"""Structured object generation function for Koine SDK."""

from typing import Any, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from ._types import GatewayObjectResponse
from .errors import KoineError
from .http import (
    build_headers,
    build_request_body,
    parse_error_response,
    safe_fetch,
    validate_config,
)
from .types import GenerateObjectResult, KoineConfig

T = TypeVar("T", bound=BaseModel)


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
        GenerateObjectResult with validated object, raw_text, usage, and session_id

    Raises:
        KoineError: On HTTP errors, invalid responses, or validation failures
    """
    validate_config(config)

    # Convert Pydantic model to JSON Schema
    json_schema: dict[str, Any] = schema.model_json_schema()

    async with httpx.AsyncClient(timeout=config.timeout) as client:
        response = await safe_fetch(
            client,
            "POST",
            f"{config.base_url}/generate-object",
            headers=build_headers(config.auth_key),
            json=build_request_body(
                system=system,
                prompt=prompt,
                schema=json_schema,
                sessionId=session_id,
                model=config.model,
            ),
        )

        if not response.is_success:
            raise parse_error_response(response)

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
