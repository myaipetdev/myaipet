"""
PETAGEN Pet-Specific Generation Routes
Generate personalized "my pet" content using Grok API.
Each generation is tied to a specific pet's identity, personality, and mood.
"""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from datetime import datetime

from app.database import get_db
from app.models import User, Generation
from app.models_pet import Pet, PetMemory
from app.auth import get_current_user
from app.services.grok_video import grok_video_service, SPECIES_NAMES
from app.tasks.generation import get_credit_cost
from app.services.pet_engine import calculate_mood

router = APIRouter(prefix="/api/pets", tags=["pet-generate"])


# ── Request / Response Schemas ──

class PetGenerateRequest(BaseModel):
    style: int = Field(ge=0, le=4, description="0=cinematic,1=anime,2=watercolor,3=3d,4=sketch")
    duration: int = Field(default=5, description="3, 5, or 10 seconds")
    prompt: Optional[str] = Field(None, max_length=500, description="Optional custom prompt")
    type: str = Field(default="image", description="'image' or 'video'")


class PetGenerateResponse(BaseModel):
    generation_id: int
    status: str
    image_url: Optional[str]
    video_url: Optional[str]
    prompt_used: str
    pet_name: str
    pet_species: str
    credits_charged: int
    created_at: datetime


# calculate_mood imported from app.services.pet_engine


# ── Route ──

@router.post("/{pet_id}/generate", response_model=PetGenerateResponse)
async def generate_pet_content(
    pet_id: int,
    body: PetGenerateRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate personalized content for a specific pet.
    Uses the pet's name, species, personality, and current mood
    to create truly personal "my pet" imagery via Grok API.
    """
    # Validate inputs
    if body.duration not in (3, 5, 10):
        raise HTTPException(400, "duration must be 3, 5, or 10")
    if body.type not in ("image", "video"):
        raise HTTPException(400, "type must be 'image' or 'video'")

    # Fetch pet and verify ownership
    result = await db.execute(
        select(Pet).where(Pet.id == pet_id, Pet.user_id == user.id, Pet.is_active == True)
    )
    pet = result.scalar_one_or_none()
    if not pet:
        raise HTTPException(404, "Pet not found or does not belong to you")

    # Check credits
    credit_cost = get_credit_cost(body.duration) if body.type == "video" else 1
    if user.credits < credit_cost:
        raise HTTPException(
            402,
            f"Insufficient credits. Need {credit_cost}, have {user.credits}",
        )

    # Deduct credits
    user.credits -= credit_cost

    # Calculate current mood from pet stats
    mood = calculate_mood(pet.happiness, pet.energy, pet.hunger)
    species_name = SPECIES_NAMES.get(pet.species, "pet")

    # Generate content via Grok
    gen_result = await grok_video_service.generate_pet_content(
        pet_name=pet.name,
        pet_species=pet.species,
        personality=pet.personality_type,
        mood=mood,
        style=body.style,
        user_prompt=body.prompt,
    )

    # Determine status
    status = gen_result.get("status", "failed")
    if status == "failed":
        # Refund credits on failure
        user.credits += credit_cost
        await db.commit()
        error_msg = gen_result.get("error", "Unknown generation error")
        raise HTTPException(500, f"Generation failed: {error_msg}")

    # If video requested and image is ready, kick off video generation
    video_url = None
    fal_request_id = None
    if body.type == "video" and gen_result.get("image_url"):
        video_result = await grok_video_service.generate_video(
            image_url=gen_result["image_url"],
            prompt=gen_result["prompt_used"],
            duration=body.duration,
        )
        video_url = video_result.get("video_url")
        fal_request_id = video_result.get("request_id")
        if video_result.get("status") == "failed":
            status = "video_failed"
        else:
            status = video_result.get("status", "queued")

    # Create Generation record
    gen = Generation(
        user_id=user.id,
        pet_type=pet.species,
        style=body.style,
        prompt=gen_result["prompt_used"],
        duration=body.duration,
        photo_path=gen_result.get("image_url", ""),
        video_path=video_url,
        status=status,
        credits_charged=credit_cost,
        fal_request_id=fal_request_id,
    )
    db.add(gen)

    # Create PetMemory of type "generation"
    memory_content = (
        f"Had a {['cinematic','anime','watercolor','3D','sketch'][body.style]} "
        f"{'video' if body.type == 'video' else 'photo'} taken! "
        f"Mood was {mood}. Prompt: {gen_result['prompt_used'][:200]}"
    )
    memory = PetMemory(
        pet_id=pet.id,
        memory_type="generation",
        content=memory_content,
        emotion=mood,
        importance=2,
    )
    db.add(memory)

    await db.commit()
    await db.refresh(gen)

    return PetGenerateResponse(
        generation_id=gen.id,
        status=gen.status,
        image_url=gen_result.get("image_url"),
        video_url=video_url,
        prompt_used=gen_result["prompt_used"],
        pet_name=pet.name,
        pet_species=species_name,
        credits_charged=credit_cost,
        created_at=gen.created_at,
    )
