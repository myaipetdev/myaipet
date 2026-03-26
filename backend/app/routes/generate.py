"""
PETAGEN Generation Routes
Upload photo → queue AI generation → poll status.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.database import get_db
from app.models import User, Generation
from app.auth import get_current_user
from app.schemas import GenerationStatusResponse, GenerationListResponse
from app.services.storage import save_upload, get_photo_url, get_video_url
from app.tasks.generation import process_generation, get_credit_cost

router = APIRouter(prefix="/api/generate", tags=["generate"])


@router.post("", response_model=GenerationStatusResponse)
async def create_generation(
    background_tasks: BackgroundTasks,
    photo: UploadFile = File(...),
    pet_type: int = Form(...),
    style: int = Form(...),
    duration: int = Form(5),
    prompt: Optional[str] = Form(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a pet photo and start video generation.
    Deducts credits immediately; refunds on failure.
    """
    # Validate inputs
    if pet_type < 0 or pet_type > 7:
        raise HTTPException(400, "pet_type must be 0-7")
    if style < 0 or style > 4:
        raise HTTPException(400, "style must be 0-4")
    if duration not in (3, 5, 10):
        raise HTTPException(400, "duration must be 3, 5, or 10")

    # Check file type
    if photo.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(400, "Only JPEG, PNG, and WebP images are supported")

    # Check credits
    credit_cost = get_credit_cost(duration)
    if user.credits < credit_cost:
        raise HTTPException(
            402,
            f"Insufficient credits. Need {credit_cost}, have {user.credits}"
        )

    # Read file
    file_data = await photo.read()
    if len(file_data) > 10 * 1024 * 1024:  # 10MB limit
        raise HTTPException(400, "File too large. Maximum 10MB.")

    # Deduct credits (atomic)
    user.credits -= credit_cost

    # Save photo
    photo_path = await save_upload(file_data, photo.filename or "photo.jpg", user.id)

    # Create generation record
    gen = Generation(
        user_id=user.id,
        pet_type=pet_type,
        style=style,
        prompt=prompt,
        duration=duration,
        photo_path=photo_path,
        status="pending",
        credits_charged=credit_cost,
    )
    db.add(gen)
    await db.commit()
    await db.refresh(gen)

    # Start background task
    background_tasks.add_task(process_generation, gen.id)

    return GenerationStatusResponse(
        id=gen.id,
        status=gen.status,
        pet_type=gen.pet_type,
        style=gen.style,
        prompt=gen.prompt,
        duration=gen.duration,
        credits_charged=gen.credits_charged,
        photo_url=get_photo_url(gen.photo_path),
        video_url=None,
        content_hash=None,
        tx_hash=None,
        chain=None,
        error_message=None,
        created_at=gen.created_at,
        completed_at=None,
    )


@router.get("/{generation_id}/status", response_model=GenerationStatusResponse)
async def get_generation_status(
    generation_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the current status of a generation."""
    result = await db.execute(
        select(Generation).where(
            Generation.id == generation_id,
            Generation.user_id == user.id,
        )
    )
    gen = result.scalar_one_or_none()
    if not gen:
        raise HTTPException(404, "Generation not found")

    return GenerationStatusResponse(
        id=gen.id,
        status=gen.status,
        pet_type=gen.pet_type,
        style=gen.style,
        prompt=gen.prompt,
        duration=gen.duration,
        credits_charged=gen.credits_charged,
        photo_url=get_photo_url(gen.photo_path),
        video_url=get_video_url(gen.video_path) if gen.video_path else None,
        content_hash=gen.content_hash,
        tx_hash=gen.tx_hash,
        chain=gen.chain,
        error_message=gen.error_message,
        created_at=gen.created_at,
        completed_at=gen.completed_at,
    )


@router.get("/history", response_model=GenerationListResponse)
async def get_generation_history(
    page: int = 1,
    page_size: int = 20,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get paginated generation history for the current user."""
    offset = (page - 1) * page_size

    # Count total
    count_result = await db.execute(
        select(func.count()).where(Generation.user_id == user.id)
    )
    total = count_result.scalar() or 0

    # Fetch page
    result = await db.execute(
        select(Generation)
        .where(Generation.user_id == user.id)
        .order_by(Generation.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    generations = result.scalars().all()

    items = [
        GenerationStatusResponse(
            id=g.id,
            status=g.status,
            pet_type=g.pet_type,
            style=g.style,
            prompt=g.prompt,
            duration=g.duration,
            credits_charged=g.credits_charged,
            photo_url=get_photo_url(g.photo_path),
            video_url=get_video_url(g.video_path) if g.video_path else None,
            content_hash=g.content_hash,
            tx_hash=g.tx_hash,
            chain=g.chain,
            error_message=g.error_message,
            created_at=g.created_at,
            completed_at=g.completed_at,
        )
        for g in generations
    ]

    return GenerationListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )
