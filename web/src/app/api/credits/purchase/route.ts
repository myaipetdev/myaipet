import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

const PLANS: Record<string, { credits: number; price: number }> = {
  starter: { credits: 100, price: 5 },
  creator: { credits: 500, price: 20 },
  pro: { credits: 2000, price: 50 },
};

const BSC_RPC_URL = "https://bsc-dataseed1.binance.org";

/**
 * Verify a BSC transaction on-chain via JSON-RPC.
 * Returns the parsed receipt and transaction, or an error string.
 */
async function verifyBscTransaction(txHash: string): Promise<
  | { error: string }
  | { receipt: { status: string; from: string }; tx: { from: string; value: string } }
> {
  try {
    const [receiptRes, txRes] = await Promise.all([
      fetch(BSC_RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getTransactionReceipt",
          params: [txHash],
        }),
      }),
      fetch(BSC_RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "eth_getTransactionByHash",
          params: [txHash],
        }),
      }),
    ]);

    const receiptJson = await receiptRes.json();
    const txJson = await txRes.json();

    if (!receiptJson.result) {
      return { error: "Transaction receipt not found — TX may be pending or invalid" };
    }
    if (!txJson.result) {
      return { error: "Transaction not found on BSC" };
    }

    return {
      receipt: receiptJson.result,
      tx: txJson.result,
    };
  } catch (e) {
    console.error("BSC RPC call failed:", e);
    return { error: "Failed to verify transaction on-chain" };
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { plan, payment_tx_hash } = body;

    if (!plan || !payment_tx_hash) {
      return NextResponse.json(
        { error: "Missing required fields: plan, payment_tx_hash" },
        { status: 400 }
      );
    }

    // Basic format validation
    if (!/^0x[0-9a-fA-F]{64}$/.test(payment_tx_hash)) {
      return NextResponse.json(
        { error: "Invalid transaction hash format" },
        { status: 400 }
      );
    }

    const selectedPlan = PLANS[plan];
    if (!selectedPlan) {
      return NextResponse.json(
        { error: `Invalid plan. Choose from: ${Object.keys(PLANS).join(", ")}` },
        { status: 400 }
      );
    }

    // --- Replay prevention: check if this TX hash was already used ---
    const existingPurchase = await prisma.creditPurchase.findFirst({
      where: { payment_tx_hash },
    });
    if (existingPurchase) {
      return NextResponse.json(
        { error: "This transaction has already been used for a purchase" },
        { status: 409 }
      );
    }

    // --- On-chain verification ---
    const verification = await verifyBscTransaction(payment_tx_hash);
    if ("error" in verification) {
      return NextResponse.json(
        { error: verification.error },
        { status: 400 }
      );
    }

    const { receipt, tx } = verification;

    // 1. TX must be confirmed (status 0x1)
    if (receipt.status !== "0x1") {
      return NextResponse.json(
        { error: "Transaction failed or was reverted on-chain" },
        { status: 400 }
      );
    }

    // 2. TX sender must match the authenticated user's wallet
    if (tx.from.toLowerCase() !== user.wallet_address.toLowerCase()) {
      return NextResponse.json(
        { error: "Transaction sender does not match your wallet" },
        { status: 403 }
      );
    }

    // 3. TX value must cover the plan price (value is in wei; price is in USD-pegged stablecoin units)
    //    For native BNB payments the value is in wei (18 decimals).
    //    Adjust this check if using a token transfer instead of native value.
    const valueBN = BigInt(tx.value);
    const expectedWei = BigInt(selectedPlan.price) * BigInt(10 ** 18);
    if (valueBN < expectedWei) {
      return NextResponse.json(
        { error: "Transaction value is less than the required payment amount" },
        { status: 400 }
      );
    }

    const [purchase, updatedUser] = await prisma.$transaction([
      prisma.creditPurchase.create({
        data: {
          user_id: user.id,
          credits: selectedPlan.credits,
          amount_usd: selectedPlan.price,
          payment_tx_hash,
          status: "confirmed",
        },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: {
          credits: { increment: selectedPlan.credits },
        },
        select: { credits: true },
      }),
    ]);

    return NextResponse.json({
      credits: updatedUser.credits,
      purchased: selectedPlan.credits,
    });
  } catch (error) {
    console.error("Credits purchase error:", error);
    return NextResponse.json({ error: "Failed to purchase credits" }, { status: 500 });
  }
}
