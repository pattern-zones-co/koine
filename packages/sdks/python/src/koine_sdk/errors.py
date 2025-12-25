"""Custom error class and error codes for Koine SDK."""

from typing import Literal

# All known error codes (SDK-generated + gateway-returned)
KoineErrorCode = Literal[
    # SDK-generated errors
    "HTTP_ERROR",
    "INVALID_RESPONSE",
    "INVALID_CONFIG",
    "VALIDATION_ERROR",
    "STREAM_ERROR",
    "SSE_PARSE_ERROR",
    "NO_SESSION",
    "NO_USAGE",
    "NO_RESPONSE_BODY",
    "TIMEOUT",
    "NETWORK_ERROR",
    # Gateway-returned errors
    "INVALID_PARAMS",
    "AUTH_ERROR",
    "UNAUTHORIZED",
    "SERVER_ERROR",
    "SCHEMA_ERROR",
    "RATE_LIMITED",
    "CONTEXT_OVERFLOW",
]

# Set for runtime validation
KNOWN_ERROR_CODES: frozenset[str] = frozenset(
    [
        "HTTP_ERROR",
        "INVALID_RESPONSE",
        "INVALID_CONFIG",
        "VALIDATION_ERROR",
        "STREAM_ERROR",
        "SSE_PARSE_ERROR",
        "NO_SESSION",
        "NO_USAGE",
        "NO_RESPONSE_BODY",
        "TIMEOUT",
        "NETWORK_ERROR",
        "INVALID_PARAMS",
        "AUTH_ERROR",
        "UNAUTHORIZED",
        "SERVER_ERROR",
        "SCHEMA_ERROR",
        "RATE_LIMITED",
        "CONTEXT_OVERFLOW",
    ]
)


def to_error_code(code: str | None, fallback: KoineErrorCode) -> KoineErrorCode:
    """Coerce an API error code to a known KoineErrorCode.

    Args:
        code: The error code from the API response (may be unknown)
        fallback: The fallback error code if code is unknown or None

    Returns:
        A valid KoineErrorCode
    """
    if code and code in KNOWN_ERROR_CODES:
        return code  # type: ignore[return-value]
    return fallback


class KoineError(Exception):
    """Custom error class for Koine client errors.

    Attributes:
        code: Machine-readable error code for programmatic handling
        raw_text: Optional raw response text for debugging validation failures
    """

    def __init__(
        self, message: str, code: KoineErrorCode, raw_text: str | None = None
    ) -> None:
        super().__init__(message)
        self.code: KoineErrorCode = code
        self.raw_text: str | None = raw_text

    def __repr__(self) -> str:
        return f"KoineError({self.code!r}, {str(self)!r})"
