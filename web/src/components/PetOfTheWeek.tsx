"use client";

/**
 * Pet of the Week — the auto-curated hero at the top of Community.
 * Collectible Editorial specimen poster: the honored companion presented as a
 * foil-stamped collectible print on cream paper (the old dead-black slab with
 * a blurred backdrop and off-system chips is gone). Real data only — the pet,
 * its metrics and its latest make all come from /api/community/pet-of-week.
 *
 * Mission + reward footer states the REAL season-point grants, mirrored from
 * the server (/api/social/[comment|like|follow] → awardPointsCapped):
 * comment +3 · author of a liked work +1 · gaining a follower +2, all under
 * the daily community cap. Never promise a number the server doesn't pay.
 */
import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import Reveal from "@/components/Reveal";
import CollectibleFrame from "@/components/editorial/CollectibleFrame";

const T = {
  paper: "#FBF6EC", inset: "#F5EFE2", ink: "#211A12", ink70: "#3A3024",
  muted: "#7A6E5A", muted2: "#5C5140", mono: "#9A7B4E", hair: "rgba(33,26,18,.13)",
  terra: "#BE4F28", terraSub: "#9A4E1E", creamOn: "#FCE9CF",
  disp: "var(--ed-disp)", body: "var(--ed-body)", m: "var(--ed-m)",
};

interface PotW {
  id: number;
  name: string;
  avatarUrl: string | null;
  level: number;
  bondLevel: number;
  personality: string;
  ownerWallet: string;
  heroImage: string | null;
  heroIsVideo: boolean;
  heroPrompt: string | null;
  reasons: string[];
}

export default function PetOfTheWeek() {
  const [pet, setPet] = useState<PotW | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/community/pet-of-week")
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled) { setPet(d?.pet || null); setLoaded(true); } })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 640px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  if (!loaded || !pet) return null;

  const frameWidth = narrow ? 196 : 236;

  return (
    // Full-width poster — scroll-revealed with the "pop" grammar.
    <Reveal dir="pop" style={{ maxWidth: 1060, margin: "0 auto 18px", padding: "0 24px" }}>
      <style>{`@media (max-width:640px){.potw-grid{grid-template-columns:1fr !important}.potw-spec{border-left:none !important;border-top:1px solid rgba(33,26,18,.13)}}`}</style>
      <div className="potw-grid" style={{
        position: "relative", overflow: "hidden", borderRadius: 22,
        background: T.paper,
        border: `1px solid ${T.hair}`,
        boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
        display: "grid", gridTemplateColumns: "1.15fr 1fr",
      }}>
        {/* gold foil top strip — the weekly honor is a stamped edition */}
        <div aria-hidden style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 4, zIndex: 2,
          background: "linear-gradient(90deg,#B8822C,#F2D289,#B8822C)",
        }} />

        {/* Left: the honored companion, in print */}
        <div style={{ padding: "28px 28px 24px", position: "relative", zIndex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 7, alignSelf: "flex-start",
            fontSize: 13, fontFamily: T.m,
            letterSpacing: "0.14em", color: T.terraSub, fontWeight: 800, textTransform: "uppercase",
            padding: "5px 12px", borderRadius: 999,
            background: "rgba(190,79,40,0.08)", border: "1px solid rgba(190,79,40,0.35)",
          }}>
            <Icon name="medal" size={14} /> PET OF THE WEEK
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{
              fontFamily: T.disp, fontWeight: 800, fontSize: narrow ? 26 : 30,
              color: T.ink, letterSpacing: "-0.02em", lineHeight: 1.05,
            }}>
              {pet.name}
            </div>
            <div style={{
              fontSize: 13, color: T.muted2, marginTop: 6,
              fontFamily: T.m, fontWeight: 700, letterSpacing: "0.05em",
            }}>
              {pet.personality} · raised by {pet.ownerWallet}
            </div>
          </div>

          {/* the devotion the metrics reveal — ink-on-inset editorial chips */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
            {[`Lv ${pet.level}`, `Bond ${pet.bondLevel}`, ...pet.reasons].map((r, i) => (
              <span key={i} style={{
                fontSize: 13, fontWeight: 700, padding: "6px 12px", borderRadius: 999,
                background: T.inset, color: T.ink70,
                border: `1px solid ${T.hair}`,
                fontFamily: T.disp,
              }}>
                {r}
              </span>
            ))}
          </div>

          {/* Weekly mission + REAL rewards (values mirror the /api/social routes) */}
          <div style={{ marginTop: "auto", paddingTop: 18 }}>
            <div style={{ borderTop: `1px solid ${T.hair}`, paddingTop: 12 }}>
              <div style={{
                fontFamily: T.m, fontSize: 13, fontWeight: 800, letterSpacing: "0.12em",
                textTransform: "uppercase", color: T.terra, marginBottom: 6,
              }}>
                The seal moves weekly
              </div>
              <div style={{ fontFamily: T.body, fontSize: 13, color: T.muted2, lineHeight: 1.6 }}>
                Raise, create &amp; connect to wear it next. Community actions pay season points:
                comment <b style={{ color: T.ink }}>+3</b> · your work liked <b style={{ color: T.ink }}>+1</b> · new
                follower <b style={{ color: T.ink }}>+2</b>. Daily caps apply.
              </div>
            </div>
          </div>
        </div>

        {/* Right: specimen pane — their best recent creation (or the companion
            portrait) as a collectible print. Real data only; no blur. */}
        <div className="potw-spec" style={{
          background: T.inset, display: "flex", alignItems: "center", justifyContent: "center",
          padding: "32px 22px 40px", borderLeft: `1px solid ${T.hair}`, position: "relative",
        }}>
          {pet.heroImage && pet.heroIsVideo ? (
            // Motion sleeve — paper mat + gold keyline well (video can't ride CollectibleFrame)
            <div style={{
              position: "relative", background: T.paper, borderRadius: 8, padding: 10,
              boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
              width: frameWidth, transform: "rotate(-2.2deg)",
            }}>
              <div style={{
                position: "relative", width: "100%", aspectRatio: "1 / 1", borderRadius: 6,
                overflow: "hidden", boxShadow: "inset 0 0 0 2px rgba(184,130,44,.5)", background: T.ink,
              }}>
                <video src={pet.heroImage} autoPlay loop muted playsInline
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                <span style={{
                  position: "absolute", right: 8, bottom: 8, fontFamily: T.m, fontSize: 13, fontWeight: 700,
                  letterSpacing: "0.1em", color: T.creamOn, background: "rgba(33,26,18,.62)",
                  borderRadius: 6, padding: "2px 8px",
                }}>▸ MOTION</span>
              </div>
              <div style={{
                display: "flex", justifyContent: "space-between", marginTop: 9,
                fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", color: T.ink70,
              }}>
                <span>LATEST MAKE</span>
                <span>★ BOND {pet.bondLevel}</span>
              </div>
            </div>
          ) : pet.heroImage ? (
            <CollectibleFrame
              photoUrl={pet.heroImage}
              level={pet.level}
              speciesLabel="LATEST MAKE"
              elementLabel={`BOND ${pet.bondLevel}`}
              width={frameWidth}
              tilt={-2.2}
            />
          ) : pet.avatarUrl ? (
            <CollectibleFrame
              photoUrl={pet.avatarUrl}
              level={pet.level}
              speciesLabel="COMPANION"
              elementLabel={`BOND ${pet.bondLevel}`}
              width={frameWidth}
              tilt={-2.2}
            />
          ) : (
            // No portrait on file yet — say so honestly instead of faking one.
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, color: T.mono }}>
              <Icon name="film-reel" size={46} />
              <span style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.12em" }}>PORTRAIT PENDING</span>
            </div>
          )}
        </div>
      </div>
    </Reveal>
  );
}
