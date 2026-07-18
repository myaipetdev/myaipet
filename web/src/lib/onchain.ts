/**
 * Single source of truth for SERVER-SIDE on-chain configuration + payment
 * verification.
 *
 * WHY: the treasury wallet, chain, RPC, USDT token, deployed contract addresses,
 * and the on-chain verification mechanism were hardcoded and duplicated across
 * many routes. They are consolidated here and made env-overridable so they can
 * be REPLACED LATER without touching route/service code:
 *
 *   - Move the treasury        → set TREASURY_WALLET
 *   - Switch chain / RPC       → set CHAIN_ID, CHAIN_NAME, RPC_URL
 *   - Switch the paid token    → set USDT_CONTRACT, USDT_DECIMALS
 *   - Re-deploy contracts      → set PET_*_ADDRESS
 *   - Swap the whole payment-verification mechanism (different chain, an indexer
 *     API, or an off-chain rail) → implement UsdtVerifier and return it from
 *     getUsdtVerifier(). Every payment route already calls verifyUsdtTransfer(),
 *     so nothing else changes.
 *
 * Chain/token defaults reproduce the current BSC mainnet + BSC-USD setup.
 * Payments themselves remain disabled unless PAYMENTS_ENABLED is exact `true`.
 *
 * NOTE: only NEXT_PUBLIC_* values are ever exposed to the browser. The bare
 * env names below are server-only; the client mirror lives in lib/contracts.
 */

function envNum(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function pick(...vals: (string | undefined)[]): string {
  for (const v of vals) {
    if (v && v.trim()) return v.trim();
  }
  return "";
}

export const ONCHAIN = {
  chainId: envNum(process.env.CHAIN_ID, 56),
  chainName: pick(process.env.CHAIN_NAME) || "BSC",
  rpcUrl: pick(process.env.RPC_URL, process.env.BSC_RPC_URL) || "https://bsc-dataseed1.binance.org",
  // A receipt is not final at inclusion. Default to three confirmed blocks;
  // operators may raise (but not disable) this before enabling payments.
  paymentMinConfirmations: Math.floor(envNum(process.env.PAYMENT_MIN_CONFIRMATIONS, 3)),
  usdt: {
    address: pick(process.env.USDT_CONTRACT) || "0x55d398326f99059fF775485246999027B3197955", // BSC-USD
    decimals: envNum(process.env.USDT_DECIMALS, 18),
  },
  // Treasury that paid receipts must be sent to. Empty = NOT configured →
  // payment routes fail closed (see treasuryConfigured / audit H4).
  treasuryWallet: pick(process.env.TREASURY_WALLET),
  // Deployed contract addresses. Server-side overrides fall back to the public
  // mirror, then to the currently-deployed mainnet addresses.
  contracts: {
    petContent: pick(process.env.PET_CONTENT_ADDRESS, process.env.NEXT_PUBLIC_PET_CONTENT) || "0xB31B656D3790bFB3b3331D6A6BF0abf3dd6b0d9c",
    petaGenTracker: pick(process.env.PET_TRACKER_ADDRESS, process.env.NEXT_PUBLIC_PET_TRACKER) || "0x590D3b2CD0AB9aEE0e0d7Fd48E8810b20ec8Ac0a",
    petToken: pick(process.env.PET_TOKEN_ADDRESS, process.env.NEXT_PUBLIC_PET_TOKEN),
    petShop: pick(process.env.PET_SHOP_ADDRESS, process.env.NEXT_PUBLIC_PET_SHOP),
    petActivity: pick(process.env.PET_ACTIVITY_ADDRESS, process.env.NEXT_PUBLIC_PET_ACTIVITY),
    petSoul: pick(process.env.PET_SOUL_ADDRESS, process.env.NEXT_PUBLIC_PET_SOUL),
  },
} as const;

// ERC-20 Transfer(address,address,uint256) — chain-agnostic event topic.
export const ERC20_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/**
 * Master switch for every server-side provenance write. This is deliberately
 * exact and opt-in: missing, `false`, `TRUE`, and all other values stay paused.
 */
export function blockchainEnabled(): boolean {
  return process.env.BLOCKCHAIN_ENABLED === "true";
}

/**
 * External payments are opt-in. A configured treasury is necessary but never
 * sufficient: only the exact value PAYMENTS_ENABLED=true opens the rail.
 */
export function paymentsEnabled(): boolean {
  return process.env.PAYMENTS_ENABLED === "true" && ONCHAIN.treasuryWallet.length > 0;
}

/** Backwards-compatible name used by paid routes and runtime config. */
export function treasuryConfigured(): boolean {
  return paymentsEnabled();
}

export class InvalidPaymentTxHash extends Error {
  constructor() {
    super("Invalid transaction hash format");
    this.name = "InvalidPaymentTxHash";
  }
}

/**
 * Canonical representation for every financial receipt lookup and write.
 * Ethereum transaction hashes are byte strings; hexadecimal letter case is
 * presentation-only and must never create a second replay namespace.
 */
export function canonicalizePaymentTxHash(value: unknown): string {
  if (typeof value !== "string" || !/^0x[0-9a-f]{64}$/i.test(value)) {
    throw new InvalidPaymentTxHash();
  }
  return value.toLowerCase();
}

export type UsdtVerifyResult =
  | { ok: true; from: string; to: string; amount: number }
  | { ok: false; error: string };

/**
 * Swap-point for the payment-verification mechanism. Implement this and return
 * it from getUsdtVerifier() to move off BSC RPC (e.g. a different chain, an
 * indexer/explorer API, or an off-chain payment rail) without touching routes.
 */
export interface UsdtVerifier {
  verifyTransfer(
    txHash: string,
    expectedFrom: string,
    expectedAmountUsd: number,
  ): Promise<UsdtVerifyResult>;
}

type RpcLog = {
  address?: string;
  topics?: string[];
  data?: string;
};

function topicToAddress(topic: string | undefined): string {
  if (!topic || topic.length < 66) return "";
  return `0x${topic.slice(-40)}`.toLowerCase();
}

function usdToTokenUnits(amountUsd: number, decimals: number): bigint {
  const scale = BigInt(10) ** BigInt(decimals);
  const normalized = amountUsd.toFixed(Math.min(decimals, 6)).replace(/\.?0+$/, "");
  const [whole, frac = ""] = normalized.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * scale + BigInt(fracPadded || "0");
}

/** Default verifier: reads the tx receipt over JSON-RPC and inspects the
 *  ERC-20 Transfer log to the configured treasury. */
class RpcUsdtVerifier implements UsdtVerifier {
  async verifyTransfer(
    txHash: string,
    expectedFrom: string,
    expectedAmountUsd: number,
  ): Promise<UsdtVerifyResult> {
    try {
      if (!paymentsEnabled()) {
        return { ok: false, error: "Payments are temporarily unavailable" };
      }
      const canonicalTxHash = canonicalizePaymentTxHash(txHash);
      const res = await fetch(ONCHAIN.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1,
          method: "eth_getTransactionReceipt",
          params: [canonicalTxHash],
        }),
      });
      const json = await res.json();
      const receipt = json.result;
      if (!receipt) return { ok: false, error: "Transaction receipt not found — TX may be pending or invalid" };
      if (receipt.status !== "0x1") return { ok: false, error: "Transaction failed or was reverted on-chain" };
      if (typeof receipt.blockNumber !== "string" || !/^0x[0-9a-f]+$/i.test(receipt.blockNumber)) {
        return { ok: false, error: "Transaction receipt is missing a valid block number" };
      }

      const tipRes = await fetch(ONCHAIN.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_blockNumber", params: [] }),
      });
      const tipJson = await tipRes.json();
      if (typeof tipJson.result !== "string" || !/^0x[0-9a-f]+$/i.test(tipJson.result)) {
        return { ok: false, error: "Could not determine payment confirmation depth" };
      }
      const receiptBlock = BigInt(receipt.blockNumber);
      const tipBlock = BigInt(tipJson.result);
      const confirmations = tipBlock >= receiptBlock ? tipBlock - receiptBlock + BigInt(1) : BigInt(0);
      if (confirmations < BigInt(ONCHAIN.paymentMinConfirmations)) {
        return {
          ok: false,
          error: `Payment is confirming (${confirmations.toString()}/${ONCHAIN.paymentMinConfirmations} confirmations)`,
        };
      }

      const expectedFromLc = expectedFrom.toLowerCase();
      const expectedToLc = ONCHAIN.treasuryWallet.toLowerCase();
      const expectedUnits = usdToTokenUnits(expectedAmountUsd, ONCHAIN.usdt.decimals);
      const transferLog = ((receipt.logs || []) as RpcLog[]).find((log) => {
        if (log.address?.toLowerCase() !== ONCHAIN.usdt.address.toLowerCase()) return false;
        if (log.topics?.[0] !== ERC20_TRANSFER_TOPIC) return false;
        if (topicToAddress(log.topics[1]) !== expectedFromLc) return false;
        if (expectedToLc && topicToAddress(log.topics[2]) !== expectedToLc) return false;
        if (!log.data) return false;
        return BigInt(log.data) === expectedUnits;
      });

      if (!transferLog) {
        return {
          ok: false,
          error: "No exact matching USDT payment transfer found for sender, treasury, and amount",
        };
      }

      const from = topicToAddress(transferLog.topics?.[1]);
      const to = topicToAddress(transferLog.topics?.[2]);
      const amount = Number(BigInt(transferLog.data || "0x0")) / 10 ** ONCHAIN.usdt.decimals;
      return { ok: true, from, to, amount };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[onchain] USDT verification failed:", message);
      return { ok: false, error: "Failed to verify transaction on-chain" };
    }
  }
}

let _verifier: UsdtVerifier | null = null;

/** Returns the active payment verifier. Swap the implementation here to migrate
 *  the on-chain (or off-chain) payment mechanism later. */
export function getUsdtVerifier(): UsdtVerifier {
  if (!_verifier) _verifier = new RpcUsdtVerifier();
  return _verifier;
}

/** Convenience wrapper used by every payment route. */
export async function verifyUsdtTransfer(
  txHash: string,
  expectedFrom: string,
  expectedAmountUsd: number,
): Promise<UsdtVerifyResult> {
  if (!paymentsEnabled()) {
    return { ok: false, error: "Payments are temporarily unavailable" };
  }
  try {
    const canonicalTxHash = canonicalizePaymentTxHash(txHash);
    return await getUsdtVerifier().verifyTransfer(canonicalTxHash, expectedFrom, expectedAmountUsd);
  } catch (error) {
    if (error instanceof InvalidPaymentTxHash) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}
