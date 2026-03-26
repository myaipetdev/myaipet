"""
PETAGEN Analytics Routes
Public endpoints for protocol statistics and activity feed.
"""

from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, cast, Date
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User, Generation, Transaction, CreditPurchase
from app.schemas import (
    StatsResponse, DailyCount, DailyStatsResponse,
    ChainStats, ChainStatsResponse,
    ActivityItem, ActivityResponse,
)
from app.services.blockchain import blockchain_service

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

PET_NAMES = {
    0: "Cat", 1: "Dog", 2: "Parrot", 3: "Turtle",
    4: "Hamster", 5: "Rabbit", 6: "Fox", 7: "Pomeranian",
}


def _relative_time(dt: datetime) -> str:
    """Convert datetime to relative time string."""
    now = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    diff = now - dt
    seconds = int(diff.total_seconds())

    if seconds < 5:
        return "just now"
    elif seconds < 60:
        return f"{seconds}s ago"
    elif seconds < 3600:
        return f"{seconds // 60}m ago"
    elif seconds < 86400:
        return f"{seconds // 3600}h ago"
    else:
        return f"{seconds // 86400}d ago"


@router.get("/stats", response_model=StatsResponse)
async def get_stats(db: AsyncSession = Depends(get_db)):
    """Get aggregate platform statistics."""
    # Total users
    user_count = await db.execute(select(func.count()).select_from(User))
    total_users = user_count.scalar() or 0

    # Total generations (completed)
    gen_count = await db.execute(
        select(func.count()).where(Generation.status == "completed")
    )
    total_generations = gen_count.scalar() or 0

    # TX today
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    tx_today_result = await db.execute(
        select(func.count()).where(Generation.created_at >= today_start)
    )
    tx_today = tx_today_result.scalar() or 0

    # Try to get on-chain burned total
    total_burned = "0"
    try:
        on_chain = await blockchain_service.get_on_chain_stats()
        if on_chain.get("total_burned", 0) > 0:
            burned_eth = on_chain["total_burned"] / 1e18
            if burned_eth >= 1000:
                total_burned = f"{burned_eth / 1000:.1f}K"
            else:
                total_burned = f"{burned_eth:.1f}"
        # Merge on-chain stats (simulator + real)
        total_users = max(total_users, on_chain.get("total_users", 0))
        total_generations = max(total_generations, on_chain.get("total_generations", 0))
    except Exception:
        pass

    # Calculate changes (last 7 days vs previous 7 days)
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    two_weeks_ago = datetime.now(timezone.utc) - timedelta(days=14)

    async def calc_change(model, date_col):
        this_week = await db.execute(
            select(func.count()).where(date_col >= week_ago)
        )
        last_week = await db.execute(
            select(func.count()).where(date_col >= two_weeks_ago, date_col < week_ago)
        )
        tw = this_week.scalar() or 0
        lw = last_week.scalar() or 1
        pct = ((tw - lw) / max(lw, 1)) * 100
        return f"+{pct:.1f}%" if pct >= 0 else f"{pct:.1f}%"

    user_change = await calc_change(User, User.created_at)
    gen_change = await calc_change(Generation, Generation.created_at)

    return StatsResponse(
        total_users=total_users,
        total_generations=total_generations,
        total_burned=total_burned,
        tx_today=tx_today,
        user_change=user_change,
        gen_change=gen_change,
        burned_change="+0.0%",
        tx_change="+0.0%",
    )


@router.get("/daily", response_model=DailyStatsResponse)
async def get_daily_stats(
    days: int = Query(20, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
):
    """Get daily generation counts for chart display."""
    start_date = datetime.now(timezone.utc) - timedelta(days=days)

    result = await db.execute(
        select(
            func.date(Generation.created_at).label("date"),
            func.count().label("count"),
        )
        .where(Generation.created_at >= start_date)
        .group_by(func.date(Generation.created_at))
        .order_by(func.date(Generation.created_at))
    )
    rows = result.all()

    # Fill in missing dates with 0
    date_map = {str(row.date): row.count for row in rows}
    data = []
    for i in range(days):
        date = (datetime.now(timezone.utc) - timedelta(days=days - 1 - i)).strftime("%Y-%m-%d")
        data.append(DailyCount(date=date, count=date_map.get(date, 0)))

    return DailyStatsResponse(data=data)


@router.get("/chains", response_model=ChainStatsResponse)
async def get_chain_stats(db: AsyncSession = Depends(get_db)):
    """Get per-chain distribution stats."""
    result = await db.execute(
        select(
            Generation.chain,
            func.count().label("count"),
        )
        .where(Generation.chain.isnot(None))
        .group_by(Generation.chain)
    )
    rows = result.all()

    total = sum(row.count for row in rows) or 1
    chains = [
        ChainStats(
            chain=row.chain or "unknown",
            count=row.count,
            percentage=round(row.count / total * 100, 1),
        )
        for row in rows
    ]

    # If no data, return defaults matching the simulator distribution
    if not chains:
        chains = [
            ChainStats(chain="Base", count=0, percentage=64.0),
            ChainStats(chain="BNB Chain", count=0, percentage=36.0),
        ]

    return ChainStatsResponse(chains=chains)


@router.get("/activity", response_model=ActivityResponse)
async def get_activity(
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Get latest platform activity feed."""
    # Get recent generations
    result = await db.execute(
        select(Generation, User.wallet_address)
        .join(User, Generation.user_id == User.id)
        .order_by(Generation.created_at.desc())
        .limit(limit)
    )
    rows = result.all()

    items = []
    for gen, wallet in rows:
        truncated = f"{wallet[:6]}...{wallet[-4:]}" if len(wallet) >= 10 else wallet
        pet_name = PET_NAMES.get(gen.pet_type, "Pet")

        if gen.status == "completed":
            items.append(ActivityItem(
                type="generate",
                icon="⚡",
                text=f"Generated {pet_name} video",
                wallet=truncated,
                chain=gen.chain or "Base",
                time=_relative_time(gen.created_at),
                created_at=gen.created_at,
            ))
        elif gen.status == "processing":
            items.append(ActivityItem(
                type="generate",
                icon="⏳",
                text=f"Generating {pet_name} video...",
                wallet=truncated,
                chain="Base",
                time=_relative_time(gen.created_at),
                created_at=gen.created_at,
            ))

    return ActivityResponse(items=items)
