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
 * Defaults reproduce the current BSC mainnet + BSC-USD setup, so behaviour is
 * unchanged until the env / factory is updated.
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

/** Payment routes must FAIL CLOSED when no treasury is configured (audit H4). */
export function treasuryConfigured(): boolean {
  // Master payment kill-switch: PAYMENTS_ENABLED=false reports "no treasury" so
  // every paid surface shows "payments paused" / 503 even while a treasury wallet
  // stays configured in env (used during the BSC→Base chain migration). Flip the
  // flag back to re-enable — no code change needed.
  if (process.env.PAYMENTS_ENABLED === "false") return false;
  return ONCHAIN.treasuryWallet.length > 0;
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
      const res = await fetch(ONCHAIN.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1,
          method: "eth_getTransactionReceipt",
          params: [txHash],
        }),
      });
      const json = await res.json();
      const receipt = json.result;
      if (!receipt) return { ok: false, error: "Transaction receipt not found — TX may be pending or invalid" };
      if (receipt.status !== "0x1") return { ok: false, error: "Transaction failed or was reverted on-chain" };

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
export function verifyUsdtTransfer(
  txHash: string,
  expectedFrom: string,
  expectedAmountUsd: number,
): Promise<UsdtVerifyResult> {
  return getUsdtVerifier().verifyTransfer(txHash, expectedFrom, expectedAmountUsd);
}
