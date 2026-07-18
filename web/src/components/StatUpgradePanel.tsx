"use client";

/**
 * Payment-gated stat upgrade panel.
 *
 * This surface fails closed: it is not rendered unless the public runtime
 * config says payments are explicitly enabled. When enabled, each row shows
 * current value + ceiling and opens the receipt-backed paywall flow.
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
  atk: { label: "ATK", icon: "sword", color: "#BE4F28" },
  def: { label: "DEF", icon: "shield", color: "#3E8FE0" },
  spd: { label: "SPD", icon: "rocket", color: "#5C8A4E" },
};

export default function StatUpgradePanel({ petId, onStatsChanged }: { petId: number; onStatsChanged?: (stats: Stats) => void }) {
  const [data, setData] = useState<PanelData | null>(null);
  const [paymentsAvailable, setPaymentsAvailable] = useState(false);
  const [busy, setBusy] = useState<keyof Stats | null>(null);
  const [paywall, setPaywall] = useState<any>(null);
  const [celebrate, setCelebrate] = useState<{ stat: keyof Stats; from: number; to: number; combinedPower: number } | null>(null);

  const load = async () => {
    try {
      const configRes = await fetch("/api/config", { cache: "no-store" });
      const config = configRes.ok ? await configRes.json() : null;
      if (config?.payments_enabled !== true) {
        setPaymentsAvailable(false);
        setData(null);
        return;
      }
      setPaymentsAvailable(true);
      const res = await fetch(`/api/pets/${petId}/stats/upgrade`, { headers: getAuthHeaders() });
      if (res.ok) setData(await res.json());
    } catch {
      setPaymentsAvailable(false);
      setData(null);
    }
  };

  useEffect(() => {
    let alive = true;
    setData(null); // clear immediately so a pet switch never shows the previous pet's stats
    setPaymentsAvailable(false);
    (async () => {
      try {
        const configRes = await fetch("/api/config", { cache: "no-store" });
        const config = configRes.ok ? await configRes.json() : null;
        if (!alive || config?.payments_enabled !== true) return;
        setPaymentsAvailable(true);
        const res = await fetch(`/api/pets/${petId}/stats/upgrade`, { headers: getAuthHeaders() });
        if (alive && res.ok) setData(await res.json());
      } catch {}
    })();
    return () => { alive = false; };
  }, [petId]);

  const upgrade = async (stat: keyof Stats, txHash?: string) => {
    if (busy && !txHash) return;
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
            await upgrade(stat, newTx);
          },
        });
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const message = err.error || "Upgrade failed";
        if (txHash) throw new Error(message);
        toast(message, "error");
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

  if (!paymentsAvailable || !data) return null;

  return (
    <div className="stat-upgrade-panel" style={{
      padding: 20, borderRadius: 16, marginTop: 16,
      background: "linear-gradient(135deg, rgba(190,79,40,0.06), rgba(154,78,30,0.04))",
      border: "1px solid rgba(190,79,40,0.18)",
    }}>
      {/* Header — combined power = ranking input */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 20, display: "inline-flex" }}><Icon name="boxing" size={20} /></span>
        <h3 style={{ fontSize: 14, fontWeight: 800, margin: 0, letterSpacing: "-0.01em" }}>
          Power Training
        </h3>
        <span style={{
          fontSize: 13, padding: "3px 9px", borderRadius: 999,
          background: "rgba(190,79,40,0.10)", color: "#9A4E1E",
          fontFamily: "var(--ed-m, ui-monospace, monospace)", fontWeight: 700, letterSpacing: "0.08em",
        }}>USDT</span>
        <div style={{ flex: 1 }} />
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13, color: "rgba(33,26,18,0.5)", letterSpacing: "0.08em" }}>POWER</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#9A4E1E" }}>{data.combinedPower}</div>
        </div>
      </div>
      <p style={{ fontSize: 13, color: "rgba(33,26,18,0.6)", margin: "0 0 14px", lineHeight: 1.6 }}>
        Each +{data.increment} raises this pet&apos;s combined battle power. A verified payment receipt is required for every upgrade.
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
              padding: "10px 14px", borderRadius: 10, background: "#FBF6EC",
              border: "1px solid rgba(33,26,18,0.13)",
            }}>
              <span style={{ fontSize: 18, display: "inline-flex" }}><Icon name={meta.icon} size={18} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: meta.color }}>{meta.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#211A12" }}>{value}</span>
                  <span style={{ fontSize: 13, color: "rgba(33,26,18,0.4)", fontFamily: "var(--ed-m, ui-monospace, monospace)" }}>
                    / {data.ceiling}
                  </span>
                </div>
                {/* Progress bar */}
                <div style={{
                  marginTop: 4, height: 4, borderRadius: 999,
                  background: "#F5EFE2", overflow: "hidden",
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
                    ? "rgba(33,26,18,0.06)"
                    : `linear-gradient(135deg, ${meta.color}, ${meta.color}dd)`,
                  color: atCap ? "rgba(33,26,18,0.4)" : "#FFF8EE",
                  fontWeight: 700, fontSize: 13, cursor: atCap ? "default" : "pointer",
                  fontFamily: "var(--ed-disp, sans-serif)",
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
            background: "linear-gradient(180deg,#F49B2A,#E27D0C)",
            color: "#FFF8EE", padding: "22px 32px", borderRadius: 20,
            boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
            fontFamily: "var(--ed-disp, sans-serif)", textAlign: "center",
            animation: "celebPop 0.4s ease, celebFade 2.8s ease forwards",
          }}>
            <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-0.02em", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <Icon name={STAT_META[celebrate.stat].icon} size={38} />
              <span>{celebrate.stat.toUpperCase()} {celebrate.from} → {celebrate.to}</span>
            </div>
            <div style={{ fontSize: 13, fontFamily: "var(--ed-m, ui-monospace, monospace)", marginTop: 6, opacity: 0.9, letterSpacing: "0.08em" }}>
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
