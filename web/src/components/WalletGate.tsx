"use client";

import { useEffect, useRef } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAuth } from "@/hooks/useAuth";

function friendlyError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("rejected") || lower.includes("denied") || lower.includes("refused"))
    return "Signature was rejected. Please tap Sign In to try again.";
  if (lower.includes("nonce"))
    return "Session expired. Please try again.";
  return "Authentication failed. Please try again.";
}

export default function WalletGate({ children, section }: any) {
  const { isConnected } = useAccount();
  const { isAuthenticated, isAuthenticating, authenticate, error } = useAuth();
  const autoAuthAttempted = useRef(false);

  // DEV ONLY: uncomment to bypass wallet gate for local testing
  const isDev = process.env.NODE_ENV === "development";

  useEffect(() => {
    if (isDev) return;
    if (isConnected && !isAuthenticated && !isAuthenticating && !autoAuthAttempted.current) {
      autoAuthAttempted.current = true;
      authenticate();
    }
    if (!isConnected) {
      autoAuthAttempted.current = false;
    }
  }, [isConnected, isAuthenticated, isAuthenticating, authenticate, isDev]);

  if (isDev) return children;
  if (isConnected && isAuthenticated) return children;

  if (isConnected && (isAuthenticating || (!isAuthenticated && !error))) {
    return (
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "140px 24px 60px", textAlign: "center" }}>
        <div style={{ fontSize: 64, marginBottom: 24, opacity: 0.7, animation: "petFloat 6s ease-in-out infinite" }}>
          🔄
        </div>
        <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 28, fontWeight: 700, color: "#1a1a2e", marginBottom: 12 }}>
          Verifying...
        </h2>
        <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, color: "rgba(26,26,46,0.5)", lineHeight: 1.8, marginBottom: 28 }}>
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
          🔐
        </div>
        <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 28, fontWeight: 700, color: "#1a1a2e", marginBottom: 12 }}>
          Sign In Required
        </h2>
        <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, color: "rgba(26,26,46,0.5)", lineHeight: 1.8, marginBottom: 20 }}>
          Wallet connected. Sign in to verify your identity.
        </p>
        <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, color: "#dc2626", marginBottom: 20 }}>
          {friendlyError(error)}
        </p>
        <div style={{ display: "inline-block" }}>
          <button
            onClick={() => { autoAuthAttempted.current = false; authenticate(); }}
            disabled={isAuthenticating}
            style={{
              padding: "14px 40px", borderRadius: 14, border: "none",
              background: "linear-gradient(135deg, #f59e0b, #d97706)",
              color: "white", fontFamily: "'Space Grotesk',sans-serif",
              fontSize: 17, fontWeight: 600, cursor: "pointer",
            }}
          >
            Sign In
          </button>
        </div>
        <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, color: "rgba(26,26,46,0.35)", marginTop: 24 }}>
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
  };

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "140px 24px 60px", textAlign: "center" }}>
      <div style={{ fontSize: 64, marginBottom: 24, opacity: 0.7, animation: "petFloat 6s ease-in-out infinite" }}>
        🔐
      </div>
      <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 28, fontWeight: 700, color: "#1a1a2e", marginBottom: 12 }}>
        Connect Your Wallet
      </h2>
      <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, color: "rgba(26,26,46,0.5)", lineHeight: 1.8, marginBottom: 28 }}>
        Connect your wallet to access{" "}
        <span style={{ color: "#d97706", fontWeight: 600 }}>{sectionLabels[section] || section}</span>.
      </p>
      <div style={{ display: "inline-block" }}>
        <ConnectButton chainStatus="none" showBalance={false} label="Connect Wallet" />
      </div>
      <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, color: "rgba(26,26,46,0.35)", marginTop: 24 }}>
        No gas fees required. Wallet is used for identity only.
      </p>
      <button
        onClick={() => {
          // Enable guest mode by faking dev auth
          localStorage.setItem("petagen_jwt", "guest-browse");
          localStorage.setItem("petagen_user", JSON.stringify({ wallet_address: "0xGuest", credits: 0 }));
          window.location.reload();
        }}
        style={{
          marginTop: 16, padding: "10px 24px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.08)",
          background: "transparent", color: "rgba(26,26,46,0.4)", fontFamily: "'Space Grotesk',sans-serif",
          fontSize: 13, cursor: "pointer",
        }}
      >
        Browse as Guest →
      </button>
      <style>{`@keyframes petFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }`}</style>
    </div>
  );
}
