"""
PETAGEN X402 Payment Middleware
FastAPI middleware that intercepts requests to X402-protected endpoints.
Returns 402 with PAYMENT-REQUIRED header, validates PAYMENT-SIGNATURE on retry,
and settles payments through the CDP facilitator.
"""

import json
import logging
from typing import Optional, Set

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse

from app.config import settings
from app.database import async_session
from app.services.x402_payment import x402_payment_service

logger = logging.getLogger(__name__)

# Header names per X402 protocol
PAYMENT_REQUIRED_HEADER = "X-PAYMENT-REQUIRED"
PAYMENT_SIGNATURE_HEADER = "X-PAYMENT"

# Endpoints protected by X402 payment wall
X402_PROTECTED_PREFIXES: Set[str] = {
    "/api/x402/agent-generate",
}


class X402PaymentMiddleware(BaseHTTPMiddleware):
    """
    Middleware implementing the X402 HTTP payment protocol.

    Flow:
    1. Request arrives at a protected endpoint without PAYMENT-SIGNATURE header
       -> Returns 402 with PAYMENT-REQUIRED header containing pricing info
    2. Client constructs and signs EIP-3009 transferWithAuthorization
    3. Client retries request with PAYMENT-SIGNATURE header
       -> Middleware verifies signature via facilitator
       -> Settles payment via facilitator
       -> On success, passes request to actual endpoint handler
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        # Check if this endpoint is X402-protected
        path = request.url.path
        if not self._is_protected(path):
            return await call_next(request)

        # Allow OPTIONS requests through (CORS preflight)
        if request.method == "OPTIONS":
            return await call_next(request)

        # Check for internal pet-initiated bypass header
        internal_key = request.headers.get("X-PETAGEN-INTERNAL-KEY")
        if internal_key and internal_key == settings.X402_INTERNAL_KEY:
            logger.info(f"X402 bypass: internal pet-initiated generation for {path}")
            return await call_next(request)

        # Check for payment signature
        payment_signature = request.headers.get(PAYMENT_SIGNATURE_HEADER)

        if not payment_signature:
            # No payment signature -> return 402 with payment requirements
            return await self._return_payment_required(path)

        # Validate and settle payment
        return await self._process_payment(request, call_next, path, payment_signature)

    def _is_protected(self, path: str) -> bool:
        """Check if the request path matches any X402-protected prefix."""
        for prefix in X402_PROTECTED_PREFIXES:
            if path.startswith(prefix):
                return True
        return False

    async def _return_payment_required(self, path: str) -> JSONResponse:
        """
        Return a 402 Payment Required response with the PAYMENT-REQUIRED header.
        Looks up the price from the database, falls back to a default if not found.
        """
        price_usdc = 0.50  # default
        description = f"Payment required for {path}"

        try:
            async with async_session() as db:
                pricing = await x402_payment_service.get_endpoint_price(db, path)
                if pricing:
                    price_usdc = pricing.price_usdc
                    description = pricing.description or description
        except Exception as e:
            logger.error(f"Failed to look up X402 pricing for {path}: {e}")

        payment_header = x402_payment_service.build_payment_required_header(
            price_usdc=price_usdc,
            description=description,
        )

        logger.info(f"X402: Returning 402 for {path}, price={price_usdc} USDC")

        return JSONResponse(
            status_code=402,
            content={
                "error": "Payment Required",
                "description": description,
                "price_usdc": price_usdc,
                "network": "eip155:8453",
                "payTo": settings.X402_WALLET_ADDRESS,
                "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            },
            headers={
                PAYMENT_REQUIRED_HEADER: payment_header,
                "Access-Control-Expose-Headers": PAYMENT_REQUIRED_HEADER,
            },
        )

    async def _process_payment(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
        path: str,
        payment_signature: str,
    ) -> Response:
        """
        Verify and settle a payment, then pass the request through.
        """
        price_usdc = 0.50  # default

        try:
            async with async_session() as db:
                pricing = await x402_payment_service.get_endpoint_price(db, path)
                if pricing:
                    price_usdc = pricing.price_usdc
        except Exception as e:
            logger.error(f"Failed to look up X402 pricing: {e}")

        # Step 1: Verify the payment signature via facilitator
        verify_result = await x402_payment_service.verify_payment(
            payment_signature=payment_signature,
            price_usdc=price_usdc,
        )

        if not verify_result.get("valid"):
            error_msg = verify_result.get("error", "Payment verification failed")
            logger.warning(f"X402: Payment verification failed for {path}: {error_msg}")
            return JSONResponse(
                status_code=402,
                content={
                    "error": "Payment verification failed",
                    "detail": error_msg,
                },
            )

        payer_address = verify_result.get("payer", "unknown")

        # Step 2: Record the verified payment
        payment_record = None
        try:
            async with async_session() as db:
                payment_record = await x402_payment_service.record_payment(
                    db=db,
                    payer_address=payer_address,
                    amount_usdc=price_usdc,
                    endpoint=path,
                    status="verified",
                    facilitator_response=json.dumps(verify_result.get("details", {})),
                )
        except Exception as e:
            logger.error(f"Failed to record X402 payment: {e}")

        # Step 3: Settle the payment via facilitator
        settle_result = await x402_payment_service.settle_payment(
            payment_signature=payment_signature,
        )

        if not settle_result.get("settled"):
            error_msg = settle_result.get("error", "Payment settlement failed")
            logger.error(f"X402: Payment settlement failed for {path}: {error_msg}")
            # Update payment record to failed
            if payment_record:
                try:
                    async with async_session() as db:
                        await x402_payment_service.update_payment_status(
                            db, payment_record.id, "failed"
                        )
                except Exception:
                    pass
            return JSONResponse(
                status_code=402,
                content={
                    "error": "Payment settlement failed",
                    "detail": error_msg,
                },
            )

        tx_hash = settle_result.get("tx_hash", "")

        # Step 4: Update payment record to settled
        if payment_record:
            try:
                async with async_session() as db:
                    await x402_payment_service.update_payment_status(
                        db, payment_record.id, "settled", tx_hash=tx_hash
                    )
            except Exception as e:
                logger.error(f"Failed to update X402 payment status: {e}")

        logger.info(
            f"X402: Payment settled for {path}: payer={payer_address}, "
            f"amount={price_usdc} USDC, tx={tx_hash}"
        )

        # Step 5: Inject payer info into request state for downstream use
        request.state.x402_payer = payer_address
        request.state.x402_tx_hash = tx_hash
        request.state.x402_amount = price_usdc

        # Pass through to the actual endpoint
        response = await call_next(request)

        # Add payment receipt headers to response
        response.headers["X-PAYMENT-TX"] = tx_hash
        response.headers["X-PAYMENT-PAYER"] = payer_address

        return response
