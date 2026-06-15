"use client";

/**
 * /settings route wrapper — global Nav + WalletGate around the BYO-models +
 * agent-loop panel (mirrors SovereigntyWithNav).
 */

import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import WalletGate from "@/components/WalletGate";
import ModelsPanel from "@/components/ModelsPanel";
import { getAuthHeaders } from "@/lib/api";

export default function SettingsWithNav() {
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/credits/balance", { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.credits != null) setCredits(d.credits); else if (d?.balance != null) setCredits(d.balance); })
      .catch(() => {});
  }, []);

  const handleSection = (key: string) => {
    if (typeof window !== "undefined") {
      window.location.href = key === "studio" ? "/studio" : key === "sovereignty" ? "/sovereignty" : `/?section=${encodeURIComponent(key)}`;
    }
  };

  return (
    <>
      <Nav section="settings" setSection={handleSection} credits={credits} />
      <div style={{ paddingTop: 72 }}>
        <WalletGate section="settings">
          <ModelsPanel />
        </WalletGate>
      </div>
    </>
  );
}
