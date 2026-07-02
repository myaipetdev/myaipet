"use client";

import { useState } from "react";

export default function ShareButtons({ matchup, you, opp, winner, appUrl }: { matchup: string; you: string; opp: string; winner: string; appUrl: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${appUrl}/card/battle/${matchup}`;

  const shareToX = () => {
    const text = `${winner} won the duel! ${you} ⚔️ ${opp} 🃏 — raise & battle your own AI pet`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}&hashtags=MyAIPet`, "_blank", "width=600,height=420");
  };
  const copy = () => navigator.clipboard?.writeText(url).then(() => setCopied(true)).catch(() => {});

  // Collectible Editorial on the warm-dark vault: paper/ink primary (strong
  // secondary next to the page's gradient CTA), foil-gold outline ghost.
  const FONT = "var(--ed-body, 'Hanken Grotesk'), 'Hanken Grotesk', system-ui, sans-serif";
  const primary: React.CSSProperties = { padding: "11px 20px", borderRadius: 999, border: "none", background: "#FBF6EC", color: "#211A12", fontFamily: FONT, fontWeight: 800, fontSize: 14, cursor: "pointer", boxShadow: "0 12px 22px -14px rgba(0,0,0,.8)" };
  const ghost: React.CSSProperties = { padding: "11px 18px", borderRadius: 999, border: "1px solid rgba(232,199,126,0.4)", background: "transparent", color: "#E8C77E", fontFamily: FONT, fontWeight: 700, fontSize: 14, cursor: "pointer" };

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
      <button onClick={shareToX} style={primary}>𝕏 &nbsp;Share result</button>
      <button onClick={copy} style={ghost}>{copied ? "Link copied ✓" : "Copy link"}</button>
    </div>
  );
}
