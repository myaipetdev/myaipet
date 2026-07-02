"use client";

/**
 * Pet of the Week — the auto-curated hero at the top of Community.
 * Makes the tab about *characters*, not just images: one pet's owner is
 * celebrated each week for the devotion the metrics reveal.
 */
import { useEffect, useState } from "react";
import Icon from "@/components/Icon";

interface PotW {
  id: number;
  name: string;
  avatarUrl: string | null;
  level: number;
  bondLevel: number;
  personality: string;
  ownerWallet: string;
  heroImage: string | null;
  heroIsVideo: boolean;
  heroPrompt: string | null;
  reasons: string[];
}

export default function PetOfTheWeek() {
  const [pet, setPet] = useState<PotW | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/community/pet-of-week")
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled) { setPet(d?.pet || null); setLoaded(true); } })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  if (!loaded || !pet) return null;

  return (
    <div className="mp-enter" style={{ maxWidth: 1060, margin: "0 auto 18px", padding: "0 24px" }}>
      <style>{`@media (max-width:640px){.potw-grid{grid-template-columns:1fr !important}.potw-hero{min-height:170px !important}}`}</style>
      <div className="potw-grid" style={{
        position: "relative", overflow: "hidden", borderRadius: 22,
        background: "#211A12",
        border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
        boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
        display: "grid", gridTemplateColumns: "1.2fr 1fr",
      }}>

        {/* Left: the pet */}
        <div style={{ padding: "26px 28px", position: "relative", zIndex: 1 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            fontSize: 12, fontFamily: "var(--ed-m)",
            letterSpacing: "0.14em", color: "#F49B2A", fontWeight: 800, textTransform: "uppercase",
            padding: "5px 11px", borderRadius: 999,
            background: "rgba(190,79,40,0.16)", border: "1px solid rgba(190,79,40,0.4)",
          }}>
            <Icon name="medal" size={14} /> PET OF THE WEEK
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 18 }}>
            {pet.avatarUrl
              ? <img src={pet.avatarUrl} alt={pet.name} style={{
                  width: 76, height: 76, borderRadius: 18, objectFit: "cover",
                  border: "1px solid rgba(190,79,40,0.45)",
                  boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
                }} />
              : <img src="/mascot.jpg" alt={pet.name} style={{
                  width: 76, height: 76, borderRadius: 18, objectFit: "cover",
                  border: "1px solid rgba(190,79,40,0.45)",
                  boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
                }} />}
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontFamily: "var(--ed-disp)", fontWeight: 800, fontSize: 26,
                color: "#FFF8EE", letterSpacing: "-0.02em", lineHeight: 1.1,
              }}>
                {pet.name}
              </div>
              <div style={{
                fontSize: 12, color: "rgba(255,248,238,0.6)", marginTop: 4,
                fontFamily: "var(--ed-m)",
              }}>
                {pet.personality} · raised by {pet.ownerWallet}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 18 }}>
            {pet.reasons.map((r, i) => (
              <span key={i} style={{
                fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 999,
                background: "rgba(255,248,238,0.07)", color: "rgba(255,248,238,0.85)",
                border: "1px solid rgba(255,248,238,0.12)",
                fontFamily: "var(--ed-disp)",
              }}>
                {r}
              </span>
            ))}
          </div>
        </div>

        {/* Right: their best recent creation (falls back to the pet's portrait,
            then a glyph — never a bare empty pane). */}
        <div className="potw-hero" style={{ position: "relative", minHeight: 200 }}>
          {pet.heroImage ? (
            pet.heroIsVideo ? (
              <video
                src={pet.heroImage} autoPlay loop muted playsInline
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <img
                src={pet.heroImage} alt={`${pet.name}'s creation`}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
              />
            )
          ) : pet.avatarUrl ? (
            <img
              src={pet.avatarUrl} alt={pet.name}
              style={{
                position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover",
                filter: "blur(7px) saturate(1.15)", transform: "scale(1.12)",
              }}
            />
          ) : (
            <div style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(255,248,238,0.04)", fontSize: 46, opacity: 0.5,
            }}><Icon name="film-reel" size={46} /></div>
          )}
          {/* left-edge fade so the image melts into the card */}
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(90deg, #211A12 0%, transparent 38%)",
            pointerEvents: "none",
          }} />
        </div>
      </div>
    </div>
  );
}
