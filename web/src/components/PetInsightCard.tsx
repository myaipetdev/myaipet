"use client";

/**
 * "{Pet} has been thinking about you" — surfaces daydream insights the pet
 * synthesized by connecting memories about the owner. The emotional payoff
 * of the whole memory ledger: proof the pet thinks about you while you're gone.
 */
import { useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/api";

interface Insight {
  id: number;
  insight: string;
  mood: string;
  score: number;
  created_at: string;
  wasNew: boolean;
}

const MOOD: Record<string, { emoji: string; bg: string; fg: string; ring: string }> = {
  tender:    { emoji: "🫶", bg: "rgba(244,114,182,0.08)", fg: "#be185d", ring: "rgba(244,114,182,0.25)" },
  playful:   { emoji: "✨", bg: "rgba(245,158,11,0.08)",  fg: "#b45309", ring: "rgba(245,158,11,0.25)" },
  concerned: { emoji: "🥺", bg: "rgba(139,92,246,0.08)",  fg: "#6d28d9", ring: "rgba(139,92,246,0.25)" },
  hopeful:   { emoji: "🌱", bg: "rgba(34,197,94,0.08)",   fg: "#15803d", ring: "rgba(34,197,94,0.25)" },
};

export default function PetInsightCard({ petId, petName }: { petId: number; petName: string }) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [thinking, setThinking] = useState(false);

  const load = async () => {
    try {
      const r = await fetch(`/api/pets/${petId}/daydream`, { headers: getAuthHeaders() });
      if (r.ok) setInsights((await r.json()).insights || []);
    } catch { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, [petId]);

  const triggerDaydream = async () => {
    setThinking(true);
    try {
      await fetch(`/api/pets/${petId}/daydream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      });
      await load();
    } catch { /* ignore */ }
    setThinking(false);
  };

  if (loading) return null;

  return (
    <div className="mp-enter" style={{
      background: "linear-gradient(135deg, rgba(139,92,246,0.05), rgba(245,158,11,0.03))",
      borderRadius: 18,
      border: "1px solid rgba(139,92,246,0.15)",
      padding: "20px 22px",
      marginTop: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: insights.length ? 16 : 8 }}>
        <span style={{ fontSize: 22 }}>💭</span>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: "0.14em", color: "#6d28d9", fontWeight: 800,
          }}>DAYDREAMS · DEFAULT MODE NETWORK</div>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.01em", color: "#1a1a2e" }}>
            {petName} has been thinking about you
          </div>
        </div>
        <button
          onClick={triggerDaydream}
          disabled={thinking}
          className="mp-lift"
          style={{
            padding: "8px 14px", borderRadius: 10, border: "none",
            background: thinking ? "rgba(139,92,246,0.5)" : "linear-gradient(135deg,#a855f7,#7c3aed)",
            color: "white", fontWeight: 700, fontSize: 12, cursor: thinking ? "wait" : "pointer",
            fontFamily: "'Space Grotesk', sans-serif",
            boxShadow: "0 2px 8px rgba(124,58,237,0.25)",
          }}
        >{thinking ? "Thinking…" : "Daydream"}</button>
      </div>

      {insights.length === 0 ? (
        <div style={{
          fontSize: 14, color: "rgba(26,26,46,0.6)", lineHeight: 1.55,
          padding: "8px 2px",
        }}>
          When {petName} has enough memories of you, they'll start connecting the
          dots on their own — noticing things, wondering about you, surfacing
          caring thoughts here. Keep chatting to give them something to dream about.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {insights.map(ins => {
            const m = MOOD[ins.mood] || MOOD.tender;
            return (
              <div key={ins.id} style={{
                display: "flex", gap: 12, alignItems: "flex-start",
                padding: "14px 16px", borderRadius: 14,
                background: m.bg, border: `1px solid ${m.ring}`,
              }}>
                <div style={{
                  width: 34, height: 34, borderRadius: "50%",
                  background: "white", border: `1px solid ${m.ring}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 17, flexShrink: 0,
                }}>{m.emoji}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, lineHeight: 1.55, color: "#1a1a2e", fontWeight: 500 }}>
                    {ins.insight}
                  </div>
                  <div style={{
                    marginTop: 4, fontSize: 11,
                    fontFamily: "'JetBrains Mono', monospace",
                    color: m.fg, letterSpacing: "0.06em",
                  }}>
                    {ins.mood}{ins.wasNew ? " · new" : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
