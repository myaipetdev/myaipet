"use client";

/**
 * Premium teaser card — Pro ($4.99/mo) / Studio ($9.99/mo). Shows pricing +
 * benefit comparison + "Coming soon" CTA. Billing wiring lands in the next
 * release (POST /api/subscription/me currently returns 202 coming_soon).
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

  return (
    <div className="mp-enter mp-enter-5" style={{ maxWidth: 1060, margin: "20px auto", padding: "0 24px" }}>
      <div style={{
        background: "#FBF6EC",
        color: "#211A12", borderRadius: 18, padding: "24px 26px",
        border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
        boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
      }}>
        <div style={{
          fontSize: 12, fontFamily: "var(--ed-m)",
          letterSpacing: "0.14em", color: "#9A4E1E", marginBottom: 8, fontWeight: 700,
        }}>UNLIMITED · COMING SOON</div>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.015em", marginBottom: 4, fontFamily: "var(--ed-disp)" }}>
          Pet Companion Premium
        </div>
        <div style={{ fontSize: 13, color: "#5C5140", marginBottom: 18, maxWidth: 540, fontFamily: "var(--ed-body)" }}>
          Free covers daily missions and 1 shield/month. Pro & Studio remove the limits —
          unlimited shields, free repairs, priority Studio queue, monthly credit drops.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <Tier
            name="Free"
            price="$0"
            current={sub?.tier === "free"}
            features={["1 shield/month", "Studio 3 videos/mo", "No priority queue"]}
            cta="Current plan"
            disabled
          />
          <Tier
            name="Pro"
            price="$4.99/mo"
            current={sub?.tier === "pro"}
            features={["8 shields/month", "Studio 30 vid · 300 img", "Priority queue", "100 credits/mo drop"]}
            cta="Coming soon"
            disabled
            highlight
          />
          <Tier
            name="Studio"
            price="$9.99/mo"
            current={sub?.tier === "studio"}
            features={["Unlimited shields", "Free repairs (any tier)", "Studio 120 vid · 2000 img", "500 credits/mo drop"]}
            cta="Coming soon"
            disabled
          />
        </div>
      </div>
    </div>
  );
}

function Tier({
  name, price, features, cta, current, disabled, highlight,
}: {
  name: string; price: string; features: string[]; cta: string;
  current?: boolean; disabled?: boolean; highlight?: boolean;
}) {
  return (
    <div className="mp-lift" style={{
      padding: 18, borderRadius: 14,
      background: highlight ? "#F5EFE2" : "#FBF6EC",
      border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
      boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
      cursor: disabled ? "default" : "pointer",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: "#211A12", fontFamily: "var(--ed-disp)" }}>{name}</span>
        {current && (
          <span style={{
            padding: "2px 7px", borderRadius: 999,
            background: "#BE4F28", color: "#fff", border: "none",
            fontSize: 12, fontWeight: 800, fontFamily: "var(--ed-m)", letterSpacing: "0.06em",
          }}>CURRENT</span>
        )}
      </div>
      <div style={{
        fontSize: 24, fontWeight: 800, marginBottom: 12, color: "#211A12",
        fontFamily: "var(--ed-m)",
      }}>{price}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
        {features.map((f, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#5C5140", fontFamily: "var(--ed-body)" }}>
            <svg width={13} height={13} viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
              <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="#BE4F28" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {f}
          </div>
        ))}
      </div>
      <button disabled={disabled} style={{
        width: "100%", padding: "10px", borderRadius: 10,
        border: highlight ? "none" : "1px solid var(--ed-hair, rgba(33,26,18,.13))",
        background: highlight ? "linear-gradient(180deg,#F49B2A,#E27D0C)" : "#F5EFE2",
        boxShadow: "none",
        color: highlight ? "#FFF8EE" : "#7A6E5A", fontWeight: 800, fontSize: 12,
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.75 : 1,
        fontFamily: "var(--ed-disp)",
      }}>{cta}</button>
    </div>
  );
}
