"""Koine client factory for creating client instances."""

from typing import Protocol, TypeVar

from pydantic import BaseModel

from .http import validate_config
from .object import GenerateObjectResult, generate_object
from .stream import stream_object, stream_text
from .stream.sse import HTTPStreamContext
from .stream.stream_object import HTTPObjectStreamContext
from .text import GenerateTextResult, generate_text
from .types import KoineConfig

T = TypeVar("T", bound=BaseModel)


class KoineClient(Protocol):
    """Koine client interface returned by create_koine.

    Provides methods for text generation, structured output, and streaming.
    """

    async def generate_text(
        self,
        *,
        prompt: str,
        system: str | None = None,
        session_id: str | None = None,
    ) -> GenerateTextResult:
        """Generate plain text response.

        Args:
            prompt: The user prompt to send
            system: Optional system prompt
            session_id: Optional session ID for conversation continuity

        Returns:
            GenerateTextResult with text, usage, and session_id
        """
        ...

    async def generate_object(
        self,
        *,
        prompt: str,
        schema: type[T],
        system: str | None = None,
        session_id: str | None = None,
    ) -> GenerateObjectResult[T]:
        """Generate structured JSON response.

        Args:
            prompt: The user prompt to send
            schema: Pydantic model class for response validation
            system: Optional system prompt
            session_id: Optional session ID for conversation continuity

        Returns:
            GenerateObjectResult with validated object, raw_text, usage, and session_id
        """
        ...

    def stream_text(
        self,
        *,
        prompt: str,
        system: str | None = None,
        session_id: str | None = None,
    ) -> HTTPStreamContext:
        """Stream text response.

        Must be used as an async context manager:

            async with koine.stream_text(prompt="Hello") as result:
                async for chunk in result.text_stream:
                    print(chunk)

        Args:
            prompt: The user prompt to send
            system: Optional system prompt
            session_id: Optional session ID for conversation continuity

        Returns:
            Async context manager that yields StreamTextResult
        """
        ...

    def stream_object(
        self,
        *,
        prompt: str,
        schema: type[T],
        system: str | None = None,
        session_id: str | None = None,
    ) -> HTTPObjectStreamContext[T]:
        """Stream structured JSON response.

        Must be used as an async context manager:

            async with koine.stream_object(prompt="...", schema=Model) as result:
                async for partial in result.partial_object_stream:
                    print(partial)

        Args:
            prompt: The user prompt describing what to extract
            schema: Pydantic model class for response validation
            system: Optional system prompt
            session_id: Optional session ID for conversation continuity

        Returns:
            Async context manager that yields StreamObjectResult[T]
        """
        ...


class _KoineClientImpl:
    """Implementation of KoineClient protocol."""

    def __init__(self, config: KoineConfig) -> None:
        self._config = config

    async def generate_text(
        self,
        *,
        prompt: str,
        system: str | None = None,
        session_id: str | None = None,
    ) -> GenerateTextResult:
        return await generate_text(
            self._config,
            prompt=prompt,
            system=system,
            session_id=session_id,
        )

    async def generate_object(
        self,
        *,
        prompt: str,
        schema: type[T],
        system: str | None = None,
        session_id: str | None = None,
    ) -> GenerateObjectResult[T]:
        return await generate_object(
            self._config,
            prompt=prompt,
            schema=schema,
            system=system,
            session_id=session_id,
        )

    def stream_text(
        self,
        *,
        prompt: str,
        system: str | None = None,
        session_id: str | None = None,
    ) -> HTTPStreamContext:
        return stream_text(
            self._config,
            prompt=prompt,
            system=system,
            session_id=session_id,
        )

    def stream_object(
        self,
        *,
        prompt: str,
        schema: type[T],
        system: str | None = None,
        session_id: str | None = None,
    ) -> HTTPObjectStreamContext[T]:
        return stream_object(
            self._config,
            prompt=prompt,
            schema=schema,
            system=system,
            session_id=session_id,
        )


def create_koine(config: KoineConfig) -> KoineClient:
    """Create a Koine client instance with the given configuration.

    Config is validated once at creation time, not on each method call.

    Args:
        config: Client configuration including base_url, auth_key, and timeout

    Returns:
        KoineClient with generate_text, stream_text, and generate_object methods

    Raises:
        KoineError: With code 'INVALID_CONFIG' if config is invalid

    Example:
        ```python
        from koine_sdk import create_koine, KoineConfig

        koine = create_koine(KoineConfig(
            base_url="http://localhost:3100",
            auth_key="your-api-key",
            timeout=300.0,
        ))

        result = await koine.generate_text(prompt="Hello!")
        print(result.text)
        ```
    """
    # Validate config once at creation time
    validate_config(config)
    return _KoineClientImpl(config)  # type: ignore[return-value]
