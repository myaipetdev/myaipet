"""
Generate gallery images using Grok API (x.ai) for the demo site.
Creates stylized AI pet images matching the logo aesthetic.
"""

import asyncio
import httpx
import os
import json
import time

API_KEY = "xai-y65KaAmmfj6g3H1IjlQEWSTeJhuuHz9HkqoIXF3v7lxLKfV3x3ezI1iP2PPFfMNuhQT4zWICAxFNsWS0"
API_BASE = "https://api.x.ai/v1"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "gallery")

# Each image: prompt + filename
IMAGES = [
    {
        "prompt": "A cute fluffy cat with big sparkly eyes sitting on a floating cloud island, digital art style, vibrant colors, fantasy lighting, highly detailed fur, magical particles floating around, pastel sky background, kawaii aesthetic",
        "file": "cat_cloud.jpg",
    },
    {
        "prompt": "A golden retriever puppy wearing a tiny astronaut helmet floating in space surrounded by stars and planets, digital illustration, cinematic lighting, detailed fur, cosmic colors purple and blue nebula background",
        "file": "dog_space.jpg",
    },
    {
        "prompt": "A colorful parrot with rainbow feathers flying through a magical crystal cave with glowing gems, fantasy art, volumetric lighting, iridescent colors, detailed feathers, mystical atmosphere",
        "file": "parrot_cave.jpg",
    },
    {
        "prompt": "A small turtle wearing a wizard hat exploring an enchanted mushroom forest, whimsical digital art, warm golden lighting, detailed shell patterns, fairy lights, cozy magical atmosphere",
        "file": "turtle_forest.jpg",
    },
    {
        "prompt": "A fluffy hamster piloting a tiny steampunk spaceship through cotton candy clouds, cute digital art, warm lighting, detailed fur, pastel colors, adventure theme, Studio Ghibli inspired",
        "file": "hamster_ship.jpg",
    },
    {
        "prompt": "A white rabbit having an elegant tea party in a rose garden at sunset, Victorian fantasy style, golden hour lighting, detailed fur, roses and teacups, dreamy soft focus background",
        "file": "rabbit_tea.jpg",
    },
    {
        "prompt": "A red fox running through golden autumn leaves in a magical forest with fireflies, cinematic digital art, volumetric god rays, detailed fur, warm orange and gold palette, dynamic pose",
        "file": "fox_autumn.jpg",
    },
    {
        "prompt": "A fluffy pomeranian dressed as a tiny superhero standing on a rooftop overlooking a neon cyberpunk city at night, digital art, dramatic lighting, detailed fur, vibrant neon colors",
        "file": "pom_hero.jpg",
    },
    {
        "prompt": "A cat astronaut floating in zero gravity inside a spaceship with fish swimming around, anime style, bright colors, detailed, whimsical, space background visible through windows",
        "file": "cat_astro.jpg",
    },
    {
        "prompt": "A shiba inu dog riding a skateboard down a neon-lit Japanese city street at night, street art style, motion blur, vibrant neon signs, rain reflections, urban atmosphere",
        "file": "dog_skate.jpg",
    },
    {
        "prompt": "A majestic owl perched on a stack of glowing ancient books in a magical library, fantasy digital art, warm candlelight, detailed feathers, floating magical particles, cozy dark academia aesthetic",
        "file": "owl_library.jpg",
    },
    {
        "prompt": "A baby penguin sliding down a rainbow ice slide in a crystalline winter wonderland, cute digital art, sparkling ice, aurora borealis sky, detailed, kawaii style, magical winter theme",
        "file": "penguin_slide.jpg",
    },
    {
        "prompt": "A fluffy cat sleeping peacefully on a crescent moon among stars, watercolor art style, soft dreamy colors, celestial theme, delicate brushstrokes, lullaby atmosphere, pastel night sky",
        "file": "cat_moon.jpg",
    },
    {
        "prompt": "A corgi dog running through a field of sunflowers at golden hour, cinematic photography style, shallow depth of field, warm golden lighting, detailed fur, joyful expression, summer vibes",
        "file": "corgi_sunflower.jpg",
    },
    {
        "prompt": "A tiny dragon-cat hybrid creature curled up on a pile of gemstones in a treasure cave, fantasy digital art, glowing crystals, warm firelight, detailed scales and fur, mystical atmosphere",
        "file": "dragon_cat.jpg",
    },
    {
        "prompt": "A rabbit samurai in cherry blossom storm, Japanese ukiyo-e meets digital art, dramatic composition, pink petals swirling, detailed armor, katana, traditional Japanese aesthetic with modern twist",
        "file": "rabbit_samurai.jpg",
    },
    {
        "prompt": "A group of tiny hamsters operating a miniature sushi restaurant kitchen, detailed digital art, warm kitchen lighting, tiny chef hats, cute detailed food, cozy atmosphere, wholesome scene",
        "file": "hamster_sushi.jpg",
    },
    {
        "prompt": "A fox witch brewing a potion in a cozy cottage filled with herbs and candles, fantasy digital art, warm glowing light, detailed fur, magical green and purple potion bubbles, cottagecore aesthetic",
        "file": "fox_witch.jpg",
    },
    {
        "prompt": "A cat DJ spinning records at a sunset beach party with palm trees, synthwave art style, neon pink and orange sunset, retro aesthetic, detailed, party lights, tropical vibes",
        "file": "cat_dj.jpg",
    },
    {
        "prompt": "A pomeranian in a hot air balloon floating over a fantasy candy land landscape, whimsical digital art, bright cheerful colors, cotton candy clouds, detailed fur, adventure theme",
        "file": "pom_balloon.jpg",
    },
    {
        "prompt": "A wise old turtle meditating on a mountaintop at sunrise with clouds below, peaceful digital art, zen atmosphere, golden sunlight, detailed shell, misty mountains, spiritual calm",
        "file": "turtle_zen.jpg",
    },
    {
        "prompt": "A kitten painter creating a masterpiece on a canvas in a Parisian art studio, impressionist style, warm studio lighting, paint splatters, beret, detailed fur and brushstrokes, artistic atmosphere",
        "file": "cat_painter.jpg",
    },
    {
        "prompt": "A wolf howling at a giant crystalline moon in a snowy forest, ethereal digital art, blue and silver palette, northern lights, detailed fur, magical winter night, majestic atmosphere",
        "file": "wolf_moon.jpg",
    },
    {
        "prompt": "A golden retriever and a tabby cat best friends having a picnic under cherry blossom trees, wholesome digital art, soft spring lighting, detailed fur, flowers, warm friendship theme, Studio Ghibli vibes",
        "file": "friends_picnic.jpg",
    },
]


async def generate_image(client, prompt, filename, index):
    """Generate a single image via Grok API and save it."""
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
            print(f"  [{index+1}/24] Generating: {filename}...")
            response = await client.post(url, json=payload, headers=headers)

            if response.status_code == 429:
                wait = (2 ** attempt) * 3
                print(f"    Rate limited, waiting {wait}s...")
                await asyncio.sleep(wait)
                continue

            response.raise_for_status()
            data = response.json()

            # Extract URL
            image_url = data["data"][0]["url"]
            print(f"    Got URL, downloading...")

            # Download the image
            img_response = await client.get(image_url)
            img_response.raise_for_status()

            filepath = os.path.join(OUTPUT_DIR, filename)
            with open(filepath, "wb") as f:
                f.write(img_response.content)

            size_kb = len(img_response.content) / 1024
            print(f"    Saved: {filename} ({size_kb:.0f}KB)")
            return filename

        except Exception as e:
            print(f"    Error (attempt {attempt+1}): {e}")
            if attempt < 2:
                await asyncio.sleep(3)

    print(f"    FAILED: {filename}")
    return None


async def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f"Output directory: {OUTPUT_DIR}")
    print(f"Generating {len(IMAGES)} images with Grok API...\n")

    results = []
    async with httpx.AsyncClient(timeout=120.0) as client:
        for i, img in enumerate(IMAGES):
            result = await generate_image(client, img["prompt"], img["file"], i)
            results.append(result)
            # Small delay between requests to avoid rate limiting
            if i < len(IMAGES) - 1:
                await asyncio.sleep(2)

    # Summary
    success = [r for r in results if r]
    print(f"\nDone! {len(success)}/{len(IMAGES)} images generated.")
    print(f"Files saved to: {OUTPUT_DIR}")

    # Generate the mapping for mockData.js
    print("\n--- Copy this to mockData.js ---")
    print("const MOCK_IMAGES = [")
    ratios = ["1:1", "4:3", "3:4", "4:3", "1:1", "3:4", "4:3", "1:1",
              "3:4", "4:3", "1:1", "4:5", "3:4", "4:3", "1:1", "3:4",
              "4:3", "1:1", "4:5", "4:3", "1:1", "3:4", "4:3", "4:5"]
    for i, r in enumerate(results):
        if r:
            ratio = ratios[i % len(ratios)]
            print(f'  {{ url: "/gallery/{r}", ratio: "{ratio}" }},')
    print("];")


if __name__ == "__main__":
    asyncio.run(main())
