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
        background: "#211A12",
        color: "#FFF8EE", borderRadius: 18, padding: "20px 24px",
        border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
        display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap",
        cursor: "default",
        boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
      }}>
        {/* Pet identity */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
          {me.pet?.avatar_url
            ? <img src={me.pet.avatar_url} alt={me.pet.name} style={{ width: 52, height: 52, borderRadius: 14, objectFit: "cover", border: "1px solid rgba(255,248,238,0.18)" }} />
            : <img src="/mascot.jpg" alt="" style={{ width: 52, height: 52, borderRadius: 14, objectFit: "cover", opacity: 0.9, border: "1px solid rgba(255,248,238,0.18)" }} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontFamily: "var(--ed-m)", letterSpacing: "0.14em", color: "rgba(255,248,238,0.55)" }}>
              YOUR SEASON
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.01em", fontFamily: "var(--ed-disp)" }}>
              {me.pet?.name || "Your pet"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, fontFamily: "var(--ed-m)", fontSize: 11 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: "#BE4F28", display: "inline-block" }} />
              <span style={{ fontWeight: 700, color: "#BE4F28" }}>{st.tier.name}</span>
              <span style={{ color: "rgba(255,248,238,0.45)" }}>{st.next ? `· ${st.toNext.toLocaleString()} to ${st.next.name}` : "· max tier"}</span>
            </div>
          </div>
        </div>

        <style>{`@media (max-width:640px){.mycard-spacer{display:none !important}.mycard-tiles{display:grid !important;grid-template-columns:repeat(auto-fit,minmax(96px,1fr)) !important;width:100% !important}}`}</style>
        <div className="mycard-spacer" style={{ flex: 1 }} />

        {/* Stat tiles */}
        <div className="mycard-tiles" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Tile label="POINTS" value={me.points.toLocaleString()} accent="#BE4F28" />
          <Tile label="STREAK" value={`${me.streak}d`} accent="#BE4F28" sub={`best ${me.longest}d`} />
          {me.streakRank != null && (
            <Tile label="SEASON RANK" value={`#${me.streakRank}`} accent="#BE4F28" sub="by streak" />
          )}
          <Tile label="CREDITS" value={me.credits.toLocaleString()} accent="#BE4F28" />
          {me.shields > 0 && <Tile label="SHIELDS" value={<><Icon name="shield" size={18} style={{ marginRight: 4 }} />{me.shields}</>} accent="#BE4F28" />}
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, accent, sub }: { label: string; value: React.ReactNode; accent: string; sub?: string }) {
  return (
    <div style={{
      padding: "10px 16px", borderRadius: 12,
      background: "rgba(255,248,238,0.05)",
      border: "1px solid rgba(255,248,238,0.12)",
      minWidth: 88,
    }}>
      <div style={{ fontSize: 9, fontFamily: "var(--ed-m)", letterSpacing: "0.12em", color: "rgba(255,248,238,0.5)" }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent, fontFamily: "var(--ed-m)", lineHeight: 1.1, marginTop: 2 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: "rgba(255,248,238,0.4)", marginTop: 1 }}>{sub}</div>}
    </div>
  );
}
