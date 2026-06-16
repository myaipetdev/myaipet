import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { consumePaymentTx, PaymentAlreadyConsumed } from "@/lib/payments";
import { verifyUsdtTransfer, treasuryConfigured } from "@/lib/onchain";
import { rateLimit } from "@/lib/rateLimit";
import { NextRequest, NextResponse } from "next/server";

const PLANS: Record<string, { credits: number; price: number }> = {
  starter: { credits: 100, price: 5 },
  creator: { credits: 500, price: 20 },
  pro: { credits: 2000, price: 50 },
};

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Throttle per-user: the on-chain verify (eth_getTransactionReceipt) is the
    // only paid route that lacked a limiter, so spamming hashes burned RPC.
    const rl = rateLimit(req, { key: "credits-purchase", limit: 10, windowMs: 60_000 });
    if (!rl.ok) return rl.response;

    const body = await req.json();
    const { plan, payment_tx_hash } = body;

    if (!plan || !payment_tx_hash) {
      return NextResponse.json({ error: "Missing: plan, payment_tx_hash" }, { status: 400 });
    }

    if (!/^0x[0-9a-fA-F]{64}$/.test(payment_tx_hash)) {
      return NextResponse.json({ error: "Invalid transaction hash format" }, { status: 400 });
    }

    const selectedPlan = PLANS[plan];
    if (!selectedPlan) {
      return NextResponse.json({ error: `Invalid plan: ${Object.keys(PLANS).join(", ")}` }, { status: 400 });
    }

    // audit H4: fail closed if treasury isn't configured (otherwise the
    // recipient check in verifyUSDTTransfer is silently skipped).
    if (!treasuryConfigured()) {
      return NextResponse.json({ error: "Payments are temporarily unavailable" }, { status: 503 });
    }

    // Fast-path replay check against the global ledger (audit C3).
    const seen = await prisma.consumedPayment.findUnique({ where: { tx_hash: payment_tx_hash } });
    if (seen) {
      return NextResponse.json({ error: "Transaction already used" }, { status: 409 });
    }

    // On-chain USDT transfer verification (central, swappable verifier)
    const verification = await verifyUsdtTransfer(payment_tx_hash, user.wallet_address, selectedPlan.price);
    if (verification.ok !== true) {
      return NextResponse.json({ error: verification.error }, { status: 400 });
    }

    // Atomic credit grant — claim the tx in the global ledger first (audit C3/H1),
    // so a concurrent/cross-endpoint replay aborts the whole transaction.
    let newCredits: number;
    try {
      newCredits = await prisma.$transaction(async (tx) => {
        await consumePaymentTx(tx, {
          txHash: payment_tx_hash,
          userId: user.id,
          purpose: "credits",
          amountUsd: verification.amount,
        });
        await tx.creditPurchase.create({
          data: {
            user_id: user.id,
            credits: selectedPlan.credits,
            amount_usd: verification.amount, // audit M3: record what was actually paid
            payment_tx_hash,
            status: "confirmed",
          },
        });
        const updated = await tx.user.update({
          where: { id: user.id },
          data: { credits: { increment: selectedPlan.credits } },
          select: { credits: true },
        });
        return updated.credits;
      });
    } catch (e) {
      if (e instanceof PaymentAlreadyConsumed) {
        return NextResponse.json({ error: "Transaction already used" }, { status: 409 });
      }
      throw e;
    }

    return NextResponse.json({ credits: newCredits, purchased: selectedPlan.credits });
  } catch (error) {
    console.error("Credits purchase error:", error);
    return NextResponse.json({ error: "Failed to purchase credits" }, { status: 500 });
  }
}
