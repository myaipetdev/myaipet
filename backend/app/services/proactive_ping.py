"""
PETAGEN Proactive Ping System
Notification engine that evaluates when a pet should proactively reach out
to its owner. Monitors hunger, loneliness, post-creation excitement, and
other emotional states to generate contextual, personality-driven messages.
"""

import logging
import random
from datetime import datetime, timezone
from typing import List, Optional, Dict

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models_pet import Pet, PetNotification
from app.services.pet_engine import calculate_mood, _clamp

logger = logging.getLogger(__name__)


# -----------------------------------------------
#  Ping cooldowns (prevent notification spam)
# -----------------------------------------------

# Minimum hours between pings of the same type
PING_COOLDOWNS = {
    "hunger": 2.0,      # Don't nag about food more than once per 2 hours
    "lonely": 4.0,      # Loneliness pings at most every 4 hours
    "excited": 1.0,     # Excitement pings can be more frequent
    "creation": 0.5,    # Creation notifications come right away
    "low_energy": 3.0,  # Energy warnings spaced out
    "milestone": 0.0,   # Milestones always go through
}

# -----------------------------------------------
#  Hunger notification messages
# -----------------------------------------------

HUNGER_MESSAGES = {
    "friendly": [
        "{name}'s tummy is rumbling! They're looking at you with big hopeful eyes~",
        "Hey! {name} is getting pretty hungry. Maybe it's feeding time?",
        "{name} nudges their empty food bowl toward you gently.",
    ],
    "playful": [
        "{name} dramatically collapses next to their food bowl. THE HUNGER!",
        "FOOD! {name} needs FOOD! They're doing the hungry dance!",
        "{name} is trying to eat their own paw. Probably time for real food.",
    ],
    "shy": [
        "{name} is sitting quietly by the food bowl... they don't want to bother you, but...",
        "Um... {name} is a little hungry. Just a tiny bit. If it's not too much trouble...",
        "{name} glances at the food bowl, then at you, then quickly looks away.",
    ],
    "brave": [
        "{name} DEMANDS sustenance! A warrior cannot fight on an empty stomach!",
        "{name} marches to the food bowl and stares at it intensely, willing food to appear.",
        "Fuel is needed! {name} stands at attention by the food station!",
    ],
    "lazy": [
        "{name} is too hungry to even yawn properly. That's saying something.",
        "The only thing that could make {name} move right now is food. Specifically, food right here.",
        "{name} opens one eye. Points at food bowl. Closes eye. Message delivered.",
    ],
}

# -----------------------------------------------
#  Low energy messages
# -----------------------------------------------

LOW_ENERGY_MESSAGES = {
    "friendly": [
        "{name} is running low on energy. A little rest would help!",
        "{name} yawns and stretches. They've had a busy day!",
    ],
    "playful": [
        "Even {name} has limits! They're zonked out. Maybe let them recharge?",
        "{name} tried to do a flip but just... flopped. Energy depleted!",
    ],
    "shy": [
        "{name} has gone very quiet. They need some rest, it seems.",
        "{name} is curled up in their favorite corner, barely keeping eyes open.",
    ],
    "brave": [
        "Even heroes need rest. {name} is fighting to stay awake.",
        "{name} stands guard but keeps nodding off. Time for a strategic retreat to bed.",
    ],
    "lazy": [
        "{name} has somehow become EVEN LAZIER. Didn't think it was possible.",
        "{name} is now a small, breathing loaf. Zero energy remaining.",
    ],
}


# -----------------------------------------------
#  Core ping evaluation
# -----------------------------------------------

async def _get_last_ping_time(
    db: AsyncSession, pet_id: int, notification_type: str
) -> Optional[datetime]:
    """Get the timestamp of the most recent notification of a given type."""
    result = await db.execute(
        select(PetNotification.created_at)
        .where(
            PetNotification.pet_id == pet_id,
            PetNotification.notification_type == notification_type,
        )
        .order_by(PetNotification.created_at.desc())
        .limit(1)
    )
    row = result.scalar_one_or_none()
    return row


async def _cooldown_elapsed(
    db: AsyncSession, pet_id: int, notification_type: str
) -> bool:
    """Check whether enough time has passed since the last ping of this type."""
    cooldown_hours = PING_COOLDOWNS.get(notification_type, 2.0)
    if cooldown_hours <= 0:
        return True  # No cooldown

    last_ping = await _get_last_ping_time(db, pet_id, notification_type)
    if last_ping is None:
        return True

    if last_ping.tzinfo is None:
        last_ping = last_ping.replace(tzinfo=timezone.utc)

    now = datetime.now(timezone.utc)
    hours_since = (now - last_ping).total_seconds() / 3600.0
    return hours_since >= cooldown_hours


def _hours_since_interaction(pet: Pet) -> float:
    """Calculate hours since the pet last had any interaction."""
    now = datetime.now(timezone.utc)
    last = pet.last_interaction_at or pet.updated_at
    if last is None:
        return 0.0
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    return (now - last).total_seconds() / 3600.0


def _pick_message(templates: Dict[str, List[str]], personality: str, name: str) -> str:
    """Select and format a personality-appropriate message."""
    options = templates.get(personality, templates.get("friendly", ["{name} needs your attention."]))
    template = random.choice(options)
    return template.format(name=name)


async def check_and_ping(pet: Pet, db: AsyncSession) -> List[PetNotification]:
    """
    Evaluate whether the pet should proactively reach out to its owner.

    Checks multiple trigger conditions and creates notifications for each
    that fires. Returns a list of newly created notifications.

    Trigger conditions:
    - Hunger > 70: the pet is getting uncomfortably hungry
    - No interaction for 6+ hours: the pet is lonely
    - Energy < 20: the pet is running on fumes
    """
    created_notifications: List[PetNotification] = []

    # --- Hunger ping ---
    if pet.hunger > 70:
        if await _cooldown_elapsed(db, pet.id, "hunger"):
            msg = _pick_message(HUNGER_MESSAGES, pet.personality_type, pet.name)
            notif = PetNotification(
                pet_id=pet.id,
                notification_type="hunger",
                message=msg,
            )
            db.add(notif)
            created_notifications.append(notif)
            logger.info(f"Hunger ping sent for pet '{pet.name}' (hunger={pet.hunger})")

    # --- Loneliness ping ---
    hours_alone = _hours_since_interaction(pet)
    if hours_alone >= 6.0:
        if await _cooldown_elapsed(db, pet.id, "lonely"):
            loneliness_messages = {
                "friendly": [
                    "It's been a while! {name} keeps checking if you're around.",
                    "{name} hasn't seen you in {hours} hours. They miss you!",
                ],
                "playful": [
                    "{name} has been alone for {hours} hours and has rearranged everything out of boredom!",
                    "HELLO?? {name} has been waiting for {hours} WHOLE HOURS! That's like {hours} dog years!",
                ],
                "shy": [
                    "{name} has been sitting by the window for {hours} hours... just waiting quietly.",
                    "It's okay if you're busy... {name} just wanted you to know it's been {hours} hours.",
                ],
                "brave": [
                    "{name} stood watch for {hours} hours. Even they're starting to wonder where you are.",
                    "After {hours} hours, {name} has begun composing a ballad about your absence. It's dramatic.",
                ],
                "lazy": [
                    "{name} has slept through {hours} hours. Even they're starting to get bored of napping.",
                    "It's been {hours} hours. {name} has licked the same spot clean three times. Send help.",
                ],
            }
            options = loneliness_messages.get(
                pet.personality_type, loneliness_messages["friendly"]
            )
            template = random.choice(options)
            msg = template.format(name=pet.name, hours=int(hours_alone))
            notif = PetNotification(
                pet_id=pet.id,
                notification_type="lonely",
                message=msg,
            )
            db.add(notif)
            created_notifications.append(notif)
            logger.info(
                f"Loneliness ping for pet '{pet.name}' "
                f"(hours_alone={hours_alone:.1f})"
            )

    # --- Low energy ping ---
    if pet.energy < 20:
        if await _cooldown_elapsed(db, pet.id, "low_energy"):
            msg = _pick_message(LOW_ENERGY_MESSAGES, pet.personality_type, pet.name)
            notif = PetNotification(
                pet_id=pet.id,
                notification_type="low_energy",
                message=msg,
            )
            db.add(notif)
            created_notifications.append(notif)
            logger.info(f"Low energy ping for pet '{pet.name}' (energy={pet.energy})")

    if created_notifications:
        await db.commit()

    return created_notifications
