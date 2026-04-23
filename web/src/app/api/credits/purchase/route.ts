import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

const PLANS: Record<string, { credits: number; price: number }> = {
  starter: { credits: 100, price: 5 },
  creator: { credits: 500, price: 20 },
  pro: { credits: 2000, price: 50 },
};

const BSC_RPC_URL = "https://bsc-dataseed1.binance.org";
const USDT_CONTRACT = "0x55d398326f99059fF775485246999027B3197955"; // BSC-USD (18 decimals on BSC)
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"; // Transfer(address,address,uint256)

// Recipient wallet for payments — set this to your treasury wallet
const TREASURY_WALLET = process.env.TREASURY_WALLET || "";

/**
 * Verify a BSC USDT transfer on-chain.
 * Checks transaction receipt logs for ERC20 Transfer event from USDT contract.
 */
async function verifyUSDTTransfer(txHash: string, expectedFrom: string, expectedAmount: number): Promise<
  | { error: string }
  | { verified: true; from: string; to: string; amount: number }
> {
  try {
    const receiptRes = await fetch(BSC_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "eth_getTransactionReceipt",
        params: [txHash],
      }),
    });

    const receiptJson = await receiptRes.json();
    const receipt = receiptJson.result;

    if (!receipt) return { error: "Transaction receipt not found — TX may be pending or invalid" };
    if (receipt.status !== "0x1") return { error: "Transaction failed or was reverted on-chain" };

    // Find USDT Transfer event in logs
    const transferLog = (receipt.logs || []).find((log: any) =>
      log.address.toLowerCase() === USDT_CONTRACT.toLowerCase() &&
      log.topics?.[0] === TRANSFER_TOPIC
    );

    if (!transferLog) return { error: "No USDT transfer found in transaction" };

    // Decode Transfer(from, to, amount)
    const from = "0x" + transferLog.topics[1].slice(26);
    const to = "0x" + transferLog.topics[2].slice(26);
    const amountHex = transferLog.data;
    const amountWei = BigInt(amountHex);

    // BSC-USD uses 18 decimals
    const amountUSD = Number(amountWei) / 1e18;

    // Verify sender matches authenticated user
    if (from.toLowerCase() !== expectedFrom.toLowerCase()) {
      return { error: "Transaction sender does not match your wallet" };
    }

    // Verify recipient is our treasury (if configured)
    if (TREASURY_WALLET && to.toLowerCase() !== TREASURY_WALLET.toLowerCase()) {
      return { error: "Payment was not sent to the correct address" };
    }

    // Verify amount covers the plan price (allow 1% tolerance for gas/fees)
    if (amountUSD < expectedAmount * 0.99) {
      return { error: `Insufficient USDT amount: sent ${amountUSD.toFixed(2)}, required ${expectedAmount}` };
    }

    return { verified: true, from, to, amount: amountUSD };
  } catch (e) {
    console.error("BSC RPC verification failed:", e);
    return { error: "Failed to verify transaction on-chain" };
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

    // Replay prevention
    const existing = await prisma.creditPurchase.findFirst({ where: { payment_tx_hash } });
    if (existing) {
      return NextResponse.json({ error: "Transaction already used" }, { status: 409 });
    }

    // On-chain USDT transfer verification
    const verification = await verifyUSDTTransfer(payment_tx_hash, user.wallet_address, selectedPlan.price);
    if ("error" in verification) {
      return NextResponse.json({ error: verification.error }, { status: 400 });
    }

    // Atomic credit grant
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
        data: { credits: { increment: selectedPlan.credits } },
        select: { credits: true },
      }),
    ]);

    return NextResponse.json({ credits: updatedUser.credits, purchased: selectedPlan.credits });
  } catch (error) {
    console.error("Credits purchase error:", error);
    return NextResponse.json({ error: "Failed to purchase credits" }, { status: 500 });
  }
}
