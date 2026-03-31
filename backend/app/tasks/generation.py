"""
PETAGEN Background Generation Task
Handles the async video generation pipeline:
  upload photo → fal.ai → poll → download → hash → on-chain record
"""

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from web3 import Web3

from app.database import async_session
from app.models import Generation, User, Transaction
from app.services.ai_video import ai_video_service
from app.services.storage import (
    get_full_photo_path,
    save_video_from_url,
    get_video_bytes,
)
from app.services.blockchain import blockchain_service, PendingRecord

logger = logging.getLogger(__name__)


# Credit costs by duration
CREDIT_COSTS = {
    3: 15,
    5: 30,
    10: 60,
}


def get_credit_cost(duration: int) -> int:
    """Get credit cost for a given duration."""
    return CREDIT_COSTS.get(duration, 30)


async def process_generation(generation_id: int):
    """
    Main background task for video generation.
    Runs the full pipeline: AI generation → save → hash → on-chain.
    """
    async with async_session() as db:
        try:
            # 1. Load generation record
            result = await db.execute(
                select(Generation).where(Generation.id == generation_id)
            )
            gen = result.scalar_one_or_none()
            if not gen:
                logger.error(f"Generation {generation_id} not found")
                return

            # Load user
            user_result = await db.execute(
                select(User).where(User.id == gen.user_id)
            )
            user = user_result.scalar_one_or_none()
            if not user:
                logger.error(f"User {gen.user_id} not found")
                return

            # 2. Update status to processing
            gen.status = "processing"
            await db.commit()

            # 3. Upload photo to fal.ai for a public URL
            photo_path = get_full_photo_path(gen.photo_path)
            logger.info(f"[GEN {generation_id}] Uploading photo: {photo_path}")

            try:
                image_url = await ai_video_service.upload_image(photo_path)
            except Exception as e:
                gen.status = "failed"
                gen.error_message = f"Photo upload failed: {str(e)}"
                # Refund credits
                user.credits += gen.credits_charged
                await db.commit()
                logger.error(f"[GEN {generation_id}] Photo upload failed: {e}")
                return

            # 4. Submit generation to AI service
            logger.info(f"[GEN {generation_id}] Submitting to AI: style={gen.style}, dur={gen.duration}s")
            submit_result = await ai_video_service.submit_generation(
                image_url=image_url,
                pet_type=gen.pet_type,
                style=gen.style,
                duration=gen.duration,
                user_prompt=gen.prompt,
            )

            if submit_result.status == "failed":
                gen.status = "failed"
                gen.error_message = submit_result.error
                user.credits += gen.credits_charged
                await db.commit()
                logger.error(f"[GEN {generation_id}] Submit failed: {submit_result.error}")
                return

            gen.fal_request_id = submit_result.request_id
            await db.commit()

            # 5. Poll for completion (max 10 minutes)
            logger.info(f"[GEN {generation_id}] Polling for result: {submit_result.request_id}")
            final_result = await ai_video_service.wait_for_result(
                submit_result.request_id, timeout=600, poll_interval=10
            )

            if final_result.status == "failed":
                gen.status = "failed"
                gen.error_message = final_result.error or "AI generation failed"
                user.credits += gen.credits_charged
                await db.commit()
                logger.error(f"[GEN {generation_id}] Generation failed: {final_result.error}")
                return

            if not final_result.video_url:
                gen.status = "failed"
                gen.error_message = "No video URL returned"
                user.credits += gen.credits_charged
                await db.commit()
                return

            # 6. Download and save video
            logger.info(f"[GEN {generation_id}] Downloading video: {final_result.video_url}")
            video_path = await save_video_from_url(final_result.video_url, generation_id)
            gen.video_path = video_path

            # 7. Compute content hash (keccak256 of video bytes)
            video_bytes = await get_video_bytes(video_path)
            content_hash = Web3.keccak(video_bytes)
            gen.content_hash = content_hash.hex()

            # 8. Record on-chain (add to batch queue)
            logger.info(f"[GEN {generation_id}] Adding to on-chain batch queue")
            await blockchain_service.add_to_batch(
                PendingRecord(
                    user_address=user.wallet_address,
                    pet_type=gen.pet_type,
                    style=gen.style,
                    content_hash=content_hash,
                    generation_id=generation_id,
                )
            )

            # 8b. Mint PETContent NFT
            if user.wallet_address:
                logger.info(f"[GEN {generation_id}] Minting PETContent NFT")
                nft_result = await blockchain_service.mint_content(
                    to_address=user.wallet_address,
                    pet_type=gen.pet_type,
                    style=gen.style,
                    gen_type="video",
                    content_hash=content_hash,
                )
                if nft_result.success:
                    gen.nft_tx_hash = nft_result.tx_hash
                    logger.info(f"[GEN {generation_id}] NFT minted: {nft_result.tx_hash}")
                else:
                    logger.warning(f"[GEN {generation_id}] NFT mint failed: {nft_result.error}")

            # 9. Mark as completed
            gen.status = "completed"
            gen.completed_at = datetime.now(timezone.utc)
            await db.commit()

            logger.info(f"[GEN {generation_id}] ✅ Completed successfully")

        except Exception as e:
            logger.error(f"[GEN {generation_id}] Unexpected error: {e}")
            try:
                # Try to mark as failed and refund
                result = await db.execute(
                    select(Generation).where(Generation.id == generation_id)
                )
                gen = result.scalar_one_or_none()
                if gen and gen.status != "completed":
                    gen.status = "failed"
                    gen.error_message = str(e)

                    user_result = await db.execute(
                        select(User).where(User.id == gen.user_id)
                    )
                    user = user_result.scalar_one_or_none()
                    if user:
                        user.credits += gen.credits_charged

                    await db.commit()
            except Exception as inner_e:
                logger.error(f"[GEN {generation_id}] Failed to handle error: {inner_e}")
