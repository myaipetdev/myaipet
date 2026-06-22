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
import { api, getAuthHeaders } from "@/lib/api";
import { WORLD_CUP_COUNTRIES, buildCountryPromptFragment, flagUrl, type WorldCupCountry } from "@/lib/worldcup/countries";

const INK = "#1a1a22";
const MUTED = "#6b6b73";
const LINE = "rgba(16,16,28,0.10)";
const GOLD = "#b45309";
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
          <a href="/?section=my%20pet" style={{ color: GOLD, fontWeight: 700, textDecoration: "none" }}>Adopt a pet ▸</a>
        </Empty>
      </Shell>
    );
  }

  return (
    <Shell>
      <ChampionPrediction />

      {/* Pet picker (only if >1) */}
      {pets.length > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontFamily: "monospace", letterSpacing: "0.12em", color: MUTED, textTransform: "uppercase" }}>Your pet</span>
          {pets.map((p) => (
            <button key={p.id} onClick={() => setPetId(p.id)} style={{
              padding: "6px 14px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 700,
              border: `1.5px solid ${p.id === petId ? GOLD : LINE}`,
              background: p.id === petId ? "rgba(245,158,11,0.1)" : "#fff",
              color: p.id === petId ? "#7a3d00" : MUTED,
            }}>{p.name}</button>
          ))}
        </div>
      )}

      {/* Flag grid */}
      <div style={{ fontSize: 13.5, color: MUTED, marginBottom: 12 }}>
        Pick a country — your pet becomes its iconic animal in the flag&apos;s colors.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))", gap: 10, marginBottom: 22 }}>
        {WORLD_CUP_COUNTRIES.map((c) => {
          const on = country?.code === c.code;
          return (
            <button key={c.code} onClick={() => setCountry(c)} title={`${c.name} — ${c.animal}`} style={{
              display: "flex", flexDirection: "column", alignItems: "stretch", gap: 0,
              padding: 0, borderRadius: 12, cursor: "pointer", overflow: "hidden",
              border: `2px solid ${on ? GOLD : LINE}`,
              background: "#fff",
              boxShadow: on ? "0 6px 18px rgba(245,158,11,0.3)" : "0 1px 4px rgba(0,0,0,0.06)",
              transform: on ? "translateY(-2px)" : "none",
              transition: "all .14s",
            }}>
              <div style={{ position: "relative", width: "100%", aspectRatio: "3 / 2", background: "#eee" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={flagUrl(c, 160)} alt={`${c.name} flag`} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                {on && <div style={{ position: "absolute", inset: 0, background: "rgba(245,158,11,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>✓</div>}
              </div>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: on ? "#7a3d00" : INK, textAlign: "center", lineHeight: 1.2, padding: "7px 4px" }}>{c.name}</span>
            </button>
          );
        })}
      </div>

      {/* Generate */}
      <button onClick={generate} disabled={!country || busy} style={{
        width: "100%", padding: "14px 18px", borderRadius: 12, border: "none",
        background: !country || busy ? "rgba(0,0,0,0.12)" : INK, color: "#fff",
        fontSize: 15, fontWeight: 800, cursor: !country || busy ? "not-allowed" : "pointer",
        fontFamily: "'Space Grotesk', system-ui, sans-serif",
      }}>
        {busy ? "Rendering your national pet…"
          : country ? `Make my ${country.flag} ${country.name} pet · ${GEN_COST} credits`
          : "Pick a country above"}
      </button>

      {err && <div style={{ background: "#fde8e8", color: "#9b1c1c", borderRadius: 10, padding: "10px 14px", fontSize: 13.5, marginTop: 16 }}>{err}</div>}

      {/* Result */}
      {resultUrl && (
        <div style={{ marginTop: 22 }}>
          <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", border: `1px solid ${LINE}`, background: "#000" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={resultUrl} alt={`${pet?.name} as a ${country?.name} pet`} style={{ width: "100%", display: "block" }} />
            {country && (
              <div style={{ position: "absolute", top: 10, left: 10, padding: "5px 12px", borderRadius: 999, background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 13, fontWeight: 700, backdropFilter: "blur(6px)" }}>
                {country.flag} {country.name}
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
            <button onClick={shareToX} style={primaryBtn}>𝕏 &nbsp;Share on X</button>
            <button onClick={copyLink} style={ghostBtn}>{copied ? "Link copied ✓" : "Copy link"}</button>
            <button onClick={setAsAvatar} style={ghostBtn}>Set as my pet&apos;s avatar</button>
            <button onClick={generate} disabled={busy} style={{ ...ghostBtn, opacity: busy ? 0.6 : 1 }}>Regenerate</button>
          </div>
          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 10 }}>
            Sharing opens X with your post pre-filled — nothing is posted until you press Post.
          </div>
        </div>
      )}
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
      borderRadius: 18, border: `1px solid ${LINE}`, background: "#fff",
      padding: "20px 20px 22px", marginBottom: 24, boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 19, fontWeight: 900, color: INK, letterSpacing: "-0.01em" }}>Predict the Champion 🏆</span>
        <span style={{ fontSize: 11, fontFamily: "monospace", letterSpacing: "0.08em", color: MUTED, background: "rgba(0,0,0,0.04)", padding: "3px 8px", borderRadius: 999, textTransform: "uppercase" }}>
          {total} {total === 1 ? "vote" : "votes"}
        </span>
      </div>
      <div style={{ fontSize: 13, color: MUTED, margin: "6px 0 14px", lineHeight: 1.5 }}>
        Who lifts the 2026 trophy? Cast your pick — the board below is the live community count. (A prediction poll, not live match results.)
      </div>

      {/* Picker */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: rows.length ? 18 : 4 }}>
        <select
          value={sel}
          onChange={(e) => setSel(e.target.value)}
          style={{
            flex: "1 1 200px", minWidth: 0, padding: "10px 12px", borderRadius: 10,
            border: `1.5px solid ${LINE}`, background: "#fff", color: INK, fontSize: 14, fontWeight: 600,
            fontFamily: "'Space Grotesk', system-ui, sans-serif", cursor: "pointer",
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
            background: !sel || saving ? "rgba(0,0,0,0.12)" : GOLD, color: "#fff",
            fontWeight: 800, fontSize: 14, cursor: !sel || saving ? "not-allowed" : "pointer",
            fontFamily: "'Space Grotesk', system-ui, sans-serif", flexShrink: 0,
          }}
        >
          {saving ? "Saving…" : myPick ? "Update pick" : "Predict"}
        </button>
      </div>

      {!authed && (
        <div style={{ fontSize: 12.5, color: "#9b1c1c", background: "#fde8e8", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
          Connect your wallet to cast your prediction.
        </div>
      )}
      {myCountry && (
        <div style={{ fontSize: 13, color: INK, marginBottom: 14 }}>
          Your pick: <strong>{myCountry.flag} {myCountry.name}</strong>
          {pts !== null && <span style={{ color: GOLD, fontWeight: 700 }}> · +{pts} airdrop points 🪙</span>}
        </div>
      )}

      {/* Leaderboard bars */}
      {rows.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((r, i) => {
            const mine = r.code === myPick;
            return (
              <div key={r.code} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: MUTED, width: 18, textAlign: "right", flexShrink: 0 }}>{i + 1}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.flag} alt={`${r.name} flag`} loading="lazy" style={{ width: 26, height: 18, objectFit: "cover", borderRadius: 3, flexShrink: 0, border: `1px solid ${LINE}` }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}>
                    <span style={{ fontWeight: mine ? 800 : 600, color: mine ? GOLD : INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.name}{mine ? " · you" : ""}
                    </span>
                    <span style={{ color: MUTED, fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>{r.pct}%</span>
                  </div>
                  <div style={{ height: 7, borderRadius: 999, background: "rgba(0,0,0,0.06)", overflow: "hidden" }}>
                    <div style={{ width: `${Math.max(r.pct, 2)}%`, height: "100%", borderRadius: 999, background: mine ? GOLD : (r.color === "#FFFFFF" ? "#94a3b8" : r.color) }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: MUTED, fontStyle: "italic" }}>No predictions yet — be the first to call it.</div>
      )}
    </div>
  );
}

const primaryBtn: React.CSSProperties = { padding: "10px 18px", borderRadius: 10, border: "none", background: INK, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" };
const ghostBtn: React.CSSProperties = { padding: "10px 16px", borderRadius: 10, border: `1px solid ${LINE}`, background: "#fff", color: INK, fontWeight: 600, fontSize: 14, cursor: "pointer" };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "8px 0 40px", fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
      <div style={{
        position: "relative", overflow: "hidden", borderRadius: 22, padding: "30px 28px", marginBottom: 24,
        background: "linear-gradient(120deg, #16a34a 0%, #0ea5e9 48%, #f59e0b 100%)",
        boxShadow: "0 14px 40px rgba(14,165,233,0.28)",
      }}>
        <div style={{ position: "absolute", right: -10, top: -18, fontSize: 130, opacity: 0.16, lineHeight: 1 }}>🏆</div>
        <div style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: "0.2em", color: "rgba(255,255,255,0.92)", textTransform: "uppercase" }}>World Cup 2026 · national pet</div>
        <h1 style={{ fontSize: 32, fontWeight: 900, color: "#fff", margin: "8px 0 0", letterSpacing: "-0.02em", textShadow: "0 2px 12px rgba(0,0,0,0.18)" }}>Suit up your pet ⚽</h1>
        <p style={{ fontSize: 15, color: "rgba(255,255,255,0.92)", margin: "10px 0 0", lineHeight: 1.55, maxWidth: 540 }}>
          Reimagine your pet as your country&apos;s iconic animal in its flag colors — then share your national pride on X.
        </p>
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "28px 0", fontSize: 14, color: MUTED }}>{children}</div>;
}
