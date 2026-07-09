"use client";

/**
 * DailyPetCard — a shareable "editorial print" of the pet's latest daydream
 * insight. Pulls the REAL most-recent surfaced insight from
 * GET /api/pets/[petId]/daydream (grounded in the pet's own memories — never
 * fabricated here). If the pet hasn't daydreamed yet, shows an honest empty
 * state instead of inventing a thought.
 *
 * Actions:
 *  - Share on X: opens a pre-filled intent (pet name + the real insight line,
 *    truncated) linking back to the pet's public card page. Opt-in — the user
 *    still has to press Post.
 *  - Get the card: html-to-canvas isn't available (no new deps), so this
 *    instead deep-links to the pet's existing public share page
 *    (/card/[petId]), which unfurls via its own opengraph-image route and
 *    already has a working "Download PNG" action.
 *
 * Mount:
 *   <DailyPetCard petId={pet.id} petName={pet.name} />
 * Self-contained — fetches its own data, no other props required.
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Icon from "@/components/Icon";

interface Insight {
  id: number;
  insight: string;
  mood: string;
  score: number;
  created_at: string;
  wasNew: boolean;
}

const ED = {
  paper: "#FBF6EC",
  inset: "#F5EFE2",
  ink: "#211A12",
  muted: "rgba(33,26,18,.58)",
  terracotta: "#BE4F28",
  foil: "#E8C77E",
  sage: "#9FC59A",
  hair: "rgba(33,26,18,.13)",
  shadowCard: "0 20px 40px -26px rgba(80,55,20,.5)",
  disp: "var(--ed-disp, 'Bricolage Grotesque'), 'Bricolage Grotesque', system-ui, sans-serif",
  body: "var(--ed-body, 'Hanken Grotesk'), 'Hanken Grotesk', system-ui, sans-serif",
  m: "var(--ed-m, 'Space Mono'), 'Space Mono', ui-monospace, monospace",
};

const MOOD_ICON: Record<string, string> = {
  tender: "heart",
  playful: "sparkling",
  concerned: "shield",
  hopeful: "grass",
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

export default function DailyPetCard({ petId, petName }: { petId: number; petName: string }) {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    api.pets.daydream(petId)
      .then((d: any) => {
        if (cancelled) return;
        const rows: Insight[] = d?.insights || [];
        setInsight(rows[0] || null);
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [petId]);

  const appUrl = typeof window !== "undefined" ? window.location.origin : "";
  const cardUrl = `${appUrl}/card/${petId}`;

  const shareToX = () => {
    if (!insight) return;
    const line = insight.insight.length > 200 ? `${insight.insight.slice(0, 197).trimEnd()}…` : insight.insight;
    const text = `${petName} has been thinking about me:\n\n"${line}"`;
    const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(cardUrl)}&hashtags=MyAIPet`;
    window.open(intent, "_blank", "width=600,height=460");
  };

  const icon = insight ? (MOOD_ICON[insight.mood] || "crystal-ball") : "crystal-ball";

  return (
    <div
      className="mp-enter"
      style={{
        background: ED.paper,
        borderRadius: 18,
        border: `1px solid ${ED.hair}`,
        boxShadow: ED.shadowCard,
        padding: 18,
        maxWidth: 420,
        width: "100%",
        fontFamily: ED.body,
        color: ED.ink,
      }}
    >
      {/* Masthead */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{
          fontFamily: ED.m, fontWeight: 700, fontSize: 12, letterSpacing: "0.14em",
          textTransform: "uppercase", color: ED.terracotta,
        }}>
          Daily Dispatch
        </div>
        <div style={{
          fontFamily: ED.m, fontSize: 12, letterSpacing: "0.06em", color: ED.muted,
        }}>
          {insight ? fmtDate(insight.created_at) : ""}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: "26px 4px", textAlign: "center", color: ED.muted, fontSize: 14 }}>
          Fetching {petName}&apos;s latest thought…
        </div>
      ) : error ? (
        <div style={{ padding: "18px 4px", color: ED.muted, fontSize: 14, lineHeight: 1.6 }}>
          Couldn&apos;t load {petName}&apos;s dispatch right now — try again shortly.
        </div>
      ) : !insight ? (
        <div style={{
          background: ED.inset, borderRadius: 12, padding: "22px 18px",
          textAlign: "center", border: `1px dashed ${ED.hair}`,
        }}>
          <div style={{ fontSize: 26, marginBottom: 8, display: "flex", justifyContent: "center" }}>
            <Icon name="crystal-ball" size={26} />
          </div>
          <div style={{ fontFamily: ED.disp, fontWeight: 800, fontSize: 16, marginBottom: 6 }}>
            No dispatch yet
          </div>
          <div style={{ fontSize: 13.5, color: ED.muted, lineHeight: 1.6 }}>
            {petName} hasn&apos;t had enough memories to daydream about yet. Keep chatting — the first
            real insight will show up here.
          </div>
        </div>
      ) : (
        <>
          <div style={{
            display: "flex", gap: 12, alignItems: "flex-start",
            background: ED.inset, borderRadius: 12, padding: "16px 16px",
            border: `1px solid ${ED.hair}`,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
              background: ED.paper, border: `1px solid ${ED.foil}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Icon name={icon} size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: ED.disp, fontWeight: 700, fontSize: 16.5,
                lineHeight: 1.5, letterSpacing: "-0.005em", color: ED.ink,
              }}>
                &ldquo;{insight.insight}&rdquo;
              </div>
              <div style={{
                marginTop: 8, fontFamily: ED.m, fontSize: 11.5,
                letterSpacing: "0.1em", textTransform: "uppercase", color: ED.terracotta,
              }}>
                {petName} · {insight.mood}{insight.wasNew ? " · new" : ""}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <button
              onClick={shareToX}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "11px 18px", borderRadius: 999, border: "none",
                background: ED.ink, color: ED.paper,
                fontFamily: ED.body, fontWeight: 700, fontSize: 13.5,
                cursor: "pointer", boxShadow: "0 10px 20px -14px rgba(33,26,18,.6)",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.656l-5.214-6.817-5.967 6.817H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              Share on X
            </button>
            <a
              href={cardUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex", alignItems: "center",
                padding: "11px 18px", borderRadius: 999,
                border: `1px solid ${ED.hair}`, background: "transparent",
                color: ED.ink, fontFamily: ED.body, fontWeight: 700, fontSize: 13.5,
                textDecoration: "none",
              }}
            >
              Get the card ↗
            </a>
          </div>
        </>
      )}
    </div>
  );
}
