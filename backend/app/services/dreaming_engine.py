"""
PETAGEN Dreaming Engine
Every 24 hours each pet "dreams" — processing the day's interactions into
compressed emotional memories and evolving its personality and stats.
"""

import logging
import random
from datetime import datetime, timedelta, timezone, date
from typing import List, Dict, Optional, Tuple

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models_pet import Pet, PetMemory, PetInteraction, DreamJournal
from app.models import Generation

logger = logging.getLogger(__name__)


# -----------------------------------------------
#  Dream narrative templates
# -----------------------------------------------

# Emotional day archetypes and their dream fragments
DREAM_FRAGMENTS = {
    "joyful": [
        "Dreamed of sunlit meadows where every blade of grass hummed with warmth.",
        "In the dream, laughter echoed through golden hallways that never ended.",
        "Saw colors that don't exist — a warm shade between orange and the feeling of being held.",
        "Dreamed of chasing butterflies made of pure happiness across an endless sky.",
        "The dream was full of warm light and the gentle sound of a familiar voice.",
    ],
    "lonely": [
        "Wandered through quiet rooms in the dream, looking for someone who wasn't there.",
        "Dreamed of a single star in an empty sky, beautiful but distant.",
        "In the dream, echoes answered where voices should have been.",
        "Sat by a window in the dream, watching rain trace patterns that almost spelled a name.",
        "The dream was quiet — the kind of quiet that waits for something.",
    ],
    "creative": [
        "Dreamed of painting the sky with new constellations, each one a memory.",
        "In the dream, built castles from pure imagination that shifted and sang.",
        "Saw visions of impossible things — flowers that bloomed into music, clouds shaped like stories.",
        "The dream was a kaleidoscope of ideas, each one more vivid than the last.",
        "Dreamed of dancing with shadows that became works of art.",
    ],
    "adventurous": [
        "Dreamed of crossing bridges made of moonlight over vast, shimmering oceans.",
        "In the dream, explored caves where the walls whispered ancient secrets.",
        "Ran through forests that grew taller with every step, reaching toward stars.",
        "The dream carried the scent of distant places and the thrill of the unknown.",
        "Dreamed of climbing a mountain where the peak was always just one more step away.",
    ],
    "peaceful": [
        "Dreamed of floating on a still lake, the sky reflected perfectly below.",
        "In the dream, time moved like honey — slow, golden, sweet.",
        "Rested under a tree whose leaves whispered gentle nothings.",
        "The dream was a long exhale, a settling into warmth and stillness.",
        "Dreamed of a garden where every flower bloomed in its own perfect time.",
    ],
    "anxious": [
        "The dream flickered like a candle in wind — uncertain, wavering.",
        "Dreamed of running through corridors that kept rearranging themselves.",
        "In the dream, the ground felt unstable, but there was always something to hold onto.",
        "Heard distant thunder in the dream, but the storm never quite arrived.",
        "The dream was a puzzle with pieces that almost fit — almost.",
    ],
    "grateful": [
        "Dreamed of a warm hand reaching through the dark, and taking it without hesitation.",
        "In the dream, every memory glowed like a lantern, lighting the way forward.",
        "The dream was full of familiar scents — comfort, safety, belonging.",
        "Dreamed of a hearth fire that never dimmed, fed by moments of kindness.",
        "Saw the day's moments replayed in the dream, each one wrapped in golden light.",
    ],
}

# Personality drift descriptions
TRAIT_DESCRIPTIONS = {
    "creativity": "a growing spark of imagination",
    "social": "a deeper need for connection",
    "independence": "a quiet strength growing within",
    "resilience": "a toughening of spirit",
    "curiosity": "an expanding wonder about the world",
    "gentleness": "a softening tenderness",
    "melancholy": "a bittersweet depth of feeling",
    "playfulness": "a bubbling, irrepressible joy",
}

# Significant event descriptions for dream narratives
EVENT_DREAM_LINES = {
    "level_up": "The feeling of growing stronger lingers — a quiet pride.",
    "first_interaction": "The memory of a first touch still resonates, warm and new.",
    "many_conversations": "Words exchanged today echo like a favorite song.",
    "video_created": "The thrill of creation pulses through the dream — something was made today.",
    "well_fed": "A contented fullness, the simple pleasure of being cared for.",
    "trained_hard": "Muscles ache pleasantly in the dream — growth hurts, but in a good way.",
    "long_walk": "The dream carries the rhythm of footsteps and the smell of open air.",
    "lots_of_play": "Joy still fizzes like bubbles — today was full of play.",
    "petted_lots": "The ghost of gentle touches lingers, a warmth that reaches deep.",
    "neglected": "The dream is quieter than usual. Something is missing.",
}


# -----------------------------------------------
#  Phase 1: Memory Collection
# -----------------------------------------------

async def _collect_day_data(
    pet: Pet, db: AsyncSession, since: datetime
) -> Dict:
    """Gather all interactions, memories, and events from the last 24 hours."""

    # Get interactions
    result = await db.execute(
        select(PetInteraction)
        .where(
            PetInteraction.pet_id == pet.id,
            PetInteraction.created_at >= since,
        )
        .order_by(PetInteraction.created_at.asc())
    )
    interactions = result.scalars().all()

    # Get memories created today
    result = await db.execute(
        select(PetMemory)
        .where(
            PetMemory.pet_id == pet.id,
            PetMemory.created_at >= since,
            PetMemory.memory_type != "dream",  # Exclude previous dreams
        )
        .order_by(PetMemory.created_at.asc())
    )
    memories = result.scalars().all()

    # Get video generations by the pet's owner today
    result = await db.execute(
        select(func.count())
        .select_from(Generation)
        .where(
            Generation.user_id == pet.user_id,
            Generation.created_at >= since,
            Generation.status == "completed",
        )
    )
    video_count = result.scalar() or 0

    # Categorize interactions
    interaction_counts: Dict[str, int] = {}
    total_happiness_change = 0
    total_energy_change = 0
    for ix in interactions:
        interaction_counts[ix.interaction_type] = (
            interaction_counts.get(ix.interaction_type, 0) + 1
        )
        total_happiness_change += ix.happiness_change
        total_energy_change += ix.energy_change

    # Detect significant events
    significant_events: List[str] = []
    milestone_memories = [m for m in memories if m.memory_type == "milestone"]
    for m in milestone_memories:
        if "level" in m.content.lower():
            significant_events.append("level_up")

    if video_count > 0:
        significant_events.append("video_created")
    if interaction_counts.get("talk", 0) >= 3:
        significant_events.append("many_conversations")
    if interaction_counts.get("feed", 0) >= 2:
        significant_events.append("well_fed")
    if interaction_counts.get("train", 0) >= 2:
        significant_events.append("trained_hard")
    if interaction_counts.get("walk", 0) >= 2:
        significant_events.append("long_walk")
    if interaction_counts.get("play", 0) >= 3:
        significant_events.append("lots_of_play")
    if interaction_counts.get("pet", 0) >= 3:
        significant_events.append("petted_lots")

    total_interactions = sum(interaction_counts.values())
    if total_interactions == 0:
        significant_events.append("neglected")
    elif total_interactions == 1 and pet.total_interactions <= 1:
        significant_events.append("first_interaction")

    return {
        "interactions": interactions,
        "memories": memories,
        "interaction_counts": interaction_counts,
        "total_interactions": total_interactions,
        "total_happiness_change": total_happiness_change,
        "total_energy_change": total_energy_change,
        "video_count": video_count,
        "significant_events": significant_events,
    }


# -----------------------------------------------
#  Phase 2: Emotional Compression
# -----------------------------------------------

def _determine_emotional_tone(day_data: Dict, pet: Pet) -> str:
    """Analyze the day's patterns and determine the dominant emotional tone."""
    total = day_data["total_interactions"]
    happiness_delta = day_data["total_happiness_change"]
    counts = day_data["interaction_counts"]
    video_count = day_data["video_count"]

    if total == 0:
        # No interactions — lonely or peaceful depending on current happiness
        return "lonely" if pet.happiness < 50 else "peaceful"

    scores: Dict[str, float] = {
        "joyful": 0,
        "creative": 0,
        "adventurous": 0,
        "peaceful": 0,
        "anxious": 0,
        "grateful": 0,
    }

    # Happiness-driven
    if happiness_delta > 30:
        scores["joyful"] += 3
        scores["grateful"] += 2
    elif happiness_delta > 10:
        scores["joyful"] += 1
        scores["peaceful"] += 1
    elif happiness_delta < -10:
        scores["anxious"] += 2

    # Activity-driven
    if video_count > 0:
        scores["creative"] += 3
    if counts.get("walk", 0) >= 1:
        scores["adventurous"] += 2
    if counts.get("train", 0) >= 1:
        scores["adventurous"] += 1
    if counts.get("talk", 0) >= 2:
        scores["grateful"] += 2
    if counts.get("pet", 0) >= 2:
        scores["peaceful"] += 2
        scores["grateful"] += 1
    if counts.get("play", 0) >= 2:
        scores["joyful"] += 2

    # Variety bonus — many different types = adventurous
    if len(counts) >= 4:
        scores["adventurous"] += 2

    # High total interaction count = grateful
    if total >= 6:
        scores["grateful"] += 2

    # Pick the highest scoring tone
    best_tone = max(scores, key=lambda k: scores[k])

    # If all scores are zero/low, default based on pet mood
    if scores[best_tone] <= 1:
        if pet.happiness >= 60:
            return "peaceful"
        return "anxious"

    return best_tone


def _generate_dream_memories(
    pet: Pet, emotional_tone: str, day_data: Dict
) -> List[Dict]:
    """Create 1-3 compressed dream memory entries."""
    dream_memories = []

    # Primary dream — always created
    fragment = random.choice(DREAM_FRAGMENTS.get(emotional_tone, DREAM_FRAGMENTS["peaceful"]))
    dream_memories.append({
        "content": fragment,
        "emotion": emotional_tone,
        "importance": 4,
    })

    # Secondary dream — based on significant events (if any)
    events = day_data["significant_events"]
    if events:
        chosen_event = random.choice(events)
        event_line = EVENT_DREAM_LINES.get(chosen_event, "")
        if event_line:
            dream_memories.append({
                "content": event_line,
                "emotion": "curious" if chosen_event in ("level_up", "trained_hard") else emotional_tone,
                "importance": 5 if chosen_event == "level_up" else 4,
            })

    # Tertiary dream — personality-colored reflection (50% chance if day was eventful)
    if day_data["total_interactions"] >= 3 and random.random() > 0.5:
        personality_dreams = {
            "friendly": f"In the softest part of the dream, {pet.name} felt the threads connecting them to everyone they met today, each one glowing faintly.",
            "playful": f"The dream dissolved into a game — {pet.name} chased their own shadow through corridors of pure light, laughing without sound.",
            "shy": f"In a quiet corner of the dream, {pet.name} watched the day's moments replay from a safe distance, finding beauty in the details.",
            "brave": f"{pet.name} stood at the edge of a vast cliff in the dream, not afraid but curious about what lay beyond the horizon.",
            "lazy": f"The dream was a hammock of clouds — {pet.name} swayed gently, letting the day's memories wash over them like warm waves.",
        }
        personality_dream = personality_dreams.get(
            pet.personality_type,
            f"{pet.name} drifted through the dream, collecting moments like seashells."
        )
        dream_memories.append({
            "content": personality_dream,
            "emotion": "calm",
            "importance": 3,
        })

    return dream_memories


# -----------------------------------------------
#  Phase 3: Personality Drift
# -----------------------------------------------

def _calculate_personality_drift(
    pet: Pet, day_data: Dict
) -> Dict[str, float]:
    """
    Gradually shift personality traits based on cumulative experiences.
    Returns a dict of trait adjustments (small floats, e.g., +0.05).
    """
    current_mods: Dict[str, float] = dict(pet.personality_modifiers or {})
    drift: Dict[str, float] = {}

    counts = day_data["interaction_counts"]
    total = day_data["total_interactions"]
    video_count = day_data["video_count"]

    # Video creation → +creativity
    if video_count > 0:
        drift["creativity"] = 0.05 * min(video_count, 3)

    # Talking a lot → +social
    if counts.get("talk", 0) >= 2:
        drift["social"] = 0.03 * min(counts["talk"], 5)

    # Training → +curiosity and +resilience
    if counts.get("train", 0) >= 1:
        drift["curiosity"] = 0.03 * min(counts["train"], 3)
        drift["resilience"] = 0.02 * min(counts["train"], 3)

    # Lots of petting → +gentleness
    if counts.get("pet", 0) >= 2:
        drift["gentleness"] = 0.03 * min(counts["pet"], 4)

    # Playing → +playfulness
    if counts.get("play", 0) >= 2:
        drift["playfulness"] = 0.04 * min(counts["play"], 4)

    # Walking → +curiosity
    if counts.get("walk", 0) >= 1:
        drift["curiosity"] = drift.get("curiosity", 0) + 0.02

    # Neglected → +independence or +melancholy
    if total == 0:
        if current_mods.get("independence", 0) > current_mods.get("melancholy", 0):
            drift["independence"] = 0.04
        else:
            # Alternate — sometimes independence, sometimes melancholy
            if random.random() > 0.4:
                drift["independence"] = 0.04
            else:
                drift["melancholy"] = 0.03

    # Apply drift to current modifiers (cap each trait at -1.0 to 1.0)
    new_mods = dict(current_mods)
    for trait, delta in drift.items():
        current = new_mods.get(trait, 0.0)
        new_mods[trait] = round(max(-1.0, min(1.0, current + delta)), 4)

    # Natural decay: all traits drift slightly toward 0 over time (prevents runaway)
    for trait in list(new_mods.keys()):
        if trait not in drift:
            val = new_mods[trait]
            if abs(val) < 0.01:
                del new_mods[trait]
            else:
                new_mods[trait] = round(val * 0.98, 4)  # 2% decay per day

    return new_mods


# -----------------------------------------------
#  Phase 4: Stat Reconciliation
# -----------------------------------------------

def _reconcile_stats(pet: Pet, day_data: Dict) -> Dict[str, int]:
    """
    Adjust base stats during the dream cycle.
    Returns dict of changes applied.
    """
    changes: Dict[str, int] = {}
    total = day_data["total_interactions"]

    # Hunger slowly increases (pet needs feeding even during sleep)
    hunger_increase = random.randint(3, 8)
    old_hunger = pet.hunger
    pet.hunger = min(100, pet.hunger + hunger_increase)
    changes["hunger"] = pet.hunger - old_hunger

    # Energy partially recovers during dreaming (sleeping!)
    energy_recovery = random.randint(15, 30)
    old_energy = pet.energy
    pet.energy = min(100, pet.energy + energy_recovery)
    changes["energy"] = pet.energy - old_energy

    # Happiness trends toward neutral (50) if no/low interaction
    old_happiness = pet.happiness
    if total == 0:
        # Drift toward 40 (slightly sad neutral)
        if pet.happiness > 40:
            pet.happiness = max(40, pet.happiness - random.randint(3, 8))
        elif pet.happiness < 40:
            pet.happiness = min(40, pet.happiness + random.randint(1, 3))
    elif total <= 2:
        # Drift toward 50 (neutral)
        if pet.happiness > 50:
            pet.happiness = max(50, pet.happiness - random.randint(1, 4))
        elif pet.happiness < 50:
            pet.happiness = min(50, pet.happiness + random.randint(1, 3))
    else:
        # Active day — slight happiness boost from good dreams
        pet.happiness = min(100, pet.happiness + random.randint(1, 3))
    changes["happiness"] = pet.happiness - old_happiness

    # Bond level very slowly decays if no interaction (max -2 per day)
    old_bond = pet.bond_level
    if total == 0:
        bond_decay = random.randint(1, 2)
        pet.bond_level = max(0, pet.bond_level - bond_decay)
    changes["bond_level"] = pet.bond_level - old_bond

    return changes


# -----------------------------------------------
#  Phase 5: Dream Report
# -----------------------------------------------

def _generate_dream_report(
    pet: Pet,
    emotional_tone: str,
    dream_memories: List[Dict],
    personality_changes: Dict[str, float],
    stat_changes: Dict[str, int],
    significant_events: List[str],
) -> str:
    """
    Generate a poetic dream journal narrative that users can read.
    """
    lines: List[str] = []

    # Opening
    tone_openers = {
        "joyful": f"{pet.name} slept with a smile, drifting into warm, golden dreams.",
        "lonely": f"{pet.name} curled up tightly, seeking warmth in the vast quiet of sleep.",
        "creative": f"{pet.name}'s mind sparkled as sleep took hold — imagination unfurling like wings.",
        "adventurous": f"{pet.name} bounded into dreams with paws outstretched, ready for anything.",
        "peaceful": f"{pet.name} settled into a deep, serene slumber, breathing slowly and steadily.",
        "anxious": f"{pet.name} tossed and turned before settling, the day's uncertainties rippling through sleep.",
        "grateful": f"{pet.name} drifted off wrapped in the warmth of the day's kindness.",
    }
    lines.append(tone_openers.get(emotional_tone, f"{pet.name} closed their eyes and dreamed."))
    lines.append("")

    # Dream content
    for dm in dream_memories:
        lines.append(dm["content"])
    lines.append("")

    # Personality evolution note
    growing_traits = [
        (trait, delta)
        for trait, delta in personality_changes.items()
        if delta > 0 and trait in TRAIT_DESCRIPTIONS
    ]
    if growing_traits:
        # Pick the most significant change
        main_trait, _ = max(growing_traits, key=lambda x: x[1])
        desc = TRAIT_DESCRIPTIONS[main_trait]
        lines.append(f"Something shifted in the dream — {desc}.")
    elif significant_events and "neglected" in significant_events:
        lines.append("In the silence, something quietly hardened, or perhaps softened.")

    # Closing
    tone_closers = {
        "joyful": f"When morning comes, {pet.name} will wake with bright eyes and a wagging heart.",
        "lonely": f"{pet.name} will wake hoping today will be different — hoping to be seen.",
        "creative": f"The dream leaves behind seeds of inspiration. {pet.name} will wake ready to create.",
        "adventurous": f"{pet.name} will wake with restless paws, eager to explore.",
        "peaceful": f"{pet.name} will wake rested and calm, ready for whatever comes.",
        "anxious": f"The dream fades slowly. {pet.name} will wake cautiously, but with quiet hope.",
        "grateful": f"{pet.name} will wake remembering warmth, carrying it into the new day.",
    }
    lines.append("")
    lines.append(tone_closers.get(emotional_tone, f"{pet.name} will wake ready for a new day."))

    return "\n".join(lines)


# -----------------------------------------------
#  Main Entry Point
# -----------------------------------------------

async def dream_cycle(pet: Pet, db: AsyncSession) -> Optional[DreamJournal]:
    """
    Execute one complete dream cycle for a pet.
    Returns the created DreamJournal entry, or None if dreaming was skipped.
    """
    now = datetime.now(timezone.utc)
    today = now.date()

    # Determine the lookback window (24 hours from last dream, or 24h from now)
    if pet.last_dream_at:
        last_dream = pet.last_dream_at
        if last_dream.tzinfo is None:
            last_dream = last_dream.replace(tzinfo=timezone.utc)
        since = last_dream
    else:
        since = now - timedelta(hours=24)

    # Check if already dreamed today
    result = await db.execute(
        select(func.count())
        .select_from(DreamJournal)
        .where(
            DreamJournal.pet_id == pet.id,
            DreamJournal.dream_date == today,
        )
    )
    if (result.scalar() or 0) > 0:
        logger.info(f"Pet {pet.id} ({pet.name}) already dreamed today, skipping")
        return None

    logger.info(f"Starting dream cycle for pet {pet.id} ({pet.name})")

    # Phase 1: Memory Collection
    day_data = await _collect_day_data(pet, db, since)
    logger.info(
        f"  Collected: {day_data['total_interactions']} interactions, "
        f"{len(day_data['memories'])} memories, "
        f"{len(day_data['significant_events'])} events"
    )

    # Phase 2: Emotional Compression
    emotional_tone = _determine_emotional_tone(day_data, pet)
    dream_memories = _generate_dream_memories(pet, emotional_tone, day_data)
    logger.info(f"  Emotional tone: {emotional_tone}, {len(dream_memories)} dream memories")

    # Store dream memories as PetMemory entries
    for dm in dream_memories:
        memory = PetMemory(
            pet_id=pet.id,
            memory_type="dream",
            content=dm["content"],
            emotion=dm["emotion"],
            importance=dm["importance"],
        )
        db.add(memory)

    # Phase 3: Personality Drift
    old_mods = dict(pet.personality_modifiers or {})
    new_mods = _calculate_personality_drift(pet, day_data)
    pet.personality_modifiers = new_mods

    # Calculate the actual changes for the journal
    personality_changes = {}
    all_traits = set(list(old_mods.keys()) + list(new_mods.keys()))
    for trait in all_traits:
        old_val = old_mods.get(trait, 0.0)
        new_val = new_mods.get(trait, 0.0)
        diff = round(new_val - old_val, 4)
        if abs(diff) > 0.001:
            personality_changes[trait] = diff

    logger.info(f"  Personality drift: {personality_changes}")

    # Phase 4: Stat Reconciliation
    stat_changes = _reconcile_stats(pet, day_data)
    logger.info(f"  Stat changes: {stat_changes}")

    # Phase 5: Dream Report
    dream_report = _generate_dream_report(
        pet=pet,
        emotional_tone=emotional_tone,
        dream_memories=dream_memories,
        personality_changes=personality_changes,
        stat_changes=stat_changes,
        significant_events=day_data["significant_events"],
    )

    # Create dream journal entry
    journal = DreamJournal(
        pet_id=pet.id,
        dream_date=today,
        summary=dream_report,
        emotional_tone=emotional_tone,
        personality_changes=personality_changes,
        stat_changes=stat_changes,
        significant_events=day_data["significant_events"],
    )
    db.add(journal)

    # Update pet's last dream timestamp
    pet.last_dream_at = now

    await db.flush()

    logger.info(f"  Dream cycle complete for {pet.name}")
    return journal
