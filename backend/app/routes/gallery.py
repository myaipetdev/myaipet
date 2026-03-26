"""
PETAGEN Gallery Routes
Public endpoints for browsing community creations.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.database import get_db
from app.models import Generation, User
from app.schemas import GalleryItem, GalleryResponse
from app.services.storage import get_photo_url, get_video_url

router = APIRouter(prefix="/api/gallery", tags=["gallery"])


PET_NAMES = {
    0: "Cat", 1: "Dog", 2: "Parrot", 3: "Turtle",
    4: "Hamster", 5: "Rabbit", 6: "Fox", 7: "Pomeranian",
}


@router.get("", response_model=GalleryResponse)
async def get_gallery(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    pet_type: Optional[int] = Query(None, ge=0, le=7),
    style: Optional[int] = Query(None, ge=0, le=4),
    chain: Optional[str] = Query(None),
    sort: str = Query("recent", regex="^(recent|oldest)$"),
    db: AsyncSession = Depends(get_db),
):
    """
    Get paginated gallery of completed generations.
    Public endpoint — no auth required.
    """
    # Base query: only completed generations with video
    query = (
        select(Generation, User.wallet_address)
        .join(User, Generation.user_id == User.id)
        .where(
            Generation.status == "completed",
            Generation.video_path.isnot(None),
        )
    )

    count_query = (
        select(func.count())
        .select_from(Generation)
        .where(
            Generation.status == "completed",
            Generation.video_path.isnot(None),
        )
    )

    # Filters
    if pet_type is not None:
        query = query.where(Generation.pet_type == pet_type)
        count_query = count_query.where(Generation.pet_type == pet_type)

    if style is not None:
        query = query.where(Generation.style == style)
        count_query = count_query.where(Generation.style == style)

    if chain:
        query = query.where(Generation.chain == chain)
        count_query = count_query.where(Generation.chain == chain)

    # Sort
    if sort == "recent":
        query = query.order_by(Generation.completed_at.desc())
    else:
        query = query.order_by(Generation.completed_at.asc())

    # Count
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Paginate
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await db.execute(query)
    rows = result.all()

    items = []
    for gen, wallet in rows:
        # Truncate wallet for display
        truncated = f"{wallet[:6]}...{wallet[-4:]}" if len(wallet) >= 10 else wallet

        items.append(GalleryItem(
            id=gen.id,
            pet_type=gen.pet_type,
            style=gen.style,
            prompt=gen.prompt,
            duration=gen.duration,
            photo_url=get_photo_url(gen.photo_path),
            video_url=get_video_url(gen.video_path),
            wallet_address=truncated,
            chain=gen.chain,
            content_hash=gen.content_hash,
            created_at=gen.created_at,
        ))

    return GalleryResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )
