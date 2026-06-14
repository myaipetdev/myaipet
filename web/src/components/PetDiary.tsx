"use client";

/**
 * Weekly pet diary card for the My Pet screen — the "주간 펫 일기" beat. The pet
 * writes a short journal entry about its week with the owner (from the memory
 * ledger). Renders nothing until the entry loads. Backed by /api/pets/[id]/diary
 * (cached 7 days server-side, so this is cheap to fetch on every visit).
 */
import { useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/api";

export default function PetDiary({
  petId, petName, accent,
}: { petId: number; petName: string; accent: string }) {
  const [entry, setEntry] = useState<string | null>(null);
  const [weekOf, setWeekOf] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/pets/${petId}/diary`, { headers: getAuthHeaders() })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled && d?.entry) { setEntry(d.entry); setWeekOf(d.weekOf || null); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [petId]);

  if (!entry) return null;

  const week = weekOf
    ? new Date(weekOf).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;

  return (
    <div
      className="mp-enter"
      style={{
        borderRadius: 18, padding: "18px 20px", marginBottom: 16,
        position: "relative", overflow: "hidden",
        background: `linear-gradient(135deg, ${accent}10, rgba(255,255,255,0.65))`,
        border: `1px solid ${accent}26`,
        boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
      }}
    >
      {/* warm paper glow */}
      <div style={{
        position: "absolute", top: -40, right: -20, width: 150, height: 150,
        borderRadius: "50%", background: accent, opacity: 0.06, filter: "blur(46px)",
        pointerEvents: "none",
      }} />

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 10, marginBottom: 9, position: "relative",
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: "0.12em", color: accent, fontWeight: 800, textTransform: "uppercase",
        }}>
          📔 {petName}&rsquo;s week
        </div>
        {week && (
          <span style={{
            fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
            color: "rgba(26,26,46,0.4)",
          }}>
            week of {week}
          </span>
        )}
      </div>

      <p style={{
        margin: 0, fontSize: 15, lineHeight: 1.65, color: "#2a2a3e",
        fontFamily: "'Space Grotesk', sans-serif", fontStyle: "italic",
        position: "relative",
      }}>
        &ldquo;{entry}&rdquo;
      </p>
    </div>
  );
}
