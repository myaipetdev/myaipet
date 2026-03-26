"""
PETAGEN Grok API Video Generation Service
Uses Grok (x.ai) for image generation and optionally video generation,
with fal.ai fallback for video. Generates personalized "my pet" content
based on pet name, personality, and mood.
"""

import asyncio
import logging
from typing import Optional, Dict, Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# Pet species mapping (matches existing PET_NAMES in ai_video.py)
SPECIES_NAMES = {
    0: "cat",
    1: "dog",
    2: "parrot",
    3: "turtle",
    4: "hamster",
    5: "rabbit",
    6: "fox",
    7: "pomeranian",
}

# Style descriptors for prompt engineering
STYLE_DESCRIPTORS = {
    0: "cinematic style, dramatic lighting, shallow depth of field, film grain, warm color grading",
    1: "anime style, cel-shaded, vibrant colors, expressive eyes, Japanese animation aesthetic",
    2: "watercolor painting style, soft washes of color, delicate brushstrokes, artistic, dreamy",
    3: "3D rendered, Pixar-like quality, detailed fur textures, volumetric lighting, subsurface scattering",
    4: "pencil sketch style, hand-drawn line art, crosshatching, monochrome, artistic illustration",
}

# Personality trait descriptions for richer prompts
PERSONALITY_PROMPTS = {
    "friendly": "warm and approachable expression, gentle eyes, relaxed posture",
    "playful": "energetic pose, bright curious eyes, mid-action, dynamic movement",
    "shy": "slightly tucked posture, peeking curiously, soft gentle expression",
    "brave": "confident stance, proud posture, alert ears, bold gaze",
    "lazy": "relaxed and cozy, half-lidded eyes, comfortable lounging position",
}

# Mood-to-visual mapping
MOOD_VISUALS = {
    "happy": "joyful expression, bright eyes, warm atmosphere, golden hour lighting",
    "sad": "gentle melancholy, soft muted tones, quiet moment, rain-washed colors",
    "excited": "dynamic energy, vibrant colors, motion blur hints, sparkling eyes",
    "calm": "serene and peaceful, soft ambient light, tranquil setting, gentle breeze",
    "curious": "wide alert eyes, head tilted, exploring surroundings, detailed environment",
    "hungry": "attentive gaze, focused expression, anticipating, slight drool",
    "tired": "drowsy half-closed eyes, yawning, cozy nest, warm dim lighting",
}


class GrokVideoService:
    """
    Grok API service for generating personalized pet images and videos.
    Uses x.ai image generation API with rich pet-specific prompts.
    Falls back to fal.ai for video generation when Grok video API
    is not available.
    """

    def __init__(self):
        self.api_key = settings.GROK_API_KEY
        self.api_base = settings.GROK_API_BASE
        self.fal_api_key = settings.FAL_API_KEY
        self.fal_video_model = "fal-ai/kling-video/v3/standard/image-to-video"

    def _build_pet_prompt(
        self,
        pet_name: str,
        personality: str,
        mood: str,
        style: int,
        user_prompt: Optional[str] = None,
    ) -> str:
        """
        Build a rich, personalized prompt describing THIS specific pet.
        Not just "a cat" but "a playful golden cat named Mochi looking
        excited and wagging tail, in cinematic style".
        """
        # Get descriptors with safe fallbacks
        personality_desc = PERSONALITY_PROMPTS.get(personality, PERSONALITY_PROMPTS["friendly"])
        mood_desc = MOOD_VISUALS.get(mood, MOOD_VISUALS["calm"])
        style_desc = STYLE_DESCRIPTORS.get(style, STYLE_DESCRIPTORS[0])

        parts = []

        # User prompt takes priority if provided
        if user_prompt:
            # Weave pet identity into user prompt
            parts.append(
                f"A pet named {pet_name}, {user_prompt}"
            )
        else:
            # Build a full descriptive prompt from pet attributes
            parts.append(
                f"A charming pet named {pet_name}, "
                f"{personality_desc}"
            )

        # Always include mood and style for visual consistency
        parts.append(mood_desc)
        parts.append(style_desc)
        parts.append("high quality, detailed, beautiful composition")

        return ", ".join(parts)

    async def generate_image(
        self,
        prompt: str,
        aspect_ratio: str = "16:9",
    ) -> str:
        """
        Call Grok image generation API.
        POST https://api.x.ai/v1/images/generations
        Model: grok-imagine-image

        Returns the generated image URL.
        """
        if not self.api_key:
            raise ValueError("GROK_API_KEY is not configured")

        url = f"{self.api_base}/images/generations"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": "grok-imagine-image",
            "prompt": prompt,
            "n": 1,
            "response_format": "url",
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            for attempt in range(3):
                try:
                    response = await client.post(url, json=payload, headers=headers)

                    if response.status_code == 429:
                        # Rate limited — exponential backoff
                        wait_time = (2 ** attempt) * 2
                        logger.warning(
                            f"Grok API rate limited, retrying in {wait_time}s "
                            f"(attempt {attempt + 1}/3)"
                        )
                        await asyncio.sleep(wait_time)
                        continue

                    response.raise_for_status()
                    data = response.json()

                    # Extract image URL from response
                    # Grok API returns: { "data": [{ "url": "..." }] }
                    images = data.get("data", [])
                    if not images:
                        raise ValueError("No image returned from Grok API")

                    image_url = images[0].get("url", "")
                    if not image_url:
                        raise ValueError("Empty image URL from Grok API")

                    logger.info(f"Grok image generated successfully")
                    return image_url

                except httpx.HTTPStatusError as e:
                    if e.response.status_code == 429 and attempt < 2:
                        continue
                    logger.error(f"Grok API HTTP error: {e.response.status_code} - {e.response.text}")
                    raise
                except httpx.RequestError as e:
                    logger.error(f"Grok API request error: {e}")
                    if attempt < 2:
                        await asyncio.sleep(2 ** attempt)
                        continue
                    raise

        raise RuntimeError("Failed to generate image after 3 attempts")

    async def generate_video(
        self,
        image_url: str,
        prompt: str,
        duration: int = 5,
    ) -> Dict[str, Any]:
        """
        Generate video from image. Attempts Grok video API first,
        falls back to fal.ai if unavailable.

        Returns: {status, request_id, video_url}
        """
        # Try fal.ai as the primary video generation path
        # (Grok video API is not yet publicly available)
        return await self._generate_video_fal(image_url, prompt, duration)

    async def _generate_video_fal(
        self,
        image_url: str,
        prompt: str,
        duration: int,
    ) -> Dict[str, Any]:
        """
        Fall back to fal.ai for image-to-video generation.
        """
        try:
            import os
            import fal_client

            if self.fal_api_key:
                os.environ["FAL_KEY"] = self.fal_api_key

            duration_str = "5" if duration <= 5 else "10"

            handler = await fal_client.submit_async(
                self.fal_video_model,
                arguments={
                    "image_url": image_url,
                    "prompt": prompt,
                    "duration": duration_str,
                    "aspect_ratio": "1:1",
                },
            )

            return {
                "status": "queued",
                "request_id": handler.request_id,
                "video_url": None,
            }

        except Exception as e:
            logger.error(f"fal.ai video generation failed: {e}")
            return {
                "status": "failed",
                "request_id": "",
                "video_url": None,
                "error": str(e),
            }

    async def generate_pet_content(
        self,
        pet_name: str,
        pet_species: int,
        personality: str,
        mood: str,
        style: int,
        user_prompt: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Orchestrate full pet content generation:
        1. Build a personalized prompt from pet attributes
        2. Generate an image via Grok API
        3. Optionally generate a video from the image

        Returns: {image_url, video_url, prompt_used, status, request_id}
        """
        # Inject species into the prompt
        species_name = SPECIES_NAMES.get(pet_species, "pet")

        # Build the rich personalized prompt
        prompt = self._build_pet_prompt(
            pet_name=pet_name,
            personality=personality,
            mood=mood,
            style=style,
            user_prompt=user_prompt,
        )

        # Insert species right after pet name reference for clarity
        # e.g., "A pet named Buddy" -> "A cute dog named Buddy"
        prompt = prompt.replace(
            f"A pet named {pet_name}",
            f"A cute {species_name} named {pet_name}",
            1,
        )
        # Also handle user_prompt case
        prompt = prompt.replace(
            f"A charming pet named {pet_name}",
            f"A charming {species_name} named {pet_name}",
            1,
        )

        result: Dict[str, Any] = {
            "image_url": None,
            "video_url": None,
            "prompt_used": prompt,
            "status": "pending",
            "request_id": None,
        }

        try:
            # Step 1: Generate image via Grok
            image_url = await self.generate_image(prompt)
            result["image_url"] = image_url
            result["status"] = "image_ready"

            logger.info(
                f"Pet content image generated for '{pet_name}' ({species_name})"
            )
            return result

        except Exception as e:
            logger.error(f"Pet content generation failed for '{pet_name}': {e}")
            result["status"] = "failed"
            result["error"] = str(e)
            return result


# Singleton
grok_video_service = GrokVideoService()
