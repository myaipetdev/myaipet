"use client";

/**
 * "My Card" — personal dashboard header for the merged Airdrop page. Turns the
 * Airdrop tab into a my-page: at-a-glance points, streak, season rank, credits,
 * and the pet you're playing as. Signed-out users get a sign-in nudge.
 */
import { useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/api";
import { seasonTier } from "@/lib/season";
import Icon from "@/components/Icon";

interface Summary {
  points: number;
  credits: number;
  streak: number;
  longest: number;
  shields: number;
  streakRank: number | null;
  pet: { name: string; avatar_url: string | null; level: number } | null;
}

export default function MyCard() {
  const [me, setMe] = useState<Summary | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/me/summary", { headers: getAuthHeaders() })
      .then(r => { if (r.status === 401) { setAuthed(false); return null; } setAuthed(true); return r.ok ? r.json() : null; })
      .then(d => d && setMe(d))
      .catch(() => {});
  }, []);

  if (authed === false || !me) return null;

  const st = seasonTier(me.points);

  return (
    <div className="mp-enter" style={{ maxWidth: 1060, margin: "0 auto", padding: "0 24px" }}>
      <div className="mp-lift" style={{
        background: "#1f1b16",
        color: "white", borderRadius: 18, padding: "20px 24px",
        border: "3px solid #1a1a22",
        display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap",
        cursor: "default",
        boxShadow: "0 6px 0 rgba(26,26,34,0.16)",
      }}>
        {/* Pet identity */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
          {me.pet?.avatar_url
            ? <img src={me.pet.avatar_url} alt={me.pet.name} style={{ width: 52, height: 52, borderRadius: 14, objectFit: "cover", border: "2px solid #1a1a22", boxShadow: "0 3px 0 rgba(0,0,0,0.3)" }} />
            : <img src="/mascot.jpg" alt="" style={{ width: 52, height: 52, borderRadius: 14, objectFit: "cover", opacity: 0.9, border: "2px solid #1a1a22", boxShadow: "0 3px 0 rgba(0,0,0,0.3)" }} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.14em", color: "rgba(255,255,255,0.55)" }}>
              YOUR SEASON
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.01em" }}>
              {me.pet?.name || "Your pet"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: "#f59e0b", display: "inline-block" }} />
              <span style={{ fontWeight: 700, color: "#f59e0b" }}>{st.tier.name}</span>
              <span style={{ color: "rgba(255,255,255,0.45)" }}>{st.next ? `· ${st.toNext.toLocaleString()} to ${st.next.name}` : "· max tier"}</span>
            </div>
          </div>
        </div>

        <style>{`@media (max-width:640px){.mycard-spacer{display:none !important}.mycard-tiles{display:grid !important;grid-template-columns:repeat(auto-fit,minmax(96px,1fr)) !important;width:100% !important}}`}</style>
        <div className="mycard-spacer" style={{ flex: 1 }} />

        {/* Stat tiles */}
        <div className="mycard-tiles" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Tile label="POINTS" value={me.points.toLocaleString()} accent="#f59e0b" />
          <Tile label="STREAK" value={`${me.streak}d`} accent="#f59e0b" sub={`best ${me.longest}d`} />
          {me.streakRank != null && (
            <Tile label="SEASON RANK" value={`#${me.streakRank}`} accent="#f59e0b" sub="by streak" />
          )}
          <Tile label="CREDITS" value={me.credits.toLocaleString()} accent="#f59e0b" />
          {me.shields > 0 && <Tile label="SHIELDS" value={<><Icon name="shield" size={18} style={{ marginRight: 4 }} />{me.shields}</>} accent="#f59e0b" />}
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, accent, sub }: { label: string; value: React.ReactNode; accent: string; sub?: string }) {
  return (
    <div style={{
      padding: "10px 16px", borderRadius: 12,
      background: "rgba(255,255,255,0.05)",
      border: "2px solid #1a1a22",
      boxShadow: "0 3px 0 rgba(0,0,0,0.25)",
      minWidth: 88,
    }}>
      <div style={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.12em", color: "rgba(255,255,255,0.5)" }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.1, marginTop: 2 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>{sub}</div>}
    </div>
  );
}
