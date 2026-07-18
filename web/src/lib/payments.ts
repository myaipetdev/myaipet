/**
 * Shared on-chain payment helpers.
 *
 * Two audit fixes live here:
 *   - C3: a single global ledger (ConsumedPayment) so one USDT tx_hash can never
 *     be redeemed across multiple paid endpoints (credits / subscription /
 *     action / premium shop). Every payment route claims the hash here, inside
 *     its grant transaction, before granting anything.
 *   - H4: payment routes must FAIL CLOSED when the treasury wallet isn't
 *     configured, instead of silently skipping the recipient check.
 */

// Treasury config + fail-closed check live in the central on-chain module so the
// treasury wallet can be swapped in one place (audit + replaceability).
import { canonicalizePaymentTxHash, paymentsEnabled } from "./onchain";

export {
  ONCHAIN,
  canonicalizePaymentTxHash,
  paymentsEnabled,
  treasuryConfigured,
  verifyUsdtTransfer,
} from "./onchain";
export const TREASURY_WALLET = (process.env.TREASURY_WALLET || "").trim();

/** Thrown by consumePaymentTx when the tx_hash was already used anywhere. */
export class PaymentAlreadyConsumed extends Error {
  constructor() {
    super("Transaction already used");
    this.name = "PaymentAlreadyConsumed";
  }
}

/** Defense-in-depth if a caller reaches the ledger while the rail is paused. */
export class PaymentsPausedError extends Error {
  constructor() {
    super("Payments are temporarily unavailable");
    this.name = "PaymentsPausedError";
  }
}

// Minimal structural type for the interactive Prisma tx client (avoids coupling
// to the generated client's exported namespace).
type ConsumeTxClient = {
  consumedPayment: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
};

/**
 * Globally claim an on-chain payment `txHash`. MUST be called inside the grant
 * transaction (pass the interactive `tx` client). Throws PaymentAlreadyConsumed
 * (P2002 on the unique tx_hash) if the payment was already consumed by any
 * endpoint — the caller should map that to HTTP 409.
 */
export async function consumePaymentTx(
  tx: ConsumeTxClient,
  args: { txHash: string; userId: number; purpose: string; amountUsd: number },
): Promise<string> {
  if (!paymentsEnabled()) throw new PaymentsPausedError();
  const canonicalTxHash = canonicalizePaymentTxHash(args.txHash);
  try {
    await tx.consumedPayment.create({
      data: {
        tx_hash: canonicalTxHash,
        user_id: args.userId,
        purpose: args.purpose,
        amount_usd: args.amountUsd,
      },
    });
    return canonicalTxHash;
  } catch (e: unknown) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2002") {
      throw new PaymentAlreadyConsumed();
    }
    throw e;
  }
}
