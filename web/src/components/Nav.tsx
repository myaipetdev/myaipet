"use client";

import { useState, useRef, useEffect } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Icon from "@/components/Icon";

const LOGO_SRC = "/mascot.jpg";

const NAV_ITEMS = [
  { key: "home", label: "Home" },
  { key: "my pet", label: "My Pet" },
  { key: "create", label: "My Contents" },
  { key: "community", label: "Community" },
  { key: "agent", label: "Agent" },
  { key: "sovereignty", label: "Sovereignty" },
];

export default function Nav({ section, setSection, credits }: any) {
  const [balanceOpen, setBalanceOpen] = useState(false);
  const balanceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (balanceRef.current && !balanceRef.current.contains(e.target as Node)) {
        setBalanceOpen(false);
      }
    }
    if (balanceOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [balanceOpen]);

  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .nav-desktop-logo-text { display: none !important; }
          .nav-desktop-badge { display: none !important; }
          .nav-container { padding: 8px 12px !important; }
          .nav-items-wrap { overflow-x: auto !important; -webkit-overflow-scrolling: touch; scrollbar-width: none; mask-image: linear-gradient(to right, black 85%, transparent); -webkit-mask-image: linear-gradient(to right, black 85%, transparent); }
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
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 24px", background: "rgba(250,247,242,0.92)",
          backdropFilter: "blur(24px)", borderBottom: "1px solid rgba(0,0,0,0.06)",
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flexShrink: 0 }}
          onClick={() => setSection("home")}>
          <img
            className="nav-logo-img"
            src={LOGO_SRC} alt="MY AI PET"
            style={{
              width: 34, height: 34, borderRadius: 10, objectFit: "cover",
              border: "2px solid rgba(251,191,36,0.25)",
              boxShadow: "0 0 12px rgba(251,191,36,0.12)",
              background: "linear-gradient(135deg, #fef3c7, #fde68a)",
            }}
          />
          <span className="nav-desktop-logo-text" style={{
            fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 15,
            color: "#1a1a2e", letterSpacing: "-0.02em",
          }}>
            MY AI PET
          </span>
          <span className="nav-desktop-badge" style={{
            fontSize: 8, padding: "2px 8px", borderRadius: 16,
            background: "linear-gradient(135deg, rgba(251,191,36,0.12), rgba(139,92,246,0.08))",
            color: "#d97706",
            fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, letterSpacing: "0.06em",
            border: "1px solid rgba(251,191,36,0.2)",
          }}>
            CompanionFi
          </span>
        </div>

        {/* Nav items — scrollable on mobile */}
        <div className="nav-items-wrap" style={{
          display: "flex", gap: 2, alignItems: "center",
          padding: 3, borderRadius: 12,
          background: "rgba(0,0,0,0.03)",
          border: "1px solid rgba(0,0,0,0.06)",
          flex: 1, minWidth: 0,
        }}>
          {NAV_ITEMS.map((item) => {
            const isActive = section === item.key;
            return (
              <button
                className="nav-btn"
                key={item.key}
                onClick={() => setSection(item.key)}
                style={{
                  background: isActive ? "rgba(251,191,36,0.12)" : "transparent",
                  border: "none", cursor: "pointer",
                  borderRadius: 9, padding: "7px 14px",
                  fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 500,
                  color: isActive ? "#b45309" : "rgba(26,26,46,0.4)",
                  transition: "all 0.2s ease",
                  position: "relative", whiteSpace: "nowrap", flexShrink: 0,
                }}
              >
                {item.label}
                {isActive && (
                  <div style={{
                    position: "absolute", bottom: 1, left: "50%", transform: "translateX(-50%)",
                    width: 12, height: 2, borderRadius: 1,
                    background: "#fbbf24", opacity: 0.6,
                  }} />
                )}
              </button>
            );
          })}

          {credits !== null && credits !== undefined && (
            <div ref={balanceRef} style={{ position: "relative", flexShrink: 0, marginLeft: 4 }}>
              <span
                className="nav-credits"
                onClick={() => setBalanceOpen((v: boolean) => !v)}
                style={{
                  fontFamily: "mono", fontSize: 11, color: "#b45309", fontWeight: 600,
                  padding: "5px 10px", borderRadius: 8,
                  background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)",
                  whiteSpace: "nowrap", cursor: "pointer",
                  display: "inline-block",
                  transition: "all 0.2s ease",
                }}
              >
                <Icon name="coin" size={14} /> {credits}
              </span>
              {balanceOpen && (
                <div style={{
                  position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 200,
                  background: "rgba(255,255,255,0.97)", backdropFilter: "blur(20px)",
                  borderRadius: 14, border: "1px solid rgba(0,0,0,0.08)",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.1)",
                  padding: "20px", minWidth: 220,
                  animation: "slideIn 0.2s ease",
                }}>
                  <div style={{
                    fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 600,
                    color: "rgba(26,26,46,0.5)", marginBottom: 8,
                  }}>
                    Your Balance
                  </div>
                  <div style={{
                    fontFamily: "'Space Grotesk',sans-serif", fontSize: 28, fontWeight: 700,
                    color: "#1a1a2e", marginBottom: 4,
                  }}>
                    {credits.toLocaleString()} <span style={{ fontSize: 14, color: "#b45309" }}>$PET</span>
                  </div>
                  <div style={{
                    height: 1, background: "rgba(0,0,0,0.06)", margin: "14px 0",
                  }} />
                  <button
                    onClick={() => { setBalanceOpen(false); setSection("home"); setTimeout(() => { document.querySelector(".pricing-root")?.scrollIntoView({ behavior: "smooth" }); }, 100); }}
                    style={{
                      width: "100%", padding: "10px 14px", borderRadius: 10, border: "none",
                      background: "linear-gradient(135deg, #f59e0b, #d97706)",
                      color: "white", fontFamily: "'Space Grotesk',sans-serif", fontSize: 13,
                      fontWeight: 600, cursor: "pointer", marginBottom: 8,
                      transition: "all 0.2s ease",
                    }}
                  >
                    Get More $PET
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

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
