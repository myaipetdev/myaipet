"use client";

/**
 * Standalone /account route wrapper. Mirrors StudioWithNav/SovereigntyWithNav:
 * the global Nav + WalletGate around the account overview so "My Page" works
 * as a real URL (the Nav credits chip links here).
 *
 * The Nav chip balance comes from AccountOverview's own fetch (the /api/
 * account/overview payload carries the same users.credits the balance route
 * reads), so the chip and the big numeral can never disagree.
 */

import { useState } from "react";
import Nav from "@/components/Nav";
import WalletGate from "@/components/WalletGate";
import AccountOverview from "./AccountOverview";

export default function AccountWithNav() {
  const [credits, setCredits] = useState<number | null>(null);

  // Non-account destinations live on the home SPA (or their own routes).
  const handleSection = (key: string) => {
    if (typeof window !== "undefined") {
      window.location.href = key === "studio" ? "/studio" : `/?section=${encodeURIComponent(key)}`;
    }
  };

  return (
    <>
      <Nav section="account" setSection={handleSection} credits={credits} />
      <div style={{ paddingTop: 72 }}>
        {/* Guest visit → the standard connect-wallet gate (no fake zeros). */}
        <WalletGate section="account">
          <AccountOverview onCreditsChange={setCredits} />
        </WalletGate>
      </div>
    </>
  );
}
