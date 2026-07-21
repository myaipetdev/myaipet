"use client";

import { useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { useDirectUsdtPay } from "@/hooks/useDirectUsdtPay";
import { getAuthHeaders } from "@/lib/api";
import Icon from "@/components/Icon";
import Reveal, { MaskedTitle } from "@/components/Reveal";

// Matches the REAL server grant map (seasonRewards.ts + checkin ladder) — never
// advertise a point value the server doesn't credit.
const EARN_METHODS = [
  { icon: "paw", label: "Daily check-in", desc: "Show up. Your pet remembers.", reward: "+5–50 pts" },
  { icon: "film-reel", label: "Create together", desc: "AI image & video starring your pet", reward: "+10–20 pts" },
  { icon: "chat", label: "Share moments", desc: "Like, comment, signal-boost", reward: "+1–3 pts" },
  { icon: "heart", label: "Build the bond", desc: "Talk, feed, walk, train", reward: "+5 pts" },
  { icon: "crystal-ball", label: "Level up", desc: "Raising well levels your pet", reward: "+50 pts" },
  { icon: "trophy", label: "Play & compete", desc: "Card duels, catches, World Cup", reward: "+5–80 pts" },
];

const BSC_CHAIN_ID = 56;

// Purchases are paused platform-wide right now. Three grey "Coming soon" cards
// read abandoned, so the checkout grid collapses into one spec-sheet strip.
// Flip this to true to restore the full three-card USDT flow — the card markup
// below is kept intact behind this flag.
const SHOW_PURCHASE_CARDS: boolean = false;

export default function Pricing({ isAuthenticated, onCreditsChange }: any) {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [step, setStep] = useState<"idle" | "approve" | "purchase" | "confirm">("idle");

  // Note: legacy on-chain $PET purchase flow has been retired. The flow is now
  // strictly USDT → /api/credits/purchase → in-game credits (points-based).

  const plans = [
    // Credits MUST match what /api/credits/purchase actually grants (PLANS there:
    // 100/500/2000) — the cards previously advertised 5× and under-delivered.
    // Kept at the server's lower grants on purpose to stay margin-positive over
    // Grok generation costs.
    { name: "Explorer", key: "starter", cookies: 100, price: 5, usdtPrice: "5 USDT", pop: false, desc: "Try the ecosystem", emoji: "grass" },
    { name: "Creator", key: "creator", cookies: 500, price: 20, usdtPrice: "20 USDT", pop: true, desc: "Full raise & create", emoji: "paw" },
    { name: "Breeder", key: "pro", cookies: 2000, price: 50, usdtPrice: "50 USDT", pop: false, desc: "Power user tier", emoji: "crown" },
  ];

  // Direct USDT pay (BSC-USD → treasury → server verifies → grants credits)
  const directPay = useDirectUsdtPay();

  const handlePurchase = async (plan: any) => {
    setError(null);
    setSuccess(null);

    if (!isConnected || !address) {
      setError("Connect your wallet at the top-right before purchasing.");
      return;
    }
    if (!isAuthenticated) {
      setError("You're connected but not signed in yet — open the wallet menu and complete the sign-in prompt.");
      return;
    }
    if (chainId !== BSC_CHAIN_ID) {
      // Trigger the switch and stop — switchChain is async, so falling through
      // here would fire pay() on the OLD chain. Make the user re-tap once on BSC.
      try {
        switchChain({ chainId: BSC_CHAIN_ID });
        setError("Switch to BNB Chain in your wallet, then tap your plan again.");
      } catch {
        setError("Please switch to BNB Chain (BSC)");
      }
      return;
    }
    if (!directPay.treasuryConfigured) {
      setError("Payments are temporarily paused. Contact support.");
      return;
    }

    setPurchasing(plan.key);
    setStep("purchase");

    // 1) Send USDT to treasury
    const result = await directPay.pay(plan.price);
    if ("error" in result) {
      const msg = result.error.toLowerCase().includes("user rejected")
        ? "Transaction cancelled"
        : result.error;
      setError(msg);
      setPurchasing(null);
      setStep("idle");
      return;
    }

    // 2) Wait for confirmation, then post hash to server for verification
    setStep("confirm");
    try {
      // Poll receipt until confirmed (server-side will also verify via RPC)
      // We send the tx hash immediately; server retries reading the receipt.
      const res = await fetch("/api/credits/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ plan: plan.key, payment_tx_hash: result.hash }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Receipt may not be available yet — retry once after 5s
        await new Promise(r => setTimeout(r, 5000));
        const res2 = await fetch("/api/credits/purchase", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ plan: plan.key, payment_tx_hash: result.hash }),
        });
        const data2 = await res2.json();
        if (!res2.ok) throw new Error(data2.error || data.error || "Verification failed");
        setSuccess(`Got ${data2.purchased} credits! ✨`);
        onCreditsChange?.();
      } else {
        setSuccess(`Got ${data.purchased} credits! ✨`);
        onCreditsChange?.();
      }
    } catch (err: any) {
      setError(`Payment sent but credit grant failed: ${err.message}. TX: ${result.hash.slice(0, 10)}... — contact support with this hash.`);
    } finally {
      setPurchasing(null);
      setStep("idle");
    }
  };

  const paused = !directPay.treasuryConfigured;
  const getButtonLabel = (planKey: string) => {
    if (paused) return "Coming soon";
    if (purchasing !== planKey) return "Pay with USDT →";
    if (step === "purchase") return "Confirm in wallet...";
    if (step === "confirm") return "Verifying tx...";
    return "Processing...";
  };

  return (
    <div className="pricing-root" style={{ padding: "60px 40px", maxWidth: 1060, margin: "0 auto" }}>
      <style>{`
        @media (max-width: 768px) {
          .pricing-root { padding: 40px 16px !important; }
          .pricing-earn-grid { grid-template-columns: repeat(2, 1fr) !important; }
        /* (.earn-card, not > div — each card now sits inside a Reveal wrapper) */
        .pricing-earn-grid .earn-card { padding: 12px 10px !important; }
        .pricing-earn-grid .earn-card > span:first-child { font-size: 16px !important; }
        .pricing-earn-grid .earn-card div > div:first-child { font-size: 13px !important; }
        .pricing-earn-grid .earn-card div > div:nth-child(2) { font-size: 13px !important; }
          .pricing-cards-grid { grid-template-columns: 1fr !important; max-width: 400px !important; margin-left: auto !important; margin-right: auto !important; }
        }
        @media (max-width: 480px) {
          .pricing-root { padding: 32px 12px !important; }
          .pricing-earn-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
      {/* Section: companionship-first economy (tone-aligned with landing) —
          scroll-revealed: badge fades, headline rises out of its print line. */}
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <Reveal dir="fade">
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 16px",
          borderRadius: 999, background: "#F5EFE2",
          border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", marginBottom: 16,
        }}>
          <span style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: "#9A4E1E", fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase" }}>
            COMPANIONSHIP · OWNED
          </span>
        </div>
        </Reveal>
        <MaskedTitle
          as="h2"
          lines={["Made with care, not hype."]}
          style={{
            fontFamily: "var(--ed-disp)", fontSize: 36, fontWeight: 800,
            color: "#211A12", marginBottom: 12, letterSpacing: "-0.025em", lineHeight: 1.1,
          }}
        />
        <Reveal dir="fade" delay={120}>
        <p style={{
          fontFamily: "var(--ed-body)", fontSize: 17, color: "#5C5140",
          maxWidth: 600, margin: "0 auto", lineHeight: 1.65, fontWeight: 500,
        }}>
          Credits power AI image &amp; video creation with your pet — the same
          companion you raise, the same memory that travels with you. Spend on
          what serves the bond. Points details in the <a href="/docs" className="ed-underline-slide" style={{ color: "#9A4E1E", fontWeight: 700, textDecoration: "none" }}>docs</a>.
        </p>
        </Reveal>
      </div>

      {/* Duplicate pause banner only when the full cards show — the compact
          strip below carries its own wax-seal pause badge. */}
      {SHOW_PURCHASE_CARDS && paused && (
        <div style={{
          maxWidth: 620, margin: "0 auto 32px", padding: "14px 20px", borderRadius: 14,
          background: "#F5EFE2", border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
          display: "flex", alignItems: "center", gap: 12, textAlign: "left",
        }}>
          <span style={{ fontSize: 20, flexShrink: 0, display: "inline-flex", color: "#BE4F28" }} aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2.5" />
              <path d="M2 9.5h20" />
              <path d="M6 14.5h3" />
            </svg>
          </span>
          <div style={{ fontFamily: "var(--ed-body)", fontSize: 14, color: "#9A4E1E", lineHeight: 1.5 }}>
            <strong>Credit purchases are paused right now.</strong> Existing credits remain usable. The activities below earn Season points, not generation credits.
          </div>
        </div>
      )}

      <div style={{
        fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 800,
        letterSpacing: "0.14em", textTransform: "uppercase", color: "#9A4E1E",
        textAlign: "center", marginBottom: 14,
      }}>
        Earn Season points · not generation credits
      </div>

      {/* Season-point methods grid. Every method is LIVE, so no tile should read
          as a faded "coming soon". A 90ms-per-card ramp held the last tile
          (Play & compete) at opacity 0 for ~450ms (Reveal uses fill:backwards),
          so cap the stagger — all tiles now land at full opacity almost together. */}
      <div className="pricing-earn-grid" style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 48,
      }}>
        {EARN_METHODS.map((m, i) => (
          <Reveal key={m.label} dir="up" delay={Math.min(i, 3) * 55}>
          <div className="earn-card" style={{
            background: "#FBF6EC", borderRadius: 14,
            border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", padding: "18px 16px",
            display: "flex", alignItems: "flex-start", gap: 12, height: "100%",
          }}>
            <span style={{ flexShrink: 0, display: "inline-flex", lineHeight: 0 }}><Icon name={m.icon} size={22} /></span>
            <div>
              <div style={{ fontFamily: "var(--ed-disp)", fontSize: 16, fontWeight: 600, color: "#211A12", marginBottom: 3 }}>
                {m.label}
              </div>
              <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: "#7A6E5A", marginBottom: 6 }}>
                {m.desc}
              </div>
              <span style={{
                fontFamily: "var(--ed-m)", fontSize: 13, color: "#5C8A4E", fontWeight: 600,
                padding: "2px 8px", borderRadius: 6,
                background: "rgba(92,138,78,0.08)", border: "1px solid rgba(92,138,78,0.20)",
              }}>
                {m.reward}
              </span>
            </div>
          </div>
          </Reveal>
        ))}
      </div>

      {/* Purchase section */}
      <Reveal dir="fade">
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <h3 style={{
          fontFamily: "var(--ed-disp)", fontSize: 22, fontWeight: 700,
          color: "#211A12", marginBottom: 6,
        }}>
          Credits &amp; Season points
        </h3>
        <p style={{ fontFamily: "var(--ed-body)", fontSize: 14, color: "#7A6E5A", marginBottom: 10 }}>
          {SHOW_PURCHASE_CARDS && paused
            ? "Purchases are paused; existing credits remain usable"
            : "Credits power AI image & video creation with your pet"}
        </p>
      </div>
      </Reveal>

      {error && (
        <div style={{
          marginBottom: 16, padding: "14px 20px", borderRadius: 12,
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
          fontFamily: "var(--ed-body)", fontSize: 15, fontWeight: 600,
          color: "#dc2626", textAlign: "center", lineHeight: 1.5,
          maxWidth: 560, marginLeft: "auto", marginRight: "auto",
        }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{
          marginBottom: 16, padding: "14px 20px", borderRadius: 12,
          background: "rgba(92,138,78,0.08)", border: "1px solid rgba(92,138,78,0.25)",
          fontFamily: "var(--ed-body)", fontSize: 15, fontWeight: 600,
          color: "#5C8A4E", textAlign: "center", lineHeight: 1.5,
          maxWidth: 560, marginLeft: "auto", marginRight: "auto",
        }}>
          {success}
        </div>
      )}

      <style>{`
        .pricing-card {
          border-radius: 16px;
          padding: 28px 22px; position: relative; text-align: center;
          box-shadow: var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5));
          transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
        }
        .pricing-cards-grid:hover .pricing-card {
          opacity: 0.5;
          filter: saturate(0.6);
        }
        .pricing-cards-grid:hover .pricing-card:hover {
          opacity: 1;
          filter: saturate(1);
          transform: translateY(-6px);
          box-shadow: var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5));
        }
        .pricing-card:hover {
          transform: translateY(-6px);
          box-shadow: var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5));
        }
        .pricing-card.popular {
          background: #F5EFE2;
          border: 1px solid rgba(190,79,40,0.30);
        }
        .pricing-card.popular:hover {
          border-color: rgba(190,79,40,0.50);
          box-shadow: var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5));
        }
        .pricing-card:not(.popular) {
          background: #FBF6EC;
          border: 1px solid var(--ed-hair, rgba(33,26,18,.13));
        }
        .pricing-card:not(.popular):hover {
          border-color: rgba(190,79,40,0.30);
          background: #F5EFE2;
        }
        .pricing-card:hover .pricing-btn-default,
        .pricing-card.popular:hover .pricing-btn-default {
          background: linear-gradient(180deg,#E68A2E,#BE4F28) !important;
          color: #FCE9CF !important;
          border-color: transparent !important;
        }
      `}</style>
      {SHOW_PURCHASE_CARDS ? (
      <div className="pricing-cards-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, maxWidth: 860, margin: "0 auto" }}>
        {plans.map((p, i) => (
          <Reveal key={p.name} dir="up" delay={Math.min(i, 8) * 90}>
          <div className={`pricing-card${p.pop ? " popular" : ""}`} style={{ height: "100%" }}>
            {p.pop && (
              <div style={{
                position: "absolute", top: -9, left: "50%", transform: "translateX(-50%)",
                background: "#BE4F28",
                padding: "3px 14px", borderRadius: 16,
                fontFamily: "var(--ed-m)", fontSize: 13, color: "#FFF8EE", fontWeight: 600,
              }}>
                MOST POPULAR
              </div>
            )}
            <div style={{ marginBottom: 8 }}><Icon name={p.emoji} size={32} /></div>
            <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: "#7A6E5A", marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em" }}>
              {p.name}
            </div>
            <div style={{
              fontFamily: "var(--ed-disp)", fontSize: 36, fontWeight: 700,
              color: "#211A12", marginBottom: 3,
            }}>
              {p.usdtPrice}
            </div>
            <div style={{ fontFamily: "var(--ed-m)", fontSize: 14, color: "#9A4E1E", marginBottom: 4, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Icon name="coin" size={16} /> {p.cookies.toLocaleString()} credits
            </div>
            <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: "#9A7B4E", marginBottom: 18 }}>
              {p.desc}
            </div>
            <button
              onClick={() => handlePurchase(p)}
              disabled={!!purchasing || paused}
              /* every card's button gets the terracotta hover fill — the popular
                 card was excluded before, so its button never lit up on hover */
              className="pricing-btn-default"
              style={{
                width: "100%",
                background: paused ? "rgba(33,26,18,0.25)"
                  : purchasing === p.key ? "rgba(190,79,40,0.5)"
                  : p.pop ? "linear-gradient(180deg,#E68A2E,#BE4F28)" : "#211A12",
                border: "none",
                borderRadius: 10, padding: "13px",
                fontFamily: "var(--ed-disp)", fontSize: 14,
                color: p.pop && !paused ? "#FCE9CF" : "#fff",
                cursor: paused ? "not-allowed" : purchasing ? "wait" : "pointer", fontWeight: 700,
                transition: "all 0.3s ease",
                boxShadow: "none",
                opacity: paused ? 0.85 : (purchasing && purchasing !== p.key ? 0.5 : 1),
              }}
            >
              {getButtonLabel(p.key)}
            </button>
            {/* "Buy with Card" (Coinbase onramp) was REMOVED: it onramped
                USDC-on-Base while the only purchase path verifies USDT-on-BSC —
                fiat spent through it could never buy the plan. Card payments
                return via the Paddle rail (feat/card-email-paddle-auth). */}
          </div>
          </Reveal>
        ))}
      </div>
      ) : (
      /* Compact spec-sheet strip — same REAL rates the server grants
         (100/500/2000 credits for 5/20/50 USDT), no dead buy buttons. */
      <Reveal dir="up">
      <div style={{
        maxWidth: 620, margin: "0 auto", background: "#FBF6EC", borderRadius: 16,
        border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
        boxShadow: "3px 4px 0 rgba(33,26,18,.12)", padding: "20px 22px 22px",
      }}>
        {/* Wax-seal pause badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <span aria-hidden="true" style={{
            width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
            background: "#BE4F28", border: "2px solid #E8C77E",
            boxShadow: "2px 3px 0 rgba(33,26,18,.18), inset 0 0 0 3px #C8932F",
            display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#FCE9CF",
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="7" y="5" width="3.5" height="14" rx="1.2" />
              <rect x="13.5" y="5" width="3.5" height="14" rx="1.2" />
            </svg>
          </span>
          <div>
            <div style={{ fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "#BE4F28" }}>
              Purchases paused
            </div>
            <div style={{ fontFamily: "var(--ed-body)", fontSize: 14, color: "#7A6E5A", fontWeight: 500 }}>
              Existing credits remain usable; no purchase date is announced
            </div>
          </div>
        </div>

        {/* Rate sheet — mono table, kept on the record for when buying reopens */}
        <div style={{ border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--ed-m)", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#ECE4D4" }}>
                <th style={{ padding: "7px 14px", textAlign: "left", color: "#7A6E5A", fontWeight: 700, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase" }}>Pack</th>
                <th style={{ padding: "7px 14px", textAlign: "right", color: "#7A6E5A", fontWeight: 700, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase" }}>Credits</th>
                <th style={{ padding: "7px 14px", textAlign: "right", color: "#7A6E5A", fontWeight: 700, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase" }}>Price</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.key} style={{ borderTop: "1px solid var(--ed-hair, rgba(33,26,18,.13))" }}>
                  <td style={{ padding: "9px 14px", color: "#211A12", fontWeight: 700 }}>{p.name}</td>
                  <td style={{ padding: "9px 14px", textAlign: "right", color: "#9A4E1E", fontWeight: 600 }}>{p.cookies.toLocaleString()}</td>
                  <td style={{ padding: "9px 14px", textAlign: "right", color: "#211A12" }}>{p.usdtPrice}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <a
          href="/studio"
          style={{
            display: "block", textAlign: "center",
            background: "linear-gradient(180deg,#E68A2E,#BE4F28)", color: "#FCE9CF",
            fontFamily: "var(--ed-disp)", fontSize: 14, fontWeight: 700,
            padding: "13px", borderRadius: 10, textDecoration: "none",
            boxShadow: "3px 4px 0 rgba(33,26,18,.12)",
          }}
        >
          Open the Studio →
        </a>
      </div>
      </Reveal>
      )}

      {/* Spacer */}
      <div style={{ height: 20 }} />
    </div>
  );
}
