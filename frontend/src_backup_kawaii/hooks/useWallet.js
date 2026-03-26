/**
 * PETAGEN Wallet Configuration
 * wagmi + RainbowKit setup for Base + BNB Chain.
 */

import { http, createConfig } from "wagmi";
import { base, bsc } from "wagmi/chains";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";

export const wagmiConfig = getDefaultConfig({
  appName: "AI PET",
  projectId: "petagen-demo", // Replace with WalletConnect project ID in production
  chains: [base, bsc],
  transports: {
    [base.id]: http(),
    [bsc.id]: http(),
  },
});
