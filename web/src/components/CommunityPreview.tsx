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

interface Item { id: number; url: string; isVideo: boolean; likes: number; }

export default function CommunityPreview({ cta }: { cta?: ReactNode }) {
  const [items, setItems] = useState<Item[] | null>(null);

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
  const albumItems = useMemo(
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
        <div style={{ textAlign: "center", padding: "32px 20px", borderRadius: 16, border: "1px dashed var(--ed-hair, rgba(33,26,18,.13))", color: "#7A6E5A", fontFamily: "var(--ed-body)", fontSize: 14 }}>
          The gallery is just getting started — be the first to create.
        </div>
      ) : (
        <Reveal dir="pop">
          <AlbumCarousel
            items={albumItems}
            autoAdvance={3800}
            onOpen={() => { window.location.href = "/?section=community"; }}
          />
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <button
              onClick={() => { window.location.href = "/?section=community"; }}
              style={{
                background: "transparent", border: "1px solid rgba(33,26,18,.13)", borderRadius: 999,
                padding: "8px 18px", cursor: "pointer", fontFamily: "var(--ed-m)", fontSize: 13,
                fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9A4E1E",
              }}
            >
              Browse the whole crate ▸
            </button>
          </div>
        </Reveal>
      )}

      {/* CTA */}
      <div style={{ marginTop: 22, padding: "20px 22px", borderRadius: 18, textAlign: "center", background: "linear-gradient(180deg,#F49B2A,#E27D0C)", color: "#FFF8EE", boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))" }}>
        <div style={{ fontFamily: "var(--ed-disp)", fontWeight: 800, fontSize: 18, marginBottom: 6 }}>Like, comment &amp; post your own</div>
        <div style={{ fontFamily: "var(--ed-body)", fontSize: 13, color: "rgba(255,248,238,0.85)", marginBottom: 16 }}>
          Connect your wallet — no gas, identity only. Join the pets.
        </div>
        <div style={{ display: "inline-block" }}>{cta}</div>
      </div>
    </div>
  );
}
