"use client";

/**
 * WorldCupPet — time-boxed World Cup 2026 national-pet skin.
 *
 * Pick your country from a flag grid → your EXISTING pet is reimagined as that
 * nation's iconic animal in its flag colors, then one-tap (opt-in) share to X.
 *
 * Reuses the Studio pipeline unchanged: POST /api/studio/generate with
 * modelId "grok-imagine" (supportsImageRef → the pet's avatar is the reference,
 * so it stays YOUR pet) + a themed prompt. If the render doesn't complete
 * inline we poll GET /api/studio/generate/[jobId] and drop the result in
 * automatically. Sharing uses the existing /c/[id] public page whose
 * summary_large_image OG card X unfurls into the tweet.
 */

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import Reveal from "@/components/Reveal";
import { api, getAuthHeaders } from "@/lib/api";
import CollectibleFrame from "@/components/editorial/CollectibleFrame";
import useCountUp from "@/hooks/useCountUp";
import { WORLD_CUP_COUNTRIES, buildCountryPromptFragment, flagUrl, type WorldCupCountry } from "@/lib/worldcup/countries";

// ── Collectible Editorial tokens ──
const T = {
  field: "#ECE4D4", paper: "#FBF6EC", inset: "#F5EFE2", ink: "#211A12", ink70: "#3A3024",
  muted: "#7A6E5A", muted2: "#5C5140", mono: "#9A7B4E", hair: "rgba(33,26,18,.13)",
  terra: "#BE4F28", terraSub: "#9A4E1E", teal: "#1A7E68", creamOn: "#FCE9CF",
  gold: "#C8932F", disp: "var(--ed-disp)", body: "var(--ed-body)", m: "var(--ed-m)",
};
const GEN_COST = 5; // grok-imagine, matches providers.ts
// System CTA — the one gradient allowed on money/convert actions.
const CTA_GRAD = "linear-gradient(180deg,#F49B2A,#E27D0C)";
const CTA_TEXT = "#FFF8EE";

type Pet = { id: number; name: string; avatar_url?: string | null };

/** 14px X (Twitter) logo — the 𝕏 unicode glyph renders inconsistently. */
function XLogo({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.451-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z" />
    </svg>
  );
}

/** Small stroke check — replaces "✓" text overlays. */
function CheckIcon({ size = 13, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export default function WorldCupPet() {
  const [pets, setPets] = useState<Pet[]>([]);
  const [petId, setPetId] = useState<number | null>(null);
  const [country, setCountry] = useState<WorldCupCountry | null>(null);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [genId, setGenId] = useState<number | null>(null);
  const [pendingJob, setPendingJob] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [avatarSet, setAvatarSet] = useState(false);
  const [notAuthed, setNotAuthed] = useState(false);
  // Honest loading: never flash "adopt a pet first" at an owner whose pets are
  // still on the wire (or whose fetch failed) — mirrors CardDeck's pattern.
  const [petsLoaded, setPetsLoaded] = useState(false);
  const [petsErr, setPetsErr] = useState(false);

  const pet = pets.find((p) => p.id === petId) || null;

  const loadPets = () => {
    setPetsErr(false);
    api.pets.list().then((d: any) => {
      const list: Pet[] = (d?.pets || []).map((p: any) => ({ id: p.id, name: p.name, avatar_url: p.avatar_url }));
      setPets(list);
      if (list[0]) setPetId((cur) => cur ?? list[0].id);
      setPetsLoaded(true);
    }).catch((e: any) => {
      if (e?.status === 401) setNotAuthed(true);
      else setPetsErr(true);
    });
  };
  useEffect(loadPets, []);

  const generate = async () => {
    if (!pet || !country || busy) return;
    setBusy(true); setErr(null); setResultUrl(null); setGenId(null); setPendingJob(null); setCopied(false); setAvatarSet(false);
    try {
      const prompt = `${pet.name}, ${buildCountryPromptFragment(country)}`;
      const res = await fetch("/api/studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ modelId: "grok-imagine", petId: pet.id, prompt, aspect: "1:1" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(
          res.status === 401 ? "Connect your wallet to generate."
          : res.status === 402 ? `Not enough credits — this costs ${GEN_COST}.`
          : data?.error || "Generation failed. Try another country."
        );
        return;
      }
      if (typeof data.generationId === "number") setGenId(data.generationId);
      if (data.status === "completed" && data.url) {
        setResultUrl(data.url);
      } else if (typeof data.generationId === "number") {
        // grok-imagine is usually synchronous; if it didn't complete inline,
        // poll the existing job endpoint and drop the result in when ready.
        setPendingJob(data.generationId);
      } else {
        setErr("Generation didn't return a result. Check Studio → History.");
      }
    } catch (e: any) {
      setErr(e?.message || "Generation failed");
    } finally {
      setBusy(false);
    }
  };

  // Poll a still-rendering job until it completes/fails (~90s cap), swapping
  // the result inline instead of dead-ending on "check Studio".
  useEffect(() => {
    if (pendingJob === null) return;
    let stop = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (stop) return;
      tries += 1;
      try {
        const res = await fetch(`/api/studio/generate/${pendingJob}`, { headers: { ...getAuthHeaders() } });
        const d = res.ok ? await res.json().catch(() => ({})) : null;
        if (stop) return;
        if (d?.status === "completed" && d?.url) { setResultUrl(d.url); setErr(null); setPendingJob(null); return; }
        if (d?.status === "failed") { setErr(d?.error || "Generation failed. Try another country."); setPendingJob(null); return; }
      } catch { /* transient — keep polling */ }
      if (!stop && tries < 36) timer = setTimeout(tick, 2500);
    };
    timer = setTimeout(tick, 2500);
    return () => { stop = true; clearTimeout(timer); };
  }, [pendingJob]);

  const shareUrl = genId ? `https://app.myaipet.ai/c/${genId}` : null;

  const shareToX = () => {
    if (!shareUrl || !country) return;
    const text = `My ${country.flag} ${country.name} pet is ready for the World Cup! 🏆⚽`;
    const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}&hashtags=MyAIPet,WorldCup2026`;
    window.open(intent, "_blank", "width=600,height=420");
  };

  const copyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard?.writeText(shareUrl).then(() => setCopied(true)).catch(() => {});
  };

  const setAsAvatar = async () => {
    if (!resultUrl || !pet || avatarSet) return;
    try {
      const res = await fetch(`/api/pets/${pet.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ avatar_url: resultUrl }),
      });
      if (res.ok) {
        setErr(null);
        setAvatarSet(true);
        // The bracket slot (and every other consumer of pets) immediately
        // wears the national-pet look — connects the two modes.
        setPets((ps) => ps.map((p) => (p.id === pet.id ? { ...p, avatar_url: resultUrl } : p)));
      } else {
        setErr("Couldn't update the avatar — try again.");
      }
    } catch {
      setErr("Couldn't update the avatar — try again.");
    }
  };

  // ── states ──
  if (notAuthed) {
    return <Shell><Empty>Connect your wallet to make your World Cup pet.</Empty></Shell>;
  }
  if (!petsLoaded) {
    return (
      <Shell>
        {petsErr ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: T.paper, border: `1px solid ${T.hair}`, borderRadius: 12, padding: "14px 16px", boxShadow: "var(--ed-shadow-card)", fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".08em", color: T.muted2, textTransform: "uppercase" }}>
            <span>Couldn&apos;t load your pets</span>
            <button onClick={loadPets} className="wc-press ed-wipe" style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".08em", color: T.terra, background: "transparent", border: "1px solid rgba(190,79,40,.4)", borderRadius: 999, padding: "4px 12px", cursor: "pointer", textTransform: "uppercase" }}>Retry</button>
          </div>
        ) : (
          <div style={{ background: T.paper, border: `1px solid ${T.hair}`, borderRadius: 12, padding: "14px 16px", boxShadow: "var(--ed-shadow-card)", fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".12em", color: T.mono, textTransform: "uppercase" }}>
            Loading your pets…
          </div>
        )}
      </Shell>
    );
  }
  if (pets.length === 0) {
    return (
      <Shell>
        <Empty>
          Adopt a pet first, then bring it to the World Cup.{" "}
          <a href="/?section=my%20pet" className="ed-underline-slide" style={{ fontFamily: T.m, fontWeight: 700, fontSize: 13, letterSpacing: ".06em", color: T.terra, textDecoration: "none" }}>ADOPT A PET ▸</a>
        </Empty>
      </Shell>
    );
  }

  return (
    <Shell>
      <CutenessCup pets={pets} onEnter={() => document.getElementById("wc-national")?.scrollIntoView({ behavior: "smooth", block: "start" })} />

      {/* ── National Pet path — below the fold, so it reveals on scroll ── */}
      <Reveal dir="up">
        <div id="wc-national" style={{ scrollMarginTop: 90, borderTop: `1px solid ${T.hair}`, paddingTop: 22, marginBottom: 6 }}>
          <div style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".14em", color: T.terraSub, textTransform: "uppercase" }}>Pet World Cup · National Pet</div>
          <h2 style={{ fontFamily: T.disp, fontSize: "clamp(24px,6vw,30px)", fontWeight: 800, color: T.ink, margin: "6px 0 2px", letterSpacing: "-.02em" }}>Fly your colors</h2>
        </div>
      </Reveal>

      {/* Pet picker (only if >1) */}
      {pets.length > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontFamily: T.m, fontWeight: 700, letterSpacing: "0.14em", color: T.mono, textTransform: "uppercase" }}>Your pet</span>
          {pets.map((p) => (
            <button key={p.id} onClick={() => setPetId(p.id)} className="ed-card-hover" style={{
              padding: "6px 14px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: T.body,
              border: p.id === petId ? `1.5px solid ${T.terra}` : `1px solid ${T.hair}`,
              background: p.id === petId ? T.terra : T.paper,
              color: p.id === petId ? T.creamOn : T.muted2,
            }}>{p.name}</button>
          ))}
        </div>
      )}

      {/* Flag grid */}
      <div style={{ fontSize: 14, fontFamily: T.body, color: T.muted2, marginBottom: 12 }}>
        Pick a country — your pet becomes its iconic animal in the flag&apos;s colors.
      </div>
      {/* Flag cells fly up into the grid as it scrolls into view (viewport
          <Reveal> per cell, stagger capped at 10 steps; fires once). */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))", gap: 10, marginBottom: 22 }}>
        {WORLD_CUP_COUNTRIES.map((c, i) => {
          const on = country?.code === c.code;
          return (
            <Reveal key={c.code} dir="up" delay={Math.min(i, 10) * 45}>
            <button onClick={() => setCountry(c)} title={`${c.name} — ${c.animal}`} className="ed-card-hover" style={{
              display: "flex", flexDirection: "column", alignItems: "stretch", gap: 0, width: "100%",
              padding: 0, borderRadius: 10, cursor: "pointer", overflow: "hidden",
              border: on ? `2px solid ${T.terra}` : `1px solid ${T.hair}`,
              background: on ? T.inset : T.paper,
              boxShadow: on ? "var(--ed-shadow-card)" : "0 8px 18px -14px rgba(80,55,20,.4)",
              transform: on ? "translateY(-2px)" : "none",
              transition: "all .14s",
            }}>
              <div style={{ position: "relative", width: "100%", aspectRatio: "3 / 2", background: T.inset, flexShrink: 0 }}>
                {/* Absolute so the img's intrinsic ratio (e.g. Switzerland is
                    square 1:1, Denmark 37:28) can't override the box's 3:2 —
                    otherwise odd-ratio flags make their card taller. cover crops
                    every flag into the same uniform 3:2 frame. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={flagUrl(c, 160)} alt={`${c.name} flag`} loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block", boxShadow: "inset 0 0 0 1px rgba(33,26,18,.08)" }} />
                {on && (
                  <div style={{ position: "absolute", inset: 0, background: "rgba(190,79,40,0.22)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <CheckIcon size={22} color={T.creamOn} />
                  </div>
                )}
              </div>
              {/* Single line for every name (all fit — longest is "Saudi
                  Arabia" at ~69px in ~106px), so each label is the same height
                  with identical padding above/below → uniform gap on every card.
                  Ellipsis is just a safety net; it never triggers for this set. */}
              <span style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".03em", color: on ? T.terra : T.ink70, textAlign: "center", lineHeight: 1.2, padding: "9px 6px", textTransform: "uppercase" }}>{c.name}</span>
            </button>
            </Reveal>
          );
        })}
      </div>

      {/* Generate — the 5-credit conversion, so it wears the system CTA gradient. */}
      <button onClick={generate} disabled={!country || busy} className="wc-press" style={{
        width: "100%", padding: "14px 18px", borderRadius: 12, border: "none",
        background: !country || busy ? "rgba(33,26,18,0.14)" : CTA_GRAD,
        color: !country || busy ? T.muted : CTA_TEXT,
        fontSize: 15, fontWeight: 700, cursor: !country || busy ? "not-allowed" : "pointer",
        fontFamily: T.disp, boxShadow: !country || busy ? "none" : "var(--ed-shadow-card)",
      }}>
        {busy ? "Rendering your national pet…"
          : country ? `Make my ${country.name} pet · ${GEN_COST} credits`
          : "Pick a country above"}
      </button>

      {err && <div style={{ fontFamily: T.body, background: "rgba(190,79,40,.08)", color: T.terraSub, border: `1px solid rgba(190,79,40,.22)`, borderRadius: 10, padding: "10px 14px", fontSize: 13.5, marginTop: 16 }}>{err}</div>}

      {/* Still-rendering: honest status + polling; result swaps in automatically. */}
      {pendingJob !== null && !resultUrl && !err && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontFamily: T.body, background: T.inset, color: T.muted2, border: `1px solid ${T.hair}`, borderRadius: 10, padding: "10px 14px", fontSize: 13.5, marginTop: 16 }}>
          <span>Still rendering — your national pet will appear here automatically.</span>
          <a href="/studio" className="ed-underline-slide" style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".08em", color: T.terra, textDecoration: "none" }}>OPEN STUDIO HISTORY →</a>
        </div>
      )}

      {/* Result — pops in as one block when the render lands (or when it's
          scrolled back into view). */}
      {resultUrl && (
        <Reveal dir="pop" style={{ marginTop: 22 }}>
          <div style={{ position: "relative", borderRadius: 18, overflow: "hidden", background: T.field, border: `1px solid ${T.hair}`, boxShadow: "var(--ed-shadow-card)" }}>
            <div className="ed-glow" /><div className="ed-vignette" />
            {country && (
              <div style={{ position: "relative", zIndex: 2, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 18px 0", fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".12em", color: T.muted2, textTransform: "uppercase" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={flagUrl(country, 80)} alt={`${country.name} flag`} style={{ width: 21, height: 14, objectFit: "cover", borderRadius: 2, border: "1px solid rgba(33,26,18,.2)", display: "block" }} />
                  {country.name}
                </span>
                <span style={{ color: T.mono }}>NATIONAL PET</span>
              </div>
            )}
            <div style={{ position: "relative", zIndex: 2, display: "flex", justifyContent: "center", padding: "30px 18px 40px" }}>
              <CollectibleFrame
                photoUrl={resultUrl}
                level={country ? country.code : "WC"}
                sealLabel="TEAM"
                speciesLabel={pet && country ? `${pet.name} · ${country.name.toUpperCase()}` : country ? country.name.toUpperCase() : pet?.name}
                elementLabel={country ? country.animal.split("(")[0].split("/")[0].trim().toUpperCase() : undefined}
                width={330}
                tilt={-2.4}
              />
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
            <button onClick={shareToX} className="wc-press" style={{ ...primaryBtn, display: "inline-flex", alignItems: "center", gap: 8 }}><XLogo size={14} /> Share on X</button>
            <button onClick={copyLink} className="wc-press ed-wipe" style={{ ...ghostBtn, display: "inline-flex", alignItems: "center", gap: 6 }}>{copied ? <>Link copied <CheckIcon size={13} /></> : "Copy link"}</button>
            <button onClick={setAsAvatar} className="wc-press ed-wipe" style={{ ...ghostBtn, display: "inline-flex", alignItems: "center", gap: 6, color: avatarSet ? T.teal : ghostBtn.color }}>{avatarSet ? <>Avatar updated <CheckIcon size={13} /></> : "Set as my pet's avatar"}</button>
            <button onClick={generate} disabled={busy} className="wc-press ed-wipe" style={{ ...ghostBtn, opacity: busy ? 0.6 : 1 }}>{`Regenerate · ${GEN_COST} credits`}</button>
          </div>
          <div style={{ fontFamily: T.body, fontSize: 13, color: T.muted, marginTop: 10 }}>
            Sharing opens X with your post pre-filled — nothing is posted until you press Post.
          </div>
        </Reveal>
      )}

      {/* ── Predict the Champion (real community poll) ── */}
      <div id="wc-predict" style={{ scrollMarginTop: 90, borderTop: `1px solid ${T.hair}`, marginTop: 30, paddingTop: 24 }}>
        <ChampionPrediction />
      </div>
    </Shell>
  );
}

/**
 * Community "Predict the Champion" — honest poll, NOT a live bracket/result.
 * We can't fabricate real-time World Cup 2026 scores, so instead the community
 * votes its predicted winner; the leaderboard is the live count of those picks.
 */
type WcRow = { code: string; name: string; flag: string; color: string; count: number; pct: number };

/** Vote-count badge — mounts only after real data loaded, then counts up. */
function VotesBadge({ total }: { total: number }) {
  const v = useCountUp(total, 500);
  return (
    <span style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", color: T.muted2, border: `1px solid ${T.hair}`, padding: "3px 9px", borderRadius: 999, textTransform: "uppercase" }}>
      {v} {total === 1 ? "vote" : "votes"}
    </span>
  );
}

/** Percentage that tweens up to the real value on first render. */
function CountPct({ value }: { value: number }) {
  const v = useCountUp(value, 500);
  return <>{v}%</>;
}

function ChampionPrediction() {
  const [rows, setRows] = useState<WcRow[]>([]);
  const [total, setTotal] = useState(0);
  const [myPick, setMyPick] = useState<string | null>(null);
  const [sel, setSel] = useState("");
  const [saving, setSaving] = useState(false);
  const [pts, setPts] = useState<number | null>(null);
  const [authed, setAuthed] = useState(true);
  const [submitErr, setSubmitErr] = useState(false); // non-401 submit failure — never swallowed
  // Honest loading: never assert "0 votes"/"be the first" before real data.
  const [loaded, setLoaded] = useState(false);
  const [fetchErr, setFetchErr] = useState(false);
  const [barsIn, setBarsIn] = useState(false);

  const apply = (d: any) => {
    setRows(Array.isArray(d?.leaderboard) ? d.leaderboard : []);
    setTotal(d?.total || 0);
    if (typeof d?.myPick === "string" || d?.myPick === null) setMyPick(d.myPick);
  };

  const load = () => {
    setFetchErr(false);
    fetch("/api/worldcup/predict", { headers: { ...getAuthHeaders() } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`))))
      .then((d) => { apply(d); if (d.myPick) setSel(d.myPick); setLoaded(true); })
      .catch(() => setFetchErr(true));
  };
  useEffect(load, []);

  // Animate standings bars 0 → pct on first data arrival (width transition
  // already exists; they used to mount at final width).
  useEffect(() => {
    if (!loaded || rows.length === 0 || barsIn) return;
    const t = setTimeout(() => setBarsIn(true), 60);
    return () => clearTimeout(t);
  }, [loaded, rows.length, barsIn]);

  const submit = async () => {
    if (!sel || saving) return;
    setSaving(true); setPts(null); setSubmitErr(false);
    try {
      const res = await fetch("/api/worldcup/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ code: sel }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 401) { setAuthed(false); return; }
      if (res.ok) { apply(d); setLoaded(true); setFetchErr(false); if (typeof d.pointsAwarded === "number" && d.pointsAwarded > 0) setPts(d.pointsAwarded); }
      else setSubmitErr(true);
    } catch {
      setSubmitErr(true);
    } finally {
      setSaving(false);
    }
  };

  const myCountry = myPick ? WORLD_CUP_COUNTRIES.find((c) => c.code === myPick) : null;
  const selCountry = sel ? WORLD_CUP_COUNTRIES.find((c) => c.code === sel) : null;

  return (
    // Poll card rises in when scrolled to (was a mount-time wc-rise).
    <Reveal dir="up" style={{
      borderRadius: 22, border: `1px solid ${T.hair}`, background: T.paper,
      padding: "22px 22px 24px", marginBottom: 24, boxShadow: "var(--ed-shadow-card)",
    }}>
      {/* +10 verified against /api/worldcup/predict (awardPointsCapped "worldcup", 10, daily cap 30). */}
      <div style={{ fontFamily: T.m, fontWeight: 700, fontSize: 13, letterSpacing: ".14em", color: T.gold, textTransform: "uppercase", marginBottom: 6 }}>COMMUNITY POLL · +10 SEASON POINTS, DAILY-CAPPED</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: T.disp, fontSize: "clamp(24px,6vw,30px)", fontWeight: 800, color: T.ink, letterSpacing: "-0.02em", display: "inline-flex", alignItems: "center", gap: 9 }}>Predict the Champion <Icon name="trophy" size={24} /></span>
        {loaded && <VotesBadge total={total} />}
      </div>
      <div style={{ fontFamily: T.body, fontSize: 13.5, color: T.muted2, margin: "8px 0 12px", lineHeight: 1.55 }}>
        Who lifts the 2026 trophy? Cast your pick — the board below is the live community count. (A prediction poll, not live match results.)
      </div>
      {/* Factual tournament reference — real, verifiable WC2026 format, framed as
          trivia and visually separated from the 31-nation ballot below. */}
      <div style={{ padding: "10px 12px", background: T.inset, border: `1px dashed ${T.hair}`, borderRadius: 10, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontFamily: T.m, fontWeight: 700, letterSpacing: ".12em", color: T.mono, textTransform: "uppercase", marginBottom: 7 }}>Real-tournament format</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {["48 nations", "Hosts: USA · Canada · Mexico", "Group stage → knockout → final"].map((f) => (
            <span key={f} style={{ fontSize: 13, fontFamily: T.m, fontWeight: 700, letterSpacing: ".04em", color: T.mono, background: T.paper, border: `1px solid ${T.hair}`, borderRadius: 999, padding: "3px 10px", textTransform: "uppercase" }}>{f}</span>
          ))}
        </div>
      </div>

      {/* Picker */}
      <div style={{ fontSize: 13, fontFamily: T.m, fontWeight: 700, letterSpacing: ".12em", color: T.mono, textTransform: "uppercase", marginBottom: 8 }}>
        {WORLD_CUP_COUNTRIES.length} nations on the ballot
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: rows.length ? 18 : 4 }}>
        {selCountry && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={flagUrl(selCountry, 80)} alt={`${selCountry.name} flag`} style={{ width: 30, height: 20, objectFit: "cover", borderRadius: 3, border: `1px solid ${T.hair}`, flexShrink: 0 }} />
        )}
        <select
          value={sel}
          onChange={(e) => setSel(e.target.value)}
          style={{
            flex: "1 1 200px", minWidth: 0, padding: "10px 12px", borderRadius: 10,
            border: `1px solid ${T.hair}`, background: T.inset, color: T.ink, fontSize: 14, fontWeight: 500,
            fontFamily: T.body, cursor: "pointer",
          }}
        >
          <option value="">— Pick a country —</option>
          {WORLD_CUP_COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>{c.name}</option>
          ))}
        </select>
        <button
          onClick={submit}
          disabled={!sel || saving}
          className="wc-press"
          style={{
            padding: "10px 18px", borderRadius: 10, border: "none",
            background: !sel || saving ? "rgba(33,26,18,0.14)" : CTA_GRAD,
            color: !sel || saving ? T.muted : CTA_TEXT,
            fontWeight: 700, fontSize: 14, cursor: !sel || saving ? "not-allowed" : "pointer",
            fontFamily: T.disp, flexShrink: 0,
            boxShadow: !sel || saving ? "none" : "var(--ed-shadow-card)",
          }}
        >
          {saving ? "Saving…" : myPick ? "Update pick" : "Predict"}
        </button>
      </div>

      {submitErr && (
        <div style={{ fontFamily: T.body, fontSize: 13, color: T.terraSub, background: "rgba(190,79,40,.08)", border: `1px solid rgba(190,79,40,.22)`, borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
          Couldn&apos;t submit — try again.
        </div>
      )}
      {!authed && (
        <div style={{ fontFamily: T.body, fontSize: 13, color: T.terraSub, background: "rgba(190,79,40,.08)", border: `1px solid rgba(190,79,40,.22)`, borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
          Connect your wallet to cast your prediction.
        </div>
      )}
      {myCountry && (
        <div style={{ fontFamily: T.body, fontSize: 13, color: T.ink, marginBottom: 14, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span>Your pick:</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={flagUrl(myCountry, 80)} alt={`${myCountry.name} flag`} style={{ width: 20, height: 13, objectFit: "cover", borderRadius: 2, border: `1px solid ${T.hair}` }} />
          <strong>{myCountry.name}</strong>
          {pts !== null && <span style={{ color: T.gold, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}>· +{pts} season points <Icon name="coin" size={14} /></span>}
        </div>
      )}

      {/* Community podium — top-3 most-predicted, styled like a tournament board */}
      {loaded && rows.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontFamily: T.m, fontWeight: 700, letterSpacing: ".12em", color: T.mono, textTransform: "uppercase", marginBottom: 12 }}>Community podium · who players back to win</div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 10 }}>
            {[{ r: rows[1], place: 2, h: 50, medal: "#B6A88C" }, { r: rows[0], place: 1, h: 72, medal: T.gold }, { r: rows[2], place: 3, h: 38, medal: "#C08A5A" }]
              .filter((x) => x.r)
              .map(({ r, place, h, medal }) => (
                <div key={r!.code} style={{ flex: "0 1 100px", textAlign: "center" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r!.flag} alt={r!.name} style={{ width: 42, height: 29, objectFit: "cover", borderRadius: 4, border: `2px solid ${medal}`, margin: "0 auto 5px", display: "block", boxShadow: place === 1 ? "0 6px 14px -6px rgba(80,55,20,.5)" : "none" }} />
                  <div style={{ fontFamily: T.disp, fontSize: 13, fontWeight: 700, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r!.name}</div>
                  <div style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, color: T.muted }}><CountPct value={r!.pct} /></div>
                  <div style={{ height: h, borderRadius: "8px 8px 0 0", background: `linear-gradient(${medal}, ${medal}cc)`, border: `1px solid ${T.ink}`, borderBottom: "none", marginTop: 6, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 5, fontFamily: T.disp, color: T.paper, fontWeight: 800, fontSize: 17 }}>{place}</div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Full standings — honest states: loading / retryable error / real board / real empty */}
      {loaded ? (
        rows.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rows.map((r, i) => {
              const mine = r.code === myPick;
              return (
                <div key={r.code} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, color: T.mono, width: 18, textAlign: "right", flexShrink: 0 }}>{i + 1}</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.flag} alt={`${r.name} flag`} loading="lazy" style={{ width: 26, height: 18, objectFit: "cover", borderRadius: 3, flexShrink: 0, border: `1px solid ${T.hair}` }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                      <span style={{ fontFamily: T.body, fontWeight: mine ? 700 : 500, color: mine ? T.terra : T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {r.name}{mine ? " · you" : ""}
                      </span>
                      <span style={{ fontFamily: T.m, color: T.muted, fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>{r.pct}%</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: "rgba(33,26,18,.08)", overflow: "hidden" }}>
                      <div style={{ width: barsIn ? `${Math.max(r.pct, 2)}%` : "0%", height: "100%", borderRadius: 2, background: mine ? T.terra : (r.color === "#FFFFFF" ? T.mono : r.color), transition: "width .6s ease" }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ fontFamily: T.body, fontSize: 13, color: T.muted, fontStyle: "italic" }}>No predictions yet — be the first to call it.</div>
        )
      ) : fetchErr ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".08em", color: T.muted2, textTransform: "uppercase" }}>
          <span>Couldn&apos;t load the board</span>
          <button onClick={load} className="wc-press ed-wipe" style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".08em", color: T.terra, background: "transparent", border: "1px solid rgba(190,79,40,.4)", borderRadius: 999, padding: "4px 12px", cursor: "pointer", textTransform: "uppercase" }}>Retry</button>
        </div>
      ) : (
        <div style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".12em", color: T.mono, textTransform: "uppercase" }}>Loading the board…</div>
      )}
    </Reveal>
  );
}

const primaryBtn: React.CSSProperties = { padding: "10px 18px", borderRadius: 10, border: "none", background: T.ink, color: T.creamOn, fontFamily: T.disp, fontWeight: 700, fontSize: 14, cursor: "pointer" };
const ghostBtn: React.CSSProperties = { padding: "10px 16px", borderRadius: 10, border: `1px solid ${T.hair}`, background: T.paper, color: T.ink70, fontFamily: T.body, fontWeight: 600, fontSize: 14, cursor: "pointer" };

/**
 * Cuteness Cup — the head-to-head bracket (design 시안 08/09). HONEST by design:
 * no bracket-entry API exists yet, so the slots promise nothing — copy says
 * entries are NOT live, the away slot is always the mystery challenger (never
 * the user's own second pet cast as a fake opponent), and no round is marked
 * active until a real bracket API drives `activeStage`. The gold Champion is
 * explicitly "crowned at the Final", never a made-up winner.
 */
function CutenessCup({ pets, onEnter, activeStage }: { pets: Pet[]; onEnter: () => void; activeStage?: string }) {
  const stages = ["R16", "QF", "SF", "FINAL"];
  return (
    <div id="wc-cuteness" style={{ scrollMarginTop: 90, marginBottom: 26 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".14em", color: T.gold, textTransform: "uppercase" }}>Pet World Cup · Cuteness Cup</div>
          <h2 style={{ fontFamily: T.disp, fontSize: "clamp(24px,6vw,30px)", fontWeight: 800, color: T.ink, margin: "6px 0 0", letterSpacing: "-.02em" }}>Pick the cutest</h2>
        </div>
        <span style={{ alignSelf: "center", fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".12em", color: T.terraSub, textTransform: "uppercase", background: "rgba(190,79,40,.08)", border: `1px solid rgba(190,79,40,.22)`, borderRadius: 999, padding: "6px 12px" }}>Bracket opening soon — entries not live yet</span>
      </div>
      <p style={{ fontFamily: T.body, fontSize: 14, color: T.muted2, margin: "0 0 16px", lineHeight: 1.55, maxWidth: 580 }}>
        Enter your pet into a head-to-head cuteness bracket — the community votes each matchup, winners climb R16 → Final, and one pet is crowned Champion. Real pets, real votes: no scores show until voting goes live.
      </p>

      {/* HOW IT WORKS — three numbered steps so the bracket reads instantly
          even before entries exist (owner: the bare VS block was confusing).
          Each step rises in on scroll, 90ms apart. */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 18px" }}>
        {([["1", "ENTER", "Put your pet in the bracket — entries open soon"], ["2", "VOTE", "The community picks the cutest of each matchup"], ["3", "CROWN", "Winners climb R16 → Final; one pet lifts the trophy"]] as const).map(([n, k, d], i) => (
          <Reveal key={k} dir="up" delay={i * 90} style={{ flex: "1 1 180px" }}>
          <div className="ed-card-hover" style={{ height: "100%", boxSizing: "border-box", background: T.paper, border: `1px solid ${T.hair}`, borderRadius: 12, padding: "10px 12px", display: "flex", gap: 9, alignItems: "flex-start", boxShadow: "var(--ed-shadow-card)" }}>
            <span style={{ width: 22, height: 22, borderRadius: 7, background: T.terra, color: "#FFF8EE", fontFamily: T.m, fontWeight: 700, fontSize: 13, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{n}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".1em", color: T.ink }}>{k}</span>
              <span style={{ display: "block", fontFamily: T.body, fontSize: 13, color: T.muted2, marginTop: 2, lineHeight: 1.45 }}>{d}</span>
            </span>
          </div>
          </Reveal>
        ))}
      </div>

      {/* VS card — an explicitly-labelled PREVIEW in a dashed frame with inert
          slots (no decoy clicks). The away slot is ALWAYS the mystery challenger
          (a real community pet is matched only when voting opens). Pops in as
          one block on scroll. */}
      <Reveal dir="pop">
      <div style={{ position: "relative", border: "1.5px dashed rgba(33,26,18,.28)", borderRadius: 24, padding: 12, marginBottom: 14 }}>
        <span style={{ position: "absolute", top: -9, left: 16, background: T.field, padding: "0 9px", fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".12em", color: T.mono, textTransform: "uppercase", zIndex: 4 }}>
          Preview — how a matchup will look
        </span>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "stretch" }}>
          <Slot side="home" pet={pets[0]} />
          <div style={{ position: "relative", overflow: "hidden", alignSelf: "center", zIndex: 3, width: 52, height: 52, margin: "0 -12px", borderRadius: "50%", background: T.ink, border: `3px solid ${T.paper}`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 0 2px ${T.ink}, 0 12px 22px -10px rgba(80,55,20,.6)` }}>
            <span className="ed-foil-text" style={{ fontFamily: T.disp, fontWeight: 800, fontSize: 15 }}>VS</span>
            <div className="ed-gloss" aria-hidden style={{ left: 0 }} />
          </div>
          <Slot side="away" pet={undefined} />
        </div>
      </div>
      </Reveal>

      {/* ONE explicit action while entries are closed: style the contender in
          the National Pet studio below (this is what the old decoy slots did
          silently — now it says so). */}
      <div style={{ textAlign: "center", margin: "0 0 18px" }}>
        <button onClick={onEnter} className="wc-press" style={{ border: "none", cursor: "pointer", borderRadius: 12, padding: "12px 24px", background: "linear-gradient(180deg,#F49B2A,#E27D0C)", color: "#FFF8EE", fontFamily: T.body, fontWeight: 700, fontSize: 14.5, boxShadow: "var(--ed-shadow-card)" }}>
          Style your contender while entries open ▸
        </button>
        <div style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, color: T.mono, marginTop: 7, letterSpacing: ".1em", textTransform: "uppercase" }}>Uses the National Pet studio below</div>
      </div>

      {/* bracket strip R16 → Final: every round dormant until a real bracket
          API passes activeStage; the strip terminates in the gold FINAL pill.
          The whole strip (plus its caption) rises in on scroll as one row. */}
      <Reveal dir="up">
      <div style={{ display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap", rowGap: 8 }}>
        {stages.map((s, i) => {
          const isFinal = s === "FINAL";
          const isActive = activeStage === s;
          return (
            <span key={s} style={{ display: "inline-flex", alignItems: "center" }}>
              <span className={isFinal ? "ed-foilstrip" : undefined} style={{
                fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".08em",
                color: isFinal ? T.ink : isActive ? T.terra : T.mono,
                border: `1px solid ${isFinal ? "rgba(184,130,44,.55)" : isActive ? "rgba(190,79,40,.4)" : T.hair}`,
                background: isFinal ? undefined : isActive ? "rgba(190,79,40,.08)" : "transparent",
                borderRadius: 999, padding: "5px 12px",
              }}>{s}</span>
              {i < stages.length - 1 && <span aria-hidden style={{ width: 16, borderTop: "1px dashed rgba(33,26,18,.3)" }} />}
            </span>
          );
        })}
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".1em", color: T.gold, textTransform: "uppercase" }}>
          <Icon name="trophy" size={13} /> Champion — crowned at the Final
        </span>
      </div>
      <div style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".12em", color: T.mono, textTransform: "uppercase", marginTop: 8 }}>Rounds open with voting</div>
      </Reveal>
    </div>
  );
}

function Slot({ side, pet }: { side: "home" | "away"; pet?: Pet }) {
  const isHome = side === "home";
  const accent = isHome ? T.terra : T.teal;
  return (
    <div aria-hidden style={{
      position: "relative", textAlign: "center",
      background: accent, borderRadius: isHome ? "18px 10px 10px 18px" : "10px 18px 18px 10px",
      padding: "20px 16px 18px", boxShadow: "var(--ed-shadow-card)", overflow: "hidden",
    }}>
      <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", aspectRatio: "1 / 1", background: "rgba(252,233,207,.14)", border: "2px solid rgba(252,233,207,.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {pet?.avatar_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={pet.avatar_url} alt={pet.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <span style={{ fontFamily: T.disp, fontWeight: 800, fontSize: 42, color: "rgba(252,233,207,.55)" }}>?</span>}
        <div className="ed-gloss" aria-hidden style={{ left: 0 }} />
      </div>
      <div style={{ fontFamily: T.disp, fontWeight: 800, fontSize: 18, color: T.creamOn, marginTop: 12 }}>{pet?.name || (isHome ? "Your pet" : "A challenger")}</div>
      <div style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".1em", color: "rgba(252,233,207,.78)", marginTop: 4, textTransform: "uppercase" }}>
        {/* Home slot always receives pets[0] (pets.length > 0 guards this screen);
            the away slot is always the mystery challenger — no third branch. */}
        {pet ? "Entries open soon" : "A community pet — matched when voting opens"}
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const chipStyle: React.CSSProperties = {
    background: "transparent", border: "none", borderBottom: "1px dotted rgba(154,123,78,.55)",
    padding: "0 0 1px", cursor: "pointer", fontFamily: T.m, fontSize: 13, fontWeight: 700,
    letterSpacing: ".1em", textTransform: "uppercase", color: T.mono,
  };
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "8px 0 40px", fontFamily: T.body, color: T.ink }}>
      {/* Screen-local motion vocabulary (globals' reduced-motion blanket also applies). */}
      <style>{`
        @keyframes wcRise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        .wc-rise{animation:wcRise .5s cubic-bezier(.22,.9,.3,1) backwards}
        .wc-press{transition:transform .12s ease}
        .wc-press:active{transform:translateY(1px) scale(.985)}
        @media (prefers-reduced-motion: reduce){
          .wc-rise{animation:none}
          .wc-press:active{transform:none}
        }
      `}</style>
      {/* ── editorial hero: PET WORLD CUP — three ways to play ── */}
      <div className="wc-rise" style={{
        position: "relative", overflow: "hidden", borderRadius: 22, padding: "34px 28px 30px", marginBottom: 24,
        background: T.field, border: `1px solid ${T.hair}`, boxShadow: "var(--ed-shadow-card)", textAlign: "center",
      }}>
        <div className="ed-grain" /><div className="ed-glow" /><div className="ed-vignette" />
        <div aria-hidden style={{ position: "absolute", right: -8, top: -16, opacity: 0.08, lineHeight: 1, zIndex: 1 }}><Icon name="trophy" size={130} /></div>
        <div style={{ position: "relative", zIndex: 2 }}>
          <div style={{ fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: "0.18em", color: T.terraSub, textTransform: "uppercase" }}>Pet World Cup · 2026</div>
          <h1 style={{ fontFamily: T.disp, fontSize: "clamp(34px,8vw,50px)", fontWeight: 800, color: T.ink, margin: "10px 0 0", letterSpacing: "-0.03em", lineHeight: 0.96 }}>Two ways to play now</h1>
          <p style={{ fontFamily: T.body, fontSize: 15.5, color: T.muted2, margin: "16px auto 0", lineHeight: 1.6, maxWidth: 580 }}>
            The 2026 World Cup is on. <strong style={{ color: T.ink, fontWeight: 600 }}>Fly your colors</strong> — reimagine your pet as your country&apos;s national animal — and predict who lifts the trophy. The <strong style={{ color: T.terra, fontWeight: 600 }}>Cuteness Cup</strong> bracket is coming soon.
          </p>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 12, margin: "18px 0 0", fontFamily: T.m, fontSize: 13, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: T.mono, flexWrap: "wrap", justifyContent: "center" }}>
            <button onClick={() => jump("wc-cuteness")} className="wc-press" style={chipStyle}>Cuteness Cup</button>
            <span aria-hidden style={{ width: 4, height: 4, borderRadius: "50%", background: T.hair }} />
            <button onClick={() => jump("wc-national")} className="wc-press" style={chipStyle}>National Pet</button>
            <span aria-hidden style={{ width: 4, height: 4, borderRadius: "50%", background: T.hair }} />
            <button onClick={() => jump("wc-predict")} className="wc-press" style={{ ...chipStyle, color: T.terraSub, borderBottomColor: "rgba(154,78,30,.55)" }}>Predict the Champion</button>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "28px 0", fontFamily: T.body, fontSize: 14, color: T.muted2 }}>{children}</div>;
}
