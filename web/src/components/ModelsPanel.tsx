"use client";

/**
 * ModelsPanel — the user-facing surface for BYO models + CLI token pairing.
 * Lets an owner connect their own provider key (xAI / OpenAI / Anthropic /
 * Google / OpenRouter / Nous-Hermes), scoped to tasks; the router then routes
 * those tasks to their model. A "Popular models" quick-pick row pre-fills the
 * form (incl. Hermes natively via Nous or via OpenRouter). Also mints CLI
 * personal-access tokens for the SDK / browser extension.
 *
 * The API key the user types is THEIR OWN key for THEIR OWN usage; the server
 * stores it encrypted (AES-256-GCM) and never returns it. (api.petclaw.models)
 */

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

// ── Collectible Editorial palette ──
const GOLD = "#9A4E1E";          // terracotta-sub (eyebrows / accents)
const GOLD_SOFT = "#FCE9CF";     // warm terracotta tint (active pill bg)
const INK = "#211A12";           // editorial ink
const MUTED = "#7A6E5A";         // editorial muted
const MUTED2 = "#5C5140";        // darker muted — form labels / body on paper
const LINE = "rgba(33,26,18,0.13)"; // hairline
const PAPER = "#FBF6EC";         // card paper
const INSET = "#F5EFE2";         // input inset
const CTA = "linear-gradient(180deg,#F49B2A,#E27D0C)"; // primary button
const DANGER = "#9A3412";        // warm danger text
const TERM_BG = "#1E1710";       // warm-dark terminal
const TERM_CREAM = "#ECE0CE";
const TERM_MUTED = "rgba(251,246,236,0.65)"; // dim-on-dark kept ≥.65 alpha for legibility
const TERM_GREEN = "#9FC59A";
const TERM_GOLD = "#E7C57C";
const DISP = "var(--ed-disp)";
const BODY = "var(--ed-body)";
const MONO = "var(--ed-m)";

interface Conn {
  id: number;
  provider: string;
  label: string;
  model: string;
  task_scopes: string[];
  is_active: boolean;
  keyMask?: string;
}
interface Supported { id: string; label: string; keyFormat: string }

// ── Popular BYO models — one-click pre-fills the connect form (provider + model).
// Hermes is offered TWICE, honestly: natively via the Nous Portal (needs a Nous
// key) AND via OpenRouter (the guaranteed-wired path, one OpenRouter key). Each
// pick only sets provider+model — the owner still supplies THEIR OWN key below.
// Model ids are the current canonical slugs (verified against each provider).
interface QuickPick { label: string; provider: string; model: string; note: string }
const QUICK_PICKS: QuickPick[] = [
  { label: "Hermes (Nous)", provider: "nous", model: "Hermes-4-405B", note: "native Nous Portal key" },
  { label: "Hermes (via OpenRouter)", provider: "openrouter", model: "nousresearch/hermes-4-405b", note: "one OpenRouter key" },
  { label: "Grok", provider: "xai", model: "grok-3-mini", note: "xAI key" },
  { label: "Claude", provider: "anthropic", model: "claude-sonnet-4-6", note: "Anthropic key" },
  { label: "GPT", provider: "openai", model: "gpt-4.1-mini", note: "OpenAI key" },
  { label: "Gemini", provider: "google", model: "gemini-2.5-flash", note: "Google key" },
];

function Card({ children, title, sub, id }: { children: React.ReactNode; title: string; sub?: string; id?: string }) {
  return (
    <div id={id} style={{ scrollMarginTop: 88, background: PAPER, border: `1px solid ${LINE}`, borderRadius: 18, padding: "22px 24px", marginBottom: 20, boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))" }}>
      <h2 style={{ fontFamily: DISP, fontSize: 20, fontWeight: 800, color: INK, margin: 0, letterSpacing: "-0.01em" }}>{title}</h2>
      {sub && <p style={{ fontFamily: BODY, fontSize: 14.5, color: MUTED, margin: "6px 0 16px", lineHeight: 1.5 }}>{sub}</p>}
      {children}
    </div>
  );
}

export default function ModelsPanel() {
  const [conns, setConns] = useState<Conn[]>([]);
  const [supported, setSupported] = useState<Supported[]>([]);
  const [tasks, setTasks] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // CLI tokens (personal access tokens for `petclaw-sdk auth`)
  const [tokens, setTokens] = useState<any[]>([]);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [newTokenPurpose, setNewTokenPurpose] = useState<"cli" | "extension">("cli");
  const [genLoading, setGenLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // connect form
  const [provider, setProvider] = useState("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Two-step inline confirm for irreversible actions (no modal): first click
  // arms the button for 4s ("Confirm revoke?/remove?"), second click executes.
  const [confirmRevokeId, setConfirmRevokeId] = useState<number | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<number | null>(null);
  const armConfirm = (id: number, set: React.Dispatch<React.SetStateAction<number | null>>) => {
    set(id);
    setTimeout(() => set((cur) => (cur === id ? null : cur)), 4000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const d = await api.petclaw.models.list();
      setConns(d.connections || []);
      setSupported(d.supported || []);
      setTasks(d.tasks || []);
      setErr(null);
    } catch (e: any) {
      setErr(e?.status === 401 ? "Connect your wallet to manage models." : e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  const loadTokens = async () => {
    try { const d = await api.petclaw.cliTokens.list(); setTokens(d.tokens || []); } catch { /* not signed in — card shows the connect prompt */ }
  };

  useEffect(() => {
    load();
    loadTokens();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const genToken = async (purpose: "cli" | "extension") => {
    setGenLoading(true); setNewToken(null); setCopied(false);
    try {
      const d = await api.petclaw.cliTokens.create(
        purpose === "extension" ? "Chrome extension" : "CLI token",
        purpose,
      );
      setNewToken(d.token);
      setNewTokenPurpose(purpose);
      await loadTokens();
    } catch (e: any) {
      setErr(e?.status === 401 ? "Connect your wallet to generate a client token." : e?.message || "Could not create token");
    } finally {
      setGenLoading(false);
    }
  };

  const revokeToken = async (id: number) => {
    try { await api.petclaw.cliTokens.revoke(id); await loadTokens(); }
    catch (e: any) { setErr(e?.message || "Revoke failed"); }
  };

  const copyToken = () => {
    if (!newToken) return;
    const value = newTokenPurpose === "extension" ? newToken : `petclaw-sdk auth ${newToken}`;
    navigator.clipboard?.writeText(value).then(() => setCopied(true)).catch(() => {});
  };

  // Quick-pick: pre-fill provider + model. The owner still enters their own key.
  const applyPick = (p: QuickPick) => {
    setProvider(p.provider);
    setModel(p.model);
    setErr(null);
  };

  const connect = async () => {
    if (!apiKey.trim()) { setErr("Enter your API key."); return; }
    setSaving(true);
    try {
      await api.petclaw.models.connect(provider, apiKey.trim(), { model: model.trim() || undefined, taskScopes: scopes });
      setApiKey(""); setModel(""); setScopes([]);
      await load();
    } catch (e: any) {
      setErr(e?.message || "Connect failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    try { await api.petclaw.models.remove(id); await load(); }
    catch (e: any) { setErr(e?.message || "Remove failed"); }
  };

  const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${LINE}`, fontSize: 14, color: INK, background: INSET, boxSizing: "border-box", fontFamily: BODY };
  const btn: React.CSSProperties = { padding: "11px 20px", borderRadius: 12, border: "none", background: CTA, color: "#211A12", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: BODY, boxShadow: "0 8px 18px -10px rgba(226,125,12,.7)" };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "8px 0 20px", fontFamily: BODY }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, letterSpacing: "0.18em", color: GOLD, textTransform: "uppercase" }}>PetClaw protocol · bring your own model</div>
        <h1 style={{ fontFamily: DISP, fontSize: 28, fontWeight: 800, color: INK, margin: "6px 0 0", letterSpacing: "-0.02em" }}>Your model, your pet</h1>
        <p style={{ fontFamily: BODY, fontSize: 14.5, color: MUTED, margin: "8px 0 0", lineHeight: 1.55 }}>
          A PetClaw-protocol (developer) feature — the intended path is the <strong style={{ color: INK, fontWeight: 600 }}>CLI / at install</strong>. Your pet then routes its chat replies, agent-loop reasoning, and best-of-N judging to your model; other background tasks use the platform default (Grok). Keys are encrypted at rest, never shown again.
        </p>
        {/* Primary path: connect via the CLI / on install. */}
        <div style={{ marginTop: 14, background: TERM_BG, borderRadius: 14, padding: "16px 18px", fontFamily: MONO, fontSize: 14, lineHeight: 1.7, color: TERM_CREAM, overflowX: "auto", boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))" }}>
          <div style={{ color: TERM_MUTED, marginBottom: 6 }}># install, authenticate, then connect a model</div>
          <div><span style={{ color: TERM_GREEN }}>npx @myaipet/petclaw-sdk init</span><span style={{ color: TERM_MUTED }}>            # guided: server · token · pick your pet · model</span></div>
          <div><span style={{ color: TERM_GREEN }}>npx @myaipet/petclaw-sdk auth</span> <span style={{ color: TERM_GOLD }}>pck_…</span><span style={{ color: TERM_MUTED }}>        # the CLI token from "Connect your CLI" below</span></div>
          <div><span style={{ color: TERM_GREEN }}>npx @myaipet/petclaw-sdk models connect</span> <span style={{ color: TERM_GOLD }}>openai sk-…</span></div>
        </div>
      </div>

      {err && <div style={{ fontFamily: BODY, background: "#F6E3DA", color: DANGER, borderRadius: 10, padding: "10px 14px", fontSize: 14.5, margin: "16px 0", border: "1px solid rgba(154,52,18,.18)" }}>{err}</div>}

      <div style={{ height: 20 }} />

      <Card id="connect-cli" title="Connect PetClaw clients" sub="Use a one-year CLI token for your terminal, or a 30-day, limited-scope extension token for Chrome. Both are revocable and shown only once.">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => genToken("extension")} disabled={genLoading} style={{ ...btn, opacity: genLoading ? 0.6 : 1 }}>
            {genLoading ? "Generating…" : "Generate extension token"}
          </button>
          <button onClick={() => genToken("cli")} disabled={genLoading} style={{ ...btn, background: PAPER, color: INK, border: `1px solid ${LINE}`, opacity: genLoading ? 0.6 : 1 }}>
            Generate CLI token
          </button>
        </div>

        {newToken && (
          <div style={{ marginTop: 16, background: TERM_BG, borderRadius: 14, padding: "14px 16px" }}>
            <div style={{ fontFamily: BODY, color: TERM_GREEN, fontSize: 14, marginBottom: 8 }}>Copy this now — it won&apos;t be shown again.</div>
            <div style={{ fontFamily: MONO, fontSize: 14, color: TERM_CREAM, wordBreak: "break-all", lineHeight: 1.6 }}>
              {newTokenPurpose === "extension" ? newToken : `petclaw-sdk auth ${newToken}`}
            </div>
            <button onClick={copyToken} style={{ marginTop: 10, padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(236,224,206,0.18)", background: "transparent", color: copied ? TERM_GREEN : TERM_GOLD, fontSize: 14, cursor: "pointer", fontFamily: MONO }}>
              {copied ? "Copied ✓" : newTokenPurpose === "extension" ? "Copy extension token" : "Copy command"}
            </button>
          </div>
        )}

        {tokens.length > 0 && (
          <div style={{ marginTop: 18 }}>
            {tokens.map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderTop: `1px solid ${LINE}` }}>
                <div>
                  <div style={{ fontWeight: 600, color: INK, fontSize: 14, opacity: t.revoked_at ? 0.5 : 1 }}>
                    {t.label} <span style={{ color: MUTED, fontWeight: 400 }}>· {t.prefix}…</span>
                  </div>
                  <div style={{ fontSize: 14, color: MUTED, marginTop: 2 }}>
                    {t.revoked_at ? "revoked" : t.last_used_at ? `last used ${new Date(t.last_used_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : "never used"}
                    {!t.revoked_at && t.expires_at ? ` · expires ${new Date(t.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}
                  </div>
                </div>
                {!t.revoked_at && (
                  <button
                    onClick={() => {
                      if (confirmRevokeId === t.id) { setConfirmRevokeId(null); revokeToken(t.id); }
                      else armConfirm(t.id, setConfirmRevokeId);
                    }}
                    style={{ background: "none", border: `1px solid ${confirmRevokeId === t.id ? DANGER : LINE}`, borderRadius: 8, padding: "6px 12px", color: DANGER, fontSize: 14, cursor: "pointer", fontWeight: confirmRevokeId === t.id ? 700 : 400 }}
                  >{confirmRevokeId === t.id ? "Confirm revoke?" : "Revoke"}</button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Or connect here (manual)" sub="This web form does the same thing as the CLI — API-key providers (BYOK); OpenRouter reaches almost any model, including Gemini and Hermes. Full CLI setup lives in the 'For Developers' section below (tap to expand).">
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, letterSpacing: "0.14em", color: GOLD, textTransform: "uppercase", marginBottom: 8 }}>Popular models</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {QUICK_PICKS.map((p) => {
              const on = provider === p.provider && model === p.model;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPick(p)}
                  title={`Sets provider to ${p.provider} · model ${p.model} — then add your ${p.note}`}
                  style={{
                    display: "inline-flex", alignItems: "baseline", gap: 7,
                    fontFamily: BODY, fontSize: 14, fontWeight: on ? 700 : 500,
                    padding: "7px 13px", borderRadius: 999,
                    border: `1px solid ${on ? "#BE4F28" : LINE}`,
                    background: on ? GOLD_SOFT : PAPER,
                    color: on ? GOLD : INK, cursor: "pointer",
                  }}
                >
                  {p.label}
                  <span style={{ fontFamily: MONO, fontSize: 14, color: on ? GOLD : MUTED, fontWeight: 400 }}>{p.note}</span>
                </button>
              );
            })}
          </div>
          <p style={{ fontFamily: BODY, fontSize: 14, color: MUTED, margin: "9px 0 0", lineHeight: 1.5 }}>
            One click fills the form below — you still add your own key. Hermes runs natively on the Nous Portal or via OpenRouter.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ fontSize: 14, fontWeight: 600, color: MUTED2 }}>Provider</label>
            <select aria-label="Provider" value={provider} onChange={(e) => { setProvider(e.target.value); setModel(""); }} style={inputStyle}>
              {supported.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 14, fontWeight: 600, color: MUTED2 }}>Model <span style={{ color: MUTED, fontWeight: 400 }}>(optional)</span></label>
            <input aria-label="Model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="default for provider" style={inputStyle} />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 14, fontWeight: 600, color: MUTED2 }}>API key <span style={{ color: MUTED, fontWeight: 400 }}>(stored encrypted, never shown again)</span></label>
          <input type="password" aria-label="API key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={supported.find((s) => s.id === provider)?.keyFormat || "sk-..."} style={inputStyle} autoComplete="off" />
        </div>
        <div style={{ marginTop: 14 }}>
          <label style={{ fontSize: 14, fontWeight: 600, color: MUTED2 }}>Use for <span style={{ color: MUTED, fontWeight: 400 }}>(none = all supported tasks below)</span></label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {tasks.map((t) => {
              const on = scopes.includes(t);
              return (
                <button key={t} onClick={() => setScopes(on ? scopes.filter((x) => x !== t) : [...scopes, t])}
                  style={{ fontFamily: BODY, padding: "5px 12px", borderRadius: 999, border: `1px solid ${on ? "#BE4F28" : LINE}`, background: on ? GOLD_SOFT : PAPER, color: on ? GOLD : MUTED, fontSize: 14, cursor: "pointer", fontWeight: on ? 600 : 400 }}>
                  {t}
                </button>
              );
            })}
          </div>
        </div>
        <button onClick={connect} disabled={saving} style={{ ...btn, marginTop: 18, opacity: saving ? 0.6 : 1 }}>
          {saving ? "Connecting…" : "Connect model"}
        </button>
      </Card>

      <Card title={`Connected models${conns.length ? ` (${conns.length})` : ""}`} sub={conns.length ? undefined : "None yet — your pet uses the platform Grok default."}>
        {conns.map((c) => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderTop: `1px solid ${LINE}` }}>
            <div>
              <div style={{ fontWeight: 600, color: INK, fontSize: 14.5 }}>{c.label} <span style={{ color: MUTED, fontWeight: 400 }}>· {c.model}</span></div>
              <div style={{ fontSize: 14, color: MUTED, marginTop: 2 }}>
                {c.provider} · {c.task_scopes?.length ? c.task_scopes.join(", ") : "all tasks"} · key {c.keyMask || "••••••"}
              </div>
            </div>
            <button
              onClick={() => {
                if (confirmRemoveId === c.id) { setConfirmRemoveId(null); remove(c.id); }
                else armConfirm(c.id, setConfirmRemoveId);
              }}
              style={{ background: "none", border: `1px solid ${confirmRemoveId === c.id ? DANGER : LINE}`, borderRadius: 8, padding: "6px 12px", color: DANGER, fontSize: 14, cursor: "pointer", fontWeight: confirmRemoveId === c.id ? 700 : 400 }}
            >{confirmRemoveId === c.id ? "Confirm remove?" : "Remove"}</button>
          </div>
        ))}
        {loading && <div style={{ color: MUTED, fontSize: 14.5 }}>Loading…</div>}
      </Card>

    </div>
  );
}
