"use client";

/**
 * Wraps PetStudioPro with the global Nav so the /studio
 * routes look like the rest of the site. App.tsx renders Nav locally for the
 * single-page-app home; standalone routes have to bring their own.
 */

import { useState } from "react";
import Nav from "@/components/Nav";
import StudioSuite from "@/components/studio/StudioSuite";

export default function StudioWithNav() {
  // Single source of truth: PetStudioPro owns the balance (it already fetches
  // and updates it on every spend) and reports changes up via onCreditsChange,
  // so the nav chip stays live instead of pinning a stale first fetch.
  const [credits, setCredits] = useState<number | null>(null);

  // Non-studio nav items live on the home SPA. Route via ?section= so the
  // user actually lands on the section they tapped (Season Rewards →
  // /?section=season, not back to Home).
  const handleSection = (key: string) => {
    if (key === "studio") return;
    if (typeof window !== "undefined") {
      window.location.href = `/?section=${encodeURIComponent(key)}`;
    }
  };

  return (
    <>
      <Nav section="studio" setSection={handleSection} credits={credits} />
      <StudioSuite onCreditsChange={setCredits} />
    </>
  );
}
