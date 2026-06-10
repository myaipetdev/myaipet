"use client";

/**
 * Wraps PetStudioPro with the global Nav so the /studio (and /studio_test)
 * routes look like the rest of the site. App.tsx renders Nav locally for the
 * single-page-app home; standalone routes have to bring their own.
 */

import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import PetStudioPro from "@/components/PetStudioPro";
import { getAuthHeaders } from "@/lib/api";

export default function StudioWithNav() {
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/studio/generate", { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.credits != null) setCredits(d.credits); })
      .catch(() => {});
  }, []);

  // Non-studio nav items live on the home SPA. Route via ?section= so the
  // user actually lands on the section they tapped (Airdrop → /?section=airdrop,
  // not back to Home).
  const handleSection = (key: string) => {
    if (key === "studio") return;
    if (typeof window !== "undefined") {
      window.location.href = `/?section=${encodeURIComponent(key)}`;
    }
  };

  return (
    <>
      <Nav section="studio" setSection={handleSection} credits={credits} />
      <PetStudioPro />
    </>
  );
}
