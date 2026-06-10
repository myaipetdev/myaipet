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
    <div style={{ maxWidth: 1060, margin: "20px auto", padding: "0 24px" }}>
      <div style={{
        background: "linear-gradient(135deg,#0f172a 0%,#1e293b 100%)",
        color: "white", borderRadius: 18, padding: "24px 26px",
        border: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{
          fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: "0.18em", color: "#fbbf24", marginBottom: 8,
        }}>UNLIMITED · COMING SOON</div>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.015em", marginBottom: 4 }}>
          Pet Companion Premium
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 18, maxWidth: 540 }}>
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
    <div style={{
      padding: 16, borderRadius: 14,
      background: highlight ? "rgba(245,158,11,0.10)" : "rgba(255,255,255,0.04)",
      border: highlight ? "1px solid rgba(245,158,11,0.35)" : "1px solid rgba(255,255,255,0.06)",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 16, fontWeight: 800 }}>{name}</span>
        {current && (
          <span style={{
            padding: "2px 7px", borderRadius: 999,
            background: "rgba(34,197,94,0.20)", color: "#86efac",
            fontSize: 9, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em",
          }}>CURRENT</span>
        )}
      </div>
      <div style={{
        fontSize: 24, fontWeight: 800, marginBottom: 12,
        fontFamily: "'JetBrains Mono', monospace",
      }}>{price}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
        {features.map((f, i) => (
          <div key={i} style={{ fontSize: 12, color: "rgba(255,255,255,0.78)" }}>
            ✓ {f}
          </div>
        ))}
      </div>
      <button disabled={disabled} style={{
        width: "100%", padding: "10px", borderRadius: 10, border: "none",
        background: highlight ? "linear-gradient(135deg,#fbbf24,#f59e0b)" : "rgba(255,255,255,0.10)",
        color: "white", fontWeight: 800, fontSize: 12,
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.7 : 1,
        fontFamily: "'Space Grotesk', sans-serif",
      }}>{cta}</button>
    </div>
  );
}
