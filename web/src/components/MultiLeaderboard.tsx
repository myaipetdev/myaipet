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

  const top3 = data?.entries.slice(0, 3) || [];
  const rest = data?.entries.slice(3) || [];

  return (
    <div className="mp-enter" style={{ maxWidth: 1060, margin: "20px auto", padding: "0 24px" }}>
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

        {/* Loading skeleton */}
        {loading && (
          <div style={{ padding: "20px 22px" }}>
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 14, padding: "10px 0",
                opacity: 1 - i * 0.12,
              }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(0,0,0,0.06)" }} />
                <div style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(0,0,0,0.06)" }} />
                <div style={{ flex: 1, height: 14, borderRadius: 4, background: "rgba(0,0,0,0.06)" }} />
                <div style={{ width: 60, height: 14, borderRadius: 4, background: "rgba(0,0,0,0.06)" }} />
              </div>
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && data?.entries.length === 0 && (
          <div style={{ padding: "40px 22px", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.7 }}>🏆</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>No entries yet</div>
            <div style={{ fontSize: 13, color: "rgba(26,26,46,0.55)" }}>
              Be the first — your name appears at the top of an empty board.
            </div>
          </div>
        )}

        {/* Top-3 Podium */}
        {!loading && top3.length > 0 && (
          <div style={{
            padding: "20px 22px 16px",
            background: "linear-gradient(180deg, rgba(245,158,11,0.04), transparent)",
            borderBottom: "1px solid rgba(0,0,0,0.05)",
            display: "grid",
            gridTemplateColumns: "1fr 1.15fr 1fr",
            gap: 10, alignItems: "end",
          }}>
            {[top3[1], top3[0], top3[2]].filter(Boolean).map((e, i) => {
              const place = e.rank;
              const medal = place === 1 ? "🥇" : place === 2 ? "🥈" : "🥉";
              const podiumH = place === 1 ? 130 : place === 2 ? 110 : 100;
              return (
                <div key={place} className="mp-lift" style={{
                  background: place === 1
                    ? "linear-gradient(180deg, rgba(245,158,11,0.10), rgba(245,158,11,0.04))"
                    : "rgba(0,0,0,0.025)",
                  border: place === 1
                    ? "1px solid rgba(245,158,11,0.30)"
                    : "1px solid rgba(0,0,0,0.05)",
                  borderRadius: 14,
                  padding: "14px 12px",
                  textAlign: "center",
                  minHeight: podiumH,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
                  gap: 8,
                  boxShadow: place === 1 ? "0 8px 24px rgba(245,158,11,0.18)" : "none",
                  cursor: "default",
                }}>
                  <div style={{ fontSize: place === 1 ? 32 : 24, lineHeight: 1 }}>{medal}</div>
                  {e.pet?.avatar_url
                    ? <img src={e.pet.avatar_url} alt={e.pet.name} style={{
                        width: place === 1 ? 56 : 44,
                        height: place === 1 ? 56 : 44,
                        borderRadius: 12, objectFit: "cover",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
                      }} />
                    : <img src="/mascot.jpg" alt={e.pet?.name || ""} style={{
                        width: place === 1 ? 56 : 44,
                        height: place === 1 ? 56 : 44,
                        borderRadius: 12, objectFit: "cover",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
                      }} />}
                  <div style={{
                    fontSize: place === 1 ? 15 : 13, fontWeight: 800,
                    color: "#1a1a2e", maxWidth: "100%",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{e.pet?.name || "—"}</div>
                  <div style={{
                    fontSize: place === 1 ? 17 : 14, fontWeight: 800,
                    fontFamily: "'JetBrains Mono', monospace",
                    color: place === 1 ? "#b45309" : "#1a1a2e",
                    lineHeight: 1,
                  }}>
                    {e.value}
                    <span style={{ fontSize: 10, color: "rgba(26,26,46,0.5)", marginLeft: 4 }}>
                      {data?.meta.unit}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Remaining rows */}
        <div style={{ padding: "6px 0" }}>
          {!loading && rest.map(e => (
            <div key={e.rank + e.wallet} className="mp-lift" style={{
              display: "flex", alignItems: "center", gap: 14,
              padding: "12px 22px",
              background: e.isMe ? "rgba(245,158,11,0.08)" : "transparent",
              borderLeft: e.isMe ? "3px solid #f59e0b" : "3px solid transparent",
            }}>
              <div style={{
                width: 36, textAlign: "center",
                fontSize: 14, fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 800, color: "rgba(26,26,46,0.55)",
              }}>
                #{e.rank}
              </div>
              {e.pet?.avatar_url
                ? <img src={e.pet.avatar_url} alt={e.pet.name} style={{ width: 34, height: 34, borderRadius: 8, objectFit: "cover" }} />
                : <img src="/mascot.jpg" alt={e.pet?.name || ""} style={{ width: 34, height: 34, borderRadius: 8, objectFit: "cover" }} />}
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
