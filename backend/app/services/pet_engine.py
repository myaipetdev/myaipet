"""
PETAGEN Pet Engine
Core pet logic: stat calculations, interactions, mood, leveling, memories.
"""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models_pet import Pet, PetMemory


# -----------------------------------------------
#  Mood calculation
# -----------------------------------------------

def calculate_mood(happiness: int, energy: int, hunger: int) -> str:
    """Determine mood string based on current stats."""
    if happiness >= 80 and energy >= 60:
        return "ecstatic"
    if happiness >= 60 and energy >= 40 and hunger <= 50:
        return "happy"
    if energy < 20:
        return "exhausted"
    if hunger >= 80:
        return "starving"
    if happiness < 30:
        return "sad"
    if happiness < 50 and energy < 50:
        return "grumpy"
    if energy < 40:
        return "tired"
    if hunger >= 60:
        return "hungry"
    return "neutral"


# -----------------------------------------------
#  Personality modifiers
# -----------------------------------------------

PERSONALITY_MODIFIERS = {
    "friendly": {
        "feed": 1.0, "play": 1.1, "talk": 1.3, "pet": 1.2, "walk": 1.0, "train": 0.9,
    },
    "playful": {
        "feed": 1.0, "play": 1.4, "talk": 0.9, "pet": 1.0, "walk": 1.2, "train": 0.8,
    },
    "shy": {
        "feed": 1.1, "play": 0.8, "talk": 1.2, "pet": 1.3, "walk": 0.7, "train": 1.0,
    },
    "brave": {
        "feed": 0.9, "play": 1.1, "talk": 1.0, "pet": 0.8, "walk": 1.3, "train": 1.4,
    },
    "lazy": {
        "feed": 1.3, "play": 0.7, "talk": 1.1, "pet": 1.4, "walk": 0.6, "train": 0.7,
    },
}


def get_personality_modifier(personality_type: str) -> dict:
    """Return multipliers for different interaction types based on personality."""
    return PERSONALITY_MODIFIERS.get(personality_type, PERSONALITY_MODIFIERS["friendly"])


# -----------------------------------------------
#  Base interaction effects
# -----------------------------------------------

INTERACTION_EFFECTS = {
    "feed": {"hunger": -25, "happiness": 5, "energy": 10, "experience": 0, "bond": 0},
    "play": {"hunger": 10, "happiness": 15, "energy": -20, "experience": 15, "bond": 0},
    "talk": {"hunger": 0, "happiness": 10, "energy": 0, "experience": 5, "bond": 5},
    "pet": {"hunger": 0, "happiness": 8, "energy": 0, "experience": 3, "bond": 8},
    "walk": {"hunger": 15, "happiness": 12, "energy": -15, "experience": 20, "bond": 0},
    "train": {"hunger": 0, "happiness": 0, "energy": -25, "experience": 30, "bond": 10},
}


def process_interaction(pet: Pet, interaction_type: str) -> dict:
    """
    Calculate stat changes based on interaction type and personality.
    Returns dict with keys: happiness, energy, hunger, experience, bond.
    """
    base = INTERACTION_EFFECTS.get(interaction_type)
    if base is None:
        raise ValueError(f"Unknown interaction type: {interaction_type}")

    modifier = get_personality_modifier(pet.personality_type)
    mult = modifier.get(interaction_type, 1.0)

    changes = {}
    for stat, value in base.items():
        if value >= 0:
            changes[stat] = int(value * mult)
        else:
            # Negative effects are reduced by good personality match (higher mult = less cost)
            changes[stat] = int(value / mult) if mult > 0 else value

    return changes


def _clamp(value: int, lo: int = 0, hi: int = 100) -> int:
    return max(lo, min(hi, value))


def apply_stat_changes(pet: Pet, changes: dict) -> dict:
    """Apply calculated changes to the pet and return the new stats dict."""
    pet.happiness = _clamp(pet.happiness + changes.get("happiness", 0))
    pet.energy = _clamp(pet.energy + changes.get("energy", 0))
    pet.hunger = _clamp(pet.hunger + changes.get("hunger", 0))
    pet.experience = max(0, pet.experience + changes.get("experience", 0))
    pet.bond_level = _clamp(pet.bond_level + changes.get("bond", 0))
    pet.total_interactions += 1

    return {
        "happiness": pet.happiness,
        "energy": pet.energy,
        "hunger": pet.hunger,
        "experience": pet.experience,
        "bond_level": pet.bond_level,
        "level": pet.level,
    }


# -----------------------------------------------
#  Leveling
# -----------------------------------------------

def check_level_up(pet: Pet) -> bool:
    """
    Level up formula: experience needed = level * 100.
    Applies level up if earned. Returns True if leveled up.
    """
    exp_needed = pet.level * 100
    if pet.experience >= exp_needed:
        pet.experience -= exp_needed
        pet.level += 1
        return True
    return False


# -----------------------------------------------
#  Response generation (template-based)
# -----------------------------------------------

RESPONSE_TEMPLATES = {
    "feed": {
        "happy": "{name} gobbles up the food joyfully! Nom nom nom!",
        "sad": "{name} eats slowly, but the food seems to cheer them up a bit.",
        "ecstatic": "{name} does a happy dance before diving into the meal!",
        "exhausted": "{name} nibbles tiredly but appreciates the food.",
        "starving": "{name} devours the food instantly! They were so hungry!",
        "grumpy": "{name} reluctantly eats... but secretly enjoys it.",
        "tired": "{name} munches lazily. The food gives them a small energy boost.",
        "hungry": "{name} eats eagerly! Just what they needed!",
        "neutral": "{name} happily eats their meal. Yum!",
    },
    "play": {
        "happy": "{name} bounces around excitedly! What a fun playtime!",
        "sad": "{name} slowly warms up to playing... and starts to smile!",
        "ecstatic": "{name} is OVERJOYED! They zoom around in circles!",
        "exhausted": "{name} tries to play but is too tired... maybe rest first?",
        "starving": "{name} is too hungry to play properly... feed them first!",
        "grumpy": "{name} grumbles but eventually gets into the game.",
        "tired": "{name} plays for a bit but needs a break soon.",
        "hungry": "{name} plays but keeps looking at the food bowl...",
        "neutral": "{name} has a great time playing! Their tail wags happily.",
    },
    "talk": {
        "happy": "{name} listens intently and seems to understand you!",
        "sad": "{name} nuzzles closer as you speak softly to them.",
        "ecstatic": "{name} chatters back excitedly, as if telling you a story!",
        "exhausted": "{name} listens with droopy eyes but appreciates the company.",
        "starving": "{name} listens but their tummy keeps rumbling...",
        "grumpy": "{name} huffs but eventually perks up hearing your voice.",
        "tired": "{name} yawns mid-conversation but stays close.",
        "hungry": "{name} tilts their head, listening while eyeing the food.",
        "neutral": "{name} perks up and listens to every word you say.",
    },
    "pet": {
        "happy": "{name} purrs contentedly as you pet them!",
        "sad": "{name} slowly relaxes under your gentle touch.",
        "ecstatic": "{name} rolls over for belly rubs! Maximum happiness!",
        "exhausted": "{name} leans into your hand and sighs peacefully.",
        "starving": "{name} enjoys the pets but would also love some food...",
        "grumpy": "{name} initially resists but melts into the pets.",
        "tired": "{name} closes their eyes and enjoys the gentle strokes.",
        "hungry": "{name} nuzzles your hand, looking for treats!",
        "neutral": "{name} enjoys the affection and wags their tail.",
    },
    "walk": {
        "happy": "{name} trots alongside you with a spring in their step!",
        "sad": "{name} follows quietly but the fresh air helps their mood.",
        "ecstatic": "{name} sprints ahead, full of boundless energy!",
        "exhausted": "{name} can barely walk... they need rest, not exercise.",
        "starving": "{name} walks slowly, conserving energy for food...",
        "grumpy": "{name} trudges along but the scenery improves their mood.",
        "tired": "{name} walks slowly but enjoys the change of scenery.",
        "hungry": "{name} sniffs around looking for food on the walk.",
        "neutral": "{name} happily explores the neighborhood with you!",
    },
    "train": {
        "happy": "{name} is focused and eager to learn new tricks!",
        "sad": "{name} tries hard to please you during training.",
        "ecstatic": "{name} masters the trick on the first try! Amazing!",
        "exhausted": "{name} can barely focus... too tired to train right now.",
        "starving": "{name} is distracted by hunger during training.",
        "grumpy": "{name} stubbornly resists but eventually cooperates.",
        "tired": "{name} yawns through training but gives it their best.",
        "hungry": "{name} will train for treats! Motivation!",
        "neutral": "{name} pays attention and learns steadily. Good progress!",
    },
}

# Personality flavor additions
PERSONALITY_FLAVOR = {
    "friendly": " {name} looks up at you with warm, trusting eyes.",
    "playful": " {name} can't stop bouncing around!",
    "shy": " {name} peeks at you shyly from behind their paws.",
    "brave": " {name} stands tall and proud!",
    "lazy": " {name} yawns and stretches lazily.",
}


def generate_response(pet: Pet, interaction_type: str, mood: str) -> str:
    """Generate contextual response text based on personality, mood, and interaction."""
    templates = RESPONSE_TEMPLATES.get(interaction_type, {})
    template = templates.get(mood, templates.get("neutral", "{name} looks at you."))
    response = template.format(name=pet.name)

    flavor = PERSONALITY_FLAVOR.get(pet.personality_type, "")
    if flavor:
        response += flavor.format(name=pet.name)

    return response


# -----------------------------------------------
#  Memory creation
# -----------------------------------------------

async def create_memory(
    db: AsyncSession,
    pet: Pet,
    memory_type: str,
    content: str,
    emotion: str,
    importance: int,
) -> PetMemory:
    """Create a PetMemory record."""
    memory = PetMemory(
        pet_id=pet.id,
        memory_type=memory_type,
        content=content,
        emotion=emotion,
        importance=_clamp(importance, 1, 5),
    )
    db.add(memory)
    return memory


# -----------------------------------------------
#  Stat decay
# -----------------------------------------------

def decay_stats(pet: Pet) -> None:
    """
    Decay stats based on time since last interaction.
    hunger +2, energy -1 per hour since last update (capped at 0-100).
    """
    now = datetime.now(timezone.utc)
    if pet.updated_at is None:
        return

    # Handle timezone-naive updated_at from SQLite
    updated = pet.updated_at
    if updated.tzinfo is None:
        updated = updated.replace(tzinfo=timezone.utc)

    delta = now - updated
    hours = delta.total_seconds() / 3600.0

    if hours < 0.01:
        return  # Less than ~36 seconds, skip decay

    hunger_increase = int(hours * 2)
    energy_decrease = int(hours * 1)

    pet.hunger = _clamp(pet.hunger + hunger_increase)
    pet.energy = _clamp(pet.energy - energy_decrease)

    # Happiness decays slowly if hunger is high or energy is low
    if pet.hunger > 70:
        pet.happiness = _clamp(pet.happiness - int(hours * 1))
    if pet.energy < 20:
        pet.happiness = _clamp(pet.happiness - int(hours * 0.5))


# -----------------------------------------------
#  Emotion mapping for memories
# -----------------------------------------------

INTERACTION_EMOTIONS = {
    "feed": "happy",
    "play": "excited",
    "talk": "calm",
    "pet": "happy",
    "walk": "excited",
    "train": "curious",
}


def get_interaction_emotion(interaction_type: str) -> str:
    """Get the default emotion for an interaction type."""
    return INTERACTION_EMOTIONS.get(interaction_type, "calm")
