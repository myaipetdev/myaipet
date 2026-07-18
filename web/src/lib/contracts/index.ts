import PETTokenABI from "./PETToken.abi.json";
import PETShopABI from "./PETShop.abi.json";
import PETContentABI from "./PETContent.abi.json";
import PetaGenTrackerABI from "./PetaGenTracker.abi.json";
import PETActivityABI from "./PETActivity.abi.json";

// Client-side (NEXT_PUBLIC) mirror of the on-chain config. The server authority
// is lib/onchain.ts; keep these env values in sync so chain/token/contract
// swaps only require env changes (no code edits).
export const CONTRACTS = {
  // Public boolean only; no relayer key or other secret is exposed. next.config
  // derives this exact value from the authoritative server kill-switch at build.
  blockchainEnabled: process.env.NEXT_PUBLIC_BLOCKCHAIN_ENABLED === "true",
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID || 56),
  petToken: (process.env.NEXT_PUBLIC_PET_TOKEN || "").trim(),
  petShop: (process.env.NEXT_PUBLIC_PET_SHOP || "").trim(),
  petContent: (process.env.NEXT_PUBLIC_PET_CONTENT || "").trim(),
  tracker: (process.env.NEXT_PUBLIC_PET_TRACKER || "").trim(),
  petActivity: (process.env.NEXT_PUBLIC_PET_ACTIVITY || "").trim(),
  usdt: (process.env.NEXT_PUBLIC_USDT_CONTRACT || "0x55d398326f99059fF775485246999027B3197955").trim(), // BSC-USD default
  // Paid-token decimals. BSC-USD = 18 (default); Base USDC = 6. Mirrors the
  // server USDT_DECIMALS so a chain swap is purely an env change.
  usdtDecimals: Number(process.env.NEXT_PUBLIC_USDT_DECIMALS || 18),
  // Native gas-token symbol for the target chain (BNB on BSC, ETH on Base).
  // Used in user-facing "you need gas" copy.
  nativeSymbol: (process.env.NEXT_PUBLIC_NATIVE_SYMBOL || "BNB").trim(),
} as const;

export { PETTokenABI, PETShopABI, PETContentABI, PetaGenTrackerABI, PETActivityABI };

// Minimal ERC-20 ABI for USDT approve
export const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
