"use client";

/**
 * WorldCupPet — time-boxed World Cup 2026 national-pet skin.
 *
 * Pick your country from a flag grid → your EXISTING pet is reimagined as that
 * nation's iconic animal in its flag colors, then one-tap (opt-in) share to X.
 *
 * Reuses the Studio pipeline unchanged: POST /api/studio/generate with
 * modelId "grok-imagine" (supportsImageRef → the pet's avatar is the reference,
 * so it stays YOUR pet) + a themed prompt. Sharing uses the existing /c/[id]
 * public page whose summary_large_image OG card X unfurls into the tweet.
 */

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { api, getAuthHeaders } from "@/lib/api";
import CollectibleFrame from "@/components/editorial/CollectibleFrame";
import { WORLD_CUP_COUNTRIES, buildCountryPromptFragment, flagUrl, type WorldCupCountry } from "@/lib/worldcup/countries";

// ── Collectible Editorial tokens ──
const T = {
  field: "#ECE4D4", paper: "#FBF6EC", inset: "#F5EFE2", ink: "#211A12", ink70: "#3A3024",
  muted: "#7A6E5A", muted2: "#5C5140", mono: "#9A7B4E", hair: "rgba(33,26,18,.13)",
  terra: "#BE4F28", terraSub: "#9A4E1E", teal: "#1B5A4B", creamOn: "#FCE9CF",
  gold: "#C8932F", disp: "var(--ed-disp)", body: "var(--ed-body)", m: "var(--ed-m)",
};
const GEN_COST = 5; // grok-imagine, matches providers.ts

type Pet = { id: number; name: string; avatar_url?: string | null };

export default function WorldCupPet() {
  const [pets, setPets] = useState<Pet[]>([]);
  const [petId, setPetId] = useState<number | null>(null);
  const [country, setCountry] = useState<WorldCupCountry | null>(null);
  const [busy, setBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [genId, setGenId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [notAuthed, setNotAuthed] = useState(false);

  const pet = pets.find((p) => p.id === petId) || null;

  useEffect(() => {
    api.pets.list().then((d: any) => {
      const list: Pet[] = (d?.pets || []).map((p: any) => ({ id: p.id, name: p.name, avatar_url: p.avatar_url }));
      setPets(list);
      if (list[0]) setPetId(list[0].id);
    }).catch((e: any) => {
      if (e?.status === 401) setNotAuthed(true);
    });
  }, []);

  const generate = async () => {
    if (!pet || !country || busy) return;
    setBusy(true); setErr(null); setResultUrl(null); setGenId(null); setCopied(false);
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
      } else {
        // grok-imagine is synchronous; if it didn't complete inline, point to History.
        setErr("Still rendering — check Studio → History in a moment.");
      }
    } catch (e: any) {
      setErr(e?.message || "Generation failed");
    } finally {
      setBusy(false);
    }
  };

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
    if (!resultUrl || !pet) return;
    try {
      await fetch(`/api/pets/${pet.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ avatar_url: resultUrl }),
      });
      setErr(null);
    } catch { /* non-fatal */ }
  };

  // ── states ──
  if (notAuthed) {
    return <Shell><Empty>Connect your wallet to make your World Cup pet.</Empty></Shell>;
  }
  if (pets.length === 0) {
    return (
      <Shell>
        <Empty>
          Adopt a pet first, then bring it to the World Cup.{" "}
          <a href="/?section=my%20pet" style={{ fontFamily: T.m, fontWeight: 700, fontSize: 12, letterSpacing: ".06em", color: T.terra, textDecoration: "none" }}>ADOPT A PET ▸</a>
        </Empty>
      </Shell>
    );
  }

  return (
    <Shell>
      <CutenessCup pets={pets} onEnter={() => document.getElementById("wc-national")?.scrollIntoView({ behavior: "smooth", block: "start" })} />

      {/* ── National Pet path ── */}
      <div id="wc-national" style={{ scrollMarginTop: 90, borderTop: `1px solid ${T.hair}`, paddingTop: 22, marginBottom: 6 }}>
        <div style={{ fontFamily: T.m, fontSize: 10, fontWeight: 700, letterSpacing: ".14em", color: T.terraSub, textTransform: "uppercase" }}>Pet World Cup · National Pet</div>
        <h2 style={{ fontFamily: T.disp, fontSize: 28, fontWeight: 800, color: T.ink, margin: "6px 0 2px", letterSpacing: "-.02em" }}>Fly your colors</h2>
      </div>

      {/* Pet picker (only if >1) */}
      {pets.length > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontFamily: T.m, fontWeight: 700, letterSpacing: "0.14em", color: T.mono, textTransform: "uppercase" }}>Your pet</span>
          {pets.map((p) => (
            <button key={p.id} onClick={() => setPetId(p.id)} style={{
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))", gap: 10, marginBottom: 22 }}>
        {WORLD_CUP_COUNTRIES.map((c) => {
          const on = country?.code === c.code;
          return (
            <button key={c.code} onClick={() => setCountry(c)} title={`${c.name} — ${c.animal}`} style={{
              display: "flex", flexDirection: "column", alignItems: "stretch", gap: 0,
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
                {on && <div style={{ position: "absolute", inset: 0, background: "rgba(190,79,40,0.22)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.disp, fontWeight: 800, fontSize: 22, color: T.creamOn }}>✓</div>}
              </div>
              {/* Single line for every name (all fit — longest is "Saudi
                  Arabia" at ~69px in ~106px), so each label is the same height
                  with identical padding above/below → uniform gap on every card.
                  Ellipsis is just a safety net; it never triggers for this set. */}
              <span style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: T.m, fontSize: 10.5, fontWeight: 700, letterSpacing: ".03em", color: on ? T.terra : T.ink70, textAlign: "center", lineHeight: 1.2, padding: "9px 6px", textTransform: "uppercase" }}>{c.name}</span>
            </button>
          );
        })}
      </div>

      {/* Generate */}
      <button onClick={generate} disabled={!country || busy} style={{
        width: "100%", padding: "14px 18px", borderRadius: 12, border: "none",
        background: !country || busy ? "rgba(33,26,18,0.14)" : T.ink, color: !country || busy ? T.muted : T.creamOn,
        fontSize: 15, fontWeight: 700, cursor: !country || busy ? "not-allowed" : "pointer",
        fontFamily: T.disp, boxShadow: !country || busy ? "none" : "var(--ed-shadow-card)",
      }}>
        {busy ? "Rendering your national pet…"
          : country ? `Make my ${country.flag} ${country.name} pet · ${GEN_COST} credits`
          : "Pick a country above"}
      </button>

      {err && <div style={{ fontFamily: T.body, background: "rgba(190,79,40,.08)", color: T.terraSub, border: `1px solid rgba(190,79,40,.22)`, borderRadius: 10, padding: "10px 14px", fontSize: 13.5, marginTop: 16 }}>{err}</div>}

      {/* Result */}
      {resultUrl && (
        <div style={{ marginTop: 22 }}>
          <div style={{ position: "relative", borderRadius: 18, overflow: "hidden", background: T.field, border: `1px solid ${T.hair}`, boxShadow: "var(--ed-shadow-card)" }}>
            <div className="ed-glow" /><div className="ed-vignette" />
            {country && (
              <div style={{ position: "relative", zIndex: 2, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 18px 0", fontFamily: T.m, fontSize: 10, fontWeight: 700, letterSpacing: ".12em", color: T.muted2, textTransform: "uppercase" }}>
                <span>{country.flag} {country.name}</span>
                <span style={{ color: T.mono }}>NATIONAL PET</span>
              </div>
            )}
            <div style={{ position: "relative", zIndex: 2, display: "flex", justifyContent: "center", padding: "30px 18px 40px" }}>
              <CollectibleFrame
                photoUrl={resultUrl}
                level={pet?.name ? pet.name : "WC"}
                speciesLabel={country ? country.name.toUpperCase() : undefined}
                elementLabel={country ? country.animal.toUpperCase() : undefined}
                width={330}
                tilt={-2.4}
              />
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
            <button onClick={shareToX} style={primaryBtn}>𝕏 &nbsp;Share on X</button>
            <button onClick={copyLink} style={ghostBtn}>{copied ? "Link copied ✓" : "Copy link"}</button>
            <button onClick={setAsAvatar} style={ghostBtn}>Set as my pet&apos;s avatar</button>
            <button onClick={generate} disabled={busy} style={{ ...ghostBtn, opacity: busy ? 0.6 : 1 }}>Regenerate</button>
          </div>
          <div style={{ fontFamily: T.body, fontSize: 11.5, color: T.muted, marginTop: 10 }}>
            Sharing opens X with your post pre-filled — nothing is posted until you press Post.
          </div>
        </div>
      )}

      {/* ── Predict the Champion (real community poll) ── */}
      <div style={{ borderTop: `1px solid ${T.hair}`, marginTop: 30, paddingTop: 24 }}>
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

function ChampionPrediction() {
  const [rows, setRows] = useState<WcRow[]>([]);
  const [total, setTotal] = useState(0);
  const [myPick, setMyPick] = useState<string | null>(null);
  const [sel, setSel] = useState("");
  const [saving, setSaving] = useState(false);
  const [pts, setPts] = useState<number | null>(null);
  const [authed, setAuthed] = useState(true);

  const apply = (d: any) => {
    setRows(Array.isArray(d?.leaderboard) ? d.leaderboard : []);
    setTotal(d?.total || 0);
    if (typeof d?.myPick === "string" || d?.myPick === null) setMyPick(d.myPick);
  };

  useEffect(() => {
    fetch("/api/worldcup/predict", { headers: { ...getAuthHeaders() } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { apply(d); if (d.myPick) setSel(d.myPick); } })
      .catch(() => {});
  }, []);

  const submit = async () => {
    if (!sel || saving) return;
    setSaving(true); setPts(null);
    try {
      const res = await fetch("/api/worldcup/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ code: sel }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 401) { setAuthed(false); return; }
      if (res.ok) { apply(d); if (typeof d.pointsAwarded === "number" && d.pointsAwarded > 0) setPts(d.pointsAwarded); }
    } finally {
      setSaving(false);
    }
  };

  const myCountry = myPick ? WORLD_CUP_COUNTRIES.find((c) => c.code === myPick) : null;

  return (
    <div style={{
      borderRadius: 22, border: `1px solid ${T.hair}`, background: T.paper,
      padding: "22px 22px 24px", marginBottom: 24, boxShadow: "var(--ed-shadow-card)",
    }}>
      <div style={{ fontFamily: T.m, fontWeight: 700, fontSize: 10, letterSpacing: ".14em", color: T.gold, textTransform: "uppercase", marginBottom: 6 }}>PET WORLD CUP · COMMUNITY POLL</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: T.disp, fontSize: 30, fontWeight: 800, color: T.ink, letterSpacing: "-0.02em", display: "inline-flex", alignItems: "center", gap: 9 }}>Predict the Champion <Icon name="trophy" size={24} /></span>
        <span style={{ fontFamily: T.m, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: T.muted2, border: `1px solid ${T.hair}`, padding: "3px 9px", borderRadius: 999, textTransform: "uppercase" }}>
          {total} {total === 1 ? "vote" : "votes"}
        </span>
      </div>
      <div style={{ fontFamily: T.body, fontSize: 13.5, color: T.muted2, margin: "8px 0 12px", lineHeight: 1.55 }}>
        Who lifts the 2026 trophy? Cast your pick — the board below is the live community count. (A prediction poll, not live match results.)
      </div>
      {/* Factual tournament reference — real, verifiable WC2026 format (no fabricated scores/draws). */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        {["48 nations", "Hosts: USA · Canada · Mexico", "Group stage → knockout → final"].map((f) => (
          <span key={f} style={{ fontSize: 10, fontFamily: T.m, fontWeight: 700, letterSpacing: ".04em", color: T.mono, background: T.inset, border: `1px solid ${T.hair}`, borderRadius: 999, padding: "3px 10px", textTransform: "uppercase" }}>{f}</span>
        ))}
      </div>

      {/* Picker */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: rows.length ? 18 : 4 }}>
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
            <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
          ))}
        </select>
        <button
          onClick={submit}
          disabled={!sel || saving}
          style={{
            padding: "10px 18px", borderRadius: 10, border: "none",
            background: !sel || saving ? "rgba(33,26,18,0.14)" : T.gold, color: !sel || saving ? T.muted : "#3A2606",
            fontWeight: 700, fontSize: 14, cursor: !sel || saving ? "not-allowed" : "pointer",
            fontFamily: T.disp, flexShrink: 0,
          }}
        >
          {saving ? "Saving…" : myPick ? "Update pick" : "Predict"}
        </button>
      </div>

      {!authed && (
        <div style={{ fontFamily: T.body, fontSize: 12.5, color: T.terraSub, background: "rgba(190,79,40,.08)", border: `1px solid rgba(190,79,40,.22)`, borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
          Connect your wallet to cast your prediction.
        </div>
      )}
      {myCountry && (
        <div style={{ fontFamily: T.body, fontSize: 13, color: T.ink, marginBottom: 14 }}>
          Your pick: <strong>{myCountry.flag} {myCountry.name}</strong>
          {pts !== null && <span style={{ color: T.gold, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}> · +{pts} season points <Icon name="coin" size={14} /></span>}
        </div>
      )}

      {/* Community podium — top-3 most-predicted, styled like a tournament board */}
      {rows.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 10, fontFamily: T.m, fontWeight: 700, letterSpacing: ".12em", color: T.mono, textTransform: "uppercase", marginBottom: 12 }}>Community podium · who players back to win</div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 10 }}>
            {[{ r: rows[1], place: 2, h: 50, medal: "#B6A88C" }, { r: rows[0], place: 1, h: 72, medal: T.gold }, { r: rows[2], place: 3, h: 38, medal: "#C08A5A" }]
              .filter((x) => x.r)
              .map(({ r, place, h, medal }) => (
                <div key={r!.code} style={{ flex: "0 1 100px", textAlign: "center" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r!.flag} alt={r!.name} style={{ width: 42, height: 29, objectFit: "cover", borderRadius: 4, border: `2px solid ${medal}`, margin: "0 auto 5px", display: "block", boxShadow: place === 1 ? "0 6px 14px -6px rgba(80,55,20,.5)" : "none" }} />
                  <div style={{ fontFamily: T.disp, fontSize: 13, fontWeight: 700, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r!.name}</div>
                  <div style={{ fontFamily: T.m, fontSize: 11, fontWeight: 700, color: T.muted }}>{r!.pct}%</div>
                  <div style={{ height: h, borderRadius: "8px 8px 0 0", background: `linear-gradient(${medal}, ${medal}cc)`, border: `1px solid ${T.ink}`, borderBottom: "none", marginTop: 6, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 5, fontFamily: T.disp, color: T.paper, fontWeight: 800, fontSize: 17 }}>{place}</div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Full standings */}
      {rows.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((r, i) => {
            const mine = r.code === myPick;
            return (
              <div key={r.code} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: T.m, fontSize: 11, fontWeight: 700, color: T.mono, width: 18, textAlign: "right", flexShrink: 0 }}>{i + 1}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.flag} alt={`${r.name} flag`} loading="lazy" style={{ width: 26, height: 18, objectFit: "cover", borderRadius: 3, flexShrink: 0, border: `1px solid ${T.hair}` }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                    <span style={{ fontFamily: T.body, fontWeight: mine ? 700 : 500, color: mine ? T.terra : T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.name}{mine ? " · you" : ""}
                    </span>
                    <span style={{ fontFamily: T.m, color: T.muted, fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>{r.pct}%</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: "rgba(33,26,18,.08)", overflow: "hidden" }}>
                    <div style={{ width: `${Math.max(r.pct, 2)}%`, height: "100%", borderRadius: 2, background: mine ? T.terra : (r.color === "#FFFFFF" ? T.mono : r.color), transition: "width .6s ease" }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ fontFamily: T.body, fontSize: 12.5, color: T.muted, fontStyle: "italic" }}>No predictions yet — be the first to call it.</div>
      )}
    </div>
  );
}

const primaryBtn: React.CSSProperties = { padding: "10px 18px", borderRadius: 10, border: "none", background: T.ink, color: T.creamOn, fontFamily: T.disp, fontWeight: 700, fontSize: 14, cursor: "pointer" };
const ghostBtn: React.CSSProperties = { padding: "10px 16px", borderRadius: 10, border: `1px solid ${T.hair}`, background: T.paper, color: T.ink70, fontFamily: T.body, fontWeight: 600, fontSize: 14, cursor: "pointer" };

/**
 * Cuteness Cup — the head-to-head bracket (design 시안 08/09). HONEST by design:
 * the tournament forms from real community pets and shows NO vote counts, matchups,
 * or champion until voting is actually live — the slots are entry CTAs, not a
 * fabricated live match. The gold Champion is explicitly "crowned at the Final",
 * never a made-up winner.
 */
function CutenessCup({ pets, onEnter }: { pets: Pet[]; onEnter: () => void }) {
  const stages = ["R16", "QF", "SF", "FINAL"];
  return (
    <div style={{ marginBottom: 26 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: T.m, fontSize: 10, fontWeight: 700, letterSpacing: ".14em", color: T.gold, textTransform: "uppercase" }}>Pet World Cup · Cuteness Cup</div>
          <h2 style={{ fontFamily: T.disp, fontSize: 30, fontWeight: 800, color: T.ink, margin: "6px 0 0", letterSpacing: "-.02em" }}>Pick the cutest</h2>
        </div>
        <span style={{ alignSelf: "center", fontFamily: T.m, fontSize: 10, fontWeight: 700, letterSpacing: ".12em", color: T.terraSub, textTransform: "uppercase", background: "rgba(190,79,40,.08)", border: `1px solid rgba(190,79,40,.22)`, borderRadius: 999, padding: "6px 12px" }}>Bracket opening</span>
      </div>
      <p style={{ fontFamily: T.body, fontSize: 14, color: T.muted2, margin: "0 0 16px", lineHeight: 1.55, maxWidth: 580 }}>
        Enter your pet into a head-to-head cuteness bracket — the community votes each matchup, winners climb R16 → Final, and one pet is crowned Champion. Real pets, real votes: no scores show until voting goes live.
      </p>

      {/* VS card — entry slots (no fabricated votes) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "stretch", marginBottom: 16 }}>
        <Slot side="home" pet={pets[0]} onEnter={onEnter} />
        <div style={{ alignSelf: "center", zIndex: 3, width: 52, height: 52, margin: "0 -12px", borderRadius: "50%", background: "radial-gradient(circle at 35% 30%,#FFF0C0,#EBB84E 48%,#B8822C)", border: `3px solid ${T.paper}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.disp, fontWeight: 800, fontSize: 15, color: "#5A3A0A", boxShadow: "0 12px 22px -10px rgba(80,55,20,.6)" }}>VS</div>
        <Slot side="away" pet={pets[1]} onEnter={onEnter} />
      </div>

      {/* bracket strip R16 → Final + champion note */}
      <div style={{ display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap", rowGap: 8 }}>
        {stages.map((s, i) => (
          <span key={s} style={{ display: "inline-flex", alignItems: "center" }}>
            <span style={{ fontFamily: T.m, fontSize: 10, fontWeight: 700, letterSpacing: ".08em", color: i === 0 ? T.terra : T.mono, border: `1px solid ${i === 0 ? "rgba(190,79,40,.4)" : T.hair}`, background: i === 0 ? "rgba(190,79,40,.08)" : "transparent", borderRadius: 999, padding: "5px 12px" }}>{s}</span>
            {i < stages.length - 1 && <span aria-hidden style={{ width: 16, height: 1, background: T.hair }} />}
          </span>
        ))}
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: T.m, fontSize: 10, fontWeight: 700, letterSpacing: ".1em", color: T.gold, textTransform: "uppercase" }}>
          <Icon name="trophy" size={13} /> Champion — crowned at the Final
        </span>
      </div>
    </div>
  );
}

function Slot({ side, pet, onEnter }: { side: "home" | "away"; pet?: Pet; onEnter: () => void }) {
  const isHome = side === "home";
  const accent = isHome ? T.terra : T.teal;
  return (
    <button onClick={onEnter} style={{
      position: "relative", cursor: "pointer", border: "none", textAlign: "center",
      background: accent, borderRadius: isHome ? "18px 10px 10px 18px" : "10px 18px 18px 10px",
      padding: "20px 16px 18px", boxShadow: "var(--ed-shadow-card)", overflow: "hidden",
    }}>
      <div style={{ borderRadius: 12, overflow: "hidden", aspectRatio: "1 / 1", background: "rgba(252,233,207,.14)", border: "2px solid rgba(252,233,207,.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {pet?.avatar_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={pet.avatar_url} alt={pet.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <span style={{ fontFamily: T.disp, fontWeight: 800, fontSize: 42, color: "rgba(252,233,207,.55)" }}>?</span>}
      </div>
      <div style={{ fontFamily: T.disp, fontWeight: 800, fontSize: 18, color: T.creamOn, marginTop: 12 }}>{pet?.name || (isHome ? "Your pet" : "A challenger")}</div>
      <div style={{ fontFamily: T.m, fontSize: 9.5, fontWeight: 700, letterSpacing: ".1em", color: "rgba(252,233,207,.78)", marginTop: 4, textTransform: "uppercase" }}>{pet ? "Ready to enter" : "Enter to claim a slot"}</div>
    </button>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "8px 0 40px", fontFamily: T.body, color: T.ink }}>
      {/* ── editorial hero: PET WORLD CUP — Pick the cutest (terracotta vs teal) ── */}
      <div style={{
        position: "relative", overflow: "hidden", borderRadius: 22, padding: "34px 28px 30px", marginBottom: 24,
        background: T.field, border: `1px solid ${T.hair}`, boxShadow: "var(--ed-shadow-card)", textAlign: "center",
      }}>
        <div className="ed-grain" /><div className="ed-glow" /><div className="ed-vignette" />
        <div aria-hidden style={{ position: "absolute", right: -8, top: -16, opacity: 0.08, lineHeight: 1, zIndex: 1 }}><Icon name="trophy" size={130} /></div>
        <div style={{ position: "relative", zIndex: 2 }}>
          <div style={{ fontFamily: T.m, fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", color: T.terraSub, textTransform: "uppercase" }}>Pet World Cup · 2026</div>
          <h1 style={{ fontFamily: T.disp, fontSize: 50, fontWeight: 800, color: T.ink, margin: "10px 0 0", letterSpacing: "-0.03em", lineHeight: 0.96 }}>Two ways to play</h1>
          <p style={{ fontFamily: T.body, fontSize: 15.5, color: T.muted2, margin: "16px auto 0", lineHeight: 1.6, maxWidth: 580 }}>
            The 2026 World Cup is on. Enter your pet in the <strong style={{ color: T.terra, fontWeight: 600 }}>Cuteness Cup</strong> head-to-head bracket, or <strong style={{ color: T.ink, fontWeight: 600 }}>fly your colors</strong> — reimagine your pet as your country&apos;s national animal. Then predict who lifts the trophy.
          </p>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 12, margin: "18px 0 0", fontFamily: T.m, fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: T.mono, flexWrap: "wrap", justifyContent: "center" }}>
            <span>Cuteness Cup</span>
            <span aria-hidden style={{ width: 4, height: 4, borderRadius: "50%", background: T.hair }} />
            <span>National Pet</span>
            <span aria-hidden style={{ width: 4, height: 4, borderRadius: "50%", background: T.hair }} />
            <span style={{ color: T.terraSub }}>Predict the Champion</span>
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
