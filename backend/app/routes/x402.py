"""
PETAGEN X402 Payment Routes
API endpoints for X402 pricing, payment history, statistics,
and the X402-protected agent video generation endpoint.
"""

import logging
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.x402_payment import x402_payment_service
from app.services.ai_video import ai_video_service
from app.models_x402 import X402Payment, X402PricingConfig

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/x402", tags=["x402"])


# -------------------------------------------------------------------
# Pydantic schemas
# -------------------------------------------------------------------

class PricingItemResponse(BaseModel):
    endpoint_pattern: str
    price_usdc: float
    description: Optional[str] = None
    is_active: bool = True


class PricingListResponse(BaseModel):
    items: List[PricingItemResponse]
    pay_to: str
    network: str = "eip155:8453"
    asset: str = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"


class PaymentItemResponse(BaseModel):
    id: int
    payer_address: str
    amount_usdc: float
    network: str
    tx_hash: Optional[str] = None
    endpoint: str
    status: str
    created_at: str
    settled_at: Optional[str] = None


class PaymentHistoryResponse(BaseModel):
    items: List[PaymentItemResponse]
    total: int


class PaymentStatsResponse(BaseModel):
    total_revenue_usdc: float
    total_payments: int
    settled_payments: int
    failed_payments: int
    unique_payers: int


class AgentGenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=1000, description="Video generation prompt")
    style: int = Field(default=0, ge=0, le=4, description="Style index 0-4")
    duration: int = Field(default=5, description="Duration in seconds (3, 5, or 10)")
    image_url: Optional[str] = Field(default=None, description="Source image URL for image-to-video")


class AgentGenerateResponse(BaseModel):
    generation_id: str
    status: str
    prompt: str
    style: int
    duration: int
    video_url: Optional[str] = None
    payer: Optional[str] = None
    tx_hash: Optional[str] = None
    message: str = "Generation queued successfully"


# -------------------------------------------------------------------
# Public routes (no X402 payment required)
# -------------------------------------------------------------------

@router.get("/pricing", response_model=PricingListResponse)
async def get_pricing(db: AsyncSession = Depends(get_db)):
    """List all X402-enabled endpoints and their prices."""
    from app.config import settings

    configs = await x402_payment_service.get_all_pricing(db)
    items = [
        PricingItemResponse(
            endpoint_pattern=c.endpoint_pattern,
            price_usdc=c.price_usdc,
            description=c.description,
            is_active=c.is_active,
        )
        for c in configs
    ]
    return PricingListResponse(
        items=items,
        pay_to=settings.X402_WALLET_ADDRESS,
    )


@router.get("/payments", response_model=PaymentHistoryResponse)
async def get_payments(
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    """Get X402 payment history."""
    from sqlalchemy import select, func
    from app.models_x402 import X402Payment

    # Get total count
    count_result = await db.execute(
        select(func.count()).select_from(X402Payment)
    )
    total = count_result.scalar() or 0

    payments = await x402_payment_service.get_payment_history(db, limit=limit, offset=offset)
    items = [
        PaymentItemResponse(
            id=p.id,
            payer_address=p.payer_address,
            amount_usdc=p.amount_usdc,
            network=p.network,
            tx_hash=p.tx_hash,
            endpoint=p.endpoint,
            status=p.status,
            created_at=p.created_at.isoformat() if p.created_at else "",
            settled_at=p.settled_at.isoformat() if p.settled_at else None,
        )
        for p in payments
    ]
    return PaymentHistoryResponse(items=items, total=total)


@router.get("/stats", response_model=PaymentStatsResponse)
async def get_stats(db: AsyncSession = Depends(get_db)):
    """Get aggregate X402 payment statistics."""
    stats = await x402_payment_service.get_payment_stats(db)
    return PaymentStatsResponse(**stats)


# -------------------------------------------------------------------
# X402-protected endpoint (payment handled by middleware)
# -------------------------------------------------------------------

@router.post("/agent-generate", response_model=AgentGenerateResponse)
async def agent_generate(
    body: AgentGenerateRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    X402-protected video generation endpoint for external AI agents.
    Payment is verified and settled by the X402 middleware before this handler runs.

    Accepts a prompt, style, and duration; returns a generation ID and status.
    The caller can poll for completion or provide a webhook URL.
    """
    # Validate duration
    if body.duration not in (3, 5, 10):
        raise HTTPException(400, "duration must be 3, 5, or 10")

    # Get payer info injected by X402 middleware
    payer = getattr(request.state, "x402_payer", None)
    tx_hash = getattr(request.state, "x402_tx_hash", None)

    logger.info(
        f"Agent generation requested: prompt='{body.prompt[:50]}...', "
        f"style={body.style}, duration={body.duration}, payer={payer}"
    )

    # If an image_url is provided, use image-to-video
    if body.image_url:
        result = await ai_video_service.submit_generation(
            image_url=body.image_url,
            pet_type=0,  # default cat for agent requests
            style=body.style,
            duration=body.duration,
            user_prompt=body.prompt,
        )

        if result.status == "failed":
            raise HTTPException(500, f"Generation failed: {result.error}")

        # Record the generation in the database for tracking
        from app.models import Generation
        gen = Generation(
            user_id=None,  # external agent, no user account
            pet_type=0,
            style=body.style,
            prompt=body.prompt,
            duration=body.duration,
            photo_path=body.image_url,
            status="queued",
            credits_charged=0,  # paid via X402
            fal_request_id=result.request_id,
        )
        db.add(gen)
        await db.commit()
        await db.refresh(gen)

        # Start background polling for result
        from app.tasks.generation import process_generation
        background_tasks.add_task(process_generation, gen.id)

        return AgentGenerateResponse(
            generation_id=str(gen.id),
            status="queued",
            prompt=body.prompt,
            style=body.style,
            duration=body.duration,
            payer=payer,
            tx_hash=tx_hash,
            message="Image-to-video generation queued. Poll status endpoint for result.",
        )
    else:
        # Text-to-video: submit with a placeholder approach
        # For now, we queue and return; the generation task handles the actual work
        from app.models import Generation
        gen = Generation(
            user_id=None,
            pet_type=0,
            style=body.style,
            prompt=body.prompt,
            duration=body.duration,
            photo_path="agent-request-no-image",
            status="queued",
            credits_charged=0,
            fal_request_id=None,
        )
        db.add(gen)
        await db.commit()
        await db.refresh(gen)

        return AgentGenerateResponse(
            generation_id=str(gen.id),
            status="queued",
            prompt=body.prompt,
            style=body.style,
            duration=body.duration,
            payer=payer,
            tx_hash=tx_hash,
            message="Generation queued. Provide image_url for image-to-video generation.",
        )
