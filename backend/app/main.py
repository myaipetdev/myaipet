"""
PETAGEN FastAPI Application
Main entry point with CORS, router mounting, static files, and lifecycle events.
"""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import init_db
from app.services.storage import ensure_dirs
from app.services.blockchain import blockchain_service
from app.tasks.dreaming_cron import dreaming_cron_loop

# Routes
from app.routes.auth import router as auth_router
from app.routes.generate import router as generate_router
from app.routes.gallery import router as gallery_router
from app.routes.analytics import router as analytics_router
from app.routes.credits import router as credits_router
from app.routes.pets import router as pets_router
from app.routes.pet_generate import router as pet_generate_router
from app.routes.social import router as social_router
from app.routes.x402 import router as x402_router
from app.routes.soul import router as soul_router
from app.middleware.x402_middleware import X402PaymentMiddleware

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle: startup and shutdown events."""
    # Startup
    logger.info("=" * 50)
    logger.info("PETAGEN Backend Starting...")
    logger.info("=" * 50)

    # Initialize database tables
    await init_db()
    logger.info("Database initialized")

    # Create upload/video directories
    ensure_dirs()
    logger.info(f"Upload dir: {settings.UPLOAD_DIR}")
    logger.info(f"Video dir: {settings.VIDEO_DIR}")

    # Seed default X402 pricing config
    from app.services.x402_payment import x402_payment_service
    from app.database import async_session as _async_session
    async with _async_session() as _db:
        await x402_payment_service.ensure_default_pricing(_db)
    logger.info("X402 default pricing seeded")

    # Initialize blockchain service
    blockchain_service.initialize()
    logger.info(f"Blockchain chains: {list(blockchain_service.chains.keys()) or ['DRY RUN']}")

    # Start batch flush background task
    batch_task = asyncio.create_task(blockchain_service.batch_flush_loop(interval=300))
    logger.info("Batch flush loop started (5 min interval)")

    # Start dreaming cron (runs at 3 AM UTC daily)
    dream_hour = int(getattr(settings, "DREAM_HOUR", 3))
    dream_task = asyncio.create_task(dreaming_cron_loop(dream_hour=dream_hour))
    logger.info(f"Dreaming cron started (daily at {dream_hour:02d}:00 UTC)")

    logger.info("=" * 50)
    logger.info("PETAGEN Backend Ready!")
    logger.info(f"CORS origins: {settings.cors_origins_list}")
    logger.info("=" * 50)

    yield

    # Shutdown
    dream_task.cancel()
    batch_task.cancel()
    for task in [dream_task, batch_task]:
        try:
            await task
        except asyncio.CancelledError:
            pass
    logger.info("PETAGEN Backend stopped")


app = FastAPI(
    title="PETAGEN API",
    description="AI Pet Video Generation Platform",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-PAYMENT-REQUIRED", "X-PAYMENT-TX", "X-PAYMENT-PAYER"],
)

# X402 Payment Middleware
app.add_middleware(X402PaymentMiddleware)

# Static files for uploads and videos
app.mount("/static/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")
app.mount("/static/videos", StaticFiles(directory=settings.VIDEO_DIR), name="videos")

# Mount routers
app.include_router(auth_router)
app.include_router(generate_router)
app.include_router(gallery_router)
app.include_router(analytics_router)
app.include_router(credits_router)
app.include_router(pets_router)
app.include_router(pet_generate_router)
app.include_router(social_router)
app.include_router(x402_router)
app.include_router(soul_router)


@app.get("/api/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "chains": list(blockchain_service.chains.keys()),
        "has_relayer": blockchain_service.relayer is not None,
    }


@app.post("/api/dev/seed")
async def seed_demo_data():
    """Seed demo data for showcase (dev only)."""
    import random
    import uuid
    from app.database import async_session
    from app.models import User, Generation, Transaction, utcnow
    from app.models_pet import Pet, PetMemory
    from app.models_social import Like, Comment, UserProfile
    from datetime import timedelta

    async with async_session() as db:
        # Check if already seeded
        from sqlalchemy import select, func
        count = (await db.execute(select(func.count()).select_from(User))).scalar()
        if count >= 5:
            return {"detail": "Already seeded", "users": count}

        now = utcnow()
        demo_wallets = [
            "0x1234567890abcdef1234567890abcdef12345678",
            "0xabcdef1234567890abcdef1234567890abcdef12",
            "0x9876543210fedcba9876543210fedcba98765432",
            "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
            "0xcafebabecafebabecafebabecafebabecafebabe",
        ]
        display_names = ["CryptoKitty", "PetLover42", "Web3Degen", "AIPetFan", "BlockchainBro"]
        pet_names = [
            "Luna", "Mochi", "Noodle", "Pixel", "Biscuit",
            "Storm", "Coco", "Ziggy", "Mango", "Tofu",
        ]
        personality_types = ["friendly", "playful", "shy", "brave", "lazy"]
        prompts = [
            "A cute cat playing with yarn in a cozy room",
            "A golden retriever surfing at sunset",
            "A parrot flying through a rainbow forest",
            "A turtle exploring a crystal cave",
            "A hamster piloting a tiny spaceship",
            "A rabbit having tea in a garden of roses",
            "A fox running through autumn leaves",
            "A pomeranian dressed as a tiny detective",
        ]

        users = []
        for i, wallet in enumerate(demo_wallets):
            u = User(
                wallet_address=wallet,
                nonce=uuid.uuid4().hex[:16],
                credits=random.randint(50, 500),
                created_at=now - timedelta(days=random.randint(1, 30)),
            )
            db.add(u)
            await db.flush()
            users.append(u)

            # Profile
            db.add(UserProfile(
                user_id=u.id,
                display_name=display_names[i],
                bio=f"AI pet enthusiast #{i+1}",
            ))

        # Create pets
        all_pets = []
        for u in users:
            num_pets = random.randint(1, 2)
            for _ in range(num_pets):
                species = random.randint(0, 7)
                pet = Pet(
                    user_id=u.id,
                    name=random.choice(pet_names),
                    species=species,
                    personality_type=random.choice(personality_types),
                    level=random.randint(1, 8),
                    experience=random.randint(0, 300),
                    happiness=random.randint(40, 100),
                    energy=random.randint(30, 100),
                    hunger=random.randint(20, 90),
                    bond_level=random.randint(10, 80),
                    total_interactions=random.randint(5, 100),
                )
                db.add(pet)
                await db.flush()
                all_pets.append(pet)

                # Add memories
                for j in range(random.randint(2, 5)):
                    db.add(PetMemory(
                        pet_id=pet.id,
                        memory_type=random.choice(["interaction", "milestone", "emotion"]),
                        content=f"{pet.name} had a wonderful {random.choice(['play session', 'walk', 'meal', 'training', 'nap'])}.",
                        emotion=random.choice(["happy", "excited", "content", "curious"]),
                        importance=random.randint(1, 5),
                    ))

        # Create generations
        all_gens = []
        for u in users:
            num_gens = random.randint(2, 5)
            for k in range(num_gens):
                gen = Generation(
                    user_id=u.id,
                    pet_type=random.randint(0, 7),
                    style=random.randint(0, 4),
                    prompt=random.choice(prompts),
                    duration=random.choice([3, 5, 10]),
                    photo_path=f"demo/{uuid.uuid4().hex[:8]}.jpg",
                    video_path=f"demo_{uuid.uuid4().hex[:8]}.mp4",
                    status="completed",
                    credits_charged=random.choice([1, 15, 30]),
                    created_at=now - timedelta(hours=random.randint(1, 72)),
                    completed_at=now - timedelta(hours=random.randint(0, 71)),
                )
                db.add(gen)
                await db.flush()
                all_gens.append(gen)

        # Add likes and comments
        for gen in all_gens:
            num_likes = random.randint(0, 4)
            liked_users = random.sample(users, min(num_likes, len(users)))
            for u in liked_users:
                db.add(Like(user_id=u.id, generation_id=gen.id))

            num_comments = random.randint(0, 3)
            for _ in range(num_comments):
                db.add(Comment(
                    user_id=random.choice(users).id,
                    generation_id=gen.id,
                    content=random.choice([
                        "So cute!",
                        "Love this style!",
                        "Amazing generation!",
                        "Your pet is adorable",
                        "This is incredible",
                        "How did you get this quality?",
                        "Best one I've seen today!",
                    ]),
                ))

        # Add transactions
        for gen in all_gens[:10]:
            db.add(Transaction(
                user_id=gen.user_id,
                type="generation",
                tx_hash=f"0x{uuid.uuid4().hex}",
                chain=random.choice(["base", "bnb"]),
                block_number=random.randint(10000000, 20000000),
                created_at=gen.created_at,
            ))

        await db.commit()

        return {
            "detail": "Demo data seeded successfully",
            "users": len(users),
            "pets": len(all_pets),
            "generations": len(all_gens),
        }
