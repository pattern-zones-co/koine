"""Text generation function for Koine SDK."""

import httpx
from pydantic import ValidationError

from ._types import GatewayTextResponse
from .errors import KoineError
from .http import (
    build_headers,
    build_request_body,
    parse_error_response,
    safe_fetch,
    validate_config,
)
from .types import GenerateTextResult, KoineConfig


async def generate_text(
    config: KoineConfig,
    *,
    prompt: str,
    system: str | None = None,
    session_id: str | None = None,
    allowed_tools: list[str] | None = None,
) -> GenerateTextResult:
    """Generate plain text response from Koine gateway service.

    Args:
        config: Gateway configuration
        prompt: The user prompt to send
        system: Optional system prompt
        session_id: Optional session ID for conversation continuity
        allowed_tools: Optional list of tools to allow for this request

    Returns:
        GenerateTextResult with text, usage, and session_id

    Raises:
        KoineError: On HTTP errors or invalid responses
    """
    validate_config(config)

    async with httpx.AsyncClient(timeout=config.timeout) as client:
        response = await safe_fetch(
            client,
            "POST",
            f"{config.base_url}/generate-text",
            headers=build_headers(config.auth_key),
            json=build_request_body(
                system=system,
                prompt=prompt,
                sessionId=session_id,
                model=config.model,
                allowedTools=allowed_tools,
            ),
        )

        if not response.is_success:
            raise parse_error_response(response)

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
