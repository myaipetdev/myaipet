"""
PETAGEN AI Video Generation Service
Uses fal.ai as the primary provider with multi-model routing.
Automatically selects the best model based on style and quality tier.
"""

import os
import asyncio
import logging
from typing import Optional, Dict, Any
from dataclasses import dataclass, field
from enum import Enum

from app.config import settings

logger = logging.getLogger(__name__)


class VideoTier(str, Enum):
    BUDGET = "budget"       # Cheapest, fast (~$0.10/5s)
    STANDARD = "standard"   # Good balance (~$0.23/5s)
    PREMIUM = "premium"     # Best quality (~$0.42/5s)
    ULTRA = "ultra"         # Top tier with audio (~$0.75/5s)


# Multi-model registry: tier → fal.ai model endpoint
VIDEO_MODELS = {
    VideoTier.BUDGET: {
        "model": "fal-ai/minimax/hailuo-02-fast/image-to-video",
        "name": "Hailuo 02 Fast",
        "cost_per_sec": 0.02,
        "max_duration": 10,
        "resolution": "768p",
    },
    VideoTier.STANDARD: {
        "model": "fal-ai/minimax/hailuo-02/standard/image-to-video",
        "name": "Hailuo 02 Standard",
        "cost_per_sec": 0.045,
        "max_duration": 10,
        "resolution": "768p",
    },
    VideoTier.PREMIUM: {
        "model": "fal-ai/kling-video/v3/standard/image-to-video",
        "name": "Kling 3.0 Standard",
        "cost_per_sec": 0.084,
        "max_duration": 15,
        "resolution": "1080p",
    },
    VideoTier.ULTRA: {
        "model": "fal-ai/kling-video/v3/pro/image-to-video",
        "name": "Kling 3.0 Pro",
        "cost_per_sec": 0.112,
        "max_duration": 15,
        "resolution": "1080p",
    },
}

# Style → recommended tier override (anime works best on certain models)
STYLE_MODEL_HINTS = {
    1: VideoTier.STANDARD,   # Anime style → Hailuo handles stylized well
}

# Style modifiers appended to user prompts
STYLE_PROMPTS = {
    0: "cinematic, movie-quality, dramatic lighting, shallow depth of field",
    1: "anime style, cel-shaded, vibrant colors, Japanese animation",
    2: "watercolor painting style, soft edges, artistic, delicate brushstrokes",
    3: "3D rendered, Pixar-like, detailed textures, volumetric lighting",
    4: "pencil sketch style, hand-drawn, artistic line work, monochrome",
}

PET_NAMES = {
    0: "cat", 1: "dog", 2: "parrot", 3: "turtle",
    4: "hamster", 5: "rabbit", 6: "fox", 7: "pomeranian",
}


@dataclass
class VideoResult:
    status: str          # "queued", "processing", "completed", "failed"
    request_id: str
    video_url: Optional[str] = None
    error: Optional[str] = None
    model_used: Optional[str] = None
    estimated_cost: Optional[float] = None


class AIVideoService:
    """
    AI Video Generation via fal.ai with multi-model routing.
    Automatically selects the best model based on tier and style.
    """

    def __init__(self):
        self.api_key = settings.FAL_API_KEY
        self.default_tier = VideoTier.PREMIUM

    def get_model_for_request(
        self, style: int, tier: Optional[VideoTier] = None
    ) -> Dict[str, Any]:
        """Select the best model based on tier and style hints."""
        if tier is None:
            tier = STYLE_MODEL_HINTS.get(style, self.default_tier)
        return VIDEO_MODELS[tier]

    def estimate_cost(self, duration: int, tier: Optional[VideoTier] = None) -> float:
        """Estimate generation cost in USD."""
        model_info = VIDEO_MODELS.get(tier or self.default_tier)
        return model_info["cost_per_sec"] * duration

    def _build_prompt(self, pet_type: int, style: int, user_prompt: Optional[str]) -> str:
        """Build the final prompt combining user input, pet type, and style."""
        pet_name = PET_NAMES.get(pet_type, "pet")
        style_text = STYLE_PROMPTS.get(style, "")

        parts = []
        if user_prompt:
            parts.append(user_prompt)
        else:
            parts.append(f"A {pet_name} in gentle natural motion, breathing and looking around")

        parts.append(style_text)
        parts.append("smooth motion, high quality, detailed")

        return ", ".join(parts)

    async def submit_generation(
        self,
        image_url: str,
        pet_type: int,
        style: int,
        duration: int,
        user_prompt: Optional[str] = None,
        tier: Optional[VideoTier] = None,
    ) -> VideoResult:
        """
        Submit a video generation request to fal.ai.
        Automatically routes to the best model for the given tier/style.
        """
        try:
            import fal_client

            if self.api_key:
                os.environ["FAL_KEY"] = self.api_key

            model_info = self.get_model_for_request(style, tier)
            model_endpoint = model_info["model"]
            prompt = self._build_prompt(pet_type, style, user_prompt)

            # Clamp duration to model's max
            actual_duration = min(duration, model_info["max_duration"])
            duration_str = "5" if actual_duration <= 5 else "10"

            estimated_cost = model_info["cost_per_sec"] * actual_duration

            logger.info(
                f"Submitting to {model_info['name']} ({model_endpoint}) "
                f"duration={duration_str}s est_cost=${estimated_cost:.3f}"
            )

            handler = await fal_client.submit_async(
                model_endpoint,
                arguments={
                    "image_url": image_url,
                    "prompt": prompt,
                    "duration": duration_str,
                    "aspect_ratio": "1:1",
                },
            )

            return VideoResult(
                status="queued",
                request_id=handler.request_id,
                model_used=model_endpoint,
                estimated_cost=estimated_cost,
            )

        except Exception as e:
            logger.error(f"Failed to submit generation: {e}")
            return VideoResult(
                status="failed",
                request_id="",
                error=str(e),
            )

    async def check_status(
        self, request_id: str, model_endpoint: Optional[str] = None
    ) -> VideoResult:
        """
        Poll fal.ai for generation status.
        model_endpoint should match the model used for submission.
        """
        try:
            import fal_client

            if self.api_key:
                os.environ["FAL_KEY"] = self.api_key

            # Use provided model or fall back to premium default
            model = model_endpoint or VIDEO_MODELS[self.default_tier]["model"]

            status_result = await fal_client.status_async(
                model,
                request_id,
                with_logs=False,
            )

            if hasattr(status_result, "status"):
                if status_result.status == "COMPLETED":
                    result = await fal_client.result_async(model, request_id)
                    video_url = result.get("video", {}).get("url", "")
                    return VideoResult(
                        status="completed",
                        request_id=request_id,
                        video_url=video_url,
                        model_used=model,
                    )
                elif status_result.status == "FAILED":
                    return VideoResult(
                        status="failed",
                        request_id=request_id,
                        error="Generation failed on provider side",
                    )
                else:
                    return VideoResult(
                        status="processing",
                        request_id=request_id,
                    )
            else:
                video_url = status_result.get("video", {}).get("url", "")
                if video_url:
                    return VideoResult(
                        status="completed",
                        request_id=request_id,
                        video_url=video_url,
                        model_used=model,
                    )
                return VideoResult(status="processing", request_id=request_id)

        except Exception as e:
            logger.error(f"Status check failed: {e}")
            return VideoResult(
                status="processing",
                request_id=request_id,
                error=str(e),
            )

    async def upload_image(self, file_path: str) -> str:
        """Upload an image to fal.ai storage, returns a public URL."""
        try:
            import fal_client

            if self.api_key:
                os.environ["FAL_KEY"] = self.api_key

            url = await fal_client.upload_file_async(file_path)
            return url

        except Exception as e:
            logger.error(f"Image upload failed: {e}")
            raise

    async def wait_for_result(
        self,
        request_id: str,
        model_endpoint: Optional[str] = None,
        timeout: int = 600,
        poll_interval: int = 10,
    ) -> VideoResult:
        """
        Poll until completion or timeout.
        Used by background task processor.
        """
        elapsed = 0
        while elapsed < timeout:
            result = await self.check_status(request_id, model_endpoint)
            if result.status in ("completed", "failed"):
                return result
            await asyncio.sleep(poll_interval)
            elapsed += poll_interval

        return VideoResult(
            status="failed",
            request_id=request_id,
            error=f"Timeout after {timeout}s",
        )

    def get_available_models(self) -> list:
        """Return all available model tiers with pricing info."""
        return [
            {
                "tier": tier.value,
                "name": info["name"],
                "cost_per_sec": info["cost_per_sec"],
                "cost_5s": round(info["cost_per_sec"] * 5, 3),
                "cost_10s": round(info["cost_per_sec"] * 10, 3),
                "max_duration": info["max_duration"],
                "resolution": info["resolution"],
            }
            for tier, info in VIDEO_MODELS.items()
        ]


# Singleton
ai_video_service = AIVideoService()
