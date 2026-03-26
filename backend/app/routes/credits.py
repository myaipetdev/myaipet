"""
PETAGEN Credits Routes
Credit balance check and purchase flow.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User, CreditPurchase
from app.auth import get_current_user
from app.schemas import CreditBalanceResponse, PurchaseRequest, PurchaseResponse

router = APIRouter(prefix="/api/credits", tags=["credits"])

# Pricing plans matching the frontend
PLANS = {
    "starter": {"credits": 100, "price": 5.0},
    "creator": {"credits": 500, "price": 20.0},
    "pro":     {"credits": 2000, "price": 50.0},
}


@router.get("/balance", response_model=CreditBalanceResponse)
async def get_balance(user: User = Depends(get_current_user)):
    """Get current user's credit balance."""
    return CreditBalanceResponse(credits=user.credits)


@router.post("/purchase", response_model=PurchaseResponse)
async def purchase_credits(
    body: PurchaseRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Initiate a credit purchase.
    For now: creates a pending purchase record.
    In production: verify on-chain payment TX, then confirm.
    """
    plan = PLANS.get(body.plan)
    if not plan:
        raise HTTPException(400, f"Invalid plan. Choose from: {list(PLANS.keys())}")

    purchase = CreditPurchase(
        user_id=user.id,
        credits=plan["credits"],
        amount_usd=plan["price"],
        payment_tx_hash=body.payment_tx_hash,
        status="pending" if not body.payment_tx_hash else "confirming",
    )
    db.add(purchase)
    await db.commit()
    await db.refresh(purchase)

    # If payment TX provided, auto-confirm for now
    # In production: verify the TX on-chain, check amount, then confirm
    if body.payment_tx_hash:
        purchase.status = "confirmed"
        user.credits += plan["credits"]
        await db.commit()

        # Record on-chain (async, fire-and-forget)
        try:
            from app.services.blockchain import blockchain_service
            from web3 import Web3
            result = await blockchain_service.record_purchase(
                user.wallet_address,
                plan["credits"],
                Web3.to_wei(plan["price"], "ether"),
            )
            if result.success:
                purchase.recording_tx_hash = result.tx_hash
                purchase.chain = result.chain
                purchase.status = "recorded"
                await db.commit()
        except Exception:
            pass  # Non-critical: purchase still valid even if on-chain record fails

    return PurchaseResponse(
        id=purchase.id,
        credits=plan["credits"],
        amount_usd=plan["price"],
        status=purchase.status,
    )
