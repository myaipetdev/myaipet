"""
PETAGEN X402 Payment Models
Database models for X402 payment tracking and pricing configuration.
"""

from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, Text, Float, Boolean, DateTime
)
from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class X402Payment(Base):
    __tablename__ = "x402_payments"

    id = Column(Integer, primary_key=True, index=True)
    payer_address = Column(String(42), index=True, nullable=False)
    amount_usdc = Column(Float, nullable=False)
    network = Column(String(32), nullable=False, default="eip155:8453")
    tx_hash = Column(String(66), unique=True, nullable=True)
    endpoint = Column(String(256), nullable=False)
    status = Column(String(20), default="pending", nullable=False)  # pending, verified, settled, failed
    facilitator_response = Column(Text, nullable=True)
    settled_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)


class X402PricingConfig(Base):
    __tablename__ = "x402_pricing_config"

    id = Column(Integer, primary_key=True, index=True)
    endpoint_pattern = Column(String(256), unique=True, nullable=False)
    price_usdc = Column(Float, nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)
