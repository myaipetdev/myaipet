"""
Generate pet avatar images using Grok API with unified Kawaii/Chibi style.
"""

import asyncio
import httpx
import os

API_KEY = os.environ.get("GROK_API_KEY", "xai-y65KaAmmfj6g3H1IjlQEWSTeJhuuHz9HkqoIXF3v7lxLKfV3x3ezI1iP2PPFfMNuhQT4zWICAxFNsWS0")
API_BASE = "https://api.x.ai/v1"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "gallery")

BASE_PROMPT = """A digital illustration of a {species} reimagined in a Kawaii/Chibi style, centered on a dark transparent background. {details} Render with fluffy, soft-textured fur and a painterly feel. The {species} should have large, expressive eyes with glassy highlights. High-quality digital mascot art style, clean silhouettes, and soft rim lighting."""

PETS = [
    {
        "species": "cat",
        "details": "A cute fluffy cat with golden-amber fur, pointed ears, and a playful curious expression. Tiny pink nose and soft whiskers.",
        "file": "pet_cat.jpg",
    },
    {
        "species": "dog",
        "details": "A golden retriever puppy with warm golden fur, floppy ears, and an excited happy expression. Tongue slightly out, wagging tail.",
        "file": "pet_dog.jpg",
    },
    {
        "species": "parrot",
        "details": "A colorful tropical parrot with vibrant rainbow feathers - green, blue, red, yellow. Perched pose with wings slightly spread.",
        "file": "pet_parrot.jpg",
    },
    {
        "species": "turtle",
        "details": "A small green turtle with a detailed shell pattern, gentle wise eyes, and a calm peaceful expression. Tiny stubby legs.",
        "file": "pet_turtle.jpg",
    },
    {
        "species": "hamster",
        "details": "A round fluffy hamster with cream and brown fur, chubby cheeks stuffed with food, tiny pink paws, and beady sparkly eyes.",
        "file": "pet_hamster.jpg",
    },
    {
        "species": "rabbit",
        "details": "A white fluffy rabbit with long floppy ears, soft cotton-like fur, pink inner ears, and a twitchy little nose.",
        "file": "pet_rabbit.jpg",
    },
    {
        "species": "fox",
        "details": "A red fox with vibrant orange-red fur, white chest and tail tip, pointed ears, and a clever sly smile. Bushy tail.",
        "file": "pet_fox.jpg",
    },
    {
        "species": "pomeranian",
        "details": "A tiny fluffy pomeranian with voluminous golden-orange fur, teddy bear face, perky pointed ears, and a happy smile.",
        "file": "pet_pom.jpg",
    },
]


async def generate_image(client, pet, index):
    """Generate a single pet avatar via Grok API."""
    prompt = BASE_PROMPT.format(species=pet["species"], details=pet["details"])
    url = f"{API_BASE}/images/generations"
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "grok-imagine-image",
        "prompt": prompt,
        "n": 1,
        "response_format": "url",
    }

    for attempt in range(3):
        try:
            print(f"  [{index+1}/8] Generating: {pet['file']}...")
            response = await client.post(url, json=payload, headers=headers)

            if response.status_code == 429:
                wait = (2 ** attempt) * 3
                print(f"    Rate limited, waiting {wait}s...")
                await asyncio.sleep(wait)
                continue

            response.raise_for_status()
            data = response.json()

            image_url = data["data"][0]["url"]
            print(f"    Got URL, downloading...")

            img_response = await client.get(image_url)
            img_response.raise_for_status()

            filepath = os.path.join(OUTPUT_DIR, pet["file"])
            with open(filepath, "wb") as f:
                f.write(img_response.content)

            size_kb = len(img_response.content) / 1024
            print(f"    Saved: {pet['file']} ({size_kb:.0f}KB)")
            return pet["file"]

        except Exception as e:
            print(f"    Error (attempt {attempt+1}): {e}")
            if attempt < 2:
                await asyncio.sleep(3)

    print(f"    FAILED: {pet['file']}")
    return None


async def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f"Generating 8 pet avatars with unified Kawaii/Chibi style...\n")

    results = []
    async with httpx.AsyncClient(timeout=120.0) as client:
        for i, pet in enumerate(PETS):
            result = await generate_image(client, pet, i)
            results.append(result)
            if i < len(PETS) - 1:
                await asyncio.sleep(2)

    success = [r for r in results if r]
    print(f"\nDone! {len(success)}/8 avatars generated.")
    print(f"Files saved to: {OUTPUT_DIR}")


if __name__ == "__main__":
    asyncio.run(main())
