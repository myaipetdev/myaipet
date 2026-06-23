"use client";

/**
 * Multi-dimensional leaderboard with 6 tabs. Replaces the legacy
 * season_points-only leaderboard.
 *
 * Tabs: 🔥 Streak · 💬 Chats · 🧠 Memories · 🎬 Creator · 💝 Bond · 🎂 Day-One
 */
import { useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/api";
import Icon from "@/components/Icon";

const METRICS = [
  { key: "streak",   label: "Streak King",     icon: "fire" },
  { key: "chats",    label: "Most Talked To",  icon: "chat" },
  { key: "memories", label: "Memory Master",   icon: "crystal-ball" },
  { key: "creator",  label: "Top Creator",     icon: "film-reel" },
  { key: "bond",     label: "Most Bonded",     icon: "heart" },
  { key: "oldest",   label: "Day-One",         icon: "crown" },
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

// Flat rank medal (gold / silver / bronze) — a printed-stock stamp: ink-keyline
// disc on the single amber accent, with neutral ink shades carrying the per-rank
// distinction the old 🥇🥈🥉 emoji held (no second hue).
const MEDAL_PALETTE: Record<number, { ribbon: string; disc: string; rim: string; face: string }> = {
  1: { ribbon: "#b45309", disc: "#f59e0b", rim: "#1a1a22", face: "#1a1a22" },
  2: { ribbon: "#1a1a22", disc: "#faf7f2", rim: "#1a1a22", face: "#1a1a22" },
  3: { ribbon: "#d97706", disc: "#cdb89a", rim: "#1a1a22", face: "#1a1a22" },
};
function MedalIcon({ place, size }: { place: number; size: number }) {
  const c = MEDAL_PALETTE[place] || MEDAL_PALETTE[3];
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M11 3l4.5 9h-5L8 5.5z" fill={c.ribbon} opacity={0.85} />
      <path d="M21 3l-4.5 9h5L24 5.5z" fill={c.ribbon} />
      <circle cx="16" cy="21" r="9" fill={c.disc} stroke={c.rim} strokeWidth="1.6" />
      <circle cx="16" cy="21" r="6" fill="none" stroke={c.rim} strokeWidth="1" opacity={0.45} />
      <text x="16" y="24.4" textAnchor="middle" fontSize="9" fontWeight="800"
        fontFamily="'JetBrains Mono', monospace" fill={c.face}>{place}</text>
    </svg>
  );
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
        background: "#fff", borderRadius: 18,
        border: "3px solid #1a1a22", boxShadow: "0 8px 0 rgba(26,26,34,0.14)",
        overflow: "hidden",
      }}>
        {/* Tabs */}
        <div style={{
          padding: "10px 12px",
          borderBottom: "2px solid rgba(26,26,34,0.1)",
          background: "#faf7f2",
          display: "flex", gap: 6, overflowX: "auto",
        }}>
          {METRICS.map(m => {
            const sel = m.key === metric;
            return (
              <button key={m.key} onClick={() => setMetric(m.key)} style={{
                padding: "8px 14px", borderRadius: 10,
                border: sel ? "2px solid #1a1a22" : "2px solid transparent",
                background: sel ? "#f59e0b" : "transparent",
                color: sel ? "#1a1a22" : "rgba(26,26,46,0.55)",
                fontWeight: sel ? 800 : 600, fontSize: 13,
                cursor: "pointer", whiteSpace: "nowrap",
                fontFamily: "'Space Grotesk', sans-serif",
                boxShadow: sel ? "0 3px 0 rgba(26,26,34,0.2)" : "none",
                display: "inline-flex", alignItems: "center", gap: 6,
              }}>
                <Icon name={m.icon} size={16} />
                {m.label}
              </button>
            );
          })}
        </div>

        {/* Description + my rank */}
        {data && (
          <div style={{
            padding: "12px 22px",
            display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
            borderBottom: "2px solid rgba(26,26,34,0.1)",
          }}>
            <div style={{ fontSize: 28 }}>{data.meta.emoji}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{data.meta.label}</div>
              <div style={{ fontSize: 12, color: "rgba(26,26,46,0.55)" }}>{data.meta.description}</div>
            </div>
            {data.myRank && (
              <div style={{
                padding: "8px 14px", borderRadius: 10,
                background: "#fbf6ec",
                border: "2px solid #1a1a22",
                boxShadow: "0 3px 0 rgba(26,26,34,0.14)",
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
            <div style={{ marginBottom: 10, opacity: 0.7 }}><Icon name="trophy" size={36} /></div>
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
            background: "#fbf6ec",
            borderBottom: "2px solid rgba(26,26,34,0.1)",
            display: "grid",
            gridTemplateColumns: "1fr 1.15fr 1fr",
            gap: 10, alignItems: "end",
          }}>
            {[top3[1], top3[0], top3[2]].filter(Boolean).map((e, i) => {
              const place = e.rank;
              const podiumH = place === 1 ? 130 : place === 2 ? 110 : 100;
              return (
                <div key={place} className="mp-lift" style={{
                  background: place === 1 ? "#f59e0b" : "#fff",
                  border: "2px solid #1a1a22",
                  borderRadius: 14,
                  padding: "14px 12px",
                  textAlign: "center",
                  minHeight: podiumH,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
                  gap: 8,
                  boxShadow: place === 1 ? "0 6px 0 rgba(26,26,34,0.16)" : "0 3px 0 rgba(26,26,34,0.12)",
                  cursor: "default",
                }}>
                  <div style={{ lineHeight: 1 }}><MedalIcon place={place} size={place === 1 ? 32 : 24} /></div>
                  {e.pet?.avatar_url
                    ? <img src={e.pet.avatar_url} alt={e.pet.name} style={{
                        width: place === 1 ? 56 : 44,
                        height: place === 1 ? 56 : 44,
                        borderRadius: 12, objectFit: "cover",
                        border: "2px solid #1a1a22",
                        boxShadow: "0 3px 0 rgba(26,26,34,0.16)",
                      }} />
                    : <img src="/mascot.jpg" alt={e.pet?.name || ""} style={{
                        width: place === 1 ? 56 : 44,
                        height: place === 1 ? 56 : 44,
                        borderRadius: 12, objectFit: "cover",
                        border: "2px solid #1a1a22",
                        boxShadow: "0 3px 0 rgba(26,26,34,0.16)",
                      }} />}
                  <div style={{
                    fontSize: place === 1 ? 15 : 13, fontWeight: 800,
                    color: "#1a1a2e", maxWidth: "100%",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{e.pet?.name || "—"}</div>
                  <div style={{
                    fontSize: place === 1 ? 17 : 14, fontWeight: 800,
                    fontFamily: "'JetBrains Mono', monospace",
                    color: "#1a1a22",
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
                ? <img src={e.pet.avatar_url} alt={e.pet.name} style={{ width: 34, height: 34, borderRadius: 8, objectFit: "cover", border: "2px solid #1a1a22" }} />
                : <img src="/mascot.jpg" alt={e.pet?.name || ""} style={{ width: 34, height: 34, borderRadius: 8, objectFit: "cover", border: "2px solid #1a1a22" }} />}
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
