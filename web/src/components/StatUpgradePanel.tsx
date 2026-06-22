"use client";

/**
 * Pay-to-power stat upgrade panel.
 *
 * Three rows (ATK / DEF / SPD), each showing current value + ceiling + a
 * "+5 (1 USDT)" button. Click → POST to /api/pets/[petId]/stats/upgrade →
 * 402 opens PaywallModal → after pay, auto-retries with ?tx_hash=…
 *
 * Combined power displayed at top — directly feeds the Leaderboard ranking.
 * The buttons drive the BM grid's "Compete" column (Stat Upgrade USDT).
 */

import { useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/api";
import PaywallModal from "@/components/PaywallModal";
import { toast } from "@/components/Toast";
import Icon from "@/components/Icon";

interface Stats { atk: number; def: number; spd: number; }
interface PanelData {
  petId: number;
  name: string;
  stats: Stats;
  combinedPower: number;
  ceiling: number;
  increment: number;
  pricePerUpgradeUsd: number;
}

const STAT_META: Record<keyof Stats, { label: string; icon: string; color: string }> = {
  atk: { label: "ATK", icon: "sword", color: "#dc2626" },
  def: { label: "DEF", icon: "shield", color: "#2563eb" },
  spd: { label: "SPD", icon: "rocket", color: "#16a34a" },
};

export default function StatUpgradePanel({ petId, onStatsChanged }: { petId: number; onStatsChanged?: (stats: Stats) => void }) {
  const [data, setData] = useState<PanelData | null>(null);
  const [busy, setBusy] = useState<keyof Stats | null>(null);
  const [paywall, setPaywall] = useState<any>(null);
  const [celebrate, setCelebrate] = useState<{ stat: keyof Stats; from: number; to: number; combinedPower: number } | null>(null);

  const load = async () => {
    try {
      const res = await fetch(`/api/pets/${petId}/stats/upgrade`, { headers: getAuthHeaders() });
      if (res.ok) setData(await res.json());
    } catch {}
  };

  useEffect(() => {
    let alive = true;
    setData(null); // clear immediately so a pet switch never shows the previous pet's stats
    (async () => {
      try {
        const res = await fetch(`/api/pets/${petId}/stats/upgrade`, { headers: getAuthHeaders() });
        if (alive && res.ok) setData(await res.json());
      } catch {}
    })();
    return () => { alive = false; };
  }, [petId]);

  const upgrade = async (stat: keyof Stats, txHash?: string) => {
    if (busy) return;
    setBusy(stat);
    try {
      const qs = new URLSearchParams({ stat });
      if (txHash) qs.set("tx_hash", txHash);
      const res = await fetch(`/api/pets/${petId}/stats/upgrade?${qs}`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      if (res.status === 402) {
        const { paywall: pw } = await res.json();
        setPaywall({
          ...pw,
          onPaid: async (newTx: string) => {
            setPaywall(null);
            await upgrade(stat, newTx);
          },
        });
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast(err.error || "Upgrade failed", "error");
        return;
      }
      const j = await res.json();
      // Celebrate the bump so the user *feels* the spend land
      setCelebrate({ stat, from: j.from, to: j.to, combinedPower: j.combinedPower });
      setTimeout(() => setCelebrate(null), 2800);
      await load();
      onStatsChanged?.(j.pet);
    } finally {
      setBusy(null);
    }
  };

  if (!data) return null;

  return (
    <div className="stat-upgrade-panel" style={{
      padding: 20, borderRadius: 16, marginTop: 16,
      background: "linear-gradient(135deg, rgba(245,158,11,0.04), rgba(220,38,38,0.04))",
      border: "1px solid rgba(245,158,11,0.18)",
    }}>
      {/* Header — combined power = ranking input */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 20, display: "inline-flex" }}><Icon name="boxing" size={20} /></span>
        <h3 style={{ fontSize: 14, fontWeight: 800, margin: 0, letterSpacing: "-0.01em" }}>
          Power Training
        </h3>
        <span style={{
          fontSize: 9, padding: "3px 9px", borderRadius: 999,
          background: "rgba(245,158,11,0.12)", color: "#b45309",
          fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, letterSpacing: "0.08em",
        }}>USDT</span>
        <div style={{ flex: 1 }} />
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 9, color: "rgba(26,26,46,0.5)", letterSpacing: "0.08em" }}>POWER</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#b45309" }}>{data.combinedPower}</div>
        </div>
      </div>
      <p style={{ fontSize: 11, color: "rgba(26,26,46,0.6)", margin: "0 0 14px", lineHeight: 1.6 }}>
        Each +{data.increment} pushes you up the leaderboard. 50% of every USDT spent is burned.
      </p>

      {/* Three stat rows */}
      <div style={{ display: "grid", gap: 8 }}>
        {(Object.keys(STAT_META) as Array<keyof Stats>).map(stat => {
          const meta = STAT_META[stat];
          const value = data.stats[stat];
          const atCap = value >= data.ceiling;
          const isBusy = busy === stat;
          return (
            <div key={stat} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "10px 14px", borderRadius: 10, background: "white",
              border: "1px solid rgba(0,0,0,0.05)",
            }}>
              <span style={{ fontSize: 18, display: "inline-flex" }}><Icon name={meta.icon} size={18} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: meta.color }}>{meta.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e" }}>{value}</span>
                  <span style={{ fontSize: 10, color: "rgba(26,26,46,0.4)", fontFamily: "mono" }}>
                    / {data.ceiling}
                  </span>
                </div>
                {/* Progress bar */}
                <div style={{
                  marginTop: 4, height: 4, borderRadius: 999,
                  background: "rgba(0,0,0,0.06)", overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%", width: `${(value / data.ceiling) * 100}%`,
                    background: meta.color, transition: "width 240ms ease",
                  }} />
                </div>
              </div>
              <button
                onClick={() => upgrade(stat)}
                disabled={atCap || isBusy}
                style={{
                  padding: "8px 14px", borderRadius: 8, border: "none",
                  background: atCap
                    ? "rgba(0,0,0,0.06)"
                    : `linear-gradient(135deg, ${meta.color}, ${meta.color}dd)`,
                  color: atCap ? "rgba(26,26,46,0.4)" : "white",
                  fontWeight: 700, fontSize: 11, cursor: atCap ? "default" : "pointer",
                  fontFamily: "'Space Grotesk', sans-serif",
                  whiteSpace: "nowrap",
                  opacity: isBusy ? 0.5 : 1,
                }}
              >
                {atCap ? "MAX" : isBusy ? "…" : `+${data.increment}  ${data.pricePerUpgradeUsd} USDT`}
              </button>
            </div>
          );
        })}
      </div>

      <PaywallModal info={paywall} onClose={() => setPaywall(null)} />

      {/* Celebration overlay — appears for ~2.8s after a successful upgrade */}
      {celebrate && (
        <div style={{
          position: "fixed", inset: 0, pointerEvents: "none", zIndex: 8888,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "linear-gradient(135deg,#fbbf24,#f59e0b)",
            color: "white", padding: "22px 32px", borderRadius: 20,
            boxShadow: "0 24px 60px rgba(245,158,11,0.45)",
            fontFamily: "'Space Grotesk',sans-serif", textAlign: "center",
            animation: "celebPop 0.4s ease, celebFade 2.8s ease forwards",
          }}>
            <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-0.02em", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <Icon name={STAT_META[celebrate.stat].icon} size={38} />
              <span>{celebrate.stat.toUpperCase()} {celebrate.from} → {celebrate.to}</span>
            </div>
            <div style={{ fontSize: 13, fontFamily: "'JetBrains Mono', monospace", marginTop: 6, opacity: 0.9, letterSpacing: "0.08em" }}>
              POWER {celebrate.combinedPower} · CLIMBING
            </div>
          </div>
          <style>{`
            @keyframes celebPop {
              0% { transform: scale(0.6); opacity: 0; }
              60% { transform: scale(1.05); }
              100% { transform: scale(1); opacity: 1; }
            }
            @keyframes celebFade {
              0%, 70% { opacity: 1; }
              100% { opacity: 0; transform: translateY(-30px); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
