"use client";

/**
 * Standalone /sovereignty route wrapper. Mirrors StudioWithNav — the global
 * Nav + WalletGate around the dashboard so the page works as a real URL (the
 * OAuth returnTo, the TrustStrip link, and the in-dashboard returnTo all point
 * at /sovereignty, which previously 404'd because the dashboard only lived as
 * an in-page section of the home SPA).
 */

import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import WalletGate from "@/components/WalletGate";
import SovereigntyDashboard from "@/components/SovereigntyDashboard";
import { getAuthHeaders } from "@/lib/api";

export default function SovereigntyWithNav() {
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/credits/balance", { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.credits != null) setCredits(d.credits); else if (d?.balance != null) setCredits(d.balance); })
      .catch(() => {});
  }, []);

  const handleSection = (key: string) => {
    if (key === "sovereignty") return;
    if (typeof window !== "undefined") {
      window.location.href = key === "studio" ? "/studio" : `/?section=${encodeURIComponent(key)}`;
    }
  };

  return (
    <>
      <Nav section="sovereignty" setSection={handleSection} credits={credits} />
      <div style={{ paddingTop: 72 }}>
        <WalletGate section="sovereignty">
          <SovereigntyDashboard />
        </WalletGate>
      </div>
    </>
  );
}
