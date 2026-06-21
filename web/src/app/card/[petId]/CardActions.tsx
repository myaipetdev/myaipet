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

  const primary: React.CSSProperties = { padding: "11px 20px", borderRadius: 999, border: "none", background: "#fff", color: "#0f0f14", fontWeight: 800, fontSize: 14, cursor: "pointer" };
  const ghost: React.CSSProperties = { padding: "11px 18px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
      <button onClick={shareToX} style={primary}>𝕏 &nbsp;Share on X</button>
      <button onClick={download} style={ghost}>Download PNG</button>
      <button onClick={copyLink} style={ghost}>{copied ? "Link copied ✓" : "Copy link"}</button>
    </div>
  );
}
