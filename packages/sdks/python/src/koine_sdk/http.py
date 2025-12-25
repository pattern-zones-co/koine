"""HTTP utilities for Koine SDK."""

from typing import Any

import httpx

from .errors import KoineError, KoineErrorCode, to_error_code
from .types import KoineConfig


def validate_config(config: KoineConfig) -> None:
    """Validate config parameters before making requests.

    Args:
        config: The configuration to validate

    Raises:
        KoineError: With code 'INVALID_CONFIG' if config is invalid
    """
    if not config.base_url:
        raise KoineError("base_url is required", "INVALID_CONFIG")
    if not config.auth_key:
        raise KoineError("auth_key is required", "INVALID_CONFIG")
    if config.timeout <= 0:
        raise KoineError("timeout must be a positive number", "INVALID_CONFIG")


async def safe_fetch(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    **kwargs: Any,
) -> httpx.Response:
    """Wraps httpx requests with KoineError for consistent error handling.

    Args:
        client: The httpx async client
        method: HTTP method (GET, POST, etc.)
        url: The URL to request
        **kwargs: Additional arguments passed to client.request

    Returns:
        The httpx Response

    Raises:
        KoineError: With appropriate code for timeout, network errors, etc.
    """
    try:
        response = await client.request(method, url, **kwargs)
        return response
    except httpx.TimeoutException as e:
        raise KoineError(
            f"Request timed out: {e}",
            "TIMEOUT",
        ) from e
    except httpx.NetworkError as e:
        raise KoineError(
            f"Network error: {e}",
            "NETWORK_ERROR",
        ) from e
    except httpx.HTTPError as e:
        raise KoineError(
            f"HTTP error: {e}",
            "NETWORK_ERROR",
        ) from e


def build_headers(auth_key: str) -> dict[str, str]:
    """Build standard request headers.

    Args:
        auth_key: The authentication key

    Returns:
        Headers dict with Content-Type and Authorization
    """
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_key}",
    }


def build_request_body(**kwargs: Any) -> dict[str, Any]:
    """Build request body, omitting None values.

    Args:
        **kwargs: Key-value pairs for the request body

    Returns:
        Dict with None values filtered out
    """
    return {k: v for k, v in kwargs.items() if v is not None}


def parse_error_response(
    response: httpx.Response,
    fallback_code: KoineErrorCode = "HTTP_ERROR",
) -> KoineError:
    """Parse error response from gateway, handling non-JSON gracefully.

    Args:
        response: The HTTP response to parse
        fallback_code: The error code to use if parsing fails

    Returns:
        A KoineError with the parsed error information
    """
    from ._types import GatewayErrorResponse

    try:
        data = response.json()
        error_resp = GatewayErrorResponse.model_validate(data)
        return KoineError(
            error_resp.error,
            to_error_code(error_resp.code, fallback_code),
            error_resp.rawText,
        )
    except Exception:
        return KoineError(
            f"HTTP {response.status_code} {response.reason_phrase}",
            fallback_code,
        )
