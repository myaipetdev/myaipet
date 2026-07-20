"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import useCountUp from "@/hooks/useCountUp";

const LOGO_SRC = "/mascot.jpg";

type NavItem = { key: string; label: string; url?: string };

// ── Primary tabs — always visible, mobile included (DD P2: Home / My Pet /
// Create(Studio) / Community). Everything else lives under "More" so the
// mobile strip never horizontally scrolls (DD P1: 9 tabs overflowed and
// Community/PetClaw/Agent Office/Season were hidden behind a scroll with only
// a decorative chevron).
const PRIMARY_ITEMS: NavItem[] = [
  { key: "home", label: "Home" },
  { key: "my pet", label: "My Pet" },
  // The Create surface — same Studio as /?section=create, served at /studio.
  { key: "studio", label: "Studio", url: "/studio" },
  { key: "community", label: "Community" },
];

// ── "More" group — play + power surfaces. Rendered inline on wide desktop
// (≥1360px, where all nine fit without scrolling) and as an accessible
// dropdown menu everywhere else.
const MORE_ITEMS: NavItem[] = [
  // Game features. (Catch lives inside Cards as a tab — /?section=catch still
  // aliases to the Cards screen's Catch tab.)
  { key: "cards", label: "Cards" },
  // Evergreen "Favorites Bracket" — pick-your-favorite pet tournament. Keeps
  // the "worldcup" section key so old deep links still land; the seasonal
  // national-flag World Cup is a small hideable module inside it.
  { key: "worldcup", label: "Bracket" },
  { key: "sovereignty", label: "PetClaw" },
  // Agent Office — the Mission-Control dashboard (5 pillars / kanban / staff / crons).
  { key: "office", label: "Agent Office" },
  // (Agent — multi-platform autonomous presence — intentionally NOT a top-level
  // tab per owner. The AgentDashboard still renders via /?section=agent.)
  // Season hub: my-card + season + missions + leaderboards. Labelled
  // "Season Rewards" (not "Airdrop") — points are off-chain loyalty credits,
  // and an "Airdrop" tab reads as a token-distribution commitment in
  // exchange/regulatory review (DD Q29).
  { key: "season", label: "Season Rewards" },
];

export default function Nav({ section, setSection, credits }: any) {
  const [balanceOpen, setBalanceOpen] = useState(false);
  const balanceRef = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

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

  // "More" menu — click-outside closes; Escape closes AND returns focus to the
  // trigger button (keyboard operability, WAI-ARIA menu-button pattern).
  useEffect(() => {
    if (!moreOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMoreOpen(false);
        moreBtnRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [moreOpen]);

  // Move focus into the menu when it opens (so ArrowUp/Down work immediately).
  useEffect(() => {
    if (moreOpen) {
      moreMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    }
  }, [moreOpen]);

  const handleMenuKey = useCallback((e: React.KeyboardEvent) => {
    const items = Array.from(
      moreMenuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
    );
    if (!items.length) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") { e.preventDefault(); items[(idx + 1) % items.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); items[(idx - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); items[items.length - 1]?.focus(); }
  }, []);

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

  // URL items (e.g. /studio) match on pathname; section items on the section
  // key. "catch" survives only as a deep-link alias for the Cards screen
  // (Catch tab) — highlight Cards for it.
  const isItemActive = (item: NavItem) =>
    item.url
      ? typeof window !== "undefined" && window.location.pathname === item.url
      : section === item.key || (item.key === "cards" && section === "catch");
  const moreActive = MORE_ITEMS.some(isItemActive);

  const goPricing = () => {
    setBalanceOpen(false);
    setMoreOpen(false);
    setSection("home");
    setTimeout(() => { document.querySelector(".pricing-root")?.scrollIntoView({ behavior: "smooth" }); }, 600);
  };

  const itemStyle = (isActive: boolean): React.CSSProperties => ({
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
  });

  const activeBar = (
    <div style={{
      position: "absolute", bottom: -1, left: 0, right: 0,
      height: 2, background: "#211A12",
      transformOrigin: "left",
      animation: "edUnderlineIn 220ms cubic-bezier(.2,.8,.2,1) both",
    }} />
  );

  const renderItem = (item: NavItem, extraClass = "") => {
    const isActive = isItemActive(item);
    const inner = (
      <>
        {item.label}
        {isActive && activeBar}
      </>
    );
    return item.url ? (
      <a key={item.key} className={`nav-btn ${extraClass}`} href={item.url} aria-current={isActive ? "page" : undefined} style={itemStyle(isActive)}>
        {inner}
      </a>
    ) : (
      <button key={item.key} className={`nav-btn ${extraClass}`} onClick={() => setSection(item.key)} aria-current={isActive ? "page" : undefined} style={itemStyle(isActive)}>
        {inner}
      </button>
    );
  };

  return (
    <>
      <style>{`
        .nav-btn:active { transform: translateY(1px); }
        .nav-credits:hover { border-color: rgba(154,78,30,.5) !important; background: #F5EFE2 !important; }
        .nav-more-item:hover, .nav-more-item:focus-visible { background: #F5EFE2 !important; }
        /* Wide desktop: every section fits inline without scrolling — show the
           full strip and hide the More menu. Below 1360px the overflow tabs
           collapse into More (NO horizontal scroll strip anywhere — the old
           scroller hid 5 of 9 tabs on mobile behind a decorative chevron). */
        @media (min-width: 1360px) {
          .nav-more-wrap { display: none !important; }
        }
        @media (max-width: 1359.98px) {
          /* Double selector: must out-rank the later ".nav-btn { display:… }"
             mobile rule (equal specificity + !important would lose on order). */
          .nav-btn.nav-inline-more { display: none !important; }
        }
        /* Hide the decorative COMPANION PROTOCOL badge before it can collide
           with the item strip on mid-width screens. */
        @media (max-width: 1520px) {
          .nav-desktop-badge { display: none !important; }
        }
        /* The balance row inside the More menu only appears when the chip in
           the strip is hidden (very narrow screens, see 520px rule below). */
        .nav-more-credits { display: none !important; }
        @media (max-width: 768px) {
          .nav-desktop-logo-text { display: none !important; }
          .nav-container { padding: 8px 12px !important; gap: 10px !important; }
          .nav-items-wrap { justify-content: flex-start !important; gap: 2px !important; }
          /* ≥44px touch targets. */
          .nav-btn { padding: 13px 7px !important; font-size: 13px !important; line-height: 1.15; min-height: 44px; display: inline-flex !important; align-items: center; }
          .nav-credits { font-size: 13px !important; padding: 4px 8px !important; }
        }
        @media (max-width: 520px) {
          /* The strip is at its tightest — the credit chip moves into the More
             menu (same balance, same Credits & Points jump) so the 4 primary
             tabs + More never overflow the viewport. Wallet button gets REAL
             compact sizing (the old scale(0.8) transform shrank it visually
             but its full layout width still squeezed the tab strip until the
             More button sat underneath the wallet button). */
          .nav-credits-wrap { display: none !important; }
          .nav-more-credits { display: flex !important; }
          .nav-wallet [data-rk] button { font-size: 13px !important; padding: 8px 10px !important; }
        }
        @media (max-width: 480px) {
          .nav-container { padding: 6px 8px !important; gap: 6px !important; }
          .nav-logo-img { width: 30px !important; height: 30px !important; }
          .nav-btn { padding: 13px 5px !important; font-size: 12.5px !important; }
        }
        @media (max-width: 430px) {
          .nav-container { gap: 4px !important; }
          .nav-btn { padding: 13px 4px !important; font-size: 12px !important; }
          /* Phone width: the mascot chip yields its slot to the tabs — the
             Home tab (and the wallet CTA) keep every destination reachable. */
          .nav-logo-btn { display: none !important; }
        }
        @media (max-width: 360px) {
          .nav-btn { padding: 13px 2px !important; font-size: 11px !important; }
          .nav-items-wrap { gap: 0 !important; }
          .nav-wallet [data-rk] button { font-size: 12px !important; padding: 7px 8px !important; }
        }
      `}</style>
      <nav
        className="nav-container"
        style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
          display: "flex", alignItems: "center", gap: 18,
          // Paper chrome over the field page — the old field-on-field bg made
          // the nav edge read as unfinished/empty. Crisp ink rule + faint drop
          // keeps the bar reading as a printed masthead layer.
          padding: "11px 22px", background: "rgba(251,246,236,0.97)",
          backdropFilter: "blur(8px)",
          borderBottom: "1px solid rgba(33,26,18,.18)",
          boxShadow: "0 10px 24px -20px rgba(33,26,18,.35)",
        }}
      >
        {/* Logo */}
        <button
          type="button"
          className="nav-logo-btn"
          aria-label="Go to home"
          style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flexShrink: 0, border: 0, padding: 0, background: "transparent", color: "inherit", font: "inherit" }}
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
            fontSize: 13, padding: "3px 9px", borderRadius: 20,
            color: "#9A4E1E",
            fontFamily: "var(--ed-m)", fontWeight: 700, letterSpacing: "0.12em",
            border: "1px solid rgba(154,78,30,0.4)",
          }}>
            COMPANION PROTOCOL
          </span>
        </button>

        {/* Nav items — 4 primary tabs + More (all nine inline on wide desktop).
            No horizontal scrolling in any viewport. */}
        <div className="nav-items-wrap" style={{
          display: "flex", gap: 17, alignItems: "center", justifyContent: "center",
          flex: 1, minWidth: 0,
        }}>
          {PRIMARY_ITEMS.map((item) => renderItem(item))}
          {MORE_ITEMS.map((item) => renderItem(item, "nav-inline-more"))}

          {/* More — a real, keyboard-operable menu button (replaces the old
              decorative "›" scroll hint that wasn't interactive). */}
          <div ref={moreRef} className="nav-more-wrap" style={{ position: "relative", flexShrink: 0 }}>
            <button
              ref={moreBtnRef}
              className="nav-btn"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              aria-controls="nav-more-menu"
              onClick={() => setMoreOpen((v) => !v)}
              style={itemStyle(moreActive)}
            >
              More <span aria-hidden="true" style={{ fontSize: 10, verticalAlign: 1 }}>{moreOpen ? "▴" : "▾"}</span>
              {moreActive && activeBar}
            </button>
            {moreOpen && (
              <div
                id="nav-more-menu"
                ref={moreMenuRef}
                role="menu"
                aria-label="More sections"
                onKeyDown={handleMenuKey}
                style={{
                  position: "absolute", top: "calc(100% + 8px)", right: -8, zIndex: 200,
                  background: "var(--ed-paper, #FBF6EC)",
                  borderRadius: 14, border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                  boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
                  padding: 6, minWidth: 212,
                  animation: "slideIn 0.18s ease",
                }}
              >
                {MORE_ITEMS.map((item) => {
                  const isActive = isItemActive(item);
                  return (
                    <button
                      key={item.key}
                      role="menuitem"
                      className="nav-more-item"
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => { setMoreOpen(false); setSection(item.key); }}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        width: "100%", minHeight: 44, padding: "10px 14px",
                        background: "transparent", border: "none", borderRadius: 10,
                        cursor: "pointer", textAlign: "left",
                        fontFamily: "var(--ed-body)", fontSize: 14,
                        fontWeight: isActive ? 700 : 500,
                        color: isActive ? "#211A12" : "#5C5140",
                        transition: "background 140ms ease",
                      }}
                    >
                      {item.label}
                      {isActive && (
                        <span aria-hidden="true" style={{
                          width: 6, height: 6, borderRadius: "50%",
                          background: "#BE4F28", flexShrink: 0, marginLeft: 10,
                        }} />
                      )}
                    </button>
                  );
                })}
                {credits !== null && credits !== undefined && (
                  <div className="nav-more-credits" style={{ flexDirection: "column" }}>
                    <div style={{ height: 1, background: "var(--ed-hair, rgba(33,26,18,.13))", margin: "6px 8px" }} />
                    <button
                      role="menuitem"
                      className="nav-more-item"
                      onClick={goPricing}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        width: "100%", minHeight: 44, padding: "10px 14px",
                        background: "transparent", border: "none", borderRadius: 10,
                        cursor: "pointer", textAlign: "left",
                        fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700,
                        color: "#9A4E1E",
                      }}
                    >
                      <span>◎ {displayCredits.toLocaleString()} <span style={{ opacity: 0.7 }}>cr</span></span>
                      <span style={{ fontFamily: "var(--ed-body)", fontWeight: 600, color: "#7A6E5A" }}>Credits &amp; Points</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {credits !== null && credits !== undefined && (
            <div ref={balanceRef} className="nav-credits-wrap" style={{ position: "relative", flexShrink: 0, marginLeft: 4 }}>
              <button
                className="nav-credits"
                aria-label={`Credit balance: ${credits}`}
                aria-expanded={balanceOpen}
                aria-haspopup="true"
                onClick={() => setBalanceOpen((v: boolean) => !v)}
                style={{
                  fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700,
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
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", opacity: 0.7, marginLeft: 4 }}>cr</span>
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
                    fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700,
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
                    {credits.toLocaleString()} <span style={{ fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, color: "#9A4E1E", letterSpacing: "0.06em" }}>credits</span>
                  </div>
                  {/* SCRUM-99: this is the in-app credit balance, NOT the connected
                      wallet's on-chain balance — label it so users don't conflate them. */}
                  <div style={{ fontFamily: "var(--ed-body)", fontSize: 13, color: "#7A6E5A", lineHeight: 1.45 }}>
                    In-app credits for AI generation — not your wallet balance.
                  </div>
                  <div style={{
                    height: 1, background: "var(--ed-hair, rgba(33,26,18,.13))", margin: "14px 0",
                  }} />
                  <button
                    className="ed-press"
                    onClick={goPricing}
                    style={{
                      width: "100%", padding: "11px 14px", borderRadius: 12, border: "none",
                      background: "linear-gradient(180deg, #F49B2A, #E27D0C)",
                      color: "#FFF8EE", fontFamily: "var(--ed-body)", fontSize: 13.5,
                      fontWeight: 600, cursor: "pointer", marginBottom: 0,
                      boxShadow: "0 8px 18px -10px rgba(226,125,12,.7)",
                      transition: "all 0.2s ease",
                    }}
                  >
                    Credits &amp; Points
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* "← Landing" button removed — /landing/ doesn't exist, the home itself is the landing. */}

        <div className="nav-wallet" style={{ flexShrink: 0 }}>
          {/* "Connect" (not "Connect Wallet") — the shorter label is what lets
              the 4 primary tabs + More fit a 360-430px viewport with no
              horizontal scrolling. */}
          <ConnectButton
            label="Connect"
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
