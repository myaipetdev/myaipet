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

// ── Studio credit costs (mirrors lib/studio/providers.ts — runnable models only,
// comingSoon engines excluded). Used for the honest "what this pack makes" math:
//   pet portrait  = 5 cr  (grok-imagine, the free-tier default image engine)
//   video clip    = 25 cr (grok-imagine-video / wan-2.1, the cheapest clip engines)
// If providers.ts reprices, update these two numbers.
const PORTRAIT_CR = 5;
const CLIP_CR = 25;

// ── Pack catalog. Credits MUST match what /api/credits/purchase actually grants
// (PLANS there: 100/500/2000 for 5/20/50 USDT) — the cards previously advertised
// 5× and under-delivered. Kept at the server's lower grants on purpose to stay
// margin-positive over Grok generation costs.
const PLANS = [
  { name: "Explorer", key: "starter", credits: 100, price: 5, desc: "Try the ecosystem", emoji: "grass" },
  { name: "Creator", key: "creator", credits: 500, price: 20, desc: "Full raise & create", emoji: "paw" },
  { name: "Breeder", key: "pro", credits: 2000, price: 50, desc: "Power user tier", emoji: "crown" },
];

// Derived, honest numbers — computed, never hand-typed, so they can't drift.
const BASE_UNIT = PLANS[0].price / PLANS[0].credits; // Explorer sets the base rate ($0.05/cr)
const BEST_UNIT = Math.min(...PLANS.map(p => p.price / p.credits));
const packs = PLANS.map(p => {
  const unit = p.price / p.credits;
  return {
    ...p,
    usdtPrice: `${p.price} USDT`,
    // "5¢" / "4¢" / "2.5¢" per credit
    unitLabel: `${(unit * 100).toFixed(1).replace(/\.0$/, "")}¢ / credit`,
    saving: Math.round((1 - unit / BASE_UNIT) * 100),
    portraits: Math.floor(p.credits / PORTRAIT_CR),
    clips: Math.floor(p.credits / CLIP_CR),
    // Wax-seal BEST VALUE only where the unit math actually supports it: the
    // strictly cheapest ¢/credit, and only if it genuinely undercuts the base.
    best: unit === BEST_UNIT && unit < BASE_UNIT,
  };
});

/** Wax-seal BEST VALUE stamp — terracotta seal, gold inner ring, hard offset
 *  shadow, hand-stamped rotation. Sits over the pack card's top-right die-cut. */
function BestValueSeal() {
  return (
    <div
      role="img"
      aria-label="Best value pack"
      style={{
        position: "absolute", top: -18, right: -12, width: 68, height: 68,
        borderRadius: "50%", background: "#BE4F28", border: "2px solid #9A4E1E",
        boxShadow: "2px 3px 0 rgba(33,26,18,.28), inset 0 0 0 3px #C8932F, inset 0 2px 0 rgba(255,255,255,.22)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        transform: "rotate(8deg)", zIndex: 2,
      }}
    >
      <span style={{ fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 800, color: "#FFF8EE", letterSpacing: "0.04em", lineHeight: 1.1 }}>BEST</span>
      <span style={{ fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 800, color: "#FFF8EE", letterSpacing: "0.04em", lineHeight: 1.1 }}>VALUE</span>
    </div>
  );
}

/** Wax-seal PAUSED stamp (decorative — the ink text beside it carries meaning). */
function PausedSeal() {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 58, height: 58, borderRadius: "50%", flexShrink: 0,
        background: "#BE4F28", border: "2px solid #9A4E1E",
        boxShadow: "2px 3px 0 rgba(33,26,18,.28), inset 0 0 0 3px #C8932F, inset 0 2px 0 rgba(255,255,255,.22)",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        color: "#FFF8EE", transform: "rotate(-8deg)",
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <rect x="7" y="5" width="3.5" height="14" rx="1.2" />
        <rect x="13.5" y="5" width="3.5" height="14" rx="1.2" />
      </svg>
    </span>
  );
}

export default function Pricing({ isAuthenticated, onCreditsChange }: any) {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [step, setStep] = useState<"idle" | "approve" | "purchase" | "confirm">("idle");

  // Note: legacy on-chain $PET purchase flow has been retired. The flow is now
  // strictly USDT → /api/credits/purchase → in-game credits (points-based).

  // Direct USDT pay (BSC-USD → treasury → server verifies → grants credits)
  const directPay = useDirectUsdtPay();

  const handlePurchase = async (plan: (typeof packs)[number]) => {
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

  // Payments kill-switch: while the treasury is unconfigured, purchases are
  // paused platform-wide. The packs stay on display at full fidelity (this is
  // the shop window), the buy slot becomes an "Opens at launch" letterpress
  // strip, and one wax-seal PAUSED plaque presides over the section.
  const paused = !directPay.treasuryConfigured;
  const getButtonLabel = (planKey: string) => {
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
          .pack-grid { grid-template-columns: 1fr !important; max-width: 380px !important; margin-left: auto !important; margin-right: auto !important; row-gap: 26px !important; }
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
          owner-scoped companion identity, with selected retained context on supported surfaces. Spend on
          what serves the bond. Points details in the <a href="/docs" className="ed-underline-slide" style={{ color: "#9A4E1E", fontWeight: 700, textDecoration: "none" }}>docs</a>.
        </p>
        </Reveal>
      </div>

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

      {/* ── Credit packs — Collectible Editorial commerce ── */}
      <Reveal dir="fade">
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{
          fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 800,
          letterSpacing: "0.14em", textTransform: "uppercase", color: "#9A4E1E", marginBottom: 8,
        }}>
          Credit packs · USDT
        </div>
        <h3 style={{
          fontFamily: "var(--ed-disp)", fontSize: 24, fontWeight: 700,
          color: "#211A12", marginBottom: 6, letterSpacing: "-0.02em",
        }}>
          Credits &amp; Season points
        </h3>
        <p style={{ fontFamily: "var(--ed-body)", fontSize: 14, color: "#7A6E5A", fontWeight: 500 }}>
          Credits power AI image &amp; video creation — points are earned, never sold.
        </p>
      </div>
      </Reveal>

      {/* Wax-seal PAUSED plaque — payments are kill-switched, and that is stated
          calmly on the record: one stamp, one line, no fake open date. */}
      {paused && (
        <Reveal dir="up">
        <div style={{
          maxWidth: 560, margin: "0 auto 34px", padding: "16px 20px",
          background: "#F5EFE2", borderRadius: 14,
          border: "1.5px solid rgba(33,26,18,.18)",
          boxShadow: "4px 5px 0 rgba(33,26,18,.10)",
          display: "flex", alignItems: "center", gap: 16, textAlign: "left",
        }}>
          <PausedSeal />
          <div>
            <div style={{
              fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 800,
              letterSpacing: "0.16em", textTransform: "uppercase", color: "#BE4F28", marginBottom: 3,
            }}>
              Purchases paused
            </div>
            <div style={{ fontFamily: "var(--ed-body)", fontSize: 15, color: "#211A12", fontWeight: 600, lineHeight: 1.5 }}>
              Purchases open at launch — existing credits stay usable.
            </div>
          </div>
        </div>
        </Reveal>
      )}

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
        /* Die-cut pack card: ink keyline, cream die-cut margin (the inset ring),
           ONE hard zero-blur offset shadow. Depth is static; hover is a peel. */
        .pack-card {
          position: relative;
          background: #FBF6EC;
          border: 2px solid #211A12;
          border-radius: 18px;
          padding: 24px 22px 20px;
          text-align: left;
          height: 100%;
          box-shadow: inset 0 0 0 5px var(--pk-margin, #FFFDF6), 6px 7px 0 rgba(33,26,18,.14);
          transition: transform 0.18s ease, box-shadow 0.18s ease;
        }
        .pack-card:hover {
          transform: translate(-2px, -3px);
          box-shadow: inset 0 0 0 5px var(--pk-margin, #FFFDF6), 9px 11px 0 rgba(33,26,18,.16);
        }
        .pack-buy-btn {
          width: 100%;
          background: linear-gradient(180deg, #E68A2E, #BE4F28);
          color: #211A12; /* ink on orange — WCAG mandate, never cream */
          border: 2px solid #211A12;
          border-radius: 11px;
          padding: 12px;
          font-family: var(--ed-disp);
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 0.01em;
          box-shadow: 3px 4px 0 rgba(33,26,18,.22);
          cursor: pointer;
          transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
        }
        .pack-buy-btn:hover:not(:disabled) {
          transform: translate(-1px, -2px);
          box-shadow: 5px 7px 0 rgba(33,26,18,.24);
        }
        .pack-buy-btn:active:not(:disabled) {
          transform: translate(1px, 2px);
          box-shadow: 1px 1px 0 rgba(33,26,18,.22);
        }
        .pack-buy-btn:disabled { cursor: wait; opacity: 0.6; }
      `}</style>

      {/* The three pack cards — always on display (this is the shop window),
          numbers mirror the server grant map exactly. */}
      <div className="pack-grid" style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18,
        maxWidth: 920, margin: "0 auto", alignItems: "stretch",
      }}>
        {packs.map((p, i) => (
          <Reveal key={p.key} dir="up" delay={Math.min(i, 3) * 80}>
          <div
            className="pack-card"
            style={{
              // Breeder earns a gold-foil die-cut margin — rarity is carried by
              // stock + seal, never by glow.
              ["--pk-margin" as any]: p.best ? "#F6E3B4" : "#FFFDF6",
            }}
          >
            {p.best && <BestValueSeal />}

            {/* Eyebrow: pack name + tier icon */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{
                fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 800,
                letterSpacing: "0.16em", textTransform: "uppercase", color: "#9A4E1E",
              }}>
                {p.name}
              </span>
              <Icon name={p.emoji} size={24} />
            </div>

            {/* Big credit numeral */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
              <span style={{
                fontFamily: "var(--ed-disp)", fontSize: 46, fontWeight: 800,
                color: "#211A12", letterSpacing: "-0.03em", lineHeight: 1,
              }}>
                {p.credits.toLocaleString()}
              </span>
              <span style={{
                fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 800,
                letterSpacing: "0.14em", color: "#7A6E5A",
              }}>
                CREDITS
              </span>
            </div>

            {/* Price + BEP-20 badge */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontFamily: "var(--ed-disp)", fontSize: 21, fontWeight: 800, color: "#211A12" }}>
                {p.usdtPrice}
              </span>
              <span style={{
                fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 700, color: "#5C5140",
                padding: "2px 8px", borderRadius: 6, background: "#ECE4D4",
                border: "1px solid rgba(33,26,18,.18)", letterSpacing: "0.06em",
              }}>
                BEP-20
              </span>
            </div>

            {/* Per-credit unit price + computed savings */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <span style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: "#7A6E5A", fontWeight: 600 }}>
                {p.unitLabel}
              </span>
              {p.saving > 0 && (
                <span style={{
                  fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 800, color: "#BE4F28",
                  padding: "2px 8px", borderRadius: 6,
                  background: "rgba(190,79,40,0.08)", border: "1px solid rgba(190,79,40,0.28)",
                  letterSpacing: "0.04em", textTransform: "uppercase",
                }}>
                  Save {p.saving}%
                </span>
              )}
            </div>

            {/* Perforation divider */}
            <div aria-hidden="true" style={{ borderTop: "1.5px dashed rgba(33,26,18,.22)", margin: "0 0 12px" }} />

            {/* What this pack makes — computed from the Studio catalog rates */}
            <div style={{
              fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 800,
              letterSpacing: "0.14em", textTransform: "uppercase", color: "#9A7B4E", marginBottom: 8,
            }}>
              Makes about
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
              <Icon name="sparkling" size={17} />
              <span style={{ fontFamily: "var(--ed-body)", fontSize: 14, color: "#5C5140", fontWeight: 500 }}>
                <strong style={{ color: "#211A12", fontWeight: 700 }}>{p.portraits.toLocaleString()}</strong> pet portraits
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <Icon name="film-reel" size={17} />
              <span style={{ fontFamily: "var(--ed-body)", fontSize: 14, color: "#5C5140", fontWeight: 500 }}>
                or <strong style={{ color: "#211A12", fontWeight: 700 }}>{p.clips.toLocaleString()}</strong> video clips
              </span>
            </div>

            {/* Buy slot: live USDT flow when open; letterpress strip when paused
                (a dead grey button reads abandoned — a stamped date-line doesn't). */}
            {paused ? (
              <div style={{
                border: "1.5px dashed rgba(33,26,18,.30)", borderRadius: 10,
                padding: "12px", textAlign: "center", background: "#F5EFE2",
                fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 800,
                letterSpacing: "0.16em", textTransform: "uppercase", color: "#9A4E1E",
              }}>
                Opens at launch
              </div>
            ) : (
              <button
                className="pack-buy-btn"
                onClick={() => handlePurchase(p)}
                disabled={!!purchasing}
                style={purchasing && purchasing !== p.key ? { opacity: 0.5 } : undefined}
              >
                {getButtonLabel(p.key)}
              </button>
            )}
          </div>
          </Reveal>
        ))}
      </div>

      {/* Rate footnote — the "makes about" basis, straight from providers.ts */}
      <Reveal dir="fade" delay={120}>
      <p style={{
        fontFamily: "var(--ed-m)", fontSize: 12, color: "#9A7B4E", textAlign: "center",
        margin: "18px auto 0", maxWidth: 560, lineHeight: 1.6, fontWeight: 500,
      }}>
        Studio rates: pet portrait 5 cr · video clip from 25 cr · premium engines up to 50 cr.
      </p>
      </Reveal>

      {/* Trust strip — every claim is live in production (RpcUsdtVerifier). */}
      <Reveal dir="fade" delay={160}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap",
        gap: "8px 18px", margin: "20px auto 8px", padding: "12px 18px", maxWidth: 640,
        borderTop: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
        borderBottom: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
      }}>
        {[
          {
            label: "USDT (BEP-20)",
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M8 9h8M12 9v7" />
              </svg>
            ),
          },
          {
            label: "On-chain verification",
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            ),
          },
          {
            label: "No card required",
            icon: (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="6" width="18" height="13" rx="2" />
                <path d="M3 10h18M4 4l16 17" />
              </svg>
            ),
          },
        ].map((t) => (
          <span key={t.label} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 700, color: "#5C5140",
          }}>
            <span style={{ display: "inline-flex", color: "#9A4E1E" }}>{t.icon}</span>
            {t.label}
          </span>
        ))}
      </div>
      </Reveal>

      {/* Compliance line, kept on the record and designed, not buried. */}
      <Reveal dir="fade" delay={200}>
      <p style={{
        fontFamily: "var(--ed-m)", fontSize: 12, color: "#9A7B4E", textAlign: "center",
        margin: "0 auto 26px", maxWidth: 560, lineHeight: 1.6, fontWeight: 500,
      }}>
        Season points are a loyalty score earned through care — never purchasable, never a financial product.
      </p>
      </Reveal>

      {/* Studio CTA — ink text on the orange gradient (WCAG mandate). */}
      <Reveal dir="up" delay={220}>
      <div style={{ textAlign: "center" }}>
        <a
          href="/studio"
          style={{
            display: "inline-block",
            background: "linear-gradient(180deg,#E68A2E,#BE4F28)", color: "#211A12",
            fontFamily: "var(--ed-disp)", fontSize: 15, fontWeight: 800,
            padding: "14px 34px", borderRadius: 12, textDecoration: "none",
            border: "2px solid #211A12",
            boxShadow: "4px 5px 0 rgba(33,26,18,.18)",
          }}
        >
          Open the Studio →
        </a>
      </div>
      </Reveal>

      {/* Spacer */}
      <div style={{ height: 20 }} />
    </div>
  );
}
