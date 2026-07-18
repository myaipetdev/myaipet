"use client";

/**
 * Membership teaser — the relationship/creation tiers.
 *
 * Repackaged per the WTP blueprint: the paywall protects what a user would
 * actually LOSE — the companion relationship (its memory/persona) and their
 * creations — NOT gamification scaffolding (shields/repairs are never sold here).
 *
 *   Companion (Free)  — the whole relationship-building loop, free forever.
 *   Companion+        — proactive memory + preservation/inheritance + phone
 *                       presence. NOT BUILT YET → honestly marked "Coming soon".
 *   Studio            — pay-per-creation of pet-anchored image/video (real COGS,
 *                       available to every tier); optional Creator Pass for volume.
 *
 * Honesty: Companion+ benefits are a roadmap and are labelled as such — we do
 * not advertise a memory/preservation feature as live before it ships. Studio
 * generation IS live today (credits), so its tier links into the real tool.
 */
import { useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/api";

interface SubResp {
  tier: "free" | "pro" | "studio";
  expires_at: string | null;
  benefits: Record<string, any>;
}

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
        background: "#FBF6EC",
        color: "#211A12", borderRadius: 18, padding: "24px 26px",
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
        <div style={{ fontSize: 13.5, color: "#5C5140", marginBottom: 18, maxWidth: 560, fontFamily: "var(--ed-body)", lineHeight: 1.55 }}>
          The relationship is free forever. Pay only to <strong>deepen it</strong> — a pet that
          remembers you unprompted and is preserved for good — or to <strong>create with it</strong>.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
          <Tier
            name="Companion"
            price="Free"
            priceNote="forever"
            current={onFree}
            features={[
              "Unlimited chat & persona evolution",
              "Your pet remembers everything — recall when you ask",
              "Studio access — creations are priced in credits",
              "Daily missions, streak & season standing",
            ]}
            cta={onFree ? "You're on Companion" : "Included"}
            disabled
          />
          <Tier
            name="Companion+"
            price="Not for sale"
            priceNote="roadmap · pricing not announced"
            current={sub?.tier === "pro"}
            highlight
            promise="Your pet, everywhere — remembering everything, never leaving."
            features={[
              "Proactive memory — your pet brings up old moments on its own",
              "Preservation & inheritance — never lose your pet's history",
              "A companion presence on your phone",
              "Benefits and limits will be published before launch",
            ]}
            cta="Coming soon"
            disabled
            soon
          />
          <Tier
            name="Studio"
            price="Pay per creation"
            priceNote="credits · passes are not on sale"
            current={sub?.tier === "studio"}
            features={[
              "Image & video that lock in your pet's face",
              "Available on every tier — no subscription needed",
              "Roadmap: volume limits, 4K and priority processing",
              "Every creation is yours to keep & share",
            ]}
            cta="Open Studio"
            href="/studio"
          />
        </div>

        <div style={{ marginTop: 16, fontSize: 13, color: "#9A7B4E", fontFamily: "var(--ed-m)", lineHeight: 1.5 }}>
          Companion+ is on the roadmap — memory, preservation &amp; phone presence ship before it&apos;s sold.
          Season points remain non-financial recognition: no token, no cash value.
        </div>
      </div>
    </div>
  );
}

function Tier({
  name, price, priceNote, promise, features, cta, href, current, disabled, highlight, soon, footNote,
}: {
  name: string; price: string; priceNote?: string; promise?: string;
  features: string[]; cta: string; href?: string;
  current?: boolean; disabled?: boolean; highlight?: boolean; soon?: boolean; footNote?: string;
}) {
  const btnStyle: React.CSSProperties = {
    width: "100%", padding: "10px", borderRadius: 10,
    border: highlight ? "none" : "1px solid var(--ed-hair, rgba(33,26,18,.13))",
    background: href ? "linear-gradient(180deg,#F49B2A,#E27D0C)" : highlight ? "#F5EFE2" : "#F5EFE2",
    color: href ? "#FFF8EE" : "#7A6E5A", fontWeight: 800, fontSize: 13,
    cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.75 : 1,
    fontFamily: "var(--ed-disp)", textDecoration: "none",
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
  };
  return (
    <div className="mp-lift" style={{
      padding: 18, borderRadius: 14,
      background: highlight ? "#F5EFE2" : "#FBF6EC",
      border: highlight ? "1.5px solid #BE4F28" : "1px solid var(--ed-hair, rgba(33,26,18,.13))",
      boxShadow: highlight ? "0 18px 40px -30px rgba(120,60,20,.6)" : "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: "#211A12", fontFamily: "var(--ed-disp)" }}>{name}</span>
        {current && (
          <span style={{
            padding: "2px 7px", borderRadius: 999,
            background: "#BE4F28", color: "#FFF8EE", border: "none",
            fontSize: 13, fontWeight: 800, fontFamily: "var(--ed-m)", letterSpacing: "0.06em",
          }}>CURRENT</span>
        )}
        {soon && !current && (
          <span style={{
            padding: "2px 7px", borderRadius: 999,
            background: "rgba(190,79,40,0.12)", color: "#9A4E1E", border: "1px solid rgba(190,79,40,0.2)",
            fontSize: 13, fontWeight: 800, fontFamily: "var(--ed-m)", letterSpacing: "0.06em",
          }}>SOON</span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: promise ? 8 : 12 }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: "#211A12", fontFamily: "var(--ed-m)" }}>{price}</span>
        {priceNote && <span style={{ fontSize: 13, color: "#9A7B4E", fontFamily: "var(--ed-m)" }}>{priceNote}</span>}
      </div>
      {promise && (
        <div style={{ fontSize: 13, color: "#9A4E1E", fontFamily: "var(--ed-body)", fontStyle: "italic", lineHeight: 1.45, marginBottom: 12 }}>
          {promise}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14, flex: 1 }}>
        {features.map((f, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 13, color: "#5C5140", fontFamily: "var(--ed-body)", lineHeight: 1.4 }}>
            <svg width={13} height={13} viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0, marginTop: 3 }}>
              <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="#BE4F28" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {f}
          </div>
        ))}
      </div>
      {href && !disabled ? (
        <a href={href} className="ed-wipe" style={btnStyle}>{cta} →</a>
      ) : (
        <button disabled={disabled} style={{ ...btnStyle, cursor: disabled ? "not-allowed" : "pointer" }}>{cta}</button>
      )}
      {footNote && (
        <div style={{ marginTop: 8, fontSize: 13, color: "#9A7B4E", fontFamily: "var(--ed-m)", textAlign: "center" }}>{footNote}</div>
      )}
    </div>
  );
}
