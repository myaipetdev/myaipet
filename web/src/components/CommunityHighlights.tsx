"use client";

/**
 * Community Highlights — sits above the gallery so the Community tab doesn't
 * open as a cold grid of images. Two jobs: prove the place is alive (live
 * aggregates) and shift the framing from "image gallery" to "a place full of
 * pets" (featured pet row). The gallery below stays as-is.
 */
import { useEffect, useState } from "react";
import Icon from "@/components/Icon";

interface Highlights {
  stats: { pets: number; generations: number; generationsThisWeek: number; activeCreators: number };
  featuredPets: { id: number; name: string; avatar_url: string | null; level: number; personality_type: string }[];
}

export default function CommunityHighlights() {
  const [h, setH] = useState<Highlights | null>(null);

  useEffect(() => {
    fetch("/api/community/highlights")
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setH(d))
      .catch(() => {});
  }, []);

  // Hide the whole hero on an empty/near-empty DB — otherwise a fresh launch
  // shows "A place full of pets · PETS 0 / CREATIONS 0", which reads as broken.
  // The gallery below has its own "No Creations Yet → Create the first one" state.
  if (!h || ((h.stats?.pets || 0) === 0 && (h.stats?.generations || 0) === 0)) return null;

  return (
    <div className="mp-enter" style={{ maxWidth: 1060, margin: "0 auto 18px", padding: "0 24px" }}>
      {/* Headline + live stats */}
      <div style={{
        background: "linear-gradient(135deg, #0f172a, #1e293b)",
        color: "white", borderRadius: 18, padding: "24px 26px",
        border: "1px solid rgba(255,255,255,0.06)",
        marginBottom: 14,
      }}>
        <div style={{
          fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: "0.18em", color: "#fbbf24", marginBottom: 8,
        }}>THE PACK</div>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: h.stats.pets >= 50 ? 16 : 0 }}>
          A place full of pets, not a wall of images.
        </div>
        {/* Only surface raw totals once they read as traction, not "10 pets". */}
        {h.stats.pets >= 50 && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Stat label="PETS" value={h.stats.pets.toLocaleString()} accent="#fbbf24" />
            <Stat label="CREATIONS" value={h.stats.generations.toLocaleString()} accent="#34d399" />
            <Stat label="THIS WEEK" value={`+${h.stats.generationsThisWeek.toLocaleString()}`} accent="#a855f7" />
            <Stat label="CREATORS · 7D" value={h.stats.activeCreators.toLocaleString()} accent="#60a5fa" />
          </div>
        )}
      </div>

      {/* Featured pets row */}
      {h.featuredPets.length > 0 && (
        <div style={{
          background: "white", borderRadius: 16,
          border: "1px solid rgba(0,0,0,0.06)", padding: "16px 18px",
        }}>
          <div style={{
            fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: "0.14em", color: "rgba(26,26,46,0.55)", marginBottom: 12,
            fontWeight: 800,
            display: "flex", alignItems: "center", gap: 6,
          }}><Icon name="trophy" size={14} /> MOST-BONDED PETS</div>
          <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
            {h.featuredPets.map(p => (
              <div key={p.id} className="mp-lift" style={{
                flexShrink: 0, width: 92, textAlign: "center",
                padding: "10px 8px", borderRadius: 14,
                background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.05)",
                cursor: "default",
              }}>
                {p.avatar_url
                  ? <img src={p.avatar_url} alt={p.name} style={{ width: 56, height: 56, borderRadius: 14, objectFit: "cover", marginBottom: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.10)" }} />
                  : <img src="/mascot.jpg" alt={p.name} style={{ width: 56, height: 56, borderRadius: 14, objectFit: "cover", marginBottom: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.10)" }} />}
                <div style={{ fontSize: 13, fontWeight: 800, color: "#1a1a2e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                <div style={{ fontSize: 13, color: "rgba(26,26,46,0.5)", fontFamily: "'JetBrains Mono', monospace", marginTop: 1 }}>Lv.{p.level}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{
      padding: "10px 16px", borderRadius: 12,
      background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
      minWidth: 96,
    }}>
      <div style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.12em", color: "rgba(255,255,255,0.5)" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: accent, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.1, marginTop: 2 }}>{value}</div>
    </div>
  );
}
