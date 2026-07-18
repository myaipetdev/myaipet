"""Generate optional pet-avatar assets with an explicitly supplied xAI key.

No credential is embedded in this utility. Supply ``GROK_API_KEY`` only in the
trusted process environment when deliberately regenerating demo assets.
"""

import asyncio
import os
from pathlib import Path

import httpx


API_BASE = "https://api.x.ai/v1"
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "frontend" / "public" / "gallery"
PETS = [
    ("pet_cat.jpg", "cat", "fluffy golden-amber fur and a curious expression"),
    ("pet_dog.jpg", "golden retriever puppy", "warm fur, floppy ears, and a happy expression"),
    ("pet_parrot.jpg", "tropical parrot", "vibrant rainbow feathers and spread wings"),
    ("pet_turtle.jpg", "small turtle", "a patterned shell and gentle wise eyes"),
    ("pet_hamster.jpg", "round hamster", "cream-brown fur, chubby cheeks, and tiny pink paws"),
    ("pet_rabbit.jpg", "white rabbit", "long ears, cotton-soft fur, and a tiny pink nose"),
    ("pet_fox.jpg", "red fox", "orange-red fur, a white chest, and a bushy tail"),
    ("pet_pom.jpg", "Pomeranian", "voluminous golden fur and a teddy-bear face"),
]


def required_api_key() -> str:
    key = os.environ.get("GROK_API_KEY", "").strip()
    if not key:
        raise SystemExit("GROK_API_KEY must be supplied through the process environment")
    return key


async def main() -> None:
    api_key = required_api_key()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    async with httpx.AsyncClient(timeout=120.0) as client:
        for filename, species, details in PETS:
            prompt = (
                f"A centered kawaii chibi digital illustration of a {species}, {details}. "
                "Large expressive eyes, clean silhouette, painterly texture, soft rim lighting."
            )
            try:
                response = await client.post(
                    f"{API_BASE}/images/generations",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={"model": "grok-imagine-image", "prompt": prompt, "n": 1, "response_format": "url"},
                )
                response.raise_for_status()
                image = await client.get(response.json()["data"][0]["url"])
                image.raise_for_status()
                (OUTPUT_DIR / filename).write_bytes(image.content)
                print(f"Saved {filename} ({len(image.content) // 1024} KiB)")
            except Exception as error:
                print(f"Failed {filename}: {type(error).__name__}")
            await asyncio.sleep(2)


if __name__ == "__main__":
    asyncio.run(main())
