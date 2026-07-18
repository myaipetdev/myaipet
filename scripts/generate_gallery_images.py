"""Generate optional demo gallery assets with an explicitly supplied xAI key.

This developer utility never contains or falls back to a credential. Run it as
``GROK_API_KEY=... python scripts/generate_gallery_images.py`` from a trusted
shell; do not place the key in the repository.
"""

import asyncio
import os
from pathlib import Path

import httpx


API_BASE = "https://api.x.ai/v1"
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "frontend" / "public" / "gallery"
IMAGES = [
    ("cat_cloud.jpg", "A fluffy cat on a floating cloud island, vibrant fantasy digital art"),
    ("dog_space.jpg", "A golden retriever puppy in an astronaut helmet, cinematic space art"),
    ("parrot_cave.jpg", "A rainbow parrot flying through a glowing crystal cave, fantasy art"),
    ("turtle_forest.jpg", "A small turtle in a wizard hat in an enchanted mushroom forest"),
    ("hamster_ship.jpg", "A fluffy hamster piloting a tiny steampunk spaceship"),
    ("rabbit_tea.jpg", "A white rabbit at an elegant sunset rose-garden tea party"),
    ("fox_autumn.jpg", "A red fox running through a magical golden autumn forest"),
    ("pom_hero.jpg", "A tiny Pomeranian superhero above a neon city at night"),
    ("cat_astro.jpg", "A cat astronaut floating inside a whimsical spaceship"),
    ("dog_skate.jpg", "A Shiba Inu skateboarding on a neon city street at night"),
    ("owl_library.jpg", "A majestic owl on glowing books in a magical library"),
    ("penguin_slide.jpg", "A baby penguin on a rainbow ice slide under an aurora"),
    ("cat_moon.jpg", "A fluffy cat sleeping on a crescent moon, dreamy watercolor"),
    ("corgi_sunflower.jpg", "A joyful corgi running through sunflowers at golden hour"),
    ("dragon_cat.jpg", "A tiny dragon-cat curled on gemstones in a glowing cave"),
    ("rabbit_samurai.jpg", "A rabbit samurai in a cherry-blossom storm, digital ukiyo-e"),
    ("hamster_sushi.jpg", "Tiny hamsters operating a miniature sushi restaurant"),
    ("fox_witch.jpg", "A fox witch brewing a glowing potion in a cozy cottage"),
    ("cat_dj.jpg", "A cat DJ at a synthwave sunset beach party"),
    ("pom_balloon.jpg", "A Pomeranian in a hot-air balloon over a fantasy candy land"),
    ("turtle_zen.jpg", "A wise turtle meditating above clouds at sunrise"),
    ("cat_painter.jpg", "A kitten painter in a warm Parisian art studio"),
    ("wolf_moon.jpg", "A wolf beneath a crystalline moon in an aurora-lit forest"),
    ("friends_picnic.jpg", "A retriever and tabby cat picnic under cherry blossoms"),
]


def required_api_key() -> str:
    key = os.environ.get("GROK_API_KEY", "").strip()
    if not key:
        raise SystemExit("GROK_API_KEY must be supplied through the process environment")
    return key


async def generate(client: httpx.AsyncClient, api_key: str, filename: str, prompt: str) -> bool:
    response = await client.post(
        f"{API_BASE}/images/generations",
        headers={"Authorization": f"Bearer {api_key}"},
        json={"model": "grok-imagine-image", "prompt": prompt, "n": 1, "response_format": "url"},
    )
    response.raise_for_status()
    image_url = response.json()["data"][0]["url"]
    image = await client.get(image_url)
    image.raise_for_status()
    (OUTPUT_DIR / filename).write_bytes(image.content)
    print(f"Saved {filename} ({len(image.content) // 1024} KiB)")
    return True


async def main() -> None:
    api_key = required_api_key()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    async with httpx.AsyncClient(timeout=120.0) as client:
        for filename, prompt in IMAGES:
            try:
                await generate(client, api_key, filename, prompt)
            except Exception as error:
                print(f"Failed {filename}: {type(error).__name__}")
            await asyncio.sleep(2)


if __name__ == "__main__":
    asyncio.run(main())
