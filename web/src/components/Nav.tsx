"use client";

import { useState, useRef, useEffect } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import useCountUp from "@/hooks/useCountUp";

const LOGO_SRC = "/mascot.jpg";

const NAV_ITEMS: { key: string; label: string; url?: string }[] = [
  { key: "home", label: "Home" },
  { key: "my pet", label: "My Pet" },
  // Game features grouped right after My Pet.
  { key: "catch", label: "Catch" },
  { key: "cards", label: "Cards" },
  // Time-boxed World Cup 2026 event (remove this entry after ~2026-07-19).
  { key: "worldcup", label: "World Cup" },
  { key: "studio", label: "Studio", url: "/studio" },
  { key: "community", label: "Community" },
  { key: "sovereignty", label: "PetClaw" },
  // (Agent — multi-platform autonomous presence — intentionally NOT a top-level
  // tab per owner. The AgentDashboard still renders via /?section=agent.)
  // Season hub: my-card + season + missions + leaderboards. Labelled
  // "Season Rewards" (not "Airdrop") — points are off-chain loyalty credits,
  // and an "Airdrop" tab reads as a token-distribution commitment in
  // exchange/regulatory review (DD Q29).
  { key: "airdrop", label: "Season Rewards" },
];

export default function Nav({ section, setSection, credits }: any) {
  const [balanceOpen, setBalanceOpen] = useState(false);
  const balanceRef = useRef<HTMLDivElement>(null);
  const navWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (balanceRef.current && !balanceRef.current.contains(e.target as Node)) {
        setBalanceOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") setBalanceOpen(false); }
    if (balanceOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKey);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleKey);
      };
    }
  }, [balanceOpen]);

  // Mobile: the tab strip scrolls horizontally — keep the active tab in view
  // when the section changes (block:"nearest" so the page itself never moves).
  useEffect(() => {
    navWrapRef.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [section]);

  // Count the REAL credit balance toward its new value (up or down) and flash
  // the chip once on change so spends/purchases are felt without a hard cut.
  const displayCredits = useCountUp(typeof credits === "number" ? credits : 0);
  const [creditsFlash, setCreditsFlash] = useState(false);
  const prevCreditsRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevCreditsRef.current;
    prevCreditsRef.current = typeof credits === "number" ? credits : null;
    if (typeof credits === "number" && prev !== null && prev !== credits) {
      setCreditsFlash(true);
      const t = setTimeout(() => setCreditsFlash(false), 500);
      return () => clearTimeout(t);
    }
  }, [credits]);

  return (
    <>
      <style>{`
        /* DD report flagged header overlap at ~774px — earlier breakpoint
           wasn't dropping the ← Landing button or shrinking wallet, so
           the items+credits+landing+wallet collided. Cascaded breakpoints. */
        .nav-btn:active { transform: translateY(1px); }
        .nav-credits:hover { border-color: rgba(154,78,30,.5) !important; background: #F5EFE2 !important; }
        @media (max-width: 1024px) {
          .nav-landing-btn { display: none !important; }
        }
        @media (max-width: 1180px) {
          .nav-items-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; justify-content: flex-start !important; mask-image: linear-gradient(to right, black 88%, transparent); -webkit-mask-image: linear-gradient(to right, black 88%, transparent); }
          .nav-items-wrap::-webkit-scrollbar { display: none; }
        }
        @media (max-width: 1060px) {
          .nav-desktop-badge { display: none !important; }
        }
        @media (max-width: 768px) {
          .nav-desktop-logo-text { display: none !important; }
          .nav-container { padding: 8px 12px !important; }
          .nav-items-wrap { overflow-x: auto !important; -webkit-overflow-scrolling: touch; scrollbar-width: none; mask-image: linear-gradient(to right, black 90%, transparent); -webkit-mask-image: linear-gradient(to right, black 90%, transparent); padding-right: 6px; }
          .nav-items-wrap::-webkit-scrollbar { display: none; }
          .nav-btn { padding: 6px 10px !important; font-size: 11px !important; white-space: nowrap; flex-shrink: 0; }
          .nav-credits { font-size: 10px !important; padding: 4px 8px !important; }
        }
        @media (max-width: 480px) {
          .nav-container { padding: 6px 8px !important; gap: 6px !important; }
          .nav-logo-img { width: 30px !important; height: 30px !important; }
          .nav-btn { padding: 5px 8px !important; font-size: 10px !important; }
          .nav-wallet { transform: scale(0.8); transform-origin: right center; }
        }
      `}</style>
      <nav
        className="nav-container"
        style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
          display: "flex", alignItems: "center", gap: 18,
          padding: "11px 22px", background: "rgba(236,228,212,0.94)",
          backdropFilter: "blur(8px)", borderBottom: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flexShrink: 0 }}
          onClick={() => setSection("home")}>
          <img
            className="nav-logo-img"
            src={LOGO_SRC} alt="MY AI PET"
            style={{
              width: 32, height: 32, borderRadius: 7, objectFit: "cover",
              border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
            }}
          />
          <span className="nav-desktop-logo-text" style={{
            fontFamily: "var(--ed-disp)", fontWeight: 800, fontSize: 18,
            color: "#211A12", letterSpacing: "-0.01em",
          }}>
            MY AI PET
          </span>
          <span className="nav-desktop-badge" style={{
            fontSize: 9.5, padding: "3px 9px", borderRadius: 20,
            color: "#9A4E1E",
            fontFamily: "var(--ed-m)", fontWeight: 700, letterSpacing: "0.12em",
            border: "1px solid rgba(154,78,30,0.4)",
          }}>
            COMPANIONFI
          </span>
        </div>

        {/* Nav items — scrollable on mobile */}
        <div ref={navWrapRef} className="nav-items-wrap" style={{
          display: "flex", gap: 17, alignItems: "center", justifyContent: "center",
          flex: 1, minWidth: 0,
        }}>
          {NAV_ITEMS.map((item) => {
            // URL items (e.g. /studio) navigate; otherwise set in-page section.
            const isActive = item.url
              ? typeof window !== "undefined" && window.location.pathname === item.url
              : section === item.key;
            const sharedStyle: React.CSSProperties = {
              background: "transparent",
              border: "none", cursor: "pointer",
              borderRadius: 0, padding: "20px 2px",
              fontFamily: "var(--ed-body)",
              fontSize: 14, fontWeight: isActive ? 600 : 500,
              color: isActive ? "#211A12" : "#7A6E5A",
              transition: "color 180ms ease, transform 120ms ease",
              position: "relative", whiteSpace: "nowrap", flexShrink: 0,
              textDecoration: "none",
              display: "inline-block",
            };
            const inner = (
              <>
                {item.label}
                {isActive && (
                  <div style={{
                    position: "absolute", bottom: -1, left: 0, right: 0,
                    height: 2, background: "#211A12",
                    transformOrigin: "left",
                    animation: "edUnderlineIn 220ms cubic-bezier(.2,.8,.2,1) both",
                  }} />
                )}
              </>
            );
            return item.url ? (
              <a key={item.key} className="nav-btn" href={item.url} aria-current={isActive ? "page" : undefined} style={sharedStyle}>
                {inner}
              </a>
            ) : (
              <button key={item.key} className="nav-btn" onClick={() => setSection(item.key)} aria-current={isActive ? "page" : undefined} style={sharedStyle}>
                {inner}
              </button>
            );
          })}

          {credits !== null && credits !== undefined && (
            <div ref={balanceRef} style={{ position: "relative", flexShrink: 0, marginLeft: 4 }}>
              <button
                className="nav-credits"
                aria-label={`Credit balance: ${credits}`}
                aria-expanded={balanceOpen}
                aria-haspopup="true"
                onClick={() => setBalanceOpen((v: boolean) => !v)}
                style={{
                  fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 700,
                  // One-shot change flash: real balance moved (spend or purchase).
                  color: creditsFlash ? "#BE4F28" : "#9A4E1E",
                  background: creditsFlash ? "rgba(190,79,40,.12)" : "transparent",
                  padding: "5px 11px", borderRadius: 8,
                  border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                  whiteSpace: "nowrap", cursor: "pointer",
                  display: "inline-block",
                  transition: "all 0.2s ease",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                ◎ {displayCredits.toLocaleString()}
              </button>
              {balanceOpen && (
                <div style={{
                  position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 200,
                  background: "var(--ed-paper, #FBF6EC)",
                  borderRadius: 16, border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                  boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
                  padding: "20px", minWidth: 220,
                  animation: "slideIn 0.2s ease",
                }}>
                  <div style={{
                    fontFamily: "var(--ed-m)", fontSize: 10, fontWeight: 700,
                    letterSpacing: "0.14em", textTransform: "uppercase",
                    color: "#9A7B4E", marginBottom: 8,
                  }}>
                    Platform Credits
                  </div>
                  <div style={{
                    fontFamily: "var(--ed-disp)", fontSize: 30, fontWeight: 800,
                    color: "#211A12", marginBottom: 4, letterSpacing: "-0.02em",
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    {credits.toLocaleString()} <span style={{ fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 700, color: "#9A4E1E", letterSpacing: "0.06em" }}>credits</span>
                  </div>
                  {/* SCRUM-99: this is the in-app credit balance, NOT the connected
                      wallet's on-chain balance — label it so users don't conflate them. */}
                  <div style={{ fontFamily: "var(--ed-body)", fontSize: 11.5, color: "#7A6E5A", lineHeight: 1.45 }}>
                    In-app credits for AI generation — not your wallet balance.
                  </div>
                  <div style={{
                    height: 1, background: "var(--ed-hair, rgba(33,26,18,.13))", margin: "14px 0",
                  }} />
                  <button
                    className="ed-press"
                    onClick={() => { setBalanceOpen(false); setSection("home"); setTimeout(() => { document.querySelector(".pricing-root")?.scrollIntoView({ behavior: "smooth" }); }, 100); }}
                    style={{
                      width: "100%", padding: "11px 14px", borderRadius: 12, border: "none",
                      background: "linear-gradient(180deg, #F49B2A, #E27D0C)",
                      color: "#FFF8EE", fontFamily: "var(--ed-body)", fontSize: 13.5,
                      fontWeight: 600, cursor: "pointer", marginBottom: 0,
                      boxShadow: "0 8px 18px -10px rgba(226,125,12,.7)",
                      transition: "all 0.2s ease",
                    }}
                  >
                    Get More Credits
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* "← Landing" button removed — /landing/ doesn't exist, the home itself is the landing. */}

        <div className="nav-wallet" style={{ flexShrink: 0 }}>
          <ConnectButton
            chainStatus="icon"
            showBalance={false}
            accountStatus={{ smallScreen: "avatar", largeScreen: "address" }}
          />
        </div>
      </nav>
    </>
  );
}

export { LOGO_SRC };
