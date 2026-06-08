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

      const transferLog = (receipt.logs || []).find((log: any) =>
        log.address?.toLowerCase() === ONCHAIN.usdt.address.toLowerCase() &&
        log.topics?.[0] === ERC20_TRANSFER_TOPIC
      );
      if (!transferLog) return { ok: false, error: "No USDT transfer found in transaction" };

      const from = "0x" + transferLog.topics[1].slice(26);
      const to = "0x" + transferLog.topics[2].slice(26);
      const amount = Number(BigInt(transferLog.data)) / 10 ** ONCHAIN.usdt.decimals;

      if (from.toLowerCase() !== expectedFrom.toLowerCase()) {
        return { ok: false, error: "Transaction sender does not match your wallet" };
      }
      // audit H4: only skipped when there is genuinely no treasury — callers must
      // gate on treasuryConfigured() and fail closed before reaching here.
      if (ONCHAIN.treasuryWallet && to.toLowerCase() !== ONCHAIN.treasuryWallet.toLowerCase()) {
        return { ok: false, error: "Payment was not sent to the configured treasury" };
      }
      if (amount < expectedAmountUsd * 0.99) {
        return { ok: false, error: `Insufficient amount: sent ${amount.toFixed(4)} USDT, required ${expectedAmountUsd}` };
      }
      return { ok: true, from, to, amount };
    } catch (e: any) {
      console.error("[onchain] USDT verification failed:", e?.message);
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
