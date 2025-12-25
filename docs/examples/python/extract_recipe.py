"""
extract_recipe.py - generate_object example with Pydantic schema

Demonstrates structured data extraction using Pydantic models for type-safe output.

Run from packages/sdks/python:
    uv run python ../../../docs/examples/python/extract_recipe.py
"""

import asyncio
import json
import os
import sys

from dotenv import find_dotenv, load_dotenv
from pydantic import BaseModel, Field

from koine_sdk import KoineConfig, KoineError, generate_object

load_dotenv(find_dotenv())


class Recipe(BaseModel):
    """Schema for a recipe."""

    name: str = Field(description="Name of the recipe")
    ingredients: list[str] = Field(description="List of ingredients")
    steps: list[str] = Field(description="Cooking instructions")
    prep_time: int = Field(description="Preparation time in minutes")
    cook_time: int = Field(description="Cooking time in minutes")


async def main() -> None:
    auth_key = os.environ.get("CLAUDE_CODE_GATEWAY_API_KEY")
    if not auth_key:
        raise RuntimeError("CLAUDE_CODE_GATEWAY_API_KEY is required in .env")

    config = KoineConfig(
        base_url=f"http://localhost:{os.environ.get('GATEWAY_PORT', '3100')}",
        auth_key=auth_key,
        timeout=300.0,
    )

    print("Extracting recipe from natural language...\n")

    result = await generate_object(
        config,
        prompt="""Extract the recipe from this description:

Make classic pancakes by mixing 1 cup flour, 1 egg, 1 cup milk, and 2 tbsp butter.
First combine the dry ingredients, then whisk in the wet ingredients until smooth.
Heat a griddle and pour 1/4 cup batter per pancake. Cook until bubbles form, flip,
and cook until golden. Takes about 5 minutes to prep and 15 minutes to cook.""",
        schema=Recipe,
    )

    print("Recipe extracted:")
    print(json.dumps(result.object.model_dump(), indent=2))
    print(
        f"\nTokens used: {result.usage.total_tokens} "
        f"(input: {result.usage.input_tokens}, output: {result.usage.output_tokens})"
    )


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KoineError as e:
        print(f"\nKoine Error [{e.code}]: {e}", file=sys.stderr)
        if e.code == "VALIDATION_ERROR":
            print("  → The response didn't match the expected schema", file=sys.stderr)
            if e.raw_text:
                print(f"  → Raw response: {e.raw_text}", file=sys.stderr)
        elif e.code == "HTTP_ERROR" and "401" in str(e):
            print(
                "  → Check that CLAUDE_CODE_GATEWAY_API_KEY is correct", file=sys.stderr
            )
        sys.exit(1)
    except ConnectionRefusedError:
        print("\nConnection refused. Is the gateway running?", file=sys.stderr)
        print(
            "  → Start it with: docker run -d --env-file .env -p 3100:3100 "
            "ghcr.io/pattern-zones-co/koine:latest",
            file=sys.stderr,
        )
        sys.exit(1)
