"""
stream_object.py - stream_object example with real-time partial objects

Demonstrates streaming structured data with progressive updates.
Watch as the travel itinerary builds incrementally.

Run from packages/sdks/python:
    uv run python examples/stream_object.py
"""

import asyncio
import os
import sys

from dotenv import find_dotenv, load_dotenv
from pydantic import BaseModel, Field

from koine_sdk import KoineConfig, KoineError, create_koine

load_dotenv(find_dotenv())


class Activity(BaseModel):
    """An activity in the itinerary."""

    time: str = Field(description="Time of day")
    activity: str = Field(description="What to do")
    location: str = Field(description="Where")
    tips: str = Field(description="Helpful tips")


class Day(BaseModel):
    """A day in the itinerary."""

    day: int = Field(description="Day number")
    title: str = Field(description="Theme for the day")
    activities: list[Activity] = Field(description="Activities for the day")


class TravelItinerary(BaseModel):
    """A complete travel itinerary."""

    destination: str = Field(description="The travel destination")
    duration: str = Field(description="Trip duration")
    best_time_to_visit: str = Field(
        alias="bestTimeToVisit", description="Recommended season"
    )
    days: list[Day] = Field(description="Day-by-day itinerary")
    packing_list: list[str] = Field(
        alias="packingList", description="Essential items to pack"
    )
    estimated_budget: str = Field(
        alias="estimatedBudget", description="Approximate budget range"
    )


async def main() -> None:
    auth_key = os.environ.get("CLAUDE_CODE_GATEWAY_API_KEY")
    if not auth_key:
        raise RuntimeError("CLAUDE_CODE_GATEWAY_API_KEY is required in .env")

    config = KoineConfig(
        base_url=f"http://localhost:{os.environ.get('GATEWAY_PORT', '3100')}",
        auth_key=auth_key,
        timeout=300.0,
    )

    koine = create_koine(config)

    print("Streaming travel itinerary...\n")
    print("Watch as the itinerary builds incrementally:\n")

    async with koine.stream_object(
        prompt="""Create a detailed 3-day travel itinerary for Tokyo, Japan.
Include 2-3 activities per day with specific times, locations, and practical tips.
Make sure to include a packing list and budget estimate.""",
        schema=TravelItinerary,
    ) as result:
        total_updates = 0
        display_count = 0
        last_day_count = 0

        async for partial in result.partial_object_stream:
            total_updates += 1

            # Show progress as days are added
            if isinstance(partial, dict):
                current_days = len(partial.get("days", []) or [])
                destination = partial.get("destination")
            else:
                current_days = len(getattr(partial, "days", []) or [])
                destination = getattr(partial, "destination", None)

            if current_days != last_day_count or display_count == 0:
                display_count += 1
                print(f"[Update {display_count}] Building itinerary...")
                if destination:
                    print(f"  Destination: {destination}")
                if current_days > 0:
                    print(f"  Days planned: {current_days}/3")
                print()
                last_day_count = current_days

        # Get the final validated object
        itinerary = await result.object()

        print("=" * 60)
        print("COMPLETE TRAVEL ITINERARY")
        print("=" * 60)
        print()

        print(f"Destination: {itinerary.destination}")
        print(f"Duration: {itinerary.duration}")
        print(f"Best time to visit: {itinerary.best_time_to_visit}")
        print(f"Estimated budget: {itinerary.estimated_budget}")
        print()

        for day in itinerary.days:
            print(f"--- Day {day.day}: {day.title} ---")
            for activity in day.activities:
                print(f"  {activity.time} - {activity.activity}")
                print(f"    Location: {activity.location}")
                print(f"    Tip: {activity.tips}")
            print()

        print("Packing list:")
        for item in itinerary.packing_list:
            print(f"  - {item}")

        usage = await result.usage()
        print("\n--- Debug Info ---")
        print(f"User-visible updates: {display_count}")
        print(f"Total stream updates: {total_updates}")
        print(f"Total tokens: {usage.total_tokens}")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KoineError as e:
        print(f"\nKoine Error [{e.code}]: {e}", file=sys.stderr)
        if e.code == "VALIDATION_ERROR":
            print("  -> The response didn't match the expected schema", file=sys.stderr)
            if e.raw_text:
                print(f"  -> Raw response: {e.raw_text}", file=sys.stderr)
        sys.exit(1)
    except ConnectionRefusedError:
        print("\nConnection refused. Is the gateway running?", file=sys.stderr)
        sys.exit(1)
