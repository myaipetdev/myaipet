"use client";

/**
 * Daily-rhythm greeting for the My Pet screen.
 *
 * Delivers three of the My-Pet upgrade directions in one card:
 *   · 일상 리듬 (#4)  — time-of-day aware ("Good evening")
 *   · 무드가 행동을 바꿈 (#2) — the welcome's *tone* shifts with the pet's mood
 *     (grumpy = 시큰둥/curt, ecstatic = 먼저 말 검/effusive)
 *   · 펫이 스스로 산다 (#1) — surfaces "while you were away, I was thinking…"
 *     by reusing the cached /thought endpoint (no new LLM cost)
 *
 * Pure client-side timing (the browser knows the user's real local hour and the
 * gap since last_interaction_at), so it needs no new backend.
 */
import { useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/api";
import Icon from "@/components/Icon";

// Crafted time-of-day glyphs (no celestial icon in the 3D set, and the card is a
// soft flat surface) — clean inline SVGs tinted with the pet's mood accent so the
// hero glyph reads as real iconography instead of a bare emoji.
type TodKind = "night" | "sunrise" | "day" | "sunset";

function TodGlyph({ kind, color, size = 28 }: { kind: TodKind; color: string; size?: number }) {
  const common = {
    width: size, height: size, viewBox: "0 0 24 24",
    fill: "none", stroke: color, strokeWidth: 1.8,
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (kind === "night") {
    // crescent moon + a couple of stars
    return (
      <svg {...common}>
        <path d="M20 14.5A7.5 7.5 0 1 1 11 5a6 6 0 0 0 9 9.5Z" fill={`${color}1f`} />
        <path d="M17.5 4.5l.7 1.5 1.5.7-1.5.7-.7 1.5-.7-1.5L15.3 6.7l1.5-.7Z" fill={color} stroke="none" />
      </svg>
    );
  }
  if (kind === "day") {
    // full sun, high
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4.2" fill={`${color}26`} />
        <path d="M12 3.2v2.1M12 18.7v2.1M3.2 12h2.1M18.7 12h2.1M5.6 5.6l1.5 1.5M16.9 16.9l1.5 1.5M18.4 5.6l-1.5 1.5M7.1 16.9l-1.5 1.5" />
      </svg>
    );
  }
  // sunrise / sunset — sun on horizon (rays only above the line)
  const rising = kind === "sunrise";
  return (
    <svg {...common}>
      <line x1="3" y1="18.5" x2="21" y2="18.5" />
      <path d="M8.2 18.5a3.8 3.8 0 0 1 7.6 0Z" fill={`${color}26`} />
      <path d="M12 8v2.2M5.8 11.3l1.5 1.4M18.2 11.3l-1.5 1.4" />
      {rising
        ? <path d="M9.6 6.4L12 4l2.4 2.4" />
        : <path d="M9.6 5.6L12 8l2.4-2.4" />}
    </svg>
  );
}

function partOfDay(h: number): { kind: TodKind; word: string } {
  if (h < 5)  return { kind: "night",   word: "Late night" };
  if (h < 12) return { kind: "sunrise", word: "Good morning" };
  if (h < 17) return { kind: "day",     word: "Good afternoon" };
  if (h < 22) return { kind: "sunset",  word: "Good evening" };
  return { kind: "night", word: "Winding down" };
}

/** Map any mood string to a welcome tone bucket. */
type Tone = "effusive" | "curt" | "tender" | "drowsy" | "needy" | "warm";
function moodTone(mood: string): Tone {
  const m = (mood || "").toLowerCase();
  if (["ecstatic", "happy", "excited", "playful"].includes(m)) return "effusive";
  if (["grumpy", "annoyed", "angry"].includes(m)) return "curt";
  if (["sad", "lonely", "wistful"].includes(m)) return "tender";
  if (["tired", "exhausted", "sleepy"].includes(m)) return "drowsy";
  if (["hungry", "starving"].includes(m)) return "needy";
  return "warm";
}

function welcomeLine(name: string, tone: Tone, word: string): string {
  switch (tone) {
    case "effusive": return `${name} lights up the second you appear — you're back! 🎉`;
    case "curt":     return `${name} cracks one eye open. Oh. It's you. …glad, though. Secretly.`;
    case "tender":   return `${name} perks up softly — I was hoping you'd come.`;
    case "drowsy":   return `${name} yawns and stretches — mmf… hi. You're here.`;
    case "needy":    return `${name} bounds over — finally! I was getting a little peckish.`;
    default:         return `${word}. ${name} is happy to see you.`;
  }
}

function absenceLine(hoursAway: number | null): string | null {
  if (hoursAway == null) return null;
  if (hoursAway < 2)  return null;
  if (hoursAway < 12) return "It's been a few hours — I kept a thought warm for you.";
  if (hoursAway < 48) return "I missed you. It had been a little while.";
  return "You were gone a good long while… I kept your spot warm the whole time.";
}

// Proactive recall — surface ONE concrete thing the pet actually remembers
// (a stored memory or a fact it learned about you), so the moat is felt in the
// pet's own voice. Deterministic + free; rotates daily so it doesn't repeat.
function pickRecall(memories: any[], profile: any[]): string | null {
  const mems = (Array.isArray(memories) ? memories : []).filter((m) => m?.content && typeof m.content === "string");
  const profs = (Array.isArray(profile) ? profile : []).filter((p) => p?.content && typeof p.content === "string");
  const sortedMems = [...mems].sort((a, b) => (b.importance || 0) - (a.importance || 0));
  const candidates = [...sortedMems.map((m) => m.content as string), ...profs.map((p) => p.content as string)];
  if (!candidates.length) return null;
  const dayIdx = Math.floor(Date.now() / 86_400_000);
  return candidates[dayIdx % candidates.length];
}

interface Props {
  petId: number;
  petName: string;
  mood: string;
  accent: string;             // mood color from PetProfile's MOOD_CONFIG
  lastInteractionAt?: string | null;
}

export default function PetGreeting({ petId, petName, mood, accent, lastInteractionAt }: Props) {
  const [thought, setThought] = useState<string | null>(null);
  const [recall, setRecall] = useState<string | null>(null);
  // Computed each render (not frozen in state) so the time-of-day greeting
  // re-anchors to the wall clock instead of sticking at the mount-time hour.
  const now = new Date();

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/pets/${petId}/thought`, { headers: getAuthHeaders() })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled && d?.thought) setThought(d.thought); })
      .catch(() => {});
    fetch(`/api/petclaw/memory?petId=${petId}`, { headers: getAuthHeaders() })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled && d) setRecall(pickRecall(d.memories, d.userProfile)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [petId]);

  const tod = partOfDay(now.getHours());
  const tone = moodTone(mood);
  const hoursAway = lastInteractionAt
    ? (Date.now() - new Date(lastInteractionAt).getTime()) / 3_600_000
    : null;
  const absence = absenceLine(hoursAway);

  return (
    <div
      className="mp-enter"
      style={{
        marginBottom: 20,
        borderRadius: 20,
        padding: "20px 24px",
        position: "relative",
        overflow: "hidden",
        background: `linear-gradient(135deg, ${accent}14 0%, ${accent}08 45%, rgba(255,255,255,0.6) 100%)`,
        border: `1px solid ${accent}2e`,
        boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
      }}
    >
      {/* mood glow */}
      <div style={{
        position: "absolute", top: -50, right: -30, width: 180, height: 180,
        borderRadius: "50%", background: accent, opacity: 0.08, filter: "blur(50px)",
        pointerEvents: "none",
      }} />

      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, position: "relative" }}>
        <div style={{ fontSize: 30, lineHeight: 1, marginTop: 2 }}><TodGlyph kind={tod.kind} color={accent} size={28} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: "0.14em", color: accent, fontWeight: 700, textTransform: "uppercase",
          }}>
            {tod.word}
          </div>
          <div style={{
            fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 17,
            color: "#1a1a2e", marginTop: 4, lineHeight: 1.35, letterSpacing: "-0.01em",
          }}>
            {welcomeLine(petName, tone, tod.word)}
          </div>
          {absence && (
            <div style={{ fontSize: 13, color: "rgba(26,26,46,0.55)", marginTop: 5, lineHeight: 1.4 }}>
              {absence}
            </div>
          )}

          {/* Proactive recall — the pet brings up something specific it remembers. */}
          {recall && (
            <div style={{ fontSize: 13, color: "rgba(26,26,46,0.62)", marginTop: 7, lineHeight: 1.45, display: "flex", gap: 7, alignItems: "flex-start" }}>
              <span style={{ flexShrink: 0, lineHeight: 1, marginTop: 1 }}><Icon name="chat" size={15} /></span>
              <span><span style={{ fontWeight: 700 }}>Still on my mind</span> — {recall}</span>
            </div>
          )}

          {/* "while you were away" — the pet's own autonomous inner thought */}
          {thought && (
            <div style={{
              marginTop: 12, padding: "11px 14px", borderRadius: 13,
              background: "rgba(255,255,255,0.7)",
              border: "1px solid rgba(0,0,0,0.05)",
              display: "flex", gap: 9, alignItems: "flex-start",
            }}>
              <span style={{ fontSize: 15, lineHeight: 1.3, flexShrink: 0 }}><Icon name="chat" size={16} /></span>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: "0.12em", color: "rgba(26,26,46,0.4)", fontWeight: 700,
                  marginBottom: 2,
                }}>
                  WHILE YOU WERE AWAY
                </div>
                <div style={{
                  fontSize: 14, color: "#1a1a2e", lineHeight: 1.45,
                  fontStyle: "italic",
                }}>
                  &ldquo;{thought}&rdquo;
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
