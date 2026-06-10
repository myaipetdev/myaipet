"use client";

/**
 * Multi-dimensional leaderboard with 6 tabs. Replaces the legacy
 * airdrop_points-only leaderboard.
 *
 * Tabs: 🔥 Streak · 💬 Chats · 🧠 Memories · 🎬 Creator · 💝 Bond · 🎂 Day-One
 */
import { useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/api";

const METRICS = [
  { key: "streak",   label: "Streak King",     emoji: "🔥" },
  { key: "chats",    label: "Most Talked To",  emoji: "💬" },
  { key: "memories", label: "Memory Master",   emoji: "🧠" },
  { key: "creator",  label: "Top Creator",     emoji: "🎬" },
  { key: "bond",     label: "Most Bonded",     emoji: "💝" },
  { key: "oldest",   label: "Day-One",         emoji: "🎂" },
] as const;

type Metric = typeof METRICS[number]["key"];

interface Entry {
  rank: number;
  wallet: string;
  isMe: boolean;
  value: number;
  pet: { name: string; avatar_url: string | null } | null;
}

interface Resp {
  metric: string;
  meta: { label: string; unit: string; emoji: string; description: string };
  entries: Entry[];
  myRank: Entry | null;
}

export default function MultiLeaderboard() {
  const [metric, setMetric] = useState<Metric>("streak");
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/leaderboards/${metric}?limit=50`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, [metric]);

  return (
    <div style={{ maxWidth: 1060, margin: "20px auto", padding: "0 24px" }}>
      <div style={{
        background: "white", borderRadius: 18,
        border: "1px solid rgba(0,0,0,0.06)", overflow: "hidden",
      }}>
        {/* Tabs */}
        <div style={{
          padding: "10px 12px",
          borderBottom: "1px solid rgba(0,0,0,0.05)",
          background: "rgba(0,0,0,0.02)",
          display: "flex", gap: 6, overflowX: "auto",
        }}>
          {METRICS.map(m => {
            const sel = m.key === metric;
            return (
              <button key={m.key} onClick={() => setMetric(m.key)} style={{
                padding: "8px 14px", borderRadius: 10, border: "none",
                background: sel ? "white" : "transparent",
                color: sel ? "#b45309" : "rgba(26,26,46,0.55)",
                fontWeight: sel ? 800 : 600, fontSize: 13,
                cursor: "pointer", whiteSpace: "nowrap",
                fontFamily: "'Space Grotesk', sans-serif",
                boxShadow: sel ? "0 1px 0 rgba(0,0,0,0.04)" : "none",
              }}>
                {m.emoji} {m.label}
              </button>
            );
          })}
        </div>

        {/* Description + my rank */}
        {data && (
          <div style={{
            padding: "12px 22px",
            display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
            borderBottom: "1px solid rgba(0,0,0,0.05)",
          }}>
            <div style={{ fontSize: 28 }}>{data.meta.emoji}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{data.meta.label}</div>
              <div style={{ fontSize: 12, color: "rgba(26,26,46,0.55)" }}>{data.meta.description}</div>
            </div>
            {data.myRank && (
              <div style={{
                padding: "8px 14px", borderRadius: 10,
                background: "rgba(245,158,11,0.10)",
                border: "1px solid rgba(245,158,11,0.25)",
              }}>
                <div style={{
                  fontSize: 9, fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: "0.12em", color: "rgba(26,26,46,0.55)",
                }}>YOUR RANK</div>
                <div style={{
                  fontSize: 18, fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 800, color: "#b45309",
                }}>
                  #{data.myRank.rank} · {data.myRank.value} {data.meta.unit}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Rows */}
        <div style={{ padding: "8px 0" }}>
          {loading && <div style={{ padding: 30, textAlign: "center", color: "rgba(26,26,46,0.45)" }}>Loading…</div>}
          {!loading && data?.entries.length === 0 && (
            <div style={{ padding: 30, textAlign: "center", color: "rgba(26,26,46,0.45)" }}>
              No entries yet. Be the first.
            </div>
          )}
          {!loading && data?.entries.map(e => (
            <div key={e.rank + e.wallet} style={{
              display: "flex", alignItems: "center", gap: 14,
              padding: "10px 22px",
              background: e.isMe ? "rgba(245,158,11,0.06)" : "transparent",
            }}>
              <div style={{
                width: 36, textAlign: "center",
                fontSize: 14, fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 800, color: e.rank <= 3 ? "#b45309" : "rgba(26,26,46,0.55)",
              }}>
                {e.rank === 1 ? "🥇" : e.rank === 2 ? "🥈" : e.rank === 3 ? "🥉" : `#${e.rank}`}
              </div>
              {e.pet?.avatar_url
                ? <img src={e.pet.avatar_url} alt={e.pet.name} style={{ width: 34, height: 34, borderRadius: 8, objectFit: "cover" }} />
                : <div style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(0,0,0,0.05)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🐾</div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{e.pet?.name || "—"}</div>
                <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: "rgba(26,26,46,0.45)" }}>
                  {e.wallet}{e.isMe ? " (you)" : ""}
                </div>
              </div>
              <div style={{
                fontSize: 16, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace",
                color: e.isMe ? "#b45309" : "#1a1a2e",
              }}>
                {e.value}{data?.meta.unit ? ` ${data.meta.unit}` : ""}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
