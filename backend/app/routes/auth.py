"""
PETAGEN Auth Routes
Wallet-based authentication via SIWE.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User
from app.auth import generate_nonce, build_siwe_message, verify_siwe_message, create_jwt, get_current_user
from app.schemas import NonceResponse, VerifyRequest, AuthResponse, UserResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/nonce", response_model=NonceResponse)
async def get_nonce(address: str, db: AsyncSession = Depends(get_db)):
    """
    Generate a nonce for SIWE authentication.
    Creates the user record if it doesn't exist.
    """
    address = address.strip()
    if not address.startswith("0x") or len(address) != 42:
        raise HTTPException(status_code=400, detail="Invalid wallet address")

    address_lower = address.lower()
    result = await db.execute(
        select(User).where(User.wallet_address == address_lower)
    )
    user = result.scalar_one_or_none()

    nonce = generate_nonce()

    if user is None:
        user = User(
            wallet_address=address_lower,
            nonce=nonce,
            credits=0,
        )
        db.add(user)
    else:
        user.nonce = nonce

    await db.commit()

    message = build_siwe_message(address, nonce)
    return NonceResponse(nonce=nonce, message=message)


@router.post("/verify", response_model=AuthResponse)
async def verify_signature(body: VerifyRequest, db: AsyncSession = Depends(get_db)):
    """
    Verify SIWE signature and issue JWT.
    """
    siwe_msg = verify_siwe_message(body.message, body.signature)
    address_lower = siwe_msg.address.lower()

    result = await db.execute(
        select(User).where(User.wallet_address == address_lower)
    )
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(status_code=401, detail="User not found. Request nonce first.")

    # Verify nonce matches
    if user.nonce != siwe_msg.nonce:
        raise HTTPException(status_code=401, detail="Nonce mismatch")

    # Rotate nonce after successful verification
    from app.auth import generate_nonce as gen
    user.nonce = gen()
    await db.commit()

    token = create_jwt(address_lower)
    return AuthResponse(
        token=token,
        wallet_address=address_lower,
        credits=user.credits,
    )


@router.get("/me", response_model=UserResponse)
async def get_me(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current user info."""
    from sqlalchemy import func
    from app.models import Generation

    result = await db.execute(
        select(func.count()).where(Generation.user_id == user.id)
    )
    total_gens = result.scalar() or 0

    return UserResponse(
        wallet_address=user.wallet_address,
        credits=user.credits,
        total_generations=total_gens,
        created_at=user.created_at,
    )
