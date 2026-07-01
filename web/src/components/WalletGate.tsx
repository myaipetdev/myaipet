"use client";

import { useEffect, type ReactNode } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAuth } from "@/hooks/useAuth";
import Icon from "@/components/Icon";
import DemoPet from "@/components/DemoPet";
import PetClawPreview from "@/components/PetClawPreview";
import CommunityPreview from "@/components/CommunityPreview";

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

export default function WalletGate({ children, section }: any) {
  const { isConnected, address } = useAccount();
  const { isAuthenticated, isAuthenticating, authenticate, error } = useAuth();

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

  if (isDev) return children;
  if (isConnected && isAuthenticated) return children;

  // ── Preview-before-wall: cold visitors should experience the value (a living
  // demo pet; the PetClaw sovereignty showcase) BEFORE being asked for a wallet,
  // with the right next-step (Connect / Sign In) inline. ──
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
    if (section === "sovereignty") return <PetClawPreview cta={cta} />;
    if (section === "community") return <CommunityPreview cta={cta} />;
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

  const sectionLabels: any = {
    "my pet": "My Pet",
    create: "Create",
    community: "Community",
    arena: "Arena",
    workbench: "the Agent Workbench",
    worldcup: "the World Cup event",
    cards: "your card deck",
    catch: "Catch",
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
        <span style={{ color: "#BE4F28", fontWeight: 600 }}>{sectionLabels[section] || section}</span>.
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
