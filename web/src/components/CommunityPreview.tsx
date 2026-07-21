"use client";

/**
 * Community preview — a live gallery of real creations for no-wallet visitors.
 * Stats + featured pets already render above (public); this adds the actual ART
 * so the place visibly breathes before the sign-in ask. Read-only: the `cta`
 * slot carries the gate's connect/sign-in control.
 *
 * Uses the same 3D album-sleeve carousel as the Community section (the owner's
 * favourite), gently auto-rotating as a teaser. No like button here — the
 * showcase feed is read-only; interaction requires sign-in.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlbumCarousel } from "@/components/SocialGallery";
import Reveal from "@/components/Reveal";
import { SEASON_SCHEDULED } from "@/lib/season";

interface Item { id: number; url: string; isVideo: boolean; likes: number; }

// Carousel item shape (a subset of the SocialGallery item) that the lightbox
// reads. The public showcase feed has no creator/prompt, so those stay absent.
interface AlbumItem { id: number; photo_url?: string; video_url?: string; likes_count: number; }

// ── Lightbox ── a read-only, accessible viewer for the public showcase. Shows
// the picked creation full-size (still or motion) over a dimmed backdrop, with
// the sign-in nudge kept in-frame so a browsing visitor still meets the ask.
// Collectible Editorial: paper mat, gold keyline well, hard offset shadow.
function PreviewLightbox({ item, onJoin, onClose }: {
  item: AlbumItem; onJoin: () => void; onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isVideo = !!item.video_url;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Community creation"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200, display: "flex",
        alignItems: "center", justifyContent: "center", padding: 20,
        background: "rgba(38,28,12,0.52)",
      }}
    >
      <style>{`@keyframes cpLightIn { from { opacity:0; transform:scale(.96) } to { opacity:1; transform:scale(1) } }`}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative", background: "#FBF6EC", borderRadius: 14, padding: 12,
          maxWidth: 560, width: "100%", boxShadow: "var(--ed-shadow-float, 0 40px 80px -30px rgba(40,28,12,.6))",
          animation: "cpLightIn .22s ease-out",
        }}
      >
        <button
          aria-label="Close"
          onClick={onClose}
          style={{
            position: "absolute", top: -14, right: -14, width: 34, height: 34, borderRadius: "50%",
            border: "2px solid #FBF6EC", background: "#211A12", color: "#FCE9CF",
            cursor: "pointer", fontSize: 16, lineHeight: 1, display: "flex",
            alignItems: "center", justifyContent: "center", zIndex: 2,
            boxShadow: "var(--ed-shadow-card, 0 12px 24px -14px rgba(40,28,12,.6))",
          }}
        >✕</button>

        {/* media well — gold foil keyline */}
        <div style={{ position: "relative", width: "100%", borderRadius: 6, overflow: "hidden", background: "#F5EFE2", boxShadow: "inset 0 0 0 2px rgba(184,130,44,.5)" }}>
          {isVideo ? (
            <video src={item.video_url} autoPlay loop muted playsInline
              style={{ display: "block", width: "100%", maxHeight: "70vh", objectFit: "contain", background: "#211A12" }} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.photo_url} alt="Community creation" draggable={false}
              style={{ display: "block", width: "100%", maxHeight: "70vh", objectFit: "contain", background: "#211A12" }} />
          )}
          {isVideo && (
            <span style={{ position: "absolute", right: 10, bottom: 10, fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", color: "#FCE9CF", background: "rgba(33,26,18,.62)", borderRadius: 6, padding: "2px 8px" }}>▸ MOTION</span>
          )}
        </div>

        {/* footer — likes + the kept sign-in nudge */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", color: "#BE4F28" }}>
            ♥ {item.likes_count || 0}
          </span>
          {/* +3 pts is the REAL comment grant (/api/social/comment → community +3, daily-capped) */}
          <span style={{ fontFamily: "var(--ed-body)", fontSize: 13, color: "#5C5140", flex: 1, minWidth: 140 }}>
            Connect your wallet to like, comment (+3 pts) &amp; post your own.
          </span>
          {/* Route to the single canonical wallet control below rather than
              re-mounting it here (a second copy could double-bind the connect
              modal). Closes the lightbox and scrolls the CTA into view. */}
          <button onClick={onJoin} style={{
            border: "none", cursor: "pointer", borderRadius: 999, padding: "8px 18px",
            background: "linear-gradient(180deg,#F49B2A,#E27D0C)", color: "#211A12",
            fontFamily: "var(--ed-body)", fontSize: 13, fontWeight: 700,
            boxShadow: "0 10px 22px -12px rgba(226,125,12,.6)",
          }}>Join</button>
        </div>
      </div>
    </div>
  );
}

export default function CommunityPreview({ cta, ctaNote }: { cta?: ReactNode; ctaNote?: string }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [preview, setPreview] = useState<AlbumItem | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/community/showcase?limit=12")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setItems(Array.isArray(d?.items) ? d.items : []); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, []);

  // Map the public showcase feed onto the carousel's item shape. The showcase
  // API only exposes id/url/isVideo/likes (no creator name or prompt on this
  // public endpoint) — omit those and let the carousel's fallbacks handle it.
  // Teaser: cap to the first 10; the full crate lives in the Community section.
  const albumItems = useMemo<AlbumItem[]>(
    () =>
      (items || []).slice(0, 10).map((it) =>
        it.isVideo
          ? { id: it.id, video_url: it.url, likes_count: it.likes }
          : { id: it.id, photo_url: it.url, likes_count: it.likes },
      ),
    [items],
  );

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "8px 20px 56px" }}>
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, letterSpacing: "0.13em", color: "#9A4E1E", fontWeight: 700, marginBottom: 6, textTransform: "uppercase" }}>
          FRESH FROM THE COMMUNITY
        </div>
        <h2 style={{ fontFamily: "var(--ed-disp)", fontSize: 26, fontWeight: 800, color: "#211A12", letterSpacing: "-0.02em", margin: "0 0 4px" }}>
          See what the pets are making
        </h2>
        <p style={{ fontFamily: "var(--ed-body)", fontSize: 14, color: "#5C5140", margin: 0 }}>
          Real creations, made by real people raising real pets. Peek in — then make your own.
        </p>
      </div>

      {items === null ? (
        <div style={{ textAlign: "center", padding: 40, color: "#9A7B4E", fontFamily: "var(--ed-body)" }}>Loading the gallery…</div>
      ) : items.length === 0 ? (
        // Designed invitation — the first record sleeve in the crate, reserved.
        // Reward chips carry the REAL server grants (/api/studio/generate →
        // awardPointsCapped "studio_gen": image +10, motion +20, daily-capped).
        <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
          <div style={{
            width: 216, margin: "0 auto 18px", padding: 10, borderRadius: 10,
            border: "2px dashed rgba(154,123,78,.6)", background: "rgba(251,246,236,.7)",
          }}>
            <div style={{
              aspectRatio: "1 / 1", borderRadius: 6, background: "#F5EFE2",
              boxShadow: "inset 0 0 0 2px rgba(184,130,44,.35)",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
            }}>
              <span style={{ fontFamily: "var(--ed-disp)", fontSize: 24, fontWeight: 800, color: "#9A7B4E" }}>№ 001</span>
              <span style={{ fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", color: "#9A7B4E" }}>RESERVED</span>
            </div>
            <div style={{ marginTop: 8, fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", color: "#7A6E5A", textTransform: "uppercase" }}>
              First sleeve in the crate
            </div>
          </div>
          <h3 style={{ fontFamily: "var(--ed-disp)", fontSize: 20, fontWeight: 800, color: "#211A12", letterSpacing: "-0.02em", margin: "0 0 6px" }}>
            The gallery is just getting started
          </h3>
          <p style={{ fontFamily: "var(--ed-body)", fontSize: 14, color: "#5C5140", margin: "0 0 12px", lineHeight: 1.55 }}>
            Your first creation hangs here — and it earns real season points.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap", marginBottom: SEASON_SCHEDULED ? 0 : 10 }}>
            {["+10 pts · image", "+20 pts · motion"].map((c) => (
              <span key={c} style={{
                fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 800, letterSpacing: "0.06em",
                textTransform: "uppercase", color: "#9A4E1E", background: "rgba(190,79,40,.09)",
                border: "1px solid rgba(190,79,40,.32)", borderRadius: 999, padding: "5px 12px",
              }}>{c}</span>
            ))}
          </div>
          {/* No dates/countdowns while Season 1 is unscheduled — honest carry-in note only. */}
          {!SEASON_SCHEDULED && (
            <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, color: "#7A6E5A", letterSpacing: "0.04em" }}>
              Season 1 starts soon — points you earn now carry in.
            </div>
          )}
        </div>
      ) : (
        // One decisive CTA (the orange card below) — the redundant ghost
        // "Browse the whole crate" button was dropped so entering Community
        // reads as an expansion, not a repeat of the same crate.
        <Reveal dir="pop">
          <AlbumCarousel
            items={albumItems}
            autoAdvance={3800}
            // Clicking the center sleeve / OPEN ▸ opens a read-only lightbox with
            // the creation full-size; the sign-in nudge rides inside it so the
            // funnel to the CTA below is preserved (it used to only scroll).
            onOpen={(item: AlbumItem) => { setPreview(item); }}
          />
        </Reveal>
      )}

      {preview && (
        <PreviewLightbox
          item={preview}
          onClose={() => setPreview(null)}
          onJoin={() => {
            setPreview(null);
            document.getElementById("community-preview-cta")?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        />
      )}

      {/* CTA — cream editorial card, not a flat orange slab. The wallet control
          in the `cta` slot is already ink-on-orange (WalletGate). Reward chips
          carry the REAL server grants (/api/social/*: comment +3, your work
          liked +1, new follower +2 — all daily-capped). */}
      <div id="community-preview-cta" style={{
        marginTop: 22, position: "relative", overflow: "hidden", padding: "26px 22px 22px",
        borderRadius: 18, textAlign: "center", background: "#FBF6EC",
        border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
        boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))", scrollMarginTop: 88,
      }}>
        <div aria-hidden style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: "linear-gradient(90deg,#B8822C,#F2D289,#B8822C)" }} />
        <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "#BE4F28", marginBottom: 8 }}>
          Join the community
        </div>
        <div style={{ fontFamily: "var(--ed-disp)", fontWeight: 800, fontSize: 20, color: "#211A12", marginBottom: 6, letterSpacing: "-0.01em" }}>
          Like, comment &amp; post your own
        </div>
        <div style={{ fontFamily: "var(--ed-body)", fontSize: 13, color: "#5C5140", marginBottom: 12 }}>
          Connect your wallet — no gas, identity only. Every contribution earns season points:
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {["Comment +3 pts", "Your work liked +1 pt", "New follower +2 pts"].map((c) => (
            <span key={c} style={{
              fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, letterSpacing: "0.04em",
              color: "#3A3024", background: "#F5EFE2",
              border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
              borderRadius: 999, padding: "5px 12px",
            }}>{c}</span>
          ))}
        </div>
        <div style={{ display: "inline-block" }}>{cta}</div>
        {ctaNote && (
          <div style={{ marginTop: 10, fontFamily: "var(--ed-m)", fontSize: 13, fontWeight: 700, color: "#7A6E5A" }}>{ctaNote}</div>
        )}
      </div>
    </div>
  );
}
