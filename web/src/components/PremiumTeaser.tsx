"use client";

/**
 * Membership teaser — the relationship/creation tiers as a collectible set.
 *
 *   Companion  (cream paper)      — the whole relationship loop, free forever.
 *   Companion+ (foil-edged        — proactive memory / preservation / phone
 *              unreleased           presence. NOT BUILT YET → wax-sealed
 *              specimen)            "ON THE ROADMAP", stamped "Not for sale".
 *   Studio     (terracotta action) — pay-per-creation, live today → real CTA.
 *
 * Honesty invariants (do not remove):
 *  - Companion+ ships before it is sold; pricing is unannounced → stamp + footnote.
 *  - Season points are non-financial (no token, no cash value) → footnote ≥12px.
 */
import { useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/api";

interface SubResp {
  tier: "free" | "pro" | "studio";
  expires_at: string | null;
  benefits: Record<string, any>;
}

const INK = "#211A12";
const CREAM = "#FBF6EC";
const FOIL = "repeating-linear-gradient(110deg,#FBE6B0 0 5px,#F1C453 5px 10px,#FBE6B0 10px 15px)";

export default function PremiumTeaser() {
  const [sub, setSub] = useState<SubResp | null>(null);

  useEffect(() => {
    fetch("/api/subscription/me", { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => setSub(d))
      .catch(() => {});
  }, []);

  const onFree = !sub || sub.tier === "free";

  return (
    <div className="mp-enter mp-enter-5" style={{ maxWidth: 1060, margin: "20px auto", padding: "0 24px" }}>
      <div style={{
        background: CREAM,
        color: INK, borderRadius: 18, padding: "24px 26px",
        border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
        boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
      }}>
        <div style={{
          fontSize: 13, fontFamily: "var(--ed-m)",
          letterSpacing: "0.14em", color: "#9A4E1E", marginBottom: 8, fontWeight: 700,
        }}>MEMBERSHIP</div>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.015em", marginBottom: 4, fontFamily: "var(--ed-disp)" }}>
          Keep your companion — and make it real
        </div>
        <div style={{ fontSize: 13.5, color: "#5C5140", marginBottom: 18, fontFamily: "var(--ed-body)", lineHeight: 1.55 }}>
          Free forever. Pay only to deepen it — or create with it.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12, alignItems: "stretch" }}>
          {/* Companion — cream paper */}
          <Tier
            name="Companion"
            sub="Free forever"
            seal={onFree ? "CURRENT" : "INCLUDED"}
            sealVariant="current"
            features={[
              "Unlimited chat, evolving persona",
              "Full memory, recall on request",
              "Missions, streaks, season standing",
            ]}
            cta={onFree ? "You're on Companion" : "Included"}
            disabled
          />

          {/* Companion+ — foil-edged unreleased specimen */}
          <div style={{
            background: FOIL, padding: 3, borderRadius: 17,
            boxShadow: "0 7px 0 rgba(122,63,20,0.24)",
            display: "flex",
          }}>
            <Tier
              name="Companion+"
              seal={sub?.tier === "pro" ? "CURRENT" : "ON THE ROADMAP"}
              sealVariant={sub?.tier === "pro" ? "current" : "foil"}
              stamp="Not for sale · pricing not announced"
              features={[
                "Brings up old moments unprompted",
                "Preservation & inheritance of history",
                "Companion presence on your phone",
              ]}
              cta="Coming soon"
              disabled
              inFoil
            />
          </div>

          {/* Studio — terracotta action card */}
          <Tier
            name="Studio"
            sub="Credits · no subscription"
            seal={sub?.tier === "studio" ? "CURRENT" : "PAY PER CREATION"}
            sealVariant="paper"
            features={[
              "Creations lock your pet's face",
              "Open to every tier",
              "Yours to keep & share",
            ]}
            cta="Open Studio"
            href="/studio"
            dark
          />
        </div>

        <div style={{ marginTop: 16, fontSize: 12.5, color: "#7A6E5A", fontFamily: "var(--ed-m)", lineHeight: 1.55 }}>
          Companion+ ships before it&apos;s sold — benefits &amp; pricing published at launch.
          Season points stay non-financial recognition: no token, no cash value.
        </div>
      </div>
    </div>
  );
}

/** Wax-seal status chip — the card's rarity/status carrier (hard offset, no glow). */
function SealChip({ label, variant, onDark }: {
  label: string; variant: "current" | "foil" | "paper"; onDark?: boolean;
}) {
  const looks: Record<string, React.CSSProperties> = {
    current: { background: "#BE4F28", border: "2px solid #7A2F12", color: "#FFF8EE" },
    foil:    { background: FOIL, border: "2px solid #B45309", color: INK },
    paper:   { background: CREAM, border: `2px solid ${INK}`, color: INK },
  };
  return (
    <span style={{
      ...looks[variant],
      display: "inline-block", padding: "3px 10px", borderRadius: 999,
      transform: "rotate(-3deg)",
      boxShadow: onDark ? "2px 3px 0 rgba(0,0,0,0.35)" : "2px 3px 0 rgba(33,26,18,0.22)",
      fontSize: 12, fontWeight: 800, fontFamily: "var(--ed-m)",
      letterSpacing: "0.07em", textTransform: "uppercase", lineHeight: 1.3,
      whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

function Tier({
  name, sub, seal, sealVariant, stamp, features, cta, href, disabled, dark, inFoil,
}: {
  name: string; sub?: string; seal: string; sealVariant: "current" | "foil" | "paper";
  stamp?: string; features: string[]; cta: string; href?: string;
  disabled?: boolean; dark?: boolean; inFoil?: boolean;
}) {
  const bodyColor = dark ? "#FFF3E4" : "#5C5140";
  const btnStyle: React.CSSProperties = {
    width: "100%", padding: "10px", borderRadius: 10,
    border: href ? "none" : "1px solid var(--ed-hair, rgba(33,26,18,.13))",
    background: href ? "linear-gradient(180deg,#F49B2A,#E27D0C)" : "#F5EFE2",
    color: href ? INK : "#7A6E5A", fontWeight: 800, fontSize: 13,
    boxShadow: href ? "0 4px 0 rgba(60,25,8,0.45)" : "none",
    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.75 : 1,
    fontFamily: "var(--ed-disp)", textDecoration: "none",
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
  };
  return (
    <div className="mp-lift" style={{
      padding: 18, flex: 1, borderRadius: 14,
      background: dark ? "#B34722" : CREAM,
      border: dark ? "1.5px solid #7A2F12" : inFoil ? "none" : "1px solid var(--ed-hair, rgba(33,26,18,.13))",
      boxShadow: dark ? "0 7px 0 rgba(60,25,8,0.4)" : inFoil ? "none" : "0 7px 0 rgba(33,26,18,0.10)",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 17, fontWeight: 800, color: dark ? "#FFF8EE" : INK, fontFamily: "var(--ed-disp)" }}>{name}</span>
        <SealChip label={seal} variant={sealVariant} onDark={dark} />
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: dark ? "#F8CBA8" : "#9A7B4E", fontFamily: "var(--ed-m)", fontWeight: 700, letterSpacing: "0.04em", marginBottom: 12 }}>
          {sub}
        </div>
      )}
      {stamp && (
        <div style={{
          alignSelf: "flex-start", transform: "rotate(-2deg)",
          border: "1.5px solid #9A4E1E", color: "#9A4E1E", borderRadius: 6,
          padding: "3px 8px", marginBottom: 12,
          fontSize: 12, fontWeight: 700, fontFamily: "var(--ed-m)",
          letterSpacing: "0.05em", textTransform: "uppercase", lineHeight: 1.35,
        }}>{stamp}</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14, flex: 1 }}>
        {features.map((f, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 13, fontWeight: dark ? 600 : 400, color: bodyColor, fontFamily: "var(--ed-body)", lineHeight: 1.4 }}>
            <svg width={13} height={13} viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0, marginTop: 3 }}>
              <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke={dark ? "#F1C453" : "#BE4F28"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {f}
          </div>
        ))}
      </div>
      {href && !disabled ? (
        <a href={href} className="ed-wipe" style={btnStyle}>{cta} →</a>
      ) : (
        <button disabled={disabled} style={btnStyle}>{cta}</button>
      )}
    </div>
  );
}
