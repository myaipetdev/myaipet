"""
PETAGEN SQLAlchemy Models
"""

from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, Text, Float, Boolean, DateTime, ForeignKey
)
from sqlalchemy.orm import relationship
from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    wallet_address = Column(String(42), unique=True, index=True, nullable=False)
    nonce = Column(String(32), nullable=False)
    credits = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    generations = relationship("Generation", back_populates="user")
    credit_purchases = relationship("CreditPurchase", back_populates="user")


class Generation(Base):
    __tablename__ = "generations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # nullable for X402 agent requests
    pet_type = Column(Integer, nullable=False)       # 0-7
    style = Column(Integer, nullable=False)           # 0-4
    prompt = Column(Text, nullable=True)
    duration = Column(Integer, nullable=False)         # 3, 5, or 10 seconds
    photo_path = Column(String(512), nullable=False)
    video_path = Column(String(512), nullable=True)
    content_hash = Column(String(66), nullable=True)   # 0x-prefixed keccak256
    tx_hash = Column(String(66), nullable=True)
    nft_tx_hash = Column(String(66), nullable=True)    # PETContent NFT mint tx
    chain = Column(String(10), nullable=True)          # "base" or "bnb"
    status = Column(String(20), default="pending", nullable=False)
    error_message = Column(Text, nullable=True)
    fal_request_id = Column(String(128), nullable=True)
    credits_charged = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="generations")


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    type = Column(String(20), nullable=False)          # "generation", "burn", "purchase"
    tx_hash = Column(String(66), nullable=False)
    chain = Column(String(10), nullable=False)
    block_number = Column(Integer, nullable=True)
    gas_used = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)


class CreditPurchase(Base):
    __tablename__ = "credit_purchases"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    credits = Column(Integer, nullable=False)
    amount_usd = Column(Float, nullable=False)
    payment_tx_hash = Column(String(66), nullable=True)
    recording_tx_hash = Column(String(66), nullable=True)
    chain = Column(String(10), nullable=True)
    status = Column(String(20), default="pending", nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    user = relationship("User", back_populates="credit_purchases")
