"""
PETAGEN Database Setup
SQLAlchemy async engine with PostgreSQL (asyncpg) or SQLite fallback.
"""

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

# SQLite needs check_same_thread; PostgreSQL does not
_connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    _connect_args["check_same_thread"] = False

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    connect_args=_connect_args,
)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    """Dependency: yields an async database session."""
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    """Create all tables on startup."""
    async with engine.begin() as conn:
        from app.models import User, Generation, Transaction, CreditPurchase  # noqa: F401
        from app.models_pet import Pet, PetMemory, PetInteraction, DreamJournal, PetNotification, PetAutonomousAction, SoulExport  # noqa: F401
        from app.models_social import Like, Comment, Follow, UserProfile  # noqa: F401
        from app.models_x402 import X402Payment, X402PricingConfig  # noqa: F401
        await conn.run_sync(Base.metadata.create_all)
