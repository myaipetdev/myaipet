/**
 * Pet Studio staging — /studio_test
 *
 * NOT linked from nav. Iteration ground for the Studio UX before going live.
 * Live home is unaffected by anything here until user signs off.
 */

import StudioWithNav from "@/components/StudioWithNav";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Studio (staging) — MY AI PET",
  robots: { index: false, follow: false },
};

export default function StudioStagingPage() {
  return (
    <div>
      {/* Staging warning ribbon — makes it obvious this is not the live UI */}
      <div style={{
        position: "sticky", top: 0, zIndex: 100,
        padding: "8px 16px",
        background: "linear-gradient(90deg, #fbbf24, #f59e0b)",
        color: "#1a1a2e", fontWeight: 800,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 13, letterSpacing: "0.14em",
        textTransform: "uppercase", textAlign: "center",
      }}>
        ⚠ STAGING · NOT LIVE · feedback iteration only
      </div>
      <StudioWithNav />
    </div>
  );
}
