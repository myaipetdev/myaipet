"""
PETAGEN Dreaming Cron
Scheduled task that triggers dream cycles for all active pets.
Runs every 24 hours (default 3 AM UTC) via asyncio scheduling.
"""

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select

from app.database import async_session
from app.models_pet import Pet
from app.services.dreaming_engine import dream_cycle

logger = logging.getLogger(__name__)

# Default: run at 3 AM UTC (configurable via DREAM_HOUR env var)
DEFAULT_DREAM_HOUR = 3


async def run_dream_cycle_for_all_pets() -> dict:
    """
    Iterate through all active pets and run dream_cycle for each.
    Error handling is per-pet — one pet failing doesn't stop others.
    Returns a summary dict.
    """
    logger.info("=" * 40)
    logger.info("DREAMING CRON: Starting dream cycle for all pets")
    logger.info("=" * 40)

    results = {
        "total_pets": 0,
        "dreams_created": 0,
        "skipped": 0,
        "errors": 0,
        "error_details": [],
    }

    async with async_session() as db:
        # Fetch all active pets
        result = await db.execute(
            select(Pet).where(Pet.is_active == True)  # noqa: E712
        )
        pets = result.scalars().all()
        results["total_pets"] = len(pets)

        logger.info(f"Found {len(pets)} active pets")

        for pet in pets:
            try:
                journal = await dream_cycle(pet, db)
                if journal is not None:
                    results["dreams_created"] += 1
                    logger.info(
                        f"  [OK] {pet.name} (id={pet.id}): "
                        f"tone={journal.emotional_tone}"
                    )
                else:
                    results["skipped"] += 1
                    logger.info(f"  [SKIP] {pet.name} (id={pet.id}): already dreamed today")
            except Exception as e:
                results["errors"] += 1
                error_msg = f"Pet {pet.id} ({pet.name}): {str(e)}"
                results["error_details"].append(error_msg)
                logger.error(f"  [ERR] {error_msg}", exc_info=True)
                # Continue to next pet — don't let one failure stop the batch

        # Commit all successful dreams in one transaction
        try:
            await db.commit()
            logger.info("Dream cycle batch committed successfully")
        except Exception as e:
            logger.error(f"Failed to commit dream cycle batch: {e}", exc_info=True)
            await db.rollback()
            results["errors"] = results["total_pets"]
            results["dreams_created"] = 0

    logger.info(
        f"DREAMING CRON complete: "
        f"{results['dreams_created']} dreams, "
        f"{results['skipped']} skipped, "
        f"{results['errors']} errors"
    )
    return results


def _seconds_until_next_dream_hour(dream_hour: int = DEFAULT_DREAM_HOUR) -> float:
    """Calculate seconds until the next occurrence of dream_hour UTC."""
    now = datetime.now(timezone.utc)
    # Target: today at dream_hour UTC
    target = now.replace(hour=dream_hour, minute=0, second=0, microsecond=0)
    if target <= now:
        # Already passed today — schedule for tomorrow
        from datetime import timedelta
        target += timedelta(days=1)
    delta = (target - now).total_seconds()
    return delta


async def dreaming_cron_loop(dream_hour: int = DEFAULT_DREAM_HOUR):
    """
    Long-running asyncio loop that triggers dream cycles at the configured hour.
    Designed to be run as an asyncio.create_task() from the FastAPI lifespan.
    """
    logger.info(
        f"Dreaming cron loop started — dreams scheduled at {dream_hour:02d}:00 UTC daily"
    )

    while True:
        try:
            # Sleep until the next dream time
            wait_seconds = _seconds_until_next_dream_hour(dream_hour)
            hours_until = wait_seconds / 3600
            logger.info(
                f"Dreaming cron: next run in {hours_until:.1f} hours "
                f"({dream_hour:02d}:00 UTC)"
            )
            await asyncio.sleep(wait_seconds)

            # Run the dream cycle
            await run_dream_cycle_for_all_pets()

        except asyncio.CancelledError:
            logger.info("Dreaming cron loop cancelled — shutting down")
            break
        except Exception as e:
            logger.error(f"Dreaming cron loop error: {e}", exc_info=True)
            # Wait 1 hour before retrying on unexpected errors
            await asyncio.sleep(3600)
