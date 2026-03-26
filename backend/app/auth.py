"""
PETAGEN Wallet-Based Authentication
SIWE (Sign In With Ethereum) + JWT token issuance.
"""

import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from siwe import SiweMessage

from app.config import settings
from app.database import get_db
from app.models import User

security = HTTPBearer(auto_error=False)


def generate_nonce() -> str:
    """Generate a random nonce for SIWE."""
    return secrets.token_hex(16)


def build_siwe_message(address: str, nonce: str, chain_id: int = 8453) -> str:
    """Build a SIWE message string for the frontend to sign."""
    msg = SiweMessage(
        domain="localhost",
        address=address,
        statement="Sign in to AI PET",
        uri="http://localhost:8000",
        version="1",
        chain_id=chain_id,
        nonce=nonce,
        issued_at=datetime.now(timezone.utc).isoformat(),
    )
    return msg.prepare_message()


def verify_siwe_message(message: str, signature: str) -> SiweMessage:
    """Verify a signed SIWE message. Raises on invalid signature."""
    try:
        siwe_msg = SiweMessage.from_message(message)
        siwe_msg.verify(signature)
        return siwe_msg
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid signature: {str(e)}"
        )


def create_jwt(wallet_address: str) -> str:
    """Create a JWT token for an authenticated user."""
    payload = {
        "sub": wallet_address.lower(),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_jwt(token: str) -> Optional[str]:
    """Decode JWT, return wallet_address or None."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Dependency: extract and validate JWT, return User from DB."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )

    wallet = decode_jwt(credentials.credentials)
    if wallet is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )

    result = await db.execute(
        select(User).where(User.wallet_address == wallet)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )

    return user


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """Dependency: returns User if authenticated, None otherwise."""
    if credentials is None:
        return None
    wallet = decode_jwt(credentials.credentials)
    if wallet is None:
        return None
    result = await db.execute(
        select(User).where(User.wallet_address == wallet)
    )
    return result.scalar_one_or_none()
