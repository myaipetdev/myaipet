"use client";

/**
 * ModelsPanel — the user-facing surface for FEATURE 1 (BYO models) + FEATURE 2
 * (plan-execute agent loop). Lets an owner:
 *   - connect their own provider key (xAI / OpenAI / Anthropic / OpenRouter),
 *     scoped to tasks; the router then routes those tasks to their model.
 *   - run the plan-and-execute agent loop on a pet and inspect the step trace.
 *
 * The API key the user types is THEIR OWN key for THEIR OWN usage; the server
 * stores it encrypted (AES-256-GCM) and never returns it. (api.petclaw.models)
 */

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const GOLD = "#b45309";
const GOLD_SOFT = "#fbbf24";
const INK = "#1a1a22";
const MUTED = "#6b6b73";
const LINE = "rgba(16,16,28,0.10)";

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

function Card({ children, title, sub }: { children: React.ReactNode; title: string; sub?: string }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 16, padding: "22px 24px", marginBottom: 20 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: INK, margin: 0 }}>{title}</h2>
      {sub && <p style={{ fontSize: 13.5, color: MUTED, margin: "6px 0 16px", lineHeight: 1.5 }}>{sub}</p>}
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

  // connect form
  const [provider, setProvider] = useState("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // agent runner
  const [pets, setPets] = useState<{ id: number; name: string }[]>([]);
  const [agentPet, setAgentPet] = useState<number | null>(null);
  const [goal, setGoal] = useState("");
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<any>(null);

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

  useEffect(() => {
    load();
    api.pets.list().then((d: any) => {
      const list = (d?.pets || []).map((p: any) => ({ id: p.id, name: p.name }));
      setPets(list);
      if (list[0]) setAgentPet(list[0].id);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const runAgent = async () => {
    if (!agentPet || goal.trim().length < 3) return;
    setRunning(true); setRun(null);
    try {
      const r = await api.pets.runAgent(agentPet, goal.trim());
      setRun(r);
    } catch (e: any) {
      setRun({ error: e?.message || "Agent run failed", status: e?.status });
    } finally {
      setRunning(false);
    }
  };

  const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${LINE}`, fontSize: 14, color: INK, background: "#fafafa", boxSizing: "border-box" };
  const btn: React.CSSProperties = { padding: "10px 18px", borderRadius: 10, border: "none", background: INK, color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer" };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "28px 20px 80px", fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: "0.18em", color: GOLD, textTransform: "uppercase" }}>PetClaw · your models</div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: INK, margin: "6px 0 0" }}>Bring your own model</h1>
        <p style={{ fontSize: 14.5, color: MUTED, margin: "8px 0 0", lineHeight: 1.55 }}>
          Connect your own provider key and the harness routes the matching tasks to it (reasoning, chat, judge…). Your key is encrypted at rest and never shown again. No connection = the platform default (Grok).
        </p>
      </div>

      {err && <div style={{ background: "#fde8e8", color: "#9b1c1c", borderRadius: 10, padding: "10px 14px", fontSize: 13.5, margin: "16px 0" }}>{err}</div>}

      <div style={{ height: 20 }} />

      <Card title="Connect a model" sub="API-key providers (BYOK). OpenRouter reaches almost any model, including Gemini.">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12.5, color: MUTED }}>Provider</label>
            <select value={provider} onChange={(e) => setProvider(e.target.value)} style={inputStyle}>
              {supported.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12.5, color: MUTED }}>Model <span style={{ color: "#b0b0b8" }}>(optional)</span></label>
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="default for provider" style={inputStyle} />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 12.5, color: MUTED }}>API key <span style={{ color: "#b0b0b8" }}>(stored encrypted, never shown again)</span></label>
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={supported.find((s) => s.id === provider)?.keyFormat || "sk-..."} style={inputStyle} autoComplete="off" />
        </div>
        <div style={{ marginTop: 14 }}>
          <label style={{ fontSize: 12.5, color: MUTED }}>Use for tasks <span style={{ color: "#b0b0b8" }}>(none = all tasks)</span></label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {tasks.map((t) => {
              const on = scopes.includes(t);
              return (
                <button key={t} onClick={() => setScopes(on ? scopes.filter((x) => x !== t) : [...scopes, t])}
                  style={{ padding: "5px 12px", borderRadius: 999, border: `1px solid ${on ? GOLD : LINE}`, background: on ? GOLD_SOFT : "#fff", color: on ? "#7a3d00" : MUTED, fontSize: 12.5, cursor: "pointer", fontWeight: on ? 600 : 400 }}>
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
              <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>
                {c.provider} · {c.task_scopes?.length ? c.task_scopes.join(", ") : "all tasks"} · key {c.keyMask || "••••••"}
              </div>
            </div>
            <button onClick={() => remove(c.id)} style={{ background: "none", border: `1px solid ${LINE}`, borderRadius: 8, padding: "6px 12px", color: "#9b1c1c", fontSize: 13, cursor: "pointer" }}>Remove</button>
          </div>
        ))}
        {loading && <div style={{ color: MUTED, fontSize: 13.5 }}>Loading…</div>}
      </Card>

      <Card title="Agent loop" sub="Give your pet a goal — it plans, calls its real skills, observes, iterates, and answers. Costs 5 credits per run.">
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <select value={agentPet ?? ""} onChange={(e) => setAgentPet(Number(e.target.value))} style={{ ...inputStyle, width: 180 }}>
            {pets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            {pets.length === 0 && <option value="">no pets</option>}
          </select>
          <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. summarize my week and tell me how you feel" style={inputStyle} onKeyDown={(e) => e.key === "Enter" && runAgent()} />
          <button onClick={runAgent} disabled={running || !agentPet} style={{ ...btn, whiteSpace: "nowrap", opacity: running || !agentPet ? 0.6 : 1 }}>{running ? "Running…" : "Run"}</button>
        </div>
        {run && (
          <div style={{ marginTop: 8, background: "#0e0e14", borderRadius: 12, padding: "16px 18px", fontFamily: "monospace", fontSize: 12.5, color: "#e8e4da" }}>
            {run.error ? (
              <div style={{ color: "#f0997b" }}>error: {run.error}{run.status === 401 ? " (connect wallet)" : ""}{run.status === 402 ? " (need 5 credits)" : ""}</div>
            ) : (
              <>
                {(run.steps || []).map((s: any, i: number) => (
                  <div key={i} style={{ marginBottom: 6, color: s.skill === "finish" ? "#8a8577" : "#9bd1c4" }}>
                    <span style={{ color: GOLD_SOFT }}>{i + 1}.</span> {s.skill === "finish" ? "✓ finish" : `${s.skill}`} <span style={{ color: "#8a8577" }}>{s.thought ? `— ${s.thought}` : ""}</span>
                  </div>
                ))}
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)", color: "#fde68a" }}>
                  {run.answer}
                </div>
                <div style={{ marginTop: 8, color: "#5f5e5a", fontSize: 11 }}>stopped: {run.stoppedReason} · credits left: {run.creditsRemaining}</div>
              </>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
