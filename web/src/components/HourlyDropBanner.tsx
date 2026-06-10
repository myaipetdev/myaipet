"use client";

import { useEffect, useState } from "react";

interface ActiveDrop {
  kind: string;
  emoji: string;
  label: string;
  applies_to: string;
  multiplier_x: number;
  description: string;
  ends_in_seconds: number;
  next_emoji: string;
  next_label: string;
  next_starts_at: string;
}

function fmt(sec: number) {
  if (sec <= 0) return "ends soon";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function HourlyDropBanner() {
  const [drop, setDrop] = useState<ActiveDrop | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let cancelled = false;
    const fetchDrop = async () => {
      try {
        const r = await fetch("/api/drops/current");
        if (!r.ok) return;
        const d = await r.json();
        if (!cancelled) setDrop(d);
      } catch { /* ignore */ }
    };
    fetchDrop();
    const refresh = setInterval(fetchDrop, 60_000); // refresh every minute
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { cancelled = true; clearInterval(refresh); clearInterval(tick); };
  }, []);

  if (!drop) return null;

  // Recompute remaining on the client tick so the countdown is smooth
  const fetched = drop;
  const remaining = Math.max(0, fetched.ends_in_seconds - Math.floor((Date.now() - now + (Date.now() - now)) / 1000));
  const live = remaining > 0;

  return (
    <div className="mp-enter" style={{ maxWidth: 1060, margin: "12px auto 0", padding: "0 24px" }}>
      <div style={{
        background: live
          ? "linear-gradient(135deg, rgba(168,85,247,0.12), rgba(139,92,246,0.06))"
          : "rgba(0,0,0,0.03)",
        border: `1px solid ${live ? "rgba(168,85,247,0.30)" : "rgba(0,0,0,0.06)"}`,
        borderRadius: 14, padding: "14px 20px",
        display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
        boxShadow: live ? "0 6px 24px rgba(168,85,247,0.10)" : "none",
        transition: "all 240ms cubic-bezier(0.2,0.8,0.2,1)",
      }}>
        <div
          className={live ? "mp-live-pulse" : ""}
          style={{
            fontSize: 32,
            width: 44, height: 44,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: live ? "rgba(168,85,247,0.16)" : "rgba(0,0,0,0.03)",
            borderRadius: 999,
          }}
        >{live ? drop.emoji : "⏳"}</div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{
            fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: "0.14em", color: live ? "#7e22ce" : "rgba(26,26,46,0.55)",
            fontWeight: 800,
          }}>
            {live ? `HOURLY DROP · ${drop.multiplier_x}× ${drop.applies_to.toUpperCase()}` : "NEXT DROP"}
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#1a1a2e", marginTop: 2 }}>
            {live ? drop.label : `${drop.next_emoji} ${drop.next_label}`}
          </div>
          <div style={{ fontSize: 12, color: "rgba(26,26,46,0.65)", marginTop: 2 }}>
            {live ? drop.description : "starts at the top of next hour"}
          </div>
        </div>
        <div style={{
          padding: "8px 14px", borderRadius: 10,
          background: live ? "rgba(168,85,247,0.16)" : "white",
          border: `1px solid ${live ? "rgba(168,85,247,0.30)" : "rgba(0,0,0,0.08)"}`,
          color: live ? "#7e22ce" : "rgba(26,26,46,0.55)",
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 800, fontSize: 14,
        }}>
          {live ? fmt(remaining) : "soon"}
        </div>
      </div>
    </div>
  );
}
