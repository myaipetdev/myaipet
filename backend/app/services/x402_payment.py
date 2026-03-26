"""
PETAGEN X402 Payment Service
Handles HTTP 402 Payment Required flow with EIP-3009 USDC transfer authorization.
Verifies and settles payments via the Coinbase CDP facilitator.
"""

import base64
import json
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

import httpx
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models_x402 import X402Payment, X402PricingConfig

logger = logging.getLogger(__name__)

# USDC contract on Base
USDC_BASE_CONTRACT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
BASE_NETWORK = "eip155:8453"


class X402PaymentService:
    """
    Service for X402 payment protocol operations.
    Handles payment requirement headers, verification, and settlement
    through the CDP facilitator.
    """

    def __init__(self):
        self.facilitator_url = settings.X402_FACILITATOR_URL
        self.pay_to_address = settings.X402_WALLET_ADDRESS
        self.default_timeout = 300  # 5 minutes

    def build_payment_required_header(
        self,
        price_usdc: float,
        description: str,
        network: str = BASE_NETWORK,
    ) -> str:
        """
        Build the base64-encoded PAYMENT-REQUIRED header value.
        Contains pricing info, network, payTo address, and accepted asset.
        """
        payload = {
            "accepts": [
                {
                    "scheme": "exact",
                    "price": f"{price_usdc:.2f}",
                    "network": network,
                    "payTo": self.pay_to_address,
                    "asset": USDC_BASE_CONTRACT,
                }
            ],
            "description": description,
            "mimeType": "application/json",
        }
        json_bytes = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        return base64.b64encode(json_bytes).decode("ascii")

    def parse_payment_required_header(self, header_value: str) -> Dict[str, Any]:
        """Decode a base64 PAYMENT-REQUIRED header back to dict."""
        try:
            decoded = base64.b64decode(header_value)
            return json.loads(decoded)
        except Exception as e:
            logger.error(f"Failed to parse PAYMENT-REQUIRED header: {e}")
            raise ValueError(f"Invalid PAYMENT-REQUIRED header: {e}")

    async def verify_payment(
        self,
        payment_signature: str,
        price_usdc: float,
        network: str = BASE_NETWORK,
    ) -> Dict[str, Any]:
        """
        Verify a payment signature through the CDP facilitator.
        The payment_signature contains an EIP-3009 transferWithAuthorization
        signed by the payer.

        Returns the facilitator's verification response including payer address
        and authorization details.
        """
        verify_payload = {
            "paymentSignature": payment_signature,
            "expectedAmount": f"{price_usdc:.2f}",
            "expectedPayTo": self.pay_to_address,
            "expectedAsset": USDC_BASE_CONTRACT,
            "expectedNetwork": network,
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.post(
                    f"{self.facilitator_url}/verify",
                    json=verify_payload,
                    headers={"Content-Type": "application/json"},
                )

                if response.status_code == 200:
                    result = response.json()
                    logger.info(
                        f"Payment verified: payer={result.get('payer')}, "
                        f"amount={price_usdc} USDC"
                    )
                    return {
                        "valid": True,
                        "payer": result.get("payer", ""),
                        "details": result,
                    }
                else:
                    error_body = response.text
                    logger.warning(
                        f"Payment verification failed: status={response.status_code}, "
                        f"body={error_body}"
                    )
                    return {
                        "valid": False,
                        "error": f"Facilitator rejected: {response.status_code} - {error_body}",
                    }

            except httpx.TimeoutException:
                logger.error("Facilitator verification timed out")
                return {"valid": False, "error": "Facilitator verification timed out"}
            except httpx.ConnectError as e:
                logger.error(f"Cannot connect to facilitator: {e}")
                return {"valid": False, "error": f"Facilitator connection failed: {e}"}

    async def settle_payment(
        self,
        payment_signature: str,
        network: str = BASE_NETWORK,
    ) -> Dict[str, Any]:
        """
        Settle a verified payment through the CDP facilitator.
        This executes the on-chain transferWithAuthorization.

        Returns settlement result including transaction hash.
        """
        settle_payload = {
            "paymentSignature": payment_signature,
            "network": network,
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                response = await client.post(
                    f"{self.facilitator_url}/settle",
                    json=settle_payload,
                    headers={"Content-Type": "application/json"},
                )

                if response.status_code == 200:
                    result = response.json()
                    tx_hash = result.get("txHash", result.get("transactionHash", ""))
                    logger.info(f"Payment settled: tx_hash={tx_hash}")
                    return {
                        "settled": True,
                        "tx_hash": tx_hash,
                        "details": result,
                    }
                else:
                    error_body = response.text
                    logger.error(
                        f"Payment settlement failed: status={response.status_code}, "
                        f"body={error_body}"
                    )
                    return {
                        "settled": False,
                        "error": f"Settlement failed: {response.status_code} - {error_body}",
                    }

            except httpx.TimeoutException:
                logger.error("Facilitator settlement timed out")
                return {"settled": False, "error": "Facilitator settlement timed out"}
            except httpx.ConnectError as e:
                logger.error(f"Cannot connect to facilitator for settlement: {e}")
                return {"settled": False, "error": f"Facilitator connection failed: {e}"}

    async def record_payment(
        self,
        db: AsyncSession,
        payer_address: str,
        amount_usdc: float,
        endpoint: str,
        network: str = BASE_NETWORK,
        tx_hash: Optional[str] = None,
        status: str = "verified",
        facilitator_response: Optional[str] = None,
    ) -> X402Payment:
        """Record a payment in the database."""
        payment = X402Payment(
            payer_address=payer_address.lower(),
            amount_usdc=amount_usdc,
            network=network,
            tx_hash=tx_hash,
            endpoint=endpoint,
            status=status,
            facilitator_response=facilitator_response,
            settled_at=datetime.now(timezone.utc) if status == "settled" else None,
        )
        db.add(payment)
        await db.commit()
        await db.refresh(payment)
        logger.info(
            f"Payment recorded: id={payment.id}, payer={payer_address}, "
            f"amount={amount_usdc}, status={status}"
        )
        return payment

    async def update_payment_status(
        self,
        db: AsyncSession,
        payment_id: int,
        status: str,
        tx_hash: Optional[str] = None,
    ) -> Optional[X402Payment]:
        """Update a payment's status after settlement."""
        result = await db.execute(
            select(X402Payment).where(X402Payment.id == payment_id)
        )
        payment = result.scalar_one_or_none()
        if payment:
            payment.status = status
            if tx_hash:
                payment.tx_hash = tx_hash
            if status == "settled":
                payment.settled_at = datetime.now(timezone.utc)
            await db.commit()
            await db.refresh(payment)
        return payment

    async def get_endpoint_price(
        self, db: AsyncSession, endpoint: str
    ) -> Optional[X402PricingConfig]:
        """
        Look up the price for an endpoint.
        Matches exact endpoint_pattern or uses fnmatch-style pattern matching.
        """
        # Try exact match first
        result = await db.execute(
            select(X402PricingConfig).where(
                X402PricingConfig.endpoint_pattern == endpoint,
                X402PricingConfig.is_active == True,
            )
        )
        config = result.scalar_one_or_none()
        if config:
            return config

        # Try pattern matching (prefix-based)
        result = await db.execute(
            select(X402PricingConfig).where(
                X402PricingConfig.is_active == True,
            ).order_by(X402PricingConfig.endpoint_pattern.desc())
        )
        configs = result.scalars().all()
        for cfg in configs:
            pattern = cfg.endpoint_pattern
            if pattern.endswith("*") and endpoint.startswith(pattern[:-1]):
                return cfg
            if endpoint == pattern:
                return cfg

        return None

    async def get_all_pricing(self, db: AsyncSession) -> List[X402PricingConfig]:
        """Get all active pricing configurations."""
        result = await db.execute(
            select(X402PricingConfig).where(
                X402PricingConfig.is_active == True,
            ).order_by(X402PricingConfig.endpoint_pattern)
        )
        return list(result.scalars().all())

    async def get_payment_history(
        self, db: AsyncSession, limit: int = 50, offset: int = 0
    ) -> List[X402Payment]:
        """Get recent payment history."""
        result = await db.execute(
            select(X402Payment)
            .order_by(X402Payment.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_payment_stats(self, db: AsyncSession) -> Dict[str, Any]:
        """Get aggregate payment statistics."""
        # Total revenue
        revenue_result = await db.execute(
            select(func.sum(X402Payment.amount_usdc)).where(
                X402Payment.status.in_(["verified", "settled"])
            )
        )
        total_revenue = revenue_result.scalar() or 0.0

        # Total payment count
        count_result = await db.execute(
            select(func.count()).select_from(X402Payment).where(
                X402Payment.status.in_(["verified", "settled"])
            )
        )
        total_count = count_result.scalar() or 0

        # Settled count
        settled_result = await db.execute(
            select(func.count()).select_from(X402Payment).where(
                X402Payment.status == "settled"
            )
        )
        settled_count = settled_result.scalar() or 0

        # Failed count
        failed_result = await db.execute(
            select(func.count()).select_from(X402Payment).where(
                X402Payment.status == "failed"
            )
        )
        failed_count = failed_result.scalar() or 0

        # Unique payers
        payers_result = await db.execute(
            select(func.count(func.distinct(X402Payment.payer_address))).where(
                X402Payment.status.in_(["verified", "settled"])
            )
        )
        unique_payers = payers_result.scalar() or 0

        return {
            "total_revenue_usdc": round(total_revenue, 2),
            "total_payments": total_count,
            "settled_payments": settled_count,
            "failed_payments": failed_count,
            "unique_payers": unique_payers,
        }

    async def ensure_default_pricing(self, db: AsyncSession) -> None:
        """
        Ensure default pricing entries exist in the database.
        Called on startup to seed initial configuration.
        """
        defaults = [
            {
                "endpoint_pattern": "/api/x402/agent-generate",
                "price_usdc": 0.50,
                "description": "AI pet video generation via X402 (external agents)",
            },
        ]

        for entry in defaults:
            result = await db.execute(
                select(X402PricingConfig).where(
                    X402PricingConfig.endpoint_pattern == entry["endpoint_pattern"]
                )
            )
            existing = result.scalar_one_or_none()
            if not existing:
                db.add(X402PricingConfig(**entry))
                logger.info(f"Created default X402 pricing: {entry['endpoint_pattern']} = ${entry['price_usdc']}")

        await db.commit()


# Singleton
x402_payment_service = X402PaymentService()
