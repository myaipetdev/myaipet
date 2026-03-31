"use client";

import { WagmiProvider, http } from "wagmi";
import { mainnet, base, bsc } from "wagmi/chains";
import { RainbowKitProvider, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState, useEffect } from "react";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "160fa3892ed87b298703795af8e6fc2a";

let config: any;
let WEB3_READY = false;

try {
  config = getDefaultConfig({
    appName: "MY AI PET",
    projectId,
    chains: [mainnet, base, bsc],
    transports: {
      [mainnet.id]: http(),
      [base.id]: http(),
      [bsc.id]: http(),
    },
    ssr: true,
  });
  WEB3_READY = true;
} catch (e) {
  console.warn("[Providers] Failed to init wagmi config:", e);
}

export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!WEB3_READY || !config) {
    return <>{children}</>;
  }

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider locale="en">
          {mounted ? children : null}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
