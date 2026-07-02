"use client";

import { useState } from "react";

// Share / download / copy actions for a public trading-card page.
// Share is opt-in by construction: it opens X's compose box pre-filled (the user
// must press Post). The image unfurls from this page's opengraph-image OG tag.

export default function CardActions({ petId, name, imgUrl, appUrl }: { petId: number; name: string; imgUrl: string; appUrl: string }) {
  const [copied, setCopied] = useState(false);
  const shareUrl = `${appUrl}/card/${petId}`;

  const shareToX = () => {
    const text = `${name}'s trading card 🃏 — raise & battle your own AI pet`;
    const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}&hashtags=MyAIPet`;
    window.open(intent, "_blank", "width=600,height=420");
  };

  const copyLink = () => {
    navigator.clipboard?.writeText(shareUrl).then(() => setCopied(true)).catch(() => {});
  };

  const download = async () => {
    try {
      const res = await fetch(imgUrl);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${name.replace(/\s+/g, "-").toLowerCase()}-card.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch { /* non-fatal */ }
  };

  // Collectible Editorial on the warm-dark vault: paper/ink primary (strong
  // secondary next to the page's gradient CTA), foil-gold outline ghosts.
  const FONT = "var(--ed-body, 'Hanken Grotesk'), 'Hanken Grotesk', system-ui, sans-serif";
  const primary: React.CSSProperties = { padding: "11px 20px", borderRadius: 999, border: "none", background: "#FBF6EC", color: "#211A12", fontFamily: FONT, fontWeight: 800, fontSize: 14, cursor: "pointer", boxShadow: "0 12px 22px -14px rgba(0,0,0,.8)" };
  const ghost: React.CSSProperties = { padding: "11px 18px", borderRadius: 999, border: "1px solid rgba(232,199,126,0.4)", background: "transparent", color: "#E8C77E", fontFamily: FONT, fontWeight: 700, fontSize: 14, cursor: "pointer" };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
      <button onClick={shareToX} style={primary}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ verticalAlign: "-1px" }}>
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.656l-5.214-6.817-5.967 6.817H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        &nbsp;Share on X
      </button>
      <button onClick={download} style={ghost}>Download PNG</button>
      <button onClick={copyLink} style={ghost}>{copied ? "Link copied ✓" : "Copy link"}</button>
    </div>
  );
}
