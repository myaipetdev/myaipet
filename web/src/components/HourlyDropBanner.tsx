"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import Reveal from "@/components/Reveal";

interface UpcomingDrop {
  kind: string;
  emoji: string;
  label: string;
  applies_to: string;
  multiplier_x: number;
  starts_at: string;
  starts_in_seconds: number;
  is_live: boolean;
}

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
  upcoming?: UpcomingDrop[];
}

function clockLabel(iso: string) {
  const d = new Date(iso);
  let h = d.getHours();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}${ampm}`;
}

export default function HourlyDropBanner() {
  const [drop, setDrop] = useState<ActiveDrop | null>(null);

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
    return () => { cancelled = true; clearInterval(refresh); };
  }, []);

  if (!drop) return null;

  // Calm spotlight — no countdown; liveness comes from the minutely fetch.
  const live = drop.ends_in_seconds > 0;

  return (
    <Reveal dir="left" style={{ maxWidth: 1060, margin: "12px auto 0", padding: "0 24px" }}>
      <div style={{
        background: live ? "#BE4F28" : "#FBF6EC",
        border: `1px solid var(--ed-hair, rgba(33,26,18,.13))`,
        borderRadius: 14, padding: "14px 20px",
        display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
        boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
      }}>
        <div
          style={{
            fontSize: 32,
            width: 44, height: 44,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: live ? "#FFF8EE" : "#F5EFE2",
            border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
            borderRadius: 999,
          }}
        >{live ? drop.emoji : <Icon name="crystal-ball" size={32} />}</div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{
            fontSize: 13, fontFamily: "var(--ed-m)",
            letterSpacing: "0.14em", color: live ? "#FFF8EE" : "#9A4E1E",
            fontWeight: 800,
          }}>
            {live ? `THIS HOUR · ${drop.applies_to.toUpperCase()} IS FEATURED` : "NEXT SPOTLIGHT"}
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "var(--ed-disp)", color: live ? "#FFF8EE" : "#211A12", marginTop: 2 }}>
            {live ? drop.label : `${drop.next_emoji} ${drop.next_label}`}
          </div>
          <div style={{ fontSize: 13.5, fontFamily: "var(--ed-body)", color: live ? "#FFF8EE" : "#5C5140", marginTop: 2 }}>
            {live ? drop.description : "starts at the top of next hour"}
          </div>
        </div>
      </div>

      {/* Upcoming spotlights runway — a fresh featured category every hour, so
          checking in more often = a reason to come back. */}
      {drop.upcoming && drop.upcoming.length > 1 && (
        <div style={{
          marginTop: 8, padding: "12px 16px",
          background: "#FBF6EC", borderRadius: 14,
          border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
          boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          {/* Header line — title + the "why check back" nudge, on their own
              row so neither steals width from the chips. */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 12, flexWrap: "wrap",
          }}>
            <div style={{
              fontSize: 13, fontFamily: "var(--ed-m)",
              letterSpacing: "0.12em", color: "#9A4E1E", fontWeight: 800,
              whiteSpace: "nowrap",
              display: "inline-flex", alignItems: "center", gap: 5,
            }}>
              <Icon name="electric" size={14} /> TODAY'S SPOTLIGHTS
            </div>
            <div style={{ fontSize: 13.5, fontFamily: "var(--ed-body)", color: "#5C5140", fontWeight: 600 }}>
              A new category is featured every hour — check back to see what's next.
            </div>
          </div>
          {/* Chips wrap so every drop stays fully visible (no edge clipping). */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {drop.upcoming.slice(0, 6).map((u, i, arr) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "6px 11px", borderRadius: 999,
                background: u.is_live ? "#BE4F28" : "#F5EFE2",
                border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
              }}>
                <span style={{ fontSize: 15 }}>{u.emoji}</span>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--ed-disp)", color: u.is_live ? "#FFF8EE" : "#211A12" }}>
                  {u.label}
                </span>
                <span style={{
                  fontSize: 13, fontFamily: "var(--ed-m)",
                  color: u.is_live ? "#FFF8EE" : "#9A7B4E", fontWeight: 700,
                }}>
                  {u.is_live
                    ? "LIVE"
                    : u.starts_in_seconds <= 0
                      ? "ended"
                      : i === arr.findIndex((x) => x.starts_in_seconds > 0)
                        ? "next"
                        : clockLabel(u.starts_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Reveal>
  );
}
