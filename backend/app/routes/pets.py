"""
PETAGEN Pet Routes
API endpoints for pet creation, interaction, memories, and management.
"""

import random
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import User
from datetime import datetime, timezone

from app.models_pet import Pet, PetMemory, PetInteraction, DreamJournal, PetNotification, PetAutonomousAction
from app.schemas_pet import (
    PetCreate,
    PetResponse,
    PetInteractRequest,
    PetInteractResponse,
    PetMemoryResponse,
    PetStatusResponse,
    DreamJournalResponse,
    PersonalityEvolutionResponse,
    UrgeResponse,
    InstinctsResponse,
    PetNotificationResponse,
    NotificationReadRequest,
    AutonomousActionResponse,
)
from app.services.dreaming_engine import TRAIT_DESCRIPTIONS
from app.services.pet_engine import (
    calculate_mood,
    process_interaction,
    apply_stat_changes,
    generate_response,
    check_level_up,
    create_memory,
    decay_stats,
    get_interaction_emotion,
)

router = APIRouter(prefix="/api/pets", tags=["pets"])

VALID_INTERACTION_TYPES = {"feed", "play", "talk", "pet", "walk", "train"}
VALID_PERSONALITY_TYPES = ["friendly", "playful", "shy", "brave", "lazy"]
VALID_MEMORY_TYPES = {"interaction", "milestone", "emotion", "generation", "dream"}


# -----------------------------------------------
#  Helpers
# -----------------------------------------------

async def _get_user_pet(
    pet_id: int, user: User, db: AsyncSession
) -> Pet:
    """Fetch a pet belonging to the current user, or raise 404."""
    result = await db.execute(
        select(Pet).where(
            Pet.id == pet_id,
            Pet.user_id == user.id,
            Pet.is_active == True,  # noqa: E712
        )
    )
    pet = result.scalar_one_or_none()
    if pet is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pet not found",
        )
    return pet


def _pet_to_response(pet: Pet) -> PetResponse:
    """Convert a Pet model to PetResponse with computed mood."""
    return PetResponse(
        id=pet.id,
        user_id=pet.user_id,
        name=pet.name,
        species=pet.species,
        personality_type=pet.personality_type,
        level=pet.level,
        experience=pet.experience,
        happiness=pet.happiness,
        energy=pet.energy,
        hunger=pet.hunger,
        bond_level=pet.bond_level,
        total_interactions=pet.total_interactions,
        avatar_url=pet.avatar_url,
        is_active=pet.is_active,
        current_mood=calculate_mood(pet.happiness, pet.energy, pet.hunger),
        created_at=pet.created_at,
        updated_at=pet.updated_at,
    )


# -----------------------------------------------
#  POST /api/pets — Create a new pet
# -----------------------------------------------

@router.post("", response_model=PetResponse, status_code=status.HTTP_201_CREATED)
async def create_pet(
    body: PetCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new pet. Maximum 3 active pets per user."""
    # Check pet count
    result = await db.execute(
        select(func.count()).select_from(Pet).where(
            Pet.user_id == user.id,
            Pet.is_active == True,  # noqa: E712
        )
    )
    count = result.scalar()
    if count >= 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 3 active pets allowed. Release a pet first.",
        )

    # Assign random personality
    personality = random.choice(VALID_PERSONALITY_TYPES)

    pet = Pet(
        user_id=user.id,
        name=body.name,
        species=body.species,
        personality_type=personality,
    )
    db.add(pet)
    await db.flush()

    # Create birth memory
    await create_memory(
        db=db,
        pet=pet,
        memory_type="milestone",
        content=f"{pet.name} was born! A new {personality} companion joins your journey.",
        emotion="excited",
        importance=5,
    )

    await db.commit()
    await db.refresh(pet)

    return _pet_to_response(pet)


# -----------------------------------------------
#  GET /api/pets — List user's pets
# -----------------------------------------------

@router.get("", response_model=list[PetResponse])
async def list_pets(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all active pets for the current user."""
    result = await db.execute(
        select(Pet).where(
            Pet.user_id == user.id,
            Pet.is_active == True,  # noqa: E712
        ).order_by(Pet.created_at.desc())
    )
    pets = result.scalars().all()
    return [_pet_to_response(p) for p in pets]


# -----------------------------------------------
#  GET /api/pets/{pet_id} — Get pet details
# -----------------------------------------------

@router.get("/{pet_id}", response_model=PetStatusResponse)
async def get_pet(
    pet_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get pet details with recent memories."""
    pet = await _get_user_pet(pet_id, user, db)

    # Fetch recent memories
    result = await db.execute(
        select(PetMemory)
        .where(PetMemory.pet_id == pet.id)
        .order_by(PetMemory.created_at.desc())
        .limit(10)
    )
    memories = result.scalars().all()

    return PetStatusResponse(
        id=pet.id,
        name=pet.name,
        species=pet.species,
        personality_type=pet.personality_type,
        level=pet.level,
        experience=pet.experience,
        happiness=pet.happiness,
        energy=pet.energy,
        hunger=pet.hunger,
        bond_level=pet.bond_level,
        total_interactions=pet.total_interactions,
        current_mood=calculate_mood(pet.happiness, pet.energy, pet.hunger),
        recent_memories=[
            PetMemoryResponse(
                id=m.id,
                memory_type=m.memory_type,
                content=m.content,
                emotion=m.emotion,
                importance=m.importance,
                created_at=m.created_at,
            )
            for m in memories
        ],
    )


# -----------------------------------------------
#  POST /api/pets/{pet_id}/interact
# -----------------------------------------------

@router.post("/{pet_id}/interact", response_model=PetInteractResponse)
async def interact_with_pet(
    pet_id: int,
    body: PetInteractRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Interact with a pet: feed, play, talk, pet, walk, or train."""
    if body.interaction_type not in VALID_INTERACTION_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid interaction type. Must be one of: {', '.join(sorted(VALID_INTERACTION_TYPES))}",
        )

    pet = await _get_user_pet(pet_id, user, db)

    # 1. Decay stats based on time since last interaction
    decay_stats(pet)

    # 2. Calculate mood before interaction
    mood = calculate_mood(pet.happiness, pet.energy, pet.hunger)

    # 3. Process interaction (calculate changes)
    changes = process_interaction(pet, body.interaction_type)

    # 4. Apply changes to pet
    new_stats = apply_stat_changes(pet, changes)

    # 5. Generate response text
    response_text = generate_response(pet, body.interaction_type, mood)

    # 6. Check level up
    leveled_up = check_level_up(pet)
    memory_content: Optional[str] = None

    if leveled_up:
        new_stats["level"] = pet.level
        new_stats["experience"] = pet.experience
        level_text = f"{pet.name} reached level {pet.level}!"
        response_text += f" {level_text}"
        await create_memory(
            db=db,
            pet=pet,
            memory_type="milestone",
            content=level_text,
            emotion="excited",
            importance=4,
        )
        memory_content = level_text

    # 7. Create interaction memory
    emotion = get_interaction_emotion(body.interaction_type)
    interaction_memory_text = (
        f"{pet.name} was {body.interaction_type}ed by their owner. "
        f"They felt {emotion}."
    )

    # Fix grammar for certain interaction types
    if body.interaction_type == "talk":
        interaction_memory_text = (
            f"Owner talked to {pet.name}. They felt {emotion}."
        )
    elif body.interaction_type == "pet":
        interaction_memory_text = (
            f"Owner petted {pet.name}. They felt {emotion}."
        )

    await create_memory(
        db=db,
        pet=pet,
        memory_type="interaction",
        content=interaction_memory_text,
        emotion=emotion,
        importance=2,
    )

    if memory_content is None:
        memory_content = interaction_memory_text

    # 8. Update last interaction time (feeds the instinct engine's loneliness calc)
    pet.last_interaction_at = datetime.now(timezone.utc)

    # 9. Record the interaction
    interaction_record = PetInteraction(
        pet_id=pet.id,
        user_id=user.id,
        interaction_type=body.interaction_type,
        response_text=response_text,
        happiness_change=changes.get("happiness", 0),
        energy_change=changes.get("energy", 0),
        hunger_change=changes.get("hunger", 0),
        experience_gained=changes.get("experience", 0),
    )
    db.add(interaction_record)

    await db.commit()

    stat_changes = {
        "happiness": changes.get("happiness", 0),
        "energy": changes.get("energy", 0),
        "hunger": changes.get("hunger", 0),
        "experience": changes.get("experience", 0),
        "bond": changes.get("bond", 0),
    }

    return PetInteractResponse(
        response_text=response_text,
        stat_changes=stat_changes,
        new_stats=new_stats,
        memory_created=memory_content,
    )


# -----------------------------------------------
#  GET /api/pets/{pet_id}/memories
# -----------------------------------------------

@router.get("/{pet_id}/memories", response_model=list[PetMemoryResponse])
async def get_pet_memories(
    pet_id: int,
    memory_type: Optional[str] = Query(None, description="Filter by memory type"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get pet memories, paginated and optionally filtered by type."""
    pet = await _get_user_pet(pet_id, user, db)

    query = select(PetMemory).where(PetMemory.pet_id == pet.id)

    if memory_type is not None:
        if memory_type not in VALID_MEMORY_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid memory type. Must be one of: {', '.join(sorted(VALID_MEMORY_TYPES))}",
            )
        query = query.where(PetMemory.memory_type == memory_type)

    query = (
        query.order_by(PetMemory.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )

    result = await db.execute(query)
    memories = result.scalars().all()

    return [
        PetMemoryResponse(
            id=m.id,
            memory_type=m.memory_type,
            content=m.content,
            emotion=m.emotion,
            importance=m.importance,
            created_at=m.created_at,
        )
        for m in memories
    ]


# -----------------------------------------------
#  GET /api/pets/{pet_id}/dreams — Dream journal history
# -----------------------------------------------

@router.get("/{pet_id}/dreams", response_model=list[DreamJournalResponse])
async def get_pet_dreams(
    pet_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a pet's dream journal history, most recent first."""
    pet = await _get_user_pet(pet_id, user, db)

    result = await db.execute(
        select(DreamJournal)
        .where(DreamJournal.pet_id == pet.id)
        .order_by(DreamJournal.dream_date.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    journals = result.scalars().all()

    return [
        DreamJournalResponse(
            id=j.id,
            pet_id=j.pet_id,
            dream_date=j.dream_date,
            summary=j.summary,
            emotional_tone=j.emotional_tone,
            personality_changes=j.personality_changes,
            stat_changes=j.stat_changes,
            significant_events=j.significant_events,
            created_at=j.created_at,
        )
        for j in journals
    ]


# -----------------------------------------------
#  GET /api/pets/{pet_id}/dreams/latest — Last night's dream
# -----------------------------------------------

@router.get("/{pet_id}/dreams/latest", response_model=Optional[DreamJournalResponse])
async def get_latest_dream(
    pet_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the most recent dream journal entry for a pet."""
    pet = await _get_user_pet(pet_id, user, db)

    result = await db.execute(
        select(DreamJournal)
        .where(DreamJournal.pet_id == pet.id)
        .order_by(DreamJournal.dream_date.desc())
        .limit(1)
    )
    journal = result.scalar_one_or_none()

    if journal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{pet.name} hasn't dreamed yet.",
        )

    return DreamJournalResponse(
        id=journal.id,
        pet_id=journal.pet_id,
        dream_date=journal.dream_date,
        summary=journal.summary,
        emotional_tone=journal.emotional_tone,
        personality_changes=journal.personality_changes,
        stat_changes=journal.stat_changes,
        significant_events=journal.significant_events,
        created_at=journal.created_at,
    )


# -----------------------------------------------
#  GET /api/pets/{pet_id}/personality-evolution
# -----------------------------------------------

@router.get("/{pet_id}/personality-evolution", response_model=PersonalityEvolutionResponse)
async def get_personality_evolution(
    pet_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Show how a pet's personality has shifted over time through dreaming."""
    pet = await _get_user_pet(pet_id, user, db)

    # Get all dream journals for this pet, oldest first
    result = await db.execute(
        select(DreamJournal)
        .where(DreamJournal.pet_id == pet.id)
        .order_by(DreamJournal.dream_date.asc())
    )
    journals = result.scalars().all()

    # Build evolution history
    evolution_history = []
    for j in journals:
        changes = j.personality_changes or {}
        if changes:  # Only include days where personality actually shifted
            evolution_history.append({
                "date": str(j.dream_date),
                "emotional_tone": j.emotional_tone,
                "changes": changes,
            })

    # Current personality modifiers
    current_mods = dict(pet.personality_modifiers or {})

    # Determine dominant traits (sorted by absolute magnitude)
    sorted_traits = sorted(
        current_mods.items(),
        key=lambda x: abs(x[1]),
        reverse=True,
    )
    dominant_traits = [
        trait for trait, val in sorted_traits
        if abs(val) >= 0.05  # Only include meaningfully developed traits
    ]

    # Build trait descriptions for current modifiers
    descriptions = {}
    for trait in current_mods:
        if trait in TRAIT_DESCRIPTIONS:
            descriptions[trait] = TRAIT_DESCRIPTIONS[trait]

    return PersonalityEvolutionResponse(
        pet_id=pet.id,
        pet_name=pet.name,
        base_personality=pet.personality_type,
        current_modifiers=current_mods,
        evolution_history=evolution_history,
        dominant_traits=dominant_traits,
        trait_descriptions=descriptions,
    )


# -----------------------------------------------
#  GET /api/pets/{pet_id}/instincts — Current urge levels
# -----------------------------------------------

@router.get("/{pet_id}/instincts", response_model=InstinctsResponse)
async def get_pet_instincts(
    pet_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Peek into the pet's inner world. Returns current urge levels
    calculated from the pet's stats, personality, and emotional state.
    This is what the pet *wants* right now.
    """
    from app.services.instinct_engine import calculate_urges, should_act as instinct_should_act

    pet = await _get_user_pet(pet_id, user, db)

    # Apply time-based decay so urges reflect current reality
    decay_stats(pet)

    urges = calculate_urges(pet)
    wants_to_act = instinct_should_act(pet)
    mood = calculate_mood(pet.happiness, pet.energy, pet.hunger)

    return InstinctsResponse(
        pet_id=pet.id,
        pet_name=pet.name,
        current_mood=mood,
        should_act=wants_to_act,
        strongest_urge=urges[0].urge_type.value if urges else None,
        urges=[
            UrgeResponse(
                urge_type=u.urge_type.value,
                intensity=u.intensity,
                description=u.description,
                source_stats=u.source_stats,
            )
            for u in urges
        ],
    )


# -----------------------------------------------
#  GET /api/pets/{pet_id}/notifications — Unread notifications
# -----------------------------------------------

@router.get("/{pet_id}/notifications", response_model=list[PetNotificationResponse])
async def get_pet_notifications(
    pet_id: int,
    unread_only: bool = Query(True, description="Only return unread notifications"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get notifications from the pet. These are proactive pings
    the pet sends when it is hungry, lonely, excited, or has
    created something on its own.
    """
    from app.services.proactive_ping import check_and_ping

    pet = await _get_user_pet(pet_id, user, db)

    # First, evaluate if any new pings should be generated right now
    decay_stats(pet)
    await check_and_ping(pet, db)

    # Then fetch notifications
    query = select(PetNotification).where(PetNotification.pet_id == pet.id)
    if unread_only:
        query = query.where(PetNotification.is_read == False)  # noqa: E712

    query = (
        query.order_by(PetNotification.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )

    result = await db.execute(query)
    notifications = result.scalars().all()

    return [
        PetNotificationResponse(
            id=n.id,
            pet_id=n.pet_id,
            notification_type=n.notification_type,
            message=n.message,
            is_read=n.is_read,
            created_at=n.created_at,
        )
        for n in notifications
    ]


# -----------------------------------------------
#  POST /api/pets/{pet_id}/notifications/read — Mark as read
# -----------------------------------------------

@router.post("/{pet_id}/notifications/read")
async def mark_notifications_read(
    pet_id: int,
    body: NotificationReadRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Mark notifications as read. If notification_ids is null/empty,
    marks ALL unread notifications for this pet as read.
    """
    pet = await _get_user_pet(pet_id, user, db)

    if body.notification_ids:
        # Mark specific notifications
        result = await db.execute(
            select(PetNotification).where(
                PetNotification.pet_id == pet.id,
                PetNotification.id.in_(body.notification_ids),
                PetNotification.is_read == False,  # noqa: E712
            )
        )
        notifications = result.scalars().all()
        for n in notifications:
            n.is_read = True
        count = len(notifications)
    else:
        # Mark all unread
        result = await db.execute(
            select(PetNotification).where(
                PetNotification.pet_id == pet.id,
                PetNotification.is_read == False,  # noqa: E712
            )
        )
        notifications = result.scalars().all()
        for n in notifications:
            n.is_read = True
        count = len(notifications)

    await db.commit()

    return {"detail": f"Marked {count} notification(s) as read."}


# -----------------------------------------------
#  GET /api/pets/{pet_id}/autonomous-actions — History of self-initiated actions
# -----------------------------------------------

@router.get("/{pet_id}/autonomous-actions", response_model=list[AutonomousActionResponse])
async def get_autonomous_actions(
    pet_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    urge_type: Optional[str] = Query(None, description="Filter by urge type"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    View the history of actions the pet took autonomously.
    These are moments where the pet's urges were strong enough
    that it decided to act on its own.
    """
    pet = await _get_user_pet(pet_id, user, db)

    query = select(PetAutonomousAction).where(PetAutonomousAction.pet_id == pet.id)

    if urge_type:
        query = query.where(PetAutonomousAction.urge_type == urge_type)

    query = (
        query.order_by(PetAutonomousAction.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )

    result = await db.execute(query)
    actions = result.scalars().all()

    return [
        AutonomousActionResponse(
            id=a.id,
            pet_id=a.pet_id,
            urge_type=a.urge_type,
            action_taken=a.action_taken,
            prompt_used=a.prompt_used,
            generation_id=a.generation_id,
            credits_used=a.credits_used,
            created_at=a.created_at,
        )
        for a in actions
    ]


# -----------------------------------------------
#  DELETE /api/pets/{pet_id} — Release pet
# -----------------------------------------------

@router.delete("/{pet_id}", status_code=status.HTTP_200_OK)
async def release_pet(
    pet_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Release a pet (soft delete: sets is_active=False)."""
    pet = await _get_user_pet(pet_id, user, db)

    pet.is_active = False

    # Create farewell memory
    await create_memory(
        db=db,
        pet=pet,
        memory_type="milestone",
        content=f"{pet.name} was released. Farewell, dear friend.",
        emotion="sad",
        importance=5,
    )

    await db.commit()

    return {"detail": f"{pet.name} has been released. Farewell!"}
