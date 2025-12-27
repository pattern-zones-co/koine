"""
Koine SDK

An async Python client for interacting with Koine gateway services.

Example:
    from koine_sdk import create_koine, KoineConfig

    koine = create_koine(KoineConfig(
        base_url="http://localhost:3100",
        timeout=300.0,
        auth_key="your-api-key",
        model="sonnet",
    ))

    result = await koine.generate_text(prompt="Hello!")
    print(result.text)
"""

# x-release-please-start-version
__version__ = "2.1.0"
# x-release-please-end

# Client factory (primary API)
from .client import KoineClient, create_koine

# Errors
from .errors import KoineError, KoineErrorCode

# Types
from .types import (
    GenerateObjectResult,
    GenerateTextResult,
    KoineConfig,
    KoineUsage,
    StreamObjectResult,
    StreamTextResult,
)

__all__ = [
    "GenerateObjectResult",
    "GenerateTextResult",
    "KoineClient",
    "KoineConfig",
    "KoineError",
    "KoineErrorCode",
    "KoineUsage",
    "StreamObjectResult",
    "StreamTextResult",
    "create_koine",
]
