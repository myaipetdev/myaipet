"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAuth } from "@/hooks/useAuth";
import Icon from "@/components/Icon";
import DemoPet from "@/components/DemoPet";
import PetClawPreview from "@/components/PetClawPreview";
import CommunityPreview from "@/components/CommunityPreview";
import TourMyPet from "@/components/TourMyPet";
import CollectibleFrame from "@/components/editorial/CollectibleFrame";
import { isTourActive, TOUR_ALLOWLIST } from "@/lib/tour";

// Session-global guard: the address we've already auto-prompted for a signature.
// Module scope (not a per-component ref) so it survives WalletGate remounts —
// each gated section mounts its own WalletGate, so a per-instance ref re-fired
// the signature prompt on every navigation.
let autoAuthTriedFor: string | null = null;

function friendlyError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("rejected") || lower.includes("denied") || lower.includes("refused"))
    return "Signature was rejected. Please tap Sign In to try again.";
  if (lower.includes("nonce"))
    return "Session expired. Please try again.";
  return "Authentication failed. Please try again.";
}

// Slim fixed DEMO-TOUR banner — shown over allowlisted sections in tour mode
// while no wallet is connected. Editorial terracotta chip; the inline Connect
// button is the "make it yours" exit. It vanishes the moment a wallet connects
// (this whole branch only renders when !isConnected).
function TourBanner() {
  return (
    <div style={{
      position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 140,
      display: "flex", alignItems: "center", justifyContent: "center", gap: 14, flexWrap: "wrap",
      padding: "10px 18px", background: "rgba(190,79,40,.96)",
      borderTop: "1px solid rgba(252,233,207,.35)", boxShadow: "0 -10px 30px -18px rgba(80,40,10,.7)",
      backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
    }}>
      <span style={{ display: "flex", alignItems: "center", gap: 9, fontFamily: "var(--ed-body)", fontSize: 13.5, color: "#FFF8EE", lineHeight: 1.35, textAlign: "center" }}>
        <span style={{
          fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 700, letterSpacing: ".1em",
          color: "#BE4F28", background: "#FCE9CF", borderRadius: 7, padding: "3px 8px", whiteSpace: "nowrap",
        }}>DEMO TOUR</span>
        <span>You&apos;re browsing a live sample — connect a wallet to make it yours.</span>
      </span>
      <ConnectButton chainStatus="none" showBalance={false} label="Connect wallet" />
    </div>
  );
}

export default function WalletGate({ children, section }: any) {
  const { isConnected, address } = useAccount();
  const { isAuthenticated, isAuthenticating, authenticate, error } = useAuth();

  // Guest tour: sticky once ?tour=1 is seen (persisted in sessionStorage).
  // Read once on mount so in-SPA navigation between sections keeps it on.
  const [tourOn] = useState(() => isTourActive());

  // DEV ONLY: uncomment to bypass wallet gate for local testing
  const isDev = process.env.NODE_ENV === "development";

  // Auto-prompt for a signature at most ONCE per connected address per page
  // session — never again on remount/navigation.
  useEffect(() => {
    if (isDev) return;
    if (isConnected && address && !isAuthenticated && !isAuthenticating && autoAuthTriedFor !== address) {
      autoAuthTriedFor = address;
      authenticate();
    }
    if (!isConnected) {
      autoAuthTriedFor = null;
    }
  }, [isConnected, address, isAuthenticated, isAuthenticating, authenticate, isDev]);

  // ?gate=1 lets dev preview the logged-out gate UIs (DemoPet etc.) that the
  // NODE_ENV bypass below would otherwise make unreachable locally
  const forceGate = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("gate") === "1";
  if (isDev && !forceGate) return children;
  if (isConnected && isAuthenticated) return children;

  // ── Guest tour: with ?tour=1 and no wallet, allowlisted sections render a
  // READ-ONLY, DEMO-badged preview + a slim fixed banner instead of the wall.
  // "my pet" needs an owned pet, so it renders the purpose-built demo preview
  // (TourMyPet) rather than the real MyPetEditorial (which would 401). The
  // other allowlisted sections already fall back gracefully logged-out
  // (community → Pet Square on public pets; worldcup → public bracket), so we
  // hand them their real children. Non-allowlisted / owner-API sections keep
  // the gate. Once a wallet connects, this branch stops matching and the banner
  // disappears on its own. ──
  if (!isConnected && tourOn && TOUR_ALLOWLIST.has(section)) {
    return (
      <>
        {section === "my pet" ? <TourMyPet /> : children}
        <TourBanner />
      </>
    );
  }

  // ── Preview-before-wall: cold visitors should experience the value (a living
  // demo pet; the PetClaw sovereignty showcase) BEFORE being asked for a wallet,
  // with the right next-step (Connect / Sign In) inline. ──
  //
  // Transient 401 / expired token (isConnected && error): we intentionally do
  // NOT auto-retry authenticate() here. authenticate() calls signMessageAsync(),
  // which OPENS the wallet's signature modal — a delayed automatic retry would
  // pop an unsolicited signature prompt (the exact loop `autoAuthTriedFor`
  // exists to prevent). Instead the section previews render with an explicit
  // sign-in cta; PetClawPreview surfaces it in a top banner + friendly error
  // note so a returning owner reads this as "signed out", not "console gone".
  if (section === "my pet" || section === "sovereignty" || section === "community") {
    const ctaBtnStyle: React.CSSProperties = {
      padding: "13px 30px", borderRadius: 13, border: "none",
      background: "linear-gradient(180deg,#F49B2A,#E27D0C)", color: "#FFF8EE",
      fontFamily: "var(--ed-disp)", fontSize: 15, fontWeight: 800,
      cursor: isAuthenticating ? "wait" : "pointer", boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
    };
    const verb = section === "sovereignty" ? "claim it" : section === "community" ? "join" : "adopt";
    let cta: ReactNode;
    let ctaNote: string | undefined;
    if (!isConnected) {
      cta = <ConnectButton chainStatus="none" showBalance={false} label={`Connect wallet to ${verb}`} />;
    } else if (error) {
      cta = (
        <button onClick={() => { autoAuthTriedFor = null; authenticate(); }} disabled={isAuthenticating} style={ctaBtnStyle}>
          Sign in to {verb}
        </button>
      );
      ctaNote = `${friendlyError(error)} No gas — identity only.`;
    } else {
      // connected, signing or checking
      cta = (
        <button onClick={() => { autoAuthTriedFor = null; authenticate(); }} disabled={isAuthenticating} style={ctaBtnStyle}>
          {isAuthenticating ? "Check your wallet…" : `Sign in to ${verb}`}
        </button>
      );
      ctaNote = "Approve the signature in your wallet — no gas, identity only.";
    }
    if (section === "sovereignty") return <PetClawPreview cta={cta} ctaNote={ctaNote} />;
    if (section === "community") return <CommunityPreview cta={cta} ctaNote={ctaNote} />;
    return <DemoPet cta={cta} ctaNote={ctaNote} />;
  }

  if (isConnected && (isAuthenticating || (!isAuthenticated && !error))) {
    return (
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "140px 24px 60px", textAlign: "center" }}>
        <div style={{ fontSize: 64, marginBottom: 24, opacity: 0.7, animation: "petFloat 6s ease-in-out infinite" }}>
          <Icon name="compass" size={64} />
        </div>
        <h2 style={{ fontFamily: "var(--ed-disp)", fontSize: 28, fontWeight: 700, color: "#211A12", marginBottom: 12 }}>
          Verifying...
        </h2>
        <p style={{ fontFamily: "var(--ed-body)", fontSize: 16, color: "#7A6E5A", lineHeight: 1.8, marginBottom: 28 }}>
          {isAuthenticating
            ? "Please sign the message in your wallet."
            : "Checking authentication..."}
        </p>
        <style>{`@keyframes petFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }`}</style>
      </div>
    );
  }

  if (isConnected && error) {
    return (
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "140px 24px 60px", textAlign: "center" }}>
        <div style={{ fontSize: 64, marginBottom: 24, opacity: 0.7, animation: "petFloat 6s ease-in-out infinite" }}>
          <Icon name="lock" size={64} />
        </div>
        <h2 style={{ fontFamily: "var(--ed-disp)", fontSize: 28, fontWeight: 700, color: "#211A12", marginBottom: 12 }}>
          Sign In Required
        </h2>
        <p style={{ fontFamily: "var(--ed-body)", fontSize: 16, color: "#7A6E5A", lineHeight: 1.8, marginBottom: 20 }}>
          Wallet connected. Sign in to verify your identity.
        </p>
        <p style={{ fontFamily: "var(--ed-body)", fontSize: 14, color: "#dc2626", marginBottom: 20 }}>
          {friendlyError(error)}
        </p>
        <div style={{ display: "inline-block" }}>
          <button
            onClick={() => { autoAuthTriedFor = null; authenticate(); }}
            disabled={isAuthenticating}
            style={{
              padding: "14px 40px", borderRadius: 14, border: "none",
              background: "linear-gradient(180deg,#F49B2A,#E27D0C)",
              color: "#FFF8EE", fontFamily: "var(--ed-disp)",
              fontSize: 17, fontWeight: 600, cursor: "pointer",
            }}
          >
            Sign In
          </button>
        </div>
        <p style={{ fontFamily: "var(--ed-body)", fontSize: 14, color: "#9A7B4E", marginTop: 24 }}>
          No gas fees required. Wallet is used for identity only.
        </p>
        <style>{`@keyframes petFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }`}</style>
      </div>
    );
  }

  // ── Agent Office guest gate ── the old generic wall read like an unfilled
  // template ("access office."). Lead with a short editorial teaser of what the
  // Office actually is, THEN the connect wall with real, specific copy.
  if (section === "office") {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "132px 24px 60px", textAlign: "center" }}>
        <div style={{ fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "#BE4F28", marginBottom: 12 }}>
          Agent Office · Mission Control
        </div>
        <h2 style={{ fontFamily: "var(--ed-disp)", fontSize: 30, fontWeight: 800, color: "#211A12", marginBottom: 14, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
          Run your pet&apos;s whole operation from one board
        </h2>
        <p style={{ fontFamily: "var(--ed-body)", fontSize: 16, color: "#5C5140", lineHeight: 1.7, maxWidth: 470, margin: "0 auto 30px" }}>
          The Agent Office is your mission-control desk: track the five pillars,
          move tasks across the Kanban, manage the staff roster and cron
          schedules, and dispatch new work from a live board.
        </p>
        <div style={{ fontSize: 52, marginBottom: 18, opacity: 0.7, animation: "petFloat 6s ease-in-out infinite" }}>
          <Icon name="lock" size={52} />
        </div>
        <p style={{ fontFamily: "var(--ed-body)", fontSize: 16, color: "#7A6E5A", lineHeight: 1.8, marginBottom: 24 }}>
          Connect your wallet to open the Agent Office.
        </p>
        <div style={{ display: "inline-block" }}>
          <ConnectButton chainStatus="none" showBalance={false} label="Connect Wallet" />
        </div>
        <p style={{ fontFamily: "var(--ed-body)", fontSize: 14, color: "#9A7B4E", marginTop: 22 }}>
          No gas fees required. Wallet is used for identity only.
        </p>
        <style>{`@keyframes petFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }`}</style>
      </div>
    );
  }

  // ── Cards guest gate ── the bare connect-wall gave a collector nothing to
  // look at. Show two clearly-labelled SAMPLE cards (never real inventory) so
  // the deck's craft is visible before the wall.
  if (section === "cards") {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "116px 24px 60px", textAlign: "center" }}>
        <div style={{ fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "#BE4F28", marginBottom: 20 }}>
          Sample cards · yours appear here once you connect
        </div>
        <div style={{ display: "flex", gap: 22, justifyContent: "center", marginBottom: 36, flexWrap: "wrap" }}>
          {[
            { label: "SAMPLE · COMMON", tilt: -4, lvl: 3 },
            { label: "SAMPLE · RARE", tilt: 4, lvl: 12 },
          ].map((s) => (
            <div key={s.label} style={{ position: "relative" }}>
              <CollectibleFrame
                photoUrl="/mascot.jpg" level={s.lvl}
                speciesLabel="COMPANION" elementLabel="SAMPLE"
                width={148} tilt={s.tilt} float={false} seal={false} holo={false}
              />
              <span style={{
                position: "absolute", top: 6, left: "50%", transform: "translateX(-50%)",
                fontFamily: "var(--ed-m)", fontSize: 10, fontWeight: 700, letterSpacing: ".1em",
                color: "#BE4F28", background: "#FCE9CF", borderRadius: 6, padding: "3px 8px",
                whiteSpace: "nowrap", boxShadow: "3px 4px 0 rgba(33,26,18,.14)",
              }}>{s.label}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 46, marginBottom: 16, opacity: 0.7 }}>
          <Icon name="lock" size={46} />
        </div>
        <h2 style={{ fontFamily: "var(--ed-disp)", fontSize: 26, fontWeight: 800, color: "#211A12", marginBottom: 12, letterSpacing: "-0.02em" }}>
          Your card deck
        </h2>
        <p style={{ fontFamily: "var(--ed-body)", fontSize: 16, color: "#7A6E5A", lineHeight: 1.8, marginBottom: 24 }}>
          Cards are minted from the pets you actually raise and catch. Connect your wallet to open your deck.
        </p>
        <div style={{ display: "inline-block" }}>
          <ConnectButton chainStatus="none" showBalance={false} label="Connect Wallet" />
        </div>
        <p style={{ fontFamily: "var(--ed-body)", fontSize: 14, color: "#9A7B4E", marginTop: 22 }}>
          No gas fees required. Wallet is used for identity only.
        </p>
      </div>
    );
  }

  const sectionLabels: any = {
    "my pet": "My Pet",
    create: "Create",
    community: "Community",
    workbench: "the Agent Workbench",
    worldcup: "the World Cup event",
    cards: "your card deck",
    agent: "the Agent dashboard",
    chat: "Chat",
    season: "Season Rewards",
  };

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "140px 24px 60px", textAlign: "center" }}>
      <div style={{ fontSize: 64, marginBottom: 24, opacity: 0.7, animation: "petFloat 6s ease-in-out infinite" }}>
        <Icon name="lock" size={64} />
      </div>
      <h2 style={{ fontFamily: "var(--ed-disp)", fontSize: 28, fontWeight: 700, color: "#211A12", marginBottom: 12 }}>
        Connect Your Wallet
      </h2>
      <p style={{ fontFamily: "var(--ed-body)", fontSize: 16, color: "#7A6E5A", lineHeight: 1.8, marginBottom: 28 }}>
        Connect your wallet to access{" "}
        <span style={{ color: "#211A12", fontWeight: 800 }}>{sectionLabels[section] || section}</span>.
      </p>
      <div style={{ display: "inline-block" }}>
        <ConnectButton chainStatus="none" showBalance={false} label="Connect Wallet" />
      </div>
      <p style={{ fontFamily: "var(--ed-body)", fontSize: 14, color: "#9A7B4E", marginTop: 24 }}>
        No gas fees required. Wallet is used for identity only.
      </p>
      <style>{`@keyframes petFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }`}</style>
    </div>
  );
}
