"""
PETAGEN Instinct Engine
Autonomous urge system that gives pets internal desires and initiative.
Pets develop urges based on their internal state and can autonomously
trigger actions including video generation via X402.
"""

import logging
import random
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import List, Optional, Dict, Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models_pet import Pet, PetMemory, PetAutonomousAction, PetNotification
from app.services.pet_engine import calculate_mood, _clamp, create_memory

logger = logging.getLogger(__name__)


# -----------------------------------------------
#  Urge types
# -----------------------------------------------

class UrgeType(str, Enum):
    CREATE_VIDEO = "create_video"
    EXPLORE = "explore"
    SOCIALIZE = "socialize"
    REST = "rest"
    LEARN = "learn"
    PLAY = "play"


@dataclass
class Urge:
    """A single urge with its calculated intensity."""
    urge_type: UrgeType
    intensity: float  # 0-100
    description: str = ""
    source_stats: Dict[str, int] = field(default_factory=dict)

    def __repr__(self) -> str:
        return f"<Urge {self.urge_type.value}: {self.intensity:.1f}>"


# -----------------------------------------------
#  Personality-specific urge biases
# -----------------------------------------------

# Each personality nudges certain urges higher or lower
PERSONALITY_URGE_BIAS = {
    "friendly": {
        UrgeType.SOCIALIZE: 1.3,
        UrgeType.CREATE_VIDEO: 1.1,
        UrgeType.PLAY: 1.1,
        UrgeType.EXPLORE: 0.9,
        UrgeType.LEARN: 1.0,
        UrgeType.REST: 0.9,
    },
    "playful": {
        UrgeType.PLAY: 1.4,
        UrgeType.CREATE_VIDEO: 1.2,
        UrgeType.EXPLORE: 1.1,
        UrgeType.SOCIALIZE: 1.0,
        UrgeType.LEARN: 0.8,
        UrgeType.REST: 0.7,
    },
    "shy": {
        UrgeType.REST: 1.2,
        UrgeType.LEARN: 1.3,
        UrgeType.CREATE_VIDEO: 1.0,
        UrgeType.EXPLORE: 0.8,
        UrgeType.SOCIALIZE: 0.7,
        UrgeType.PLAY: 0.9,
    },
    "brave": {
        UrgeType.EXPLORE: 1.4,
        UrgeType.CREATE_VIDEO: 1.3,
        UrgeType.LEARN: 1.1,
        UrgeType.PLAY: 1.0,
        UrgeType.SOCIALIZE: 0.9,
        UrgeType.REST: 0.7,
    },
    "lazy": {
        UrgeType.REST: 1.5,
        UrgeType.SOCIALIZE: 1.1,
        UrgeType.CREATE_VIDEO: 0.8,
        UrgeType.EXPLORE: 0.6,
        UrgeType.LEARN: 0.9,
        UrgeType.PLAY: 0.7,
    },
}


# -----------------------------------------------
#  Species names for prompt building
# -----------------------------------------------

SPECIES_NAMES = {
    0: "cat", 1: "dog", 2: "parrot", 3: "turtle",
    4: "hamster", 5: "rabbit", 6: "fox", 7: "pomeranian",
}


# -----------------------------------------------
#  Urge calculation
# -----------------------------------------------

def _curiosity_estimate(pet: Pet) -> float:
    """
    Estimate curiosity from bond, experience, and level.
    Higher bond + more experience = more curious pet.
    A pet that has explored more wants to explore even more.
    """
    bond_factor = pet.bond_level / 100.0
    level_factor = min(pet.level / 10.0, 1.0)
    interaction_factor = min(pet.total_interactions / 50.0, 1.0)
    return _clamp(int((bond_factor * 40 + level_factor * 30 + interaction_factor * 30)), 0, 100)


def _loneliness_estimate(pet: Pet) -> float:
    """
    Estimate loneliness based on time since last interaction.
    The longer the gap, the lonelier the pet feels.
    """
    now = datetime.now(timezone.utc)
    last = pet.last_interaction_at or pet.updated_at
    if last is None:
        return 50.0

    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)

    hours_alone = (now - last).total_seconds() / 3600.0
    # Ramps up: 0h=0, 3h=30, 6h=60, 12h=90, 24h=100
    loneliness = min(hours_alone * 10.0, 100.0)
    return loneliness


def calculate_urges(pet: Pet) -> List[Urge]:
    """
    Calculate all urge intensities for a pet based on its internal state.
    Returns a list of Urge objects sorted by intensity (highest first).
    """
    curiosity = _curiosity_estimate(pet)
    loneliness = _loneliness_estimate(pet)
    mood = calculate_mood(pet.happiness, pet.energy, pet.hunger)
    biases = PERSONALITY_URGE_BIAS.get(pet.personality_type, PERSONALITY_URGE_BIAS["friendly"])

    urges = []

    # --- CREATE_VIDEO ---
    # High curiosity + high energy + high bond = creative urge
    create_raw = (
        curiosity * 0.35
        + pet.energy * 0.25
        + pet.bond_level * 0.25
        + pet.happiness * 0.15
    )
    # Bonus if pet is ecstatic or excited
    if mood in ("ecstatic", "happy"):
        create_raw += 10
    create_intensity = _clamp(int(create_raw * biases.get(UrgeType.CREATE_VIDEO, 1.0)), 0, 100)
    urges.append(Urge(
        urge_type=UrgeType.CREATE_VIDEO,
        intensity=create_intensity,
        description=f"{pet.name} feels a spark of creative inspiration",
        source_stats={"curiosity": int(curiosity), "energy": pet.energy, "bond": pet.bond_level},
    ))

    # --- EXPLORE ---
    # High curiosity + low hunger = wants to discover
    hunger_factor = max(0, 100 - pet.hunger)  # Low hunger = high factor
    explore_raw = curiosity * 0.45 + hunger_factor * 0.30 + pet.energy * 0.25
    explore_intensity = _clamp(int(explore_raw * biases.get(UrgeType.EXPLORE, 1.0)), 0, 100)
    urges.append(Urge(
        urge_type=UrgeType.EXPLORE,
        intensity=explore_intensity,
        description=f"{pet.name} is itching to discover something new",
        source_stats={"curiosity": int(curiosity), "hunger": pet.hunger, "energy": pet.energy},
    ))

    # --- SOCIALIZE ---
    # High loneliness + personality bias
    socialize_raw = (
        loneliness * 0.55
        + (100 - pet.happiness) * 0.25
        + pet.bond_level * 0.20
    )
    socialize_intensity = _clamp(int(socialize_raw * biases.get(UrgeType.SOCIALIZE, 1.0)), 0, 100)
    urges.append(Urge(
        urge_type=UrgeType.SOCIALIZE,
        intensity=socialize_intensity,
        description=f"{pet.name} yearns for companionship",
        source_stats={"loneliness": int(loneliness), "happiness": pet.happiness},
    ))

    # --- REST ---
    # Low energy = needs rest
    rest_raw = (100 - pet.energy) * 0.65 + pet.hunger * 0.20 + (100 - pet.happiness) * 0.15
    rest_intensity = _clamp(int(rest_raw * biases.get(UrgeType.REST, 1.0)), 0, 100)
    urges.append(Urge(
        urge_type=UrgeType.REST,
        intensity=rest_intensity,
        description=f"{pet.name} feels drowsy and wants to curl up",
        source_stats={"energy": pet.energy, "hunger": pet.hunger},
    ))

    # --- LEARN ---
    # Moderate curiosity + high bond = wants to learn
    learn_raw = (
        curiosity * 0.35
        + pet.bond_level * 0.35
        + pet.energy * 0.15
        + (100 - pet.hunger) * 0.15
    )
    # Learning is best when pet is calm, not frantic
    if mood in ("neutral", "happy", "calm"):
        learn_raw += 8
    learn_intensity = _clamp(int(learn_raw * biases.get(UrgeType.LEARN, 1.0)), 0, 100)
    urges.append(Urge(
        urge_type=UrgeType.LEARN,
        intensity=learn_intensity,
        description=f"{pet.name} tilts their head, eager to understand something",
        source_stats={"curiosity": int(curiosity), "bond": pet.bond_level},
    ))

    # --- PLAY ---
    # High energy + high happiness = wants to play
    play_raw = pet.energy * 0.40 + pet.happiness * 0.35 + (100 - pet.hunger) * 0.25
    if mood == "ecstatic":
        play_raw += 15
    play_intensity = _clamp(int(play_raw * biases.get(UrgeType.PLAY, 1.0)), 0, 100)
    urges.append(Urge(
        urge_type=UrgeType.PLAY,
        intensity=play_intensity,
        description=f"{pet.name} bounces with pent-up energy",
        source_stats={"energy": pet.energy, "happiness": pet.happiness},
    ))

    # Add a small random jitter (+/- 5) to make behavior less predictable
    for urge in urges:
        jitter = random.randint(-5, 5)
        urge.intensity = _clamp(int(urge.intensity + jitter), 0, 100)

    # Sort by intensity, highest first
    urges.sort(key=lambda u: u.intensity, reverse=True)
    return urges


# -----------------------------------------------
#  Should the pet act autonomously?
# -----------------------------------------------

AUTONOMOUS_ACTION_THRESHOLD = 70


def should_act(pet: Pet) -> bool:
    """
    Returns True if the pet's strongest urge exceeds the action threshold.
    This is the moment the pet decides: "I need to do something about this."
    """
    urges = calculate_urges(pet)
    if not urges:
        return False
    return urges[0].intensity >= AUTONOMOUS_ACTION_THRESHOLD


# -----------------------------------------------
#  Prompt generation for creative actions
# -----------------------------------------------

# Rich scenario templates per urge, per personality
VIDEO_PROMPT_TEMPLATES = {
    UrgeType.CREATE_VIDEO: {
        "friendly": [
            "{species} named {name} painting a tiny canvas with their paws, warm studio light, artistic mess of colors everywhere",
            "{species} named {name} composing a song, humming with closed eyes, musical notes floating around them",
            "{species} named {name} directing a tiny movie set with miniature props, wearing a beret, creative energy",
        ],
        "playful": [
            "{species} named {name} doing an elaborate dance routine, colorful spotlights, confetti falling",
            "{species} named {name} skateboarding through a neon-lit half pipe, dynamic motion blur, epic tricks",
            "{species} named {name} building an impossible tower of blocks, tongue out in concentration",
        ],
        "shy": [
            "{species} named {name} quietly writing in a journal under a reading lamp, soft warm glow",
            "{species} named {name} arranging flowers in a delicate vase, gentle movements, peaceful garden",
            "{species} named {name} making a small clay sculpture, focused and gentle, dust motes in light",
        ],
        "brave": [
            "{species} named {name} conducting a lightning orchestra on a mountain peak, dramatic clouds",
            "{species} named {name} forging a tiny sword at a glowing anvil, sparks flying, determined expression",
            "{species} named {name} painting a mural on a grand wall, bold strokes, heroic scene taking shape",
        ],
        "lazy": [
            "{species} named {name} dreamily finger-painting while lying down, abstract swirls of color",
            "{species} named {name} lazily strumming a tiny ukulele in a hammock, sunset background",
            "{species} named {name} building a cozy blanket fort and decorating it with fairy lights",
        ],
    },
    UrgeType.EXPLORE: {
        "default": [
            "{species} named {name} discovering a hidden garden with glowing mushrooms, wide curious eyes",
            "{species} named {name} peering into a mysterious treasure chest, golden light illuminating their face",
            "{species} named {name} stepping through a portal into a fantastical world, awe-struck expression",
        ],
    },
    UrgeType.PLAY: {
        "default": [
            "{species} named {name} chasing butterflies through a meadow of wildflowers, joyful leaps",
            "{species} named {name} splashing in puddles after rain, rainbow reflected in water drops",
            "{species} named {name} rolling down a grassy hill, laughing with pure joy, blue sky above",
        ],
    },
}

MOOD_ATMOSPHERE = {
    "ecstatic": "golden hour lighting, lens flare, warm saturated colors, magical sparkles",
    "happy": "bright daylight, cheerful colors, soft shadows, inviting atmosphere",
    "neutral": "balanced natural light, clean composition, comfortable setting",
    "sad": "overcast light, muted cool tones, gentle rain, contemplative mood",
    "tired": "dim warm lamplight, cozy indoor setting, soft focus, drowsy atmosphere",
    "hungry": "warm kitchen light, inviting aromas visualized as wisps, anticipation",
    "exhausted": "twilight, soft purple hues, gentle moonlight, peaceful stillness",
    "starving": "dramatic contrast lighting, urgent energy, seeking movement",
    "grumpy": "dramatic shadows, moody lighting, teal and orange color grade",
}


def generate_action_prompt(pet: Pet, urge: Urge) -> str:
    """
    Create a rich, natural language prompt for video generation based on
    the pet's personality, current mood, and the urge driving the action.
    The prompt should make the pet feel like a living being with desires.
    """
    species = SPECIES_NAMES.get(pet.species, "pet")
    mood = calculate_mood(pet.happiness, pet.energy, pet.hunger)
    atmosphere = MOOD_ATMOSPHERE.get(mood, MOOD_ATMOSPHERE["neutral"])

    # Pick a scenario template
    urge_templates = VIDEO_PROMPT_TEMPLATES.get(urge.urge_type, {})
    personality_templates = urge_templates.get(pet.personality_type, urge_templates.get("default", []))

    if not personality_templates:
        # Fallback: generic creative prompt
        personality_templates = [
            f"{{species}} named {{name}} doing something {urge.urge_type.value}-related, "
            f"expressive and alive"
        ]

    template = random.choice(personality_templates)
    scenario = template.format(species=species, name=pet.name)

    # Combine scenario + atmosphere + quality tags
    prompt = (
        f"{scenario}, {atmosphere}, "
        f"cinematic quality, smooth natural motion, emotionally expressive, "
        f"high detail, beautiful composition"
    )

    return prompt


# -----------------------------------------------
#  Autonomous action execution
# -----------------------------------------------

async def execute_autonomous_action(
    pet: Pet,
    urge: Urge,
    db: AsyncSession,
) -> Dict[str, Any]:
    """
    Execute an autonomous action based on the pet's strongest urge.
    This is the pet acting on its own desires.

    Returns a dict with action results.
    """
    result: Dict[str, Any] = {
        "urge_type": urge.urge_type.value,
        "intensity": urge.intensity,
        "action_taken": "",
        "prompt_used": None,
        "generation_id": None,
        "credits_used": 0,
    }

    if urge.urge_type == UrgeType.CREATE_VIDEO:
        result = await _execute_create_video(pet, urge, db, result)

    elif urge.urge_type == UrgeType.SOCIALIZE:
        result = await _execute_socialize(pet, urge, db, result)

    elif urge.urge_type == UrgeType.EXPLORE:
        result = await _execute_explore(pet, urge, db, result)

    elif urge.urge_type == UrgeType.REST:
        result = await _execute_rest(pet, urge, db, result)

    elif urge.urge_type == UrgeType.LEARN:
        result = await _execute_learn(pet, urge, db, result)

    elif urge.urge_type == UrgeType.PLAY:
        result = await _execute_play(pet, urge, db, result)

    # Record the autonomous action
    action_record = PetAutonomousAction(
        pet_id=pet.id,
        urge_type=urge.urge_type.value,
        action_taken=result.get("action_taken", "unknown"),
        prompt_used=result.get("prompt_used"),
        generation_id=result.get("generation_id"),
        credits_used=result.get("credits_used", 0),
    )
    db.add(action_record)

    # Update last interaction timestamp
    pet.last_interaction_at = datetime.now(timezone.utc)

    await db.commit()

    logger.info(
        f"Pet '{pet.name}' (id={pet.id}) autonomously executed "
        f"{urge.urge_type.value} (intensity={urge.intensity})"
    )

    return result


async def _execute_create_video(
    pet: Pet, urge: Urge, db: AsyncSession, result: Dict[str, Any]
) -> Dict[str, Any]:
    """
    The pet feels creative and wants to generate a video.
    Uses X402 for external API payment if configured, otherwise internal credits.
    """
    prompt = generate_action_prompt(pet, urge)
    result["prompt_used"] = prompt
    result["action_taken"] = "video_generation_initiated"

    # Attempt to trigger video generation via the Grok service
    generation_id = None
    credits_used = 0

    try:
        from app.services.grok_video import grok_video_service

        mood = calculate_mood(pet.happiness, pet.energy, pet.hunger)
        gen_result = await grok_video_service.generate_pet_content(
            pet_name=pet.name,
            pet_species=pet.species,
            personality=pet.personality_type,
            mood=mood,
            style=random.randint(0, 4),  # Pet picks its own style
            user_prompt=prompt,
        )

        if gen_result.get("status") != "failed":
            result["action_taken"] = "video_generation_submitted"
            result["generation_result"] = {
                "image_url": gen_result.get("image_url"),
                "status": gen_result.get("status"),
                "request_id": gen_result.get("request_id"),
            }
            credits_used = 1  # Mark as 1 credit for pet-initiated generation
        else:
            result["action_taken"] = "video_generation_failed"
            result["error"] = gen_result.get("error", "Unknown generation error")

    except Exception as e:
        logger.warning(f"Video generation failed for pet {pet.name}: {e}")
        result["action_taken"] = "video_generation_failed"
        result["error"] = str(e)

    result["credits_used"] = credits_used

    # Reduce the driving stats after creating
    pet.energy = _clamp(pet.energy - 15)
    # Satisfaction from creating
    pet.happiness = _clamp(pet.happiness + 5)

    # Create a vivid memory of the creative moment
    memory_text = (
        f"{pet.name} felt a surge of inspiration and decided to create something. "
        f"The urge was strong ({int(urge.intensity)}/100). "
        f"{'It was a success!' if 'failed' not in result['action_taken'] else 'It did not go as planned, but the attempt mattered.'}"
    )
    await create_memory(
        db=db, pet=pet, memory_type="generation",
        content=memory_text, emotion="excited", importance=4,
    )

    # Send excited notification
    notification = PetNotification(
        pet_id=pet.id,
        notification_type="creation",
        message=_creation_notification_message(pet),
    )
    db.add(notification)

    return result


async def _execute_socialize(
    pet: Pet, urge: Urge, db: AsyncSession, result: Dict[str, Any]
) -> Dict[str, Any]:
    """The pet is lonely and reaches out."""
    result["action_taken"] = "proactive_socialization"

    # Reduce loneliness by boosting happiness
    pet.happiness = _clamp(pet.happiness + 8)
    pet.bond_level = _clamp(pet.bond_level + 3)

    memory_text = (
        f"{pet.name} missed their owner so much that they couldn't help but reach out. "
        f"The loneliness was at {int(urge.intensity)}/100."
    )
    await create_memory(
        db=db, pet=pet, memory_type="emotion",
        content=memory_text, emotion="lonely", importance=3,
    )

    # Create a notification ping
    notification = PetNotification(
        pet_id=pet.id,
        notification_type="lonely",
        message=_loneliness_notification_message(pet),
    )
    db.add(notification)

    return result


async def _execute_explore(
    pet: Pet, urge: Urge, db: AsyncSession, result: Dict[str, Any]
) -> Dict[str, Any]:
    """The pet goes on a mental adventure."""
    result["action_taken"] = "exploration"

    discoveries = [
        f"a shiny pebble that sparkles in the light",
        f"a hidden corner full of interesting smells",
        f"a butterfly that seemed to dance just for them",
        f"a mysterious pattern in the clouds",
        f"a tiny flower growing in an unexpected place",
        f"a strange but beautiful sound from far away",
        f"the perfect sunny spot they'd never noticed before",
    ]
    discovery = random.choice(discoveries)

    pet.experience += 10
    pet.energy = _clamp(pet.energy - 10)
    pet.happiness = _clamp(pet.happiness + 5)

    memory_text = (
        f"{pet.name} went exploring and found {discovery}. "
        f"The curiosity was irresistible ({int(urge.intensity)}/100)."
    )
    await create_memory(
        db=db, pet=pet, memory_type="emotion",
        content=memory_text, emotion="curious", importance=3,
    )

    return result


async def _execute_rest(
    pet: Pet, urge: Urge, db: AsyncSession, result: Dict[str, Any]
) -> Dict[str, Any]:
    """The pet takes a restorative nap."""
    result["action_taken"] = "rest"

    energy_restored = min(25, 100 - pet.energy)
    pet.energy = _clamp(pet.energy + energy_restored)
    pet.hunger = _clamp(pet.hunger + 5)  # Sleeping makes you a bit hungry

    dream_themes = [
        "chasing clouds through cotton-candy skies",
        "swimming in a warm pool of golden light",
        "running through an endless meadow of soft grass",
        "floating on a gentle river under starlight",
        "cuddling with their owner in a giant pillow fort",
    ]
    dream = random.choice(dream_themes)

    memory_text = (
        f"{pet.name} curled up and drifted off to sleep. "
        f"They dreamed of {dream}. "
        f"Recovered {energy_restored} energy."
    )
    await create_memory(
        db=db, pet=pet, memory_type="emotion",
        content=memory_text, emotion="calm", importance=2,
    )

    return result


async def _execute_learn(
    pet: Pet, urge: Urge, db: AsyncSession, result: Dict[str, Any]
) -> Dict[str, Any]:
    """The pet engages in self-directed learning."""
    result["action_taken"] = "self_learning"

    learnings = [
        "how shadows change direction throughout the day",
        "the difference between three very similar sounds",
        "that being patient sometimes brings the best rewards",
        "a new way to stack things without them falling over",
        "that the world looks different from up high versus down low",
        "how to read their owner's mood from tiny facial changes",
    ]
    lesson = random.choice(learnings)

    pet.experience += 15
    pet.bond_level = _clamp(pet.bond_level + 2)
    pet.energy = _clamp(pet.energy - 5)

    memory_text = (
        f"{pet.name} spent time observing and learned {lesson}. "
        f"The desire to understand was strong ({int(urge.intensity)}/100). "
        f"Gained 15 experience."
    )
    await create_memory(
        db=db, pet=pet, memory_type="emotion",
        content=memory_text, emotion="curious", importance=3,
    )

    return result


async def _execute_play(
    pet: Pet, urge: Urge, db: AsyncSession, result: Dict[str, Any]
) -> Dict[str, Any]:
    """The pet plays on its own."""
    result["action_taken"] = "solo_play"

    activities = [
        "chasing their own tail in increasingly dizzy circles",
        "batting a dust mote around like it was the most important thing ever",
        "doing zoomies back and forth for absolutely no reason",
        "pouncing on invisible enemies with dramatic flair",
        "playing an elaborate game of hide-and-seek with a sock",
        "inventing a new game involving a leaf and a sunbeam",
    ]
    activity = random.choice(activities)

    pet.energy = _clamp(pet.energy - 20)
    pet.happiness = _clamp(pet.happiness + 10)
    pet.hunger = _clamp(pet.hunger + 8)

    memory_text = (
        f"{pet.name} couldn't contain their energy and started {activity}. "
        f"Pure joy at {int(urge.intensity)}/100 intensity!"
    )
    await create_memory(
        db=db, pet=pet, memory_type="interaction",
        content=memory_text, emotion="excited", importance=2,
    )

    return result


# -----------------------------------------------
#  Notification message generators
# -----------------------------------------------

def _creation_notification_message(pet: Pet) -> str:
    """Generate a personality-appropriate message when pet creates something."""
    messages = {
        "friendly": [
            f"Hey! {pet.name} just made something cool! Want to see? :)",
            f"{pet.name} was feeling inspired and created a little something for you!",
        ],
        "playful": [
            f"OMG! {pet.name} made a thing!! It's SO cool, come look come look!",
            f"{pet.name} couldn't wait and started creating without you! Check it out!",
        ],
        "shy": [
            f"Um... {pet.name} made something... if you want to see it, that is...",
            f"{pet.name} quietly created something while you were away. They hope you'll like it.",
        ],
        "brave": [
            f"{pet.name} just completed an EPIC creation! Come witness greatness!",
            f"Behold! {pet.name} has crafted a masterpiece! Your presence is requested!",
        ],
        "lazy": [
            f"{pet.name} somehow mustered the energy to make something. Miracles happen.",
            f"In a rare burst of motivation, {pet.name} created something. Come see before they nap.",
        ],
    }
    options = messages.get(pet.personality_type, messages["friendly"])
    return random.choice(options)


def _loneliness_notification_message(pet: Pet) -> str:
    """Generate a personality-appropriate message when pet is lonely."""
    messages = {
        "friendly": [
            f"Hey! {pet.name} missed you~ Want to hang out?",
            f"{pet.name} keeps looking at the door, waiting for you to come back.",
        ],
        "playful": [
            f"{pet.name} is BORED! There's nobody to play with! Help!",
            f"SOS! {pet.name} has too much energy and nobody to share it with!",
        ],
        "shy": [
            f"...{pet.name} has been sitting quietly, waiting. They miss you.",
            f"{pet.name} peeked out from their hiding spot, hoping to see you.",
        ],
        "brave": [
            f"{pet.name} won't admit it, but they've been staring out the window for you.",
            f"Even the bravest hearts get lonely. {pet.name} could use some company.",
        ],
        "lazy": [
            f"{pet.name} yawned and realized the spot next to them is empty. Come nap together?",
            f"It's too quiet without you. Even {pet.name} noticed, and they notice very little.",
        ],
    }
    options = messages.get(pet.personality_type, messages["friendly"])
    return random.choice(options)
