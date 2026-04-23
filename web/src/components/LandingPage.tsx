"use client";

/**
 * Landing Page Component
 * Shows the full landing page for non-authenticated users
 * Loads the static landing HTML in an iframe for now
 * TODO: Convert to native React components later
 */

interface Props {
  onGetStarted: () => void;
}

export default function LandingPage({ onGetStarted }: Props) {
  return (
    <div style={{ position: "relative" }}>
      <iframe
        src="/landing/"
        style={{
          width: "100%",
          height: "100vh",
          border: "none",
          position: "fixed",
          top: 0,
          left: 0,
          zIndex: 90,
        }}
        title="PetClaw Landing"
      />

      {/* Floating "Launch App" button over the iframe */}
      <div style={{
        position: "fixed",
        top: 18,
        right: 24,
        zIndex: 100,
      }}>
        <button
          onClick={onGetStarted}
          style={{
            padding: "10px 20px",
            borderRadius: 999,
            border: "none",
            background: "linear-gradient(135deg, #f59e0b, #d97706)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "'Space Grotesk', sans-serif",
            boxShadow: "0 4px 20px rgba(245,158,11,0.3)",
            transition: "transform .2s",
          }}
          onMouseOver={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
          onMouseOut={(e) => (e.currentTarget.style.transform = "")}
        >
          Connect Wallet →
        </button>
      </div>
    </div>
  );
}
