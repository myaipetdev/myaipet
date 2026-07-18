"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api, getAuthHeaders } from "@/lib/api";
import Icon from "@/components/Icon";
import Reveal, { MaskedTitle } from "@/components/Reveal";
import PetClawConsole, { SDK_VERSION } from "@/components/PetClawConsole";
import CollectibleFrame from "@/components/editorial/CollectibleFrame";
import ModelsPanel from "@/components/ModelsPanel";
import { toast } from "@/components/Toast";
import { confirmDialog, promptDialog } from "@/components/Dialog";
import { PETCLAW_EXTENSION_STEPS, PETCLAW_EXTENSION_VERSION } from "@/lib/petclaw-extension";

// ── Types ──
interface SoulState {
  token_id?: number | string;
  mint_tx_hash?: string | null;
  genesis_hash?: string;
  current_version?: number;
  current_hash?: string;
  birth_at?: string;
  last_heartbeat?: string;
  successor_wallet?: string | null;
  inactivity_days?: number;
  wallet_address?: string;
  on_chain?: boolean;
}

interface Checkpoint {
  id: number | string;
  version: number;
  trigger_event: string;
  summary?: string;
  created_at: string;
  tx_hash?: string | null;
  hash?: string;
}

interface MemoryMilestone {
  id: number | string;
  token_id?: number | string;
  memory_type: string;
  title: string;
  description: string;
  importance: number;
  tx_hash?: string | null;
  minted_at?: string;
  recorded_at?: string;
}

// Receipts surfaced from export/delete responses. These are integrity
// checksums/identifiers, not third-party-verifiable server signatures.
interface ExportReceipt {
  exportedAt?: string;
  integrityHash?: string;
  memoriesCount: number;
  skillsCount: number;
  checkpointsCount: number;
}

interface DeleteReceipt {
  deletedAt?: string;
  deletionHash?: string;
}

// A single sovereign pet on the open network (discovery endpoint, no auth).
interface NetworkNode {
  petId: number | string;
  name: string;
  avatarUrl?: string;
  personality?: string;
  element?: string;
  level?: number;
  status?: "online" | "offline" | "busy";
  trustScore?: number;
  totalInteractions?: number;
  lastSeen?: string;
}

interface NetworkStats {
  totalNodes?: number;
  onlineNodes?: number;
  totalInvocations?: number;
  avgTrustScore?: number;
}

// ── Collectible Editorial tokens (the warm die-cut print system) ──
const FIELD = "#ECE4D4";      // section bg
const PAPER = "#FBF6EC";      // cards
const INSET = "#F5EFE2";      // recessed wells
const INK = "#211A12";        // primary text
const INK70 = "#3A3024";      // secondary text
const MUTED = "#7A6E5A";      // muted text
const MUTED2 = "#5C5140";     // muted-strong text
const MONO_CLR = "#9A7B4E";   // faint mono / file-numbers
const HAIR = "rgba(33,26,18,.13)"; // hairline rule
const TERRA = "#BE4F28";      // brand terracotta
const TERRA_SUB = "#9A4E1E";  // terracotta sub (eyebrows)
const CREAM_ON = "#FCE9CF";   // cream-on-terracotta
const CTA = "linear-gradient(180deg,#F49B2A,#E27D0C)"; // primary CTA gradient
const GOOD = "#5C8A4E";       // editorial green (status/online)
const DANGER = "#B5462B";     // editorial danger (delete) — warm, not pure red
const CARD_SHADOW = "var(--ed-shadow-card)";
const DISP = "var(--ed-disp)";
const BODY = "var(--ed-body)";
const MONO = "var(--ed-m)";

// ── Helpers ──
const BSCSCAN = "https://bscscan.com";

const truncate = (s?: string | null, n = 4) => {
  if (!s) return "—";
  if (s.length <= n * 2 + 2) return s;
  return `${s.slice(0, n + 2)}...${s.slice(-n)}`;
};

const timeAgo = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const days = Math.floor(h / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
};

const formatDate = (iso?: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
};

const MEMORY_TYPE_ICONS: Record<string, string> = {
  conversation: "chat",
  milestone: "trophy",
  dream: "sparkling",
  achievement: "medal",
  "0": "chat",
  "1": "trophy",
  "2": "sparkling",
  "3": "medal",
  "10": "heart",
  "20": "trophy",
  "30": "medal",
};

// ── Direct API access (no more defensive fallbacks) ──
const soulApi = {
  get: (petId: any) => api.soul.get(petId),
  checkpoints: (petId: any, limit = 50, offset = 0) => api.soul.checkpoints(petId, limit, offset),
  setSuccessor: (petId: any, wallet: string) => api.soul.setSuccessor(petId, wallet),
  removeSuccessor: (petId: any) => api.soul.removeSuccessor(petId),
};

const memoryNftApi = {
  list: (petId: any) => api.memoryNfts.list(petId),
};

// ── Channel Connections (OAuth subscriptions) ──
function ChannelConnectionsCard({ petId }: { petId: number }) {
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/petclaw/connections?petId=${petId}`, {
        headers: getAuthHeaders(),
      });
      // Only trust the payload on a 2xx — a 401/500 error body has no
      // `providers`, and falling back to [] would render "all disconnected"
      // and silently mask an auth/server failure as an empty state.
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setUnavailable(false);
        setProviders(data.providers || []);
      } else if (res.status === 503) {
        setUnavailable(true);
        setProviders([]);
      }
    } catch {}
    setLoading(false);
  }, [petId]);

  useEffect(() => { load(); }, [load]);

  // Auto-reload when returning from a successful OAuth callback
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("connected") || sp.get("oauth_error")) {
      load();
      // Strip the query so it doesn't keep firing
      const url = new URL(window.location.href);
      url.searchParams.delete("connected");
      url.searchParams.delete("oauth_error");
      url.searchParams.delete("from");
      window.history.replaceState({}, "", url.toString());
    }
  }, [load]);

  const connect = (id: string) => {
    setActioning(id);
    window.location.href = `/api/auth/oauth/${id}?petId=${petId}&returnTo=${encodeURIComponent("/sovereignty")}`;
  };

  const disconnect = async (id: string) => {
    if (!(await confirmDialog({ title: `Disconnect ${id}?` }))) return;
    setActioning(id);
    try {
      const res = await fetch(`/api/petclaw/connections?petId=${petId}&platform=${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        toast("Couldn't disconnect that channel — please try again.", "error");
      } else {
        await load();
      }
    } catch {
      toast("Couldn't disconnect that channel — please try again.", "error");
    }
    setActioning(null);
  };

  const COLORS: Record<string, string> = {
    discord: "#5865F2", telegram: "#2AABEE", twitter: "#000", github: "#181717",
  };

  // Only surface channels that are actually usable (admin-configured) or already
  // connected. A card full of disabled "Coming soon — admin not configured"
  // rows just reads as broken, so when nothing is actionable we hide it entirely.
  const visible = providers.filter((p) => p.configured || p.connected);
  if (!loading && !unavailable && visible.length === 0) return null;

  return (
    <div className="sov-card" style={{
      padding: 30, borderRadius: 20, marginBottom: 32,
      background: PAPER, border: `1px solid ${HAIR}`, boxShadow: CARD_SHADOW,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 22, display: "inline-flex", color: TERRA }}><Icon name="chat" size={22} /></span>
        <h2 style={{ fontFamily: DISP, fontSize: 24, fontWeight: 800, color: INK, letterSpacing: "-0.02em" }}>
          Channel Subscriptions
        </h2>
        <span style={{
          fontSize: 13, padding: "3px 10px", borderRadius: 999,
          background: "rgba(190,79,40,0.1)", color: TERRA_SUB,
          fontFamily: MONO, fontWeight: 700, letterSpacing: "0.12em",
        }}>{unavailable ? "UNAVAILABLE" : "OAUTH"}</span>
      </div>
      <p style={{ fontFamily: BODY, fontSize: 14, color: MUTED2, lineHeight: 1.6, margin: "0 0 22px" }}>
        {unavailable
          ? "Channel subscriptions are unavailable for launch while credential storage is being upgraded."
          : "Subscribe your pet to platforms via OAuth. Tokens are encrypted per pet, revocable anytime, and never returned to the browser."}
      </p>

      {loading ? (
        <div style={{ padding: 20, textAlign: "center", color: MUTED, fontSize: 13, fontFamily: BODY }}>Loading…</div>
      ) : unavailable ? (
        <div role="status" style={{ padding: "14px 16px", borderRadius: 12, background: INSET, color: MUTED2, fontSize: 14, fontFamily: BODY, lineHeight: 1.6 }}>
          Unavailable right now. No new channel can be connected, and no OAuth callback will be accepted.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {visible.map((p) => {
            const color = COLORS[p.id] || "#999";
            const isActing = actioning === p.id;
            const profile = p.connection?.profile;
            return (
              <div key={p.id} style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "12px 16px", borderRadius: 14,
                background: p.connected ? INSET : PAPER,
                border: p.connected ? `1.5px solid ${TERRA}` : `1px solid ${HAIR}`,
                opacity: !p.configured ? 0.6 : 1,
              }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  background: color, color: "white",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16, fontWeight: 800, flexShrink: 0,
                }}>
                  {p.id === "twitter" ? "𝕏" : p.id === "github" ? "⌥" : p.displayName.charAt(0)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: DISP, fontSize: 15, fontWeight: 700, color: INK }}>
                    {p.displayName}
                  </div>
                  <div style={{ fontFamily: BODY, fontSize: 13, color: MUTED2, marginTop: 2 }}>
                    {p.connected
                      ? (profile?.username ? `Connected as @${profile.username}` : "Connected")
                      : !p.configured
                      ? "Coming soon — admin not configured"
                      : "Not connected"}
                  </div>
                </div>
                {p.connected ? (
                  <button
                    onClick={() => disconnect(p.id)}
                    disabled={isActing}
                    style={{
                      padding: "7px 14px", borderRadius: 999, border: `1px solid ${HAIR}`,
                      background: PAPER, color: DANGER,
                      fontFamily: BODY, fontSize: 13, fontWeight: 700,
                      cursor: isActing ? "wait" : "pointer",
                    }}
                  >{isActing ? "..." : "Disconnect"}</button>
                ) : (
                  <button
                    onClick={() => p.configured && connect(p.id)}
                    disabled={!p.configured || isActing}
                    style={{
                      padding: "7px 14px", borderRadius: 999, border: "none",
                      background: p.configured ? CTA : "rgba(33,26,18,0.06)",
                      color: p.configured ? "#fff" : MUTED,
                      fontFamily: BODY, fontSize: 13, fontWeight: 700,
                      cursor: p.configured && !isActing ? "pointer" : "not-allowed",
                    }}
                  >{isActing ? "..." : "Connect"}</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!unavailable && <div style={{
        marginTop: 16, padding: "10px 14px", borderRadius: 10,
        background: INSET, fontFamily: BODY, fontSize: 13.5, color: MUTED2, lineHeight: 1.6,
      }}>
        Tokens never leave the server. Disconnect any time — pet stops posting/reading on that channel within seconds.
      </div>}
    </div>
  );
}

// ── Memory Inspector (VIGIL sovereignty) ──
// Shows the pet's MEMORY.md, USER.md, learned skills, session log, with per-entry
// delete/edit. The pet's "self-improvement" surface is finally inspectable.

// The product is English-only on shared/inspectable surfaces. Legacy session
// turns may contain Korean (chats predating the English-only enforcement); we
// hide those from the log rather than fabricating translations. Underlying data
// is untouched and still exportable.
const hasHangul = (s: string) => /[\u3130-\u318f\uac00-\ud7a3]/.test(s || "");
// Strip the leading "[user]" / "[pet]" speaker tag for display.
const stripSpeakerTag = (s: string) => (s || "").replace(/^\[(user(?::[^\]]+)?|pet)\]\s*/, "");

// Collapse consecutive automatic "post_consolidation" checkpoints that carry no
// real summary into ONE row (with a count + version range), so the Persona
// Evolution timeline never shows N byte-identical "Memory consolidated" entries.
// Rows with a real summary, or any other trigger, stay individual. List is
// newest-first, so _fromVersion trends toward the oldest in the run.
type DisplayCheckpoint = Checkpoint & { _count?: number; _fromVersion?: number };
function collapseConsolidations(cks: Checkpoint[]): DisplayCheckpoint[] {
  const out: DisplayCheckpoint[] = [];
  for (const ck of cks) {
    const plain = ck.trigger_event === "post_consolidation" && !ck.summary;
    const prev = out[out.length - 1];
    if (plain && prev && prev.trigger_event === "post_consolidation" && !prev.summary) {
      prev._count = (prev._count || 1) + 1;
      prev._fromVersion = ck.version;
      continue;
    }
    out.push(plain ? { ...ck, _count: 1, _fromVersion: ck.version } : ck);
  }
  return out;
}

// A small labeled custom dropdown for switching the active pet. Replaces a bare
// native <select> whose OS-rendered (dark) option list looked unstyled/awkward
// and gave no hint that "Cat" was even the active pet.
function PetSwitcher({ pets, selectedPet, onSelect }: { pets: any[]; selectedPet: any; onSelect: (p: any) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  if (!pets.length) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 13, fontFamily: MONO, fontWeight: 700, letterSpacing: "0.14em", color: MONO_CLR, textTransform: "uppercase" }}>Active pet</span>
      <div ref={ref} style={{ position: "relative" }}>
        <button onClick={() => setOpen((o) => !o)} style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 14px", borderRadius: 999, border: `1px solid ${HAIR}`,
          background: PAPER, color: INK, fontFamily: BODY,
          fontSize: 13, fontWeight: 700, cursor: "pointer", outline: "none",
          boxShadow: CARD_SHADOW,
        }}>
          <span style={{ color: TERRA, display: "inline-flex" }}><Icon name="paw" size={16} /></span>
          <span>{selectedPet?.name || "Pet"}</span>
          <span style={{ color: MUTED, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>
        </button>
        {open && (
          <div style={{
            position: "absolute", right: 0, top: "calc(100% + 6px)", minWidth: 180,
            background: PAPER, borderRadius: 14, border: `1px solid ${HAIR}`,
            boxShadow: CARD_SHADOW, padding: 6, zIndex: 30,
          }}>
            {pets.map((p) => {
              const active = p.id === selectedPet?.id;
              return (
                <button key={p.id} onClick={() => { onSelect(p); setOpen(false); }} style={{
                  display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left",
                  padding: "9px 12px", borderRadius: 10, border: "none", cursor: "pointer",
                  background: active ? "rgba(190,79,40,0.1)" : "transparent",
                  color: INK, fontFamily: BODY, fontSize: 13.5,
                  fontWeight: active ? 700 : 500,
                }}>
                  <span style={{ width: 12, color: TERRA }}>{active ? "✓" : ""}</span>
                  {p.name || `Pet #${p.id}`}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function MemoryInspectorCard({ petId }: { petId: number }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  // Session log collapse — 37 raw rows made the whole page scroll forever.
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [consolidating, setConsolidating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/petclaw/memory?petId=${petId}`, { headers: getAuthHeaders() });
      const json = await res.json().catch(() => null);
      // On any error response (auth/404/500) the body has no `stats` — don't
      // store it raw or the render crashes reading data.stats.*; fall back to
      // an empty shape so the card renders an empty state instead.
      setData(res.ok && json ? json : {});
    } catch { setData({}); }
    setLoading(false);
  }, [petId]);

  useEffect(() => { load(); }, [load]);

  const del = async (entryType: string, keyOrId: string | number) => {
    if (!(await confirmDialog({ title: `Delete this ${entryType} entry?` }))) return;
    const k = entryType === "session" ? "id" : "key";
    setBusy(`${entryType}_${keyOrId}`);
    try {
      const res = await fetch(`/api/petclaw/memory?petId=${petId}&entryType=${entryType}&${k}=${encodeURIComponent(String(keyOrId))}`, {
        method: "DELETE", headers: getAuthHeaders(),
      });
      if (!res.ok) toast("Couldn't delete that entry — try again.", "error");
      else await load();
    } catch {}
    setBusy(null);
  };

  const clearAll = async (entryType: string) => {
    if (!(await confirmDialog({ title: `Wipe ALL ${entryType} entries?`, body: "This is irreversible.", danger: true, confirmLabel: "Wipe" }))) return;
    setBusy(`${entryType}_all`);
    try {
      const res = await fetch(`/api/petclaw/memory?petId=${petId}&entryType=${entryType}&all=1`, {
        method: "DELETE", headers: getAuthHeaders(),
      });
      if (!res.ok) toast("Couldn't clear those entries — try again.", "error");
      else await load();
    } catch {}
    setBusy(null);
  };

  const editContent = async (entryType: string, key: string, current: string) => {
    const next = await promptDialog({ title: "Edit content", defaultValue: current });
    if (next == null || next === current) return;
    setBusy(`${entryType}_${key}`);
    try {
      const res = await fetch(`/api/petclaw/memory?petId=${petId}&entryType=${entryType}`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ key, content: next }),
      });
      if (!res.ok) toast("Couldn't save that edit — try again.", "error");
      else await load();
    } catch {}
    setBusy(null);
  };

  const triggerConsolidate = async () => {
    if (!(await confirmDialog({ title: "Run memory consolidation now?", body: "Uses one LLM call to compress/dedupe." }))) return;
    setConsolidating(true);
    try {
      const res = await fetch(`/api/petclaw/memory/consolidate?petId=${petId}&force=1`, {
        method: "POST", headers: getAuthHeaders(),
      });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(r.error || `Consolidation failed (${res.status})`, "error");
      } else {
        if (r.result) {
          toast(`Done. ${r.result.before.memories}→${r.result.after.memories} memories, ${r.result.before.userProfile}→${r.result.after.userProfile} profile entries.`, "success");
        } else {
          toast("Skipped (gated or nothing to do)", "info");
        }
        await load();
      }
    } catch (e: any) {
      toast("Failed: " + e?.message, "error");
    }
    setConsolidating(false);
  };

  if (loading) return (
    <div className="sov-card" style={{ padding: 24, borderRadius: 20, marginBottom: 32, background: PAPER, border: `1px solid ${HAIR}`, boxShadow: CARD_SHADOW }}>
      <div style={{ fontFamily: BODY, fontSize: 13, color: MUTED }}>Loading memory ledger…</div>
    </div>
  );
  if (!data) return null;

  const memories: any[] = data.memories || [];
  const userProfile: any[] = data.userProfile || [];
  const learned: any[] = data.learnedPatterns || [];
  // English-only surface: drop legacy Korean turns from the visible log.
  const sessions: any[] = (data.sessions || []).filter((s: any) => !hasHangul(s.content));

  return (
    <div className="sov-card" style={{
      padding: 30, borderRadius: 20, marginBottom: 32,
      background: PAPER, border: `1px solid ${HAIR}`, boxShadow: CARD_SHADOW,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 22, display: "inline-flex", color: TERRA }}><Icon name="scroll" size={22} /></span>
        <h2 style={{ fontFamily: DISP, fontSize: 24, fontWeight: 800, color: INK, letterSpacing: "-0.02em" }}>
          Memory Ledger
        </h2>
        <span style={{
          fontSize: 13, padding: "3px 10px", borderRadius: 999,
          background: "rgba(190,79,40,0.1)", color: TERRA_SUB,
          fontFamily: MONO, fontWeight: 700, letterSpacing: "0.12em",
        }}>VIGIL</span>
        <span title="Each reply pulls the most relevant memories via reciprocal-rank fusion (lexical + recency + importance; plus semantic cosine when you connect an embedding key)." style={{
          fontSize: 13, padding: "3px 10px", borderRadius: 999,
          background: INSET, color: MUTED2,
          fontFamily: MONO, fontWeight: 700, letterSpacing: "0.12em", cursor: "help",
        }}>RRF RECALL</span>
        <div style={{ flex: 1 }} />
        <button onClick={triggerConsolidate} disabled={consolidating} style={{
          padding: "6px 14px", borderRadius: 999, border: `1px solid ${HAIR}`,
          background: PAPER, color: TERRA_SUB, fontFamily: BODY, fontSize: 13, fontWeight: 700, cursor: "pointer",
        }}>{consolidating ? "Consolidating…" : "Consolidate Now"}</button>
      </div>
      <p style={{ fontFamily: BODY, fontSize: 14, color: MUTED2, lineHeight: 1.6, margin: "0 0 18px" }}>
        Everything your pet has learned about you — inspectable, editable, deletable.
        {data.stats?.lastConsolidatedAt && (
          <span style={{ marginLeft: 8, color: MUTED, fontSize: 13 }}>
            · last consolidated {new Date(data.stats.lastConsolidatedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
          </span>
        )}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10, marginBottom: 22 }}>
        <Stat label="Memories" value={memories.length} />
        <Stat label="About Owner" value={userProfile.length} />
        <Stat label="Learned Skills" value={data.stats?.learnedSkillCount ?? 0} />
        <Stat label="Session Log" value={sessions.length} />
      </div>

      <Section title="MEMORY.md — Facts the pet remembers" onClear={memories.length ? () => clearAll("memory") : undefined} disabled={!!busy}>
        {memories.length === 0 ? <Empty msg="Nothing remembered yet. Chat a few times to seed this." /> :
          memories.map((m) => (
            <EntryRow key={m.key} primary={m.content} secondary={`[${m.category}] importance ${m.importance}`}
              onEdit={() => editContent("memory", m.key, m.content)}
              onDelete={() => del("memory", m.key)}
              busy={busy === `memory_${m.key}`}
            />
          ))
        }
      </Section>

      <Section title="USER.md — What the pet knows about you" onClear={userProfile.length ? () => clearAll("profile") : undefined} disabled={!!busy}>
        {userProfile.length === 0 ? <Empty msg="No owner profile yet — onboarding seeds this." /> :
          userProfile.map((u) => (
            <EntryRow key={u.key} primary={u.content} secondary={`[${u.category}] ${u.source}`}
              onEdit={() => editContent("profile", u.key, u.content)}
              onDelete={() => del("profile", u.key)}
              busy={busy === `profile_${u.key}`}
            />
          ))
        }
      </Section>

      <Section title="Learned skills (auto-promoted)" onClear={learned.length ? () => clearAll("learned") : undefined} disabled={!!busy}>
        {learned.length === 0 ? <Empty msg="No learned skills yet. Patterns promote after 3 successful conversations on the same topic." /> :
          learned.map((p) => (
            <EntryRow key={p.id || p.topic} primary={p.topic} secondary={`freq ${p.frequency} · success ${Math.round((p.successRate || 0) * 100)}%${p.promotedToSkill ? " · ⭐ promoted" : ""}`}
              onDelete={() => del("learned", p.id || p.topic)}
              busy={busy === `learned_${p.id || p.topic}`}
            />
          ))
        }
      </Section>

      <Section title={`Session log (recent ${sessions.length})`} onClear={sessions.length ? () => clearAll("session") : undefined} disabled={!!busy}>
        {sessions.length === 0 ? <Empty msg="No session log." /> : (
          <>
            {sessions.slice(0, showAllSessions ? 25 : 8).map((s) => (
              <EntryRow key={s.id} primary={stripSpeakerTag(s.content)} secondary={`${s.platform} · ${new Date(s.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`}
                onDelete={() => del("session", s.id)}
                busy={busy === `session_${s.id}`}
              />
            ))}
            {sessions.length > 8 && (
              <button
                onClick={() => setShowAllSessions(v => !v)}
                style={{
                  width: "100%", marginTop: 8, padding: "9px 0", borderRadius: 10, cursor: "pointer",
                  border: `1px dashed ${HAIR}`, background: "transparent",
                  fontFamily: MONO, fontSize: 13, fontWeight: 700, letterSpacing: "0.1em",
                  color: TERRA_SUB, textTransform: "uppercase",
                }}
              >
                {showAllSessions ? "Show fewer" : `Show all ${Math.min(sessions.length, 25)}`}
              </button>
            )}
          </>
        )}
      </Section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{
      padding: "10px 14px", borderRadius: 12, background: INSET,
      border: `1px solid ${HAIR}`, textAlign: "center",
    }}>
      <div style={{ fontFamily: DISP, fontSize: 24, fontWeight: 800, color: INK, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: MONO_CLR, textTransform: "uppercase", letterSpacing: "0.12em" }}>{label}</div>
    </div>
  );
}

function Section({ title, children, onClear, disabled }: { title: string; children: React.ReactNode; onClear?: () => void; disabled?: boolean }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <h3 style={{ fontFamily: DISP, fontSize: 16, fontWeight: 800, color: INK70, margin: 0, letterSpacing: "-0.01em" }}>{title}</h3>
        {onClear && (
          <button onClick={onClear} disabled={disabled} style={{
            fontFamily: MONO, fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", padding: "3px 8px", borderRadius: 6,
            border: `1px solid ${HAIR}`, background: PAPER,
            color: DANGER, cursor: disabled ? "wait" : "pointer",
            opacity: disabled ? 0.5 : 1,
          }}>Clear all</button>
        )}
      </div>
      <div style={{ display: "grid", gap: 6 }}>{children}</div>
    </div>
  );
}

function EntryRow({ primary, secondary, onEdit, onDelete, busy }: { primary: string; secondary: string; onEdit?: () => void; onDelete: () => void; busy: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10,
      padding: "8px 12px", borderRadius: 10,
      background: INSET, border: `1px solid ${HAIR}`,
      opacity: busy ? 0.5 : 1,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: BODY, fontSize: 13, color: INK, overflowWrap: "anywhere", wordBreak: "break-word", lineHeight: 1.5 }}>{primary}</div>
        <div style={{ fontFamily: MONO, fontSize: 13, color: MONO_CLR, marginTop: 2, overflowWrap: "anywhere" }}>{secondary}</div>
      </div>
      {onEdit && (
        <button onClick={onEdit} disabled={busy} style={{
          flexShrink: 0,
          padding: "4px 10px", borderRadius: 6,
          border: `1px solid ${HAIR}`, background: PAPER,
          fontFamily: BODY, fontSize: 13, fontWeight: 600, color: INK70, cursor: "pointer",
        }}>Edit</button>
      )}
      <button onClick={onDelete} disabled={busy} style={{
        flexShrink: 0,
        padding: "4px 10px", borderRadius: 6,
        border: `1px solid ${HAIR}`, background: PAPER,
        fontFamily: BODY, fontSize: 13, fontWeight: 600, color: DANGER, cursor: "pointer",
      }}>Delete</button>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div style={{ fontFamily: BODY, fontSize: 13, color: MUTED2, padding: "8px 0", fontStyle: "italic" }}>{msg}</div>;
}

// ── Chrome Extension in-app showcase ──
/**
 * Line-art "what you'll see" illustration for each install step — drawn in the
 * Collectible Editorial idiom (ink linework on warm inset paper, terracotta
 * accents) so the steps read as a hand-illustrated guide, not a wall of text.
 * viewBox 220×128.
 */
function StepArt({ n }: { n: number }) {
  const INK = "#211A12", AMBER = "#BE4F28", CREAM = "#F5EFE2", WHITE = "#FBF6EC";
  const S = { stroke: INK, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  const common = { width: "100%", viewBox: "0 0 220 128", role: "img" as const, "aria-hidden": true as const, style: { display: "block" } };
  switch (n) {
    case 1: // Download — amber button → .zip
      return (
        <svg {...common}>
          <rect x="22" y="20" width="176" height="58" rx="9" fill={WHITE} {...S} />
          <line x1="22" y1="34" x2="198" y2="34" {...S} />
          <circle cx="32" cy="27" r="2" fill={INK} /><circle cx="40" cy="27" r="2" fill={INK} /><circle cx="48" cy="27" r="2" fill={INK} />
          <rect x="66" y="46" width="88" height="20" rx="10" fill={AMBER} {...S} />
          <path d="M110 51v8M106 56l4 4 4-4" stroke={INK} strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M110 80v14M104 90l6 6 6-6" stroke={AMBER} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="92" y="98" width="36" height="24" rx="4" fill={CREAM} {...S} />
          <path d="M104 98v24M116 98v24" stroke={INK} strokeWidth="1.4" />
          <text x="110" y="114" fontSize="8" fontFamily="var(--ed-m)" fontWeight="700" fill={INK} textAnchor="middle">ZIP</text>
        </svg>
      );
    case 2: // Unzip — zip → open folder
      return (
        <svg {...common}>
          <rect x="20" y="44" width="40" height="44" rx="5" fill={CREAM} {...S} />
          <path d="M34 44v44M46 44v44" stroke={INK} strokeWidth="1.4" />
          <text x="40" y="70" fontSize="8" fontFamily="var(--ed-m)" fontWeight="700" fill={INK} textAnchor="middle">ZIP</text>
          <path d="M84 64h40M116 56l10 8-10 8" {...S} stroke={AMBER} strokeWidth="2.4" />
          <path d="M150 52h20l6 8h26a4 4 0 0 1 4 4v34a4 4 0 0 1-4 4h-52a4 4 0 0 1-4-4V56a4 4 0 0 1 4-4Z" fill={CREAM} {...S} />
          <rect x="158" y="40" width="16" height="20" rx="2" fill={WHITE} {...S} />
          <rect x="178" y="36" width="16" height="24" rx="2" fill={WHITE} {...S} />
        </svg>
      );
    case 3: // Open Extensions — address bar only
      return (
        <svg {...common}>
          <rect x="20" y="36" width="180" height="26" rx="13" fill={WHITE} {...S} />
          <circle cx="36" cy="49" r="4.5" {...S} /><path d="M39.2 52.2l4.2 4.2" {...S} />
          <text x="55" y="55" fontSize="12" fontFamily="var(--ed-m)" fontWeight="700" fill={INK}>chrome://extensions</text>
          <path d="M60 84l50 0M96 74l14 10-14 10" {...S} stroke={AMBER} strokeWidth="2.4" />
          <rect x="120" y="70" width="70" height="28" rx="7" fill={CREAM} {...S} />
          <text x="155" y="88" fontSize="9" fontFamily="var(--ed-disp)" fontWeight="700" fill={INK} textAnchor="middle">Extensions</text>
        </svg>
      );
    case 4: // Enable Developer Mode — big toggle, ON
      return (
        <svg {...common}>
          <rect x="20" y="24" width="180" height="80" rx="8" fill={WHITE} {...S} />
          <line x1="20" y1="48" x2="200" y2="48" {...S} />
          <text x="34" y="40" fontSize="10" fontFamily="var(--ed-m)" fontWeight="700" fill="#7A6E5A">chrome://extensions</text>
          <text x="34" y="72" fontSize="13" fontFamily="var(--ed-disp)" fontWeight="800" fill={INK}>Developer mode</text>
          <text x="34" y="88" fontSize="8" fontFamily="var(--ed-m)" fill="#7A6E5A">top-right toggle</text>
          <rect x="140" y="60" width="50" height="26" rx="13" fill={AMBER} {...S} strokeWidth="2.4" />
          <circle cx="177" cy="73" r="9" fill={WHITE} {...S} />
          <path d="M132 62l6 6M132 68l6-6" stroke={AMBER} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 5: // Load Unpacked — toolbar with amber "Load unpacked" + folder picker
      return (
        <svg {...common}>
          <rect x="20" y="26" width="180" height="76" rx="8" fill={WHITE} {...S} />
          <line x1="20" y1="50" x2="200" y2="50" {...S} />
          <rect x="30" y="34" width="58" height="10" rx="5" fill={AMBER} {...S} />
          <text x="59" y="43" fontSize="11" fontFamily="var(--ed-disp)" fontWeight="800" fill={INK} textAnchor="middle">Load</text>
          <rect x="96" y="34" width="40" height="10" rx="5" fill={CREAM} {...S} />
          <rect x="144" y="34" width="40" height="10" rx="5" fill={CREAM} {...S} />
          <path d="M70 64h16l4 5h30a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3H70a3 3 0 0 1-3-3V67a3 3 0 0 1 3-3Z" fill={AMBER} {...S} />
          <path d="M150 78l8 8 14-16" stroke={INK} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 6: // Pin & Sign In — pinned toolbar icon + Settings › Connection field
      return (
        <svg {...common}>
          {/* browser toolbar with the pinned pet icon */}
          <rect x="20" y="18" width="180" height="20" rx="10" fill={WHITE} {...S} />
          <circle cx="176" cy="28" r="8" fill={AMBER} {...S} />
          <circle cx="173" cy="27" r="1.3" fill={INK} /><circle cx="179" cy="27" r="1.3" fill={INK} />
          <path d="M173 31q3 2 6 0" stroke={INK} strokeWidth="1.3" fill="none" strokeLinecap="round" />
          <path d="M176 39l-4.5 6h9Z" fill={AMBER} {...S} strokeWidth="1.6" />
          {/* Settings > Connection panel with a scoped extension token */}
          <rect x="24" y="52" width="172" height="56" rx="9" fill={CREAM} {...S} />
          <text x="36" y="68" fontSize="8.5" fontFamily="var(--ed-m)" fontWeight="700" fill="#7A6E5A">SETTINGS › CONNECTION</text>
          <rect x="36" y="76" width="116" height="20" rx="6" fill={WHITE} {...S} />
          <text x="44" y="90" fontSize="9.5" fontFamily="var(--ed-m)" fontWeight="700" fill={INK}>pex_••••••••</text>
          <rect x="158" y="76" width="22" height="20" rx="6" fill={AMBER} {...S} />
          <path d="M164 86l4 4 6-8" stroke={INK} strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default: // 7: grant this one site's optional Chrome host permission
      return (
        <svg {...common}>
          <rect x="24" y="18" width="172" height="92" rx="9" fill={WHITE} {...S} />
          <text x="36" y="36" fontSize="8.5" fontFamily="var(--ed-m)" fontWeight="700" fill="#7A6E5A">SETTINGS › WEBSITE ACCESS</text>
          <rect x="36" y="48" width="148" height="20" rx="6" fill={CREAM} {...S} />
          <circle cx="49" cy="58" r="4" fill={GOOD} />
          <text x="59" y="62" fontSize="9" fontFamily="var(--ed-m)" fontWeight="700" fill={INK}>This scheme + domain</text>
          <rect x="56" y="78" width="108" height="20" rx="10" fill={AMBER} {...S} />
          <text x="110" y="92" fontSize="9" fontFamily="var(--ed-disp)" fontWeight="800" fill={INK} textAnchor="middle">Allow on this site</text>
        </svg>
      );
  }
}

function ChromeExtensionSection() {
  useEffect(() => {
    if (window.location.hash === "#petclaw-extension") {
      window.setTimeout(() => document.getElementById("petclaw-extension")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    }
  }, []);

  return (
    <div
      id="petclaw-extension"
      className="sov-card"
      style={{
        scrollMarginTop: 88,
        borderRadius: 20, marginBottom: 32, overflow: "hidden",
        border: `1px solid ${HAIR}`,
        background: PAPER,
        boxShadow: CARD_SHADOW,
      }}
    >
      <Reveal dir="up" style={{ padding: 30 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 22, display: "inline-flex", color: TERRA }}><Icon name="extension-icon" size={22} /></span>
          <h2 style={{ fontFamily: DISP, fontSize: 24, fontWeight: 800, color: INK, letterSpacing: "-0.02em" }}>Desktop Companion Extension</h2>
          <span style={{ fontSize: 13, padding: "3px 9px", borderRadius: 999, background: "rgba(190,79,40,0.1)", color: TERRA_SUB, fontFamily: MONO, fontWeight: 700, letterSpacing: "0.12em" }}>v{PETCLAW_EXTENSION_VERSION} · CHROME</span>
        </div>
        <p style={{ fontFamily: BODY, fontSize: 14, color: MUTED2, lineHeight: 1.65, marginBottom: 14 }}>
          Your pet follows you across supported websites — a little companion you can pause per site. Click it to chat,
          ask <em>&ldquo;what&apos;s this page?&rdquo;</em>, feed or play. Page reactions are off by default. A summary reads
          only after you approve a preview, then sends the approved excerpt to a non-memory summarizer.
        </p>
        <div style={{
          display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px", borderRadius: 12,
          background: INSET, border: `1px solid ${HAIR}`, marginBottom: 20,
        }}>
          <span style={{ fontSize: 16, lineHeight: 1.4, display: "inline-flex", color: TERRA }}><Icon name="lock" size={16} /></span>
          <p style={{ fontFamily: BODY, fontSize: 13, color: INK70, lineHeight: 1.6, margin: 0 }}>
            <strong>To see YOUR pet:</strong> generate a <strong>30-day extension token</strong> in{" "}
            <a href="#connect-cli" style={{ color: TERRA, fontWeight: 700, textDecoration: "underline" }}>&ldquo;Connect PetClaw clients&rdquo;</a> above, then paste it in the extension&apos;s <strong>Settings</strong>. The token is limited to extension features and can be revoked at any time.
          </p>
        </div>
      </Reveal>

      {/* Two-column: features left, popup mockup right — split flies in from
          opposite edges (left column ← , mockup aside → ). */}
      <div style={{ display: "flex", gap: 0, flexWrap: "wrap", borderTop: `1px solid ${HAIR}` }}>
        {/* Left: features + steps */}
        <Reveal dir="left" threshold={0.1} style={{ flex: "1 1 280px", padding: "24px 30px", borderRight: `1px solid ${HAIR}` }}>
          <div className="sov-2col" style={{ gap: 10, marginBottom: 24 }}>
            {[
              { icon: "paw", title: "Background Companion", desc: "Chrome wakes your pet for allowed-site activity, scheduled care checks, and enabled notifications." },
              { icon: "medal", title: "Play Points", desc: "Collect local play points for browsing, chats, streaks, and evolution — stored on your device, just for fun." },
              { icon: "joystick", title: "Mini Games", desc: "Treat Catcher and Memory Match, built right into the popup." },
              { icon: "crystal-ball", title: "Context Aware", desc: "Optional local reactions; summaries show the full excerpt and ask twice before sending." },
              { icon: "sparkling", title: "Evolution", desc: "6 local stages from Egg → Legendary, with visual auras and a Legendary Play Points bonus." },
              { icon: "heart", title: "Mood System", desc: "Pet gets hungry, tired, or excited based on your activity." },
            ].map(({ icon, title, desc }) => (
              <div key={title} style={{ padding: 12, borderRadius: 12, background: INSET, border: `1px solid ${HAIR}` }}>
                <div style={{ fontSize: 18, marginBottom: 6, color: TERRA }}><Icon name={icon} size={18} /></div>
                <div style={{ fontFamily: DISP, fontSize: 14.5, fontWeight: 800, color: INK, marginBottom: 3 }}>{title}</div>
                <div style={{ fontFamily: BODY, fontSize: 13.5, color: MUTED2, lineHeight: 1.55 }}>{desc}</div>
              </div>
            ))}
          </div>

          {/* Install steps — each with a "what you'll see" illustration */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: MONO_CLR, letterSpacing: "0.14em", marginBottom: 12 }}>DEVELOPER MODE INSTALL · ~2 MIN</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(158px, 1fr))", gap: 10 }}>
              {PETCLAW_EXTENSION_STEPS.map((s) => (
                <div key={s.n} className="mp-lift" style={{ background: PAPER, border: `1px solid ${HAIR}`, borderRadius: 12, boxShadow: CARD_SHADOW, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderBottom: `1px solid ${HAIR}`, background: INSET }}>
                    <span style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, background: TERRA, color: CREAM_ON, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, fontFamily: MONO }}>{s.n}</span>
                    <span style={{ fontFamily: DISP, fontSize: 14, fontWeight: 800, color: INK, letterSpacing: "-0.01em" }}>{s.title}</span>
                  </div>
                  <div style={{ padding: "10px 10px 2px", background: INSET, borderBottom: `1px solid ${HAIR}` }}>
                    <StepArt n={s.n} />
                  </div>
                  <div style={{ fontFamily: BODY, fontSize: 13.5, color: MUTED2, lineHeight: 1.5, padding: "8px 10px 11px" }}>{s.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <a
            href="/petclaw-extension.zip"
            download="myaipet-extension.zip"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "12px 24px", borderRadius: 12,
              background: CTA, border: "none",
              boxShadow: CARD_SHADOW,
              color: "#fff", fontFamily: DISP, fontSize: 14, fontWeight: 700,
              textDecoration: "none",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
              <path d="M12 4v11" />
              <path d="M7 11l5 5 5-5" />
              <path d="M5 20h14" />
            </svg>
            Download Extension
          </a>
          <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 13, color: MONO_CLR, letterSpacing: "0.1em" }}>
            Developer-mode install
          </div>
          <p style={{ marginTop: 10, fontFamily: BODY, fontSize: 13, color: MUTED2, lineHeight: 1.55, maxWidth: 460 }}>
            Not yet on the Chrome Web Store — this is a developer / &ldquo;unpacked&rdquo; install straight from the ZIP,
            using the 7 steps above. Takes about 2 minutes.
          </p>
        </Reveal>

        {/* Right: popup mockup */}
        <Reveal dir="right" threshold={0.1} className="sov-split-aside" style={{ padding: "24px 20px", display: "flex", flexDirection: "column", alignItems: "center", background: FIELD }}>
          <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: MONO_CLR, letterSpacing: "0.14em", marginBottom: 12 }}>POPUP PREVIEW</div>
          {/* Extension popup mockup — a realistic dark device preview, framed
              softly on the warm field (no hard offset shadow, no purple glow). */}
          <div className="sov-popup-mock" aria-hidden role="img" aria-label="Chrome extension popup preview" style={{
            width: 320, maxWidth: "100%", borderRadius: 16, overflow: "hidden",
            background: "#1f1b16", fontFamily: "'Segoe UI', -apple-system, sans-serif",
            boxShadow: CARD_SHADOW, border: `1px solid ${HAIR}`,
            fontSize: 13, pointerEvents: "none", userSelect: "none",
          }}>
            {/* Header */}
            <div style={{
              display: "flex", alignItems: "center", gap: 12, padding: "14px 16px 12px",
              background: "linear-gradient(135deg, rgba(244,155,42,0.1), rgba(190,79,40,0.08))",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14,
                border: "2px solid rgba(244,155,42,0.5)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 28, background: "rgba(244,155,42,0.08)",
                overflow: "hidden",
              }}>
                <img src="/mascot.jpg" alt="pet" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 3 }}>Sparky</div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {["⚡ Adult", "😄 Happy", "🔥 Fire"].map((tag) => (
                    <span key={tag} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 5, background: "rgba(255,255,255,0.06)", color: "#cbb" }}>{tag}</span>
                  ))}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#F49B2A" }}>2,841</div>
                <div style={{ fontSize: 9, color: "#9a8", fontFamily: "monospace" }}>Play pts (local)</div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", padding: "0 16px", gap: 2, background: "rgba(0,0,0,0.3)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              {["Points", "Evolve", "Mood", "Game", "Badges", "Settings"].map((t) => {
                const active = t === "Mood";
                return (
                <div key={t} style={{
                  flex: 1, padding: "8px 0", textAlign: "center", fontSize: 10, fontWeight: 600,
                  color: active ? "#F49B2A" : "#6a635a",
                  borderBottom: active ? "2px solid #F49B2A" : "2px solid transparent",
                }}>{t}</div>
              );})}
            </div>

            {/* Status tab body */}
            <div style={{ padding: "14px 16px" }}>
              {/* Mood bar */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 10, color: "#9a8" }}>😄 Happy</span>
                  <span style={{ fontSize: 10, color: "#F49B2A", fontFamily: "monospace" }}>78%</span>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.06)" }}>
                  <div style={{ height: "100%", width: "78%", borderRadius: 3, background: "linear-gradient(90deg, #F49B2A, #E27D0C)" }} />
                </div>
              </div>
              {[
                { label: "Energy", val: 65, color: "#3E8FE0" },
                { label: "Hunger", val: 42, color: "#f0a062" },
                { label: "Bond", val: 88, color: "#d4a24e" },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 9, color: "#7a736a" }}>{label}</span>
                    <span style={{ fontSize: 9, color, fontFamily: "monospace" }}>{val}%</span>
                  </div>
                  <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.05)" }}>
                    <div style={{ height: "100%", width: `${val}%`, borderRadius: 2, background: color }} />
                  </div>
                </div>
              ))}

              {/* Action buttons */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 14 }}>
                {["🍖 Feed", "🎾 Play", "💬 Chat"].map((a) => (
                  <div key={a} style={{
                    padding: "8px 0", borderRadius: 8, textAlign: "center",
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
                    color: "#cbb", fontSize: 11,
                  }}>{a}</div>
                ))}
              </div>

              {/* Recent notif */}
              <div style={{ marginTop: 12, padding: "8px 10px", borderRadius: 8, background: "rgba(244,155,42,0.08)", border: "1px solid rgba(244,155,42,0.16)", display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ fontSize: 14 }}>⚡</span>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#F49B2A" }}>Evolved! Adult stage unlocked</div>
                  <div style={{ fontSize: 9, color: "#7a736a", fontFamily: "monospace" }}>+50 local Play Points earned</div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: "8px 16px 12px", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 9, fontFamily: "monospace", color: "#5a544c" }}>v{PETCLAW_EXTENSION_VERSION} · PetClaw enabled</span>
              <span style={{ fontSize: 9, color: "#7CB36A", fontFamily: "monospace" }}>● connected</span>
            </div>
          </div>
          <div style={{ marginTop: 10, fontFamily: MONO, fontSize: 13, color: MONO_CLR, textAlign: "center" }}>
            Extension popup preview
          </div>
        </Reveal>
      </div>
    </div>
  );
}

export default function SovereigntyDashboard() {
  const [pets, setPets] = useState<any[]>([]);
  const [selectedPet, setSelectedPet] = useState<any>(null);
  const [soul, setSoul] = useState<SoulState | null>(null);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [memoryMilestones, setMemoryMilestones] = useState<MemoryMilestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [successorInput, setSuccessorInput] = useState("");
  const [successorSaving, setSuccessorSaving] = useState(false);
  const [successorMsg, setSuccessorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Data Sovereignty state
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [sovMsg, setSovMsg] = useState<string | null>(null);
  // Demo preview (authed-but-petless) arms NOTHING: every sovereignty control
  // manages a real pet's data — against the fake petId=1 each click just errors.
  const guardDemo = () => {
    if (isDemo) {
      setSovMsg("This is a demo preview — adopt a pet to unlock your sovereignty controls.");
      setTimeout(() => setSovMsg(null), 3200);
      return true;
    }
    return false;
  };
  const [consent, setConsent] = useState({
    allowPublicProfile: false,
    allowDataSharing: false,
    allowAITraining: false,
    allowInteraction: false,
  });
  const [consentSaving, setConsentSaving] = useState(false);

  // ── Transparency snapshot ("what we hold about you") ──
  // Memory stats are NOT fetched by fetchSovereigntyData — pulled in below.
  const [memoryStats, setMemoryStats] = useState<{ memoryCount?: number; profileCount?: number; learnedSkillCount?: number } | null>(null);
  const [connectedCount, setConnectedCount] = useState<number | null>(null);
  const [installedSkillCount, setInstalledSkillCount] = useState<number | null>(null);

  // ── Export integrity / deletion receipts (surfaced from responses) ──
  const [exportReceipt, setExportReceipt] = useState<ExportReceipt | null>(null);
  const [deleteReceipt, setDeleteReceipt] = useState<DeleteReceipt | null>(null);

  // ── Pet Network (public discovery; not pet-specific) ──
  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null);
  const [networkNodes, setNetworkNodes] = useState<NetworkNode[]>([]);

  // ── Load pets (fallback to demo) ──
  const [isDemo, setIsDemo] = useState(false);
  useEffect(() => {
    api.pets.list().then((d: any) => {
      const list = d.pets || d || [];
      if (list.length > 0) {
        setPets(list);
        setSelectedPet(list[0]);
        setIsDemo(false);
      } else {
        // Authed but no pet yet — still demo the console (no real pet to chat).
        const demo = { id: 1, name: "Sparky", species: 7, personality_type: "playful", level: 15, element: "fire" };
        setPets([demo]); setSelectedPet(demo); setIsDemo(true);
      }
    }).catch(() => {
      // Transient failure ≠ no pets: retry once before demoing, so a network
      // blip never casts a real owner's console as the sample pet.
      setTimeout(() => {
        api.pets.list().then((d: any) => {
          const list = d.pets || d || [];
          if (list.length > 0) { setPets(list); setSelectedPet(list[0]); setIsDemo(false); return; }
          const demo = { id: 1, name: "Sparky", species: 7, personality_type: "playful", level: 15, element: "fire" };
          setPets([demo]); setSelectedPet(demo); setIsDemo(true);
        }).catch(() => {
          const demo = { id: 1, name: "Sparky", species: 7, personality_type: "playful", level: 15, element: "fire" };
          setPets([demo]); setSelectedPet(demo); setIsDemo(true);
        });
      }, 1500);
    });
  }, []);

  // ── Load sovereignty data when pet changes ──
  const selectedPetIdRef = useRef<number | null>(null);
  useEffect(() => { selectedPetIdRef.current = selectedPet?.id ?? null; }, [selectedPet]);

  const fetchSovereigntyData = useCallback(async () => {
    if (!selectedPet) return;
    const pid = selectedPet.id;
    setLoading(true);
    try {
      const [soulRes, ckptRes, memsRes, consentRes, memStatsRes, connRes, skillsRes] = await Promise.all([
        soulApi.get(pid).catch(() => null),
        soulApi.checkpoints(pid, 50, 0).catch(() => null),
        memoryNftApi.list(pid).catch(() => null),
        fetch(`/api/petclaw/consent?petId=${pid}`, {
          headers: getAuthHeaders(),
        }).then(r => r.ok ? r.json() : null).catch(() => null),
        // Transparency snapshot data — memory ledger counts, connected platforms,
        // installed skills. Each guarded so one failure never breaks the others.
        fetch(`/api/petclaw/memory?petId=${pid}`, {
          headers: getAuthHeaders(),
        }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`/api/petclaw/connections?petId=${pid}`, {
          headers: getAuthHeaders(),
        }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`/api/petclaw/skills?petId=${pid}`, {
          headers: getAuthHeaders(),
        }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      if (selectedPetIdRef.current !== pid) return; // pet switched mid-fetch
      const toArr = (v: any) => Array.isArray(v) ? v : [];
      setSoul(soulRes?.soul || soulRes || null);
      setCheckpoints(toArr(ckptRes?.checkpoints ?? ckptRes));
      // Route returns { items }; these are off-chain history records unless an
      // individual item includes a real transaction hash.
      setMemoryMilestones(toArr(memsRes?.items ?? memsRes?.memories ?? memsRes?.memory_nfts ?? memsRes));
      setSuccessorInput((soulRes?.soul?.successor_wallet || soulRes?.successor_wallet) || "");
      if (consentRes?.consent) setConsent(consentRes.consent);
      setMemoryStats(memStatsRes?.stats ?? null);
      setConnectedCount(toArr(connRes?.providers).filter((p: any) => p?.connected).length);
      setInstalledSkillCount(toArr(skillsRes?.installed).length);
    } catch {}
    setLoading(false);
  }, [selectedPet]);

  // Persist consent toggle and roll the optimistic UI back on any server error.
  const saveConsent = async (next: typeof consent, previous: typeof consent) => {
    if (!selectedPet || guardDemo()) return;
    setConsentSaving(true);
    try {
      const response = await fetch("/api/petclaw/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ petId: selectedPet.id, consent: next }),
      });
      if (!response.ok) {
        throw new Error(`Consent save failed (${response.status})`);
      }
      const payload = await response.json().catch(() => null);
      if (payload?.consent) setConsent(payload.consent);
      setSovMsg("Consent saved");
      setTimeout(() => setSovMsg(null), 2000);
    } catch {
      // The controls are optimistic for responsiveness, but privacy choices must
      // never look persisted when the server rejected or lost the request.
      setConsent(previous);
      setSovMsg("Failed to save consent");
      setTimeout(() => setSovMsg(null), 3000);
    } finally {
      setConsentSaving(false);
    }
  };

  useEffect(() => { fetchSovereigntyData(); }, [fetchSovereigntyData]);

  // ── Pet Network discovery (public, no auth, runs once) ──
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/petclaw/network/discover`)
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => {
        if (cancelled || !d) return;
        setNetworkStats(d.network ?? null);
        setNetworkNodes(Array.isArray(d.nodes) ? d.nodes : []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // ── Copy-to-clipboard ──
  const copyHash = async (hash: string, label: string) => {
    if (!hash) return;
    const flash = () => {
      setCopied(label);
      setTimeout(() => setCopied(null), 1600);
    };
    // Try the async Clipboard API first; only confirm on a real success.
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(hash);
        flash();
        return;
      } catch {
        // fall through to legacy path
      }
    }
    // Legacy fallback: only confirm if execCommand reports success.
    try {
      const ta = document.createElement("textarea");
      ta.value = hash;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (ok) flash();
    } catch {
      // copy unavailable — show no false confirmation
    }
  };

  // ── Successor actions ──
  const handleSaveSuccessor = async () => {
    if (!selectedPet || !successorInput.trim() || guardDemo()) return;
    if (!/^0x[a-fA-F0-9]{40}$/.test(successorInput.trim())) {
      setSuccessorMsg("Invalid wallet address");
      setTimeout(() => setSuccessorMsg(null), 2400);
      return;
    }
    setSuccessorSaving(true);
    setSuccessorMsg(null);
    try {
      await soulApi.setSuccessor(selectedPet.id, successorInput.trim());
      setSuccessorMsg("Successor saved off-chain — on-chain inheritance is planned, not live");
      fetchSovereigntyData();
    } catch (err: any) {
      setSuccessorMsg(err?.message || "Failed to save");
    }
    setSuccessorSaving(false);
    setTimeout(() => setSuccessorMsg(null), 2400);
  };

  const handleRemoveSuccessor = async () => {
    if (guardDemo()) return;
    if (!selectedPet) return;
    setSuccessorSaving(true);
    try {
      await soulApi.removeSuccessor(selectedPet.id);
      setSuccessorInput("");
      fetchSovereigntyData();
    } catch {}
    setSuccessorSaving(false);
  };

  // ── Render ──
  return (
    <div
      style={{
        position: "relative",
        minHeight: "100vh",
        background: FIELD,
        fontFamily: BODY,
        color: INK,
      }}
    >
      <div className="ed-grain" /><div className="ed-glow" /><div className="ed-vignette" />
      <style>{`
        @keyframes sovSlideIn { from { opacity: 0; transform: translateY(18px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes soulPulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }
        @keyframes copiedFade { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes sovFadeUp { from { opacity:0; transform:translateY(24px) } to { opacity:1; transform:translateY(0) } }
        .sov-card { animation: sovSlideIn 0.45s ease both; }
        .sov-hash:hover { opacity: 0.7; }
        .sov-copied { animation: copiedFade 0.2s ease both; }
        .sov-tag { display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:999px; font-family:var(--ed-m); font-size: 13px; font-weight:700; letter-spacing:0.12em; }
        .sov-section-title { font-family:var(--ed-disp); font-size:24px; font-weight:800; color:#211A12; letter-spacing:-0.02em; margin:0 0 4px; }
        .sov-section-sub { font-family:var(--ed-m); font-size: 13px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:#9A4E1E; margin:0 0 24px; }
        .sov-divider { width:100%; height:1px; background:rgba(33,26,18,.13); margin:32px 0; }
        .sov-2col { display:grid; grid-template-columns:1fr 1fr; }
        .sov-split { display:flex; }
        .sov-split-aside { flex:0 0 360px; }
        @media (max-width: 760px) {
          .sov-2col { grid-template-columns:1fr; }
          .sov-hero-grid { gap:28px !important; }
          .sov-split { flex-direction:column; }
          .sov-split-aside { flex:1 1 auto !important; }
        }
        /* Phones: the fixed-width popup mockup (320) + SOUL.md block (280 min)
           overflowed the card. Let them shrink to the viewport; the input's
           280 min drops so it never pushes the save button off-screen. */
        @media (max-width: 480px) {
          .sov-popup-mock { width: 100% !important; }
          .sov-soul-block { min-width: 0 !important; }
          .sov-successor-input { min-width: 0 !important; flex: 1 1 100% !important; }
        }
      `}</style>

      <div style={{ position: "relative", zIndex: 2, padding: "40px 24px", paddingTop: 100, maxWidth: 1100, margin: "0 auto" }}>

      {/* ───── Hero ───── */}
      <div className="sov-card" style={{ marginBottom: 48 }}>
        {/* Active-pet switcher — top right (labeled custom dropdown) */}
        {pets.length > 0 && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 32 }}>
            <PetSwitcher pets={pets} selectedPet={selectedPet} onSelect={setSelectedPet} />
          </div>
        )}

        {/* Plain-language explainer for non-developers — sits ABOVE the dev console. */}
        <div className="sov-card" style={{
          padding: "24px 26px", borderRadius: 18, marginBottom: 24,
          background: PAPER, border: `1px solid ${HAIR}`, boxShadow: CARD_SHADOW,
        }}>
          <h2 style={{ fontFamily: DISP, fontSize: 22, fontWeight: 800, color: INK, margin: "0 0 8px", letterSpacing: "-0.02em" }}>
            What is PetClaw?
          </h2>
          <p style={{ fontFamily: BODY, fontSize: 14.5, lineHeight: 1.65, color: INK70, margin: "0 0 14px" }}>
            Think of your pet as a <strong>personal assistant that actually remembers you</strong>. It keeps a private
            memory of what matters to you, replies in its own voice, and can come with you across the apps you connect —
            chat, X/Twitter, and your browser. <strong>Connecting</strong> is what makes the same pet — same memory, same
            personality — follow you everywhere. Everything it learns is yours: inspectable, exportable, and deletable.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {[
              ["crystal-ball", "Remembers you", "Builds a private memory from every chat"],
              ["chat", "Across your apps", "Connect channels + the browser companion below"],
              ["lock", "Your data, yours", "Export or delete it anytime, on your terms"],
            ].map(([icon, title, sub]) => (
              <div key={title} style={{
                flex: "1 1 180px", minWidth: 0, padding: "12px 14px", borderRadius: 12,
                background: INSET, border: `1px solid ${HAIR}`,
              }}>
                <div style={{ fontFamily: DISP, fontSize: 14, fontWeight: 700, color: INK, display: "flex", alignItems: "center", gap: 6 }}><span style={{ color: TERRA, display: "inline-flex" }}><Icon name={icon} size={16} /></span> {title}</div>
                <div style={{ fontFamily: BODY, fontSize: 13.5, color: MUTED2, marginTop: 3, lineHeight: 1.45 }}>{sub}</div>
              </div>
            ))}
          </div>
          <p style={{ fontFamily: BODY, fontSize: 13.5, color: MUTED2, margin: "14px 0 0" }}>
            The console below is the advanced <strong>developer</strong> view — you don&apos;t need it to use your pet.
          </p>
        </div>

        {/* PetClaw agentic-harness console — the headline of this tab */}
        <div id="connect-cli" style={{ marginBottom: 40, scrollMarginTop: 88 }}>
          <PetClawConsole
            key={selectedPet?.id ?? "none"}
            petId={selectedPet?.id}
            demo={isDemo}
            pet={selectedPet ? {
              name: selectedPet.name,
              level: selectedPet.level,
              personality_type: selectedPet.personality_type,
              element: selectedPet.element,
              avatar_url: selectedPet.avatar_url,
            } : null}
          />
        </div>

        {/* Bring your own model — merged into the PetClaw (developer) screen.
            Connection is a CLI/SDK action; the web form is a manual fallback. */}
        <Reveal dir="up" threshold={0.1} style={{ marginBottom: 40 }}>
          <ModelsPanel />
        </Reveal>

        {/* Big two-column hero */}
        <div className="sov-2col sov-hero-grid" style={{ gap: 48, alignItems: "center" }}>
          {/* Left: text */}
          <div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
              <span className="sov-tag" style={{ background: PAPER, border: `1px solid ${HAIR}`, color: GOOD }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: GOOD, animation: "soulPulse 1.8s ease infinite" }} />
                SOUL-BOUND
              </span>
              <span className="sov-tag" style={{ background: PAPER, border: `1px solid ${HAIR}`, color: TERRA_SUB }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="4" y="10.5" width="16" height="10" rx="2.5" />
                  <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
                  <circle cx="12" cy="15.5" r="1.4" fill="currentColor" stroke="none" />
                </svg>
                YOUR DATA
              </span>
              <span className="sov-tag" style={{ background: PAPER, border: `1px solid ${HAIR}`, color: INK70 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="9" width="9.5" height="6" rx="3" />
                  <rect x="11.5" y="9" width="9.5" height="6" rx="3" />
                </svg>
                ON-CHAIN · PLANNED, NOT LIVE
              </span>
            </div>
            <MaskedTitle
              as="h1"
              lines={["Your Pet.", <span key="truly-yours" style={{ color: TERRA }}>Truly Yours.</span>]}
              style={{ fontFamily: DISP, fontSize: 52, fontWeight: 800, letterSpacing: "-0.04em", color: INK, lineHeight: 1.0, margin: "0 0 16px" }}
            />
            <p style={{ fontFamily: BODY, fontSize: 16, color: MUTED2, lineHeight: 1.7, margin: "0 0 28px", maxWidth: 380 }}>
              Every memory, every conversation, every bond — owned by you. Not us. Export your pet&apos;s full soul anytime. On-chain anchoring and inheritance are planned but have no activation date.
            </p>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {[
                { n: "4", l: "Channels" },
                { n: "100%", l: "Data Ownership" },
                { n: "∞", l: "Memory" },
              ].map(({ n, l }, i) => (
                <Reveal key={l} dir="up" delay={i * 90} style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: DISP, fontSize: 26, fontWeight: 800, color: INK, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>{n}</div>
                  <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: MONO_CLR, textTransform: "uppercase", letterSpacing: "0.12em" }}>{l}</div>
                </Reveal>
              ))}
            </div>
          </div>

          {/* Right: the pet as a foil collectible on a terracotta poster chip
              (same artifact language as My Pet / World Cup). Demo pets are
              LABELLED — never presented as the user's own. */}
          {selectedPet && (
            <Reveal dir="right" style={{ display: "flex", justifyContent: "center" }}>
              <div style={{
                position: "relative", background: TERRA, borderRadius: 22,
                padding: "34px 36px 44px", boxShadow: CARD_SHADOW, overflow: "visible",
              }}>
                <div aria-hidden style={{ position: "absolute", inset: 10, border: "1px solid rgba(252,233,207,.35)", borderRadius: 12, pointerEvents: "none" }} />
                <div style={{ position: "absolute", top: 14, left: 18, right: 18, display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 13, fontWeight: 700, letterSpacing: ".12em", color: CREAM_ON, zIndex: 3 }}>
                  <span>{isDemo ? "DEMO PET" : "SOUL-BOUND"}</span>
                  {soul && <span>SOUL v{soul.current_version ?? 1}</span>}
                </div>
                <div style={{ marginTop: 16 }}>
                  <CollectibleFrame
                    photoUrl={selectedPet.avatar_url || "/mascot.jpg"}
                    level={selectedPet.level ?? 1}
                    speciesLabel={selectedPet.name?.toUpperCase()}
                    elementLabel={(selectedPet.element || "normal").toUpperCase()}
                    width={230}
                    tilt={-2}
                    float={false}
                  />
                </div>
                <div style={{ textAlign: "center", marginTop: 18, fontFamily: MONO, fontSize: 13, fontWeight: 700, letterSpacing: ".1em", color: "rgba(252,233,207,.85)", textTransform: "uppercase" }}>
                  Lv.{selectedPet.level ?? 1} · {selectedPet.personality_type}
                </div>
                {isDemo && (
                  <div style={{ textAlign: "center", marginTop: 6, fontFamily: MONO, fontSize: 13, fontWeight: 700, letterSpacing: ".1em", color: "rgba(252,233,207,.65)", textTransform: "uppercase" }}>
                    Sample — adopt to see your own pet here
                  </div>
                )}
              </div>
            </Reveal>
          )}
        </div>
      </div>

      {/* ───── No pet fallback ───── */}
      {!selectedPet && !loading && (
        <div
          className="sov-card"
          style={{
            padding: 48,
            borderRadius: 20,
            background: PAPER,
            border: `1px solid ${HAIR}`,
            boxShadow: CARD_SHADOW,
            textAlign: "center",
          }}
        >
          <div style={{ fontFamily: DISP, fontSize: 18, fontWeight: 800, color: INK, marginBottom: 8 }}>
            No pets yet
          </div>
          <div style={{ fontFamily: MONO, fontSize: 13, color: MONO_CLR, letterSpacing: "0.1em" }}>
            Adopt a pet to create a portable, exportable Soul
          </div>
        </div>
      )}

      {/* ───── Loading ───── */}
      {loading && selectedPet && (
        <div
          className="sov-card"
          style={{
            padding: 48,
            borderRadius: 20,
            background: PAPER,
            border: `1px solid ${HAIR}`,
            boxShadow: CARD_SHADOW,
            textAlign: "center",
            color: MONO_CLR,
            fontFamily: MONO,
            fontSize: 13,
            letterSpacing: "0.1em",
          }}
        >
          Loading sovereignty data...
        </div>
      )}

      {/* ───── Soul NFT Card ───── */}
      {!loading && selectedPet && (
        <>
          {soul ? (
            /* ── Soul Identity Card — warm editorial spec sheet ── */
            <Reveal dir="up" style={{ marginBottom: 28 }}>
              <p className="sov-section-sub" style={{ marginBottom: 16 }}>
                Soul Identity · {soul.on_chain ? "ON-CHAIN" : "OFF-CHAIN RECORD"}
              </p>
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12,
              }}>
                {[
                  { label: "VERSION", value: `v${soul.current_version ?? 1}`, accent: INK },
                  { label: "BORN", value: formatDate(soul.birth_at), accent: INK },
                  { label: "LAST ACTIVE", value: timeAgo(soul.last_heartbeat), accent: GOOD },
                  { label: "GENESIS", value: truncate(soul.genesis_hash, 5), accent: TERRA_SUB, click: () => soul.genesis_hash && copyHash(soul.genesis_hash, "genesis"), copied: copied === "genesis" },
                  { label: "SOUL HASH", value: truncate(soul.current_hash, 5), accent: TERRA_SUB, click: () => soul.current_hash && copyHash(soul.current_hash, "current"), copied: copied === "current" },
                  // Only show TOKEN ID once a real Soul NFT is minted — null/undefined
                  // during the on-chain holding period must NOT render as "#null".
                  ...(soul.token_id != null ? [{ label: "TOKEN ID", value: `#${soul.token_id}`, accent: INK }] : []),
                ].map(({ label, value, accent, click, copied: isCopied }: any) => (
                  <div
                    key={label}
                    onClick={click}
                    role={click ? "button" : undefined}
                    tabIndex={click ? 0 : undefined}
                    aria-label={click ? `Copy ${label.toLowerCase()}` : undefined}
                    onKeyDown={click ? (event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      click();
                    } : undefined}
                    style={{
                    padding: "16px 18px", borderRadius: 14, background: PAPER,
                    border: `1px solid ${HAIR}`, boxShadow: CARD_SHADOW, cursor: click ? "pointer" : "default",
                    transition: "border-color 0.2s",
                  }}>
                    <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: MONO_CLR, letterSpacing: "0.14em", marginBottom: 6, textTransform: "uppercase" }}>{label}</div>
                    <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: accent }}>
                      {value}
                      {isCopied && <span style={{ marginLeft: 6, fontSize: 13, color: GOOD }}>Copied!</span>}
                    </div>
                  </div>
                ))}
              </div>

              {soul.on_chain && soul.mint_tx_hash && (
                <a href={`${BSCSCAN}/tx/${soul.mint_tx_hash}`} target="_blank" rel="noopener noreferrer" className="ed-wipe" style={{
                  display: "inline-flex", alignItems: "center", gap: 6, marginTop: 14,
                  padding: "7px 14px", borderRadius: 999, background: INSET,
                  border: `1px solid ${HAIR}`, color: TERRA_SUB,
                  fontSize: 13, fontFamily: MONO, fontWeight: 700, textDecoration: "none",
                }}>
                  View on BscScan ↗
                </a>
              )}
            </Reveal>
          ) : (
            /* No on-chain soul yet — explain the holding-period state honestly
               instead of a fake "initializing" spinner that never resolves. */
            <Reveal dir="up" style={{
              padding: "24px 24px", borderRadius: 16, marginBottom: 28,
              background: PAPER, border: `1.5px dashed ${TERRA}`, boxShadow: CARD_SHADOW,
            }}>
              <div style={{ fontFamily: DISP, fontSize: 16, fontWeight: 800, color: INK, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: TERRA, display: "inline-flex" }}><Icon name="crystal-ball" size={18} /></span> Soul not yet anchored on-chain
              </div>
              <div style={{ fontFamily: BODY, fontSize: 13, color: INK70, lineHeight: 1.7 }}>
                Your pet&apos;s Soul — its memory, persona, and identity — lives in your account and can be
                exported today. An on-chain Soul NFT and automatic inheritance are future designs, not
                active features; no activation date is announced. See /contracts for current status.
              </div>
            </Reveal>
          )}

          {/* ───── Persona Evolution Timeline ───── */}
          <Reveal
            dir="up"
            threshold={0.1}
            style={{
              padding: 30,
              borderRadius: 20,
              background: PAPER,
              border: `1px solid ${HAIR}`,
              boxShadow: CARD_SHADOW,
              marginBottom: 32,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
              <div
                style={{
                  width: 4,
                  height: 22,
                  borderRadius: 2,
                  background: TERRA,
                }}
              />
              <h2 style={{ fontFamily: DISP, fontSize: 24, fontWeight: 800, color: INK, letterSpacing: "-0.02em" }}>
                Persona Evolution
              </h2>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  color: MONO_CLR,
                  marginLeft: "auto",
                }}
              >
                {checkpoints.length} checkpoint{checkpoints.length === 1 ? "" : "s"}
              </span>
            </div>

            {/* What this actually is — it's NOT the level/XP bar. */}
            <p style={{ fontFamily: BODY, fontSize: 13.5, lineHeight: 1.6, color: MUTED2, margin: "0 0 22px" }}>
              <strong style={{ color: INK }}>Not your level.</strong> This is the versioned history of <em>who your pet is becoming</em> — each checkpoint is an immutable snapshot of its personality, voice, and memory at a turning point (adoption, a memory consolidation, a milestone). A SHA-256 hash fingerprints each version. Future on-chain anchoring is planned but not live; portability works through the downloadable SOUL bundle today.
            </p>

            {checkpoints.length === 0 ? (
              <div
                style={{
                  padding: 28,
                  textAlign: "center",
                  color: MUTED,
                  fontFamily: BODY,
                  fontSize: 14,
                }}
              >
                No persona checkpoints yet — interact with your pet to create the first one
              </div>
            ) : (
              <div style={{ position: "relative", paddingLeft: 6 }}>
                {collapseConsolidations(checkpoints).map((ck, i, arr) => {
                  const isLast = i === arr.length - 1;
                  const verified = !!ck.tx_hash;
                  const rolled = (ck._count || 1) > 1;
                  return (
                    <div key={ck.id} style={{ position: "relative", paddingLeft: 26, paddingBottom: isLast ? 0 : 24 }}>
                      {/* Timeline line */}
                      {!isLast && (
                        <div
                          style={{
                            position: "absolute",
                            left: 5,
                            top: 14,
                            bottom: 0,
                            width: 2,
                            background: "linear-gradient(180deg, rgba(190,79,40,0.35), rgba(190,79,40,0.08))",
                          }}
                        />
                      )}
                      {/* Dot */}
                      <div
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 4,
                          width: 12,
                          height: 12,
                          borderRadius: "50%",
                          background: verified ? GOOD : TERRA,
                          border: `2px solid ${PAPER}`,
                        }}
                      />

                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                        <span
                          style={{
                            padding: "3px 10px",
                            borderRadius: 6,
                            background: "rgba(190,79,40,0.1)",
                            border: `1px solid ${HAIR}`,
                            color: TERRA_SUB,
                            fontFamily: MONO,
                            fontSize: 13,
                            fontWeight: 700,
                            letterSpacing: "0.06em",
                          }}
                        >
                          {rolled ? `v${ck._fromVersion}–v${ck.version}` : `v${ck.version}`}
                        </span>
                        <span
                          style={{
                            fontFamily: DISP,
                            color: INK,
                            fontWeight: 700,
                            fontSize: 15,
                          }}
                        >
                          {ck.trigger_event === "adoption" ? "Adopted"
                            : ck.trigger_event === "post_consolidation" ? (rolled ? `Memory consolidated ×${ck._count}` : "Memory consolidated")
                            : ck.trigger_event === "onboarding" ? "Onboarding learned"
                            : ck.trigger_event === "chat_analysis" ? "Learned from chat"
                            : (ck.trigger_event || "checkpoint").replace(/_/g, " ")}
                        </span>
                        <span
                          style={{
                            fontFamily: MONO,
                            fontSize: 13,
                            color: MONO_CLR,
                          }}
                        >
                          {formatDate(ck.created_at)}
                        </span>
                        {verified && (
                          <a
                            href={`${BSCSCAN}/tx/${ck.tx_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={ck.tx_hash || ""}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              padding: "2px 7px",
                              borderRadius: 6,
                              background: "rgba(92,138,78,0.12)",
                              border: `1px solid ${HAIR}`,
                              color: GOOD,
                              fontFamily: MONO,
                              fontSize: 13,
                              fontWeight: 700,
                              textDecoration: "none",
                            }}
                          >
                            ✓ on-chain
                          </a>
                        )}
                      </div>

                      {/* Always say what this checkpoint meant — fall back to a
                          trigger-derived blurb so a row is never just "v2 · date". */}
                      <div
                        style={{
                          fontSize: 13,
                          color: MUTED,
                          fontFamily: BODY,
                          lineHeight: 1.6,
                          fontStyle: "italic",
                        }}
                      >
                        {ck.summary
                          ? `“${ck.summary}”`
                          : ck.trigger_event === "adoption"
                            ? "Origin identity sealed — who your pet first was."
                            : ck.trigger_event === "post_consolidation"
                              ? (rolled
                                  ? `${ck._count} automatic memory passes · latest ${formatDate(ck.created_at)}`
                                  : `Memory pass · ${formatDate(ck.created_at)}`)
                              : "A turning point in your pet's identity, snapshotted and fingerprinted."}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Reveal>

          {/* ───── Inheritance Card ───── */}
          <Reveal
            dir="up"
            style={{
              padding: 30,
              borderRadius: 20,
              background: PAPER,
              border: `1px solid ${HAIR}`,
              boxShadow: CARD_SHADOW,
              marginBottom: 32,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 22, display: "inline-flex", color: TERRA }}><Icon name="crown" size={22} /></span>
              <h2 style={{ fontFamily: DISP, fontSize: 24, fontWeight: 800, color: INK, letterSpacing: "-0.02em" }}>
                Legacy &amp; Inheritance
              </h2>
            </div>
            <p
              style={{
                fontSize: 15,
                color: MUTED2,
                marginBottom: 20,
                fontFamily: BODY,
                lineHeight: 1.65,
              }}
            >
              Record a successor-wallet preference. This is stored off-chain today; automatic transfer and on-chain inheritance are not active.
            </p>

            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontSize: 13,
                  fontFamily: MONO,
                  fontWeight: 700,
                  color: MONO_CLR,
                  marginBottom: 8,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                Successor Wallet
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  className="sov-successor-input"
                  aria-label="Successor wallet"
                  value={successorInput}
                  onChange={(e) => setSuccessorInput(e.target.value)}
                  placeholder="0x..."
                  disabled={successorSaving}
                  style={{
                    flex: 1,
                    minWidth: 280,
                    padding: "11px 14px",
                    borderRadius: 10,
                    background: INSET,
                    border: `1px solid ${HAIR}`,
                    color: INK,
                    fontFamily: MONO,
                    fontSize: 13,
                    outline: "none",
                  }}
                />
                <button
                  onClick={handleSaveSuccessor}
                  disabled={successorSaving || !successorInput.trim()}
                  style={{
                    padding: "11px 22px",
                    borderRadius: 12,
                    background:
                      successorSaving || !successorInput.trim()
                        ? "rgba(33,26,18,0.06)"
                        : CTA,
                    border: "none",
                    color: successorSaving || !successorInput.trim() ? MUTED : "#fff",
                    fontFamily: DISP,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: successorSaving || !successorInput.trim() ? "not-allowed" : "pointer",
                  }}
                >
                  {successorSaving ? "Saving..." : "Save"}
                </button>
                {soul?.successor_wallet && (
                  <button
                    onClick={handleRemoveSuccessor}
                    disabled={successorSaving}
                    style={{
                      padding: "11px 18px",
                      borderRadius: 12,
                      background: PAPER,
                      border: `1px solid ${HAIR}`,
                      color: DANGER,
                      fontFamily: BODY,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
              {successorMsg && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 13,
                    fontFamily: MONO,
                    color: successorMsg.includes("saved") ? GOOD : DANGER,
                  }}
                >
                  {successorMsg}
                </div>
              )}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 14,
                paddingTop: 16,
                borderTop: `1px solid ${HAIR}`,
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontFamily: MONO, fontWeight: 700, color: MONO_CLR, marginBottom: 6, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                  Planned Trigger · Not Active
                </div>
                <div style={{ fontSize: 15, fontFamily: DISP, fontWeight: 700, color: INK }}>
                  Proposed: {soul?.inactivity_days ?? 180} days of inactivity
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, fontFamily: MONO, fontWeight: 700, color: MONO_CLR, marginBottom: 6, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                  Last Active
                </div>
                <div style={{ fontSize: 15, color: GOOD, fontFamily: DISP, fontWeight: 700 }}>
                  {timeAgo(soul?.last_heartbeat)}
                </div>
              </div>
            </div>
          </Reveal>

          {/* ───── Memory milestone history ───── */}
          <Reveal
            dir="up"
            threshold={0.1}
            style={{
              padding: 30,
              borderRadius: 20,
              background: PAPER,
              border: `1px solid ${HAIR}`,
              boxShadow: CARD_SHADOW,
              marginBottom: 32,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
              <div
                style={{
                  width: 4,
                  height: 22,
                  borderRadius: 2,
                  background: TERRA,
                }}
              />
              <h2 style={{ fontFamily: DISP, fontSize: 24, fontWeight: 800, color: INK, letterSpacing: "-0.02em" }}>
                Memory milestones
              </h2>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  color: MONO_CLR,
                }}
              >
                {memoryMilestones.length} preserved
              </span>
              <span style={{
                marginLeft: "auto",
                fontFamily: BODY,
                fontSize: 13,
                color: MUTED,
              }}>
                On-chain minting is paused. Records without a transaction hash remain off-chain history — see <a href="/contracts" style={{ color: TERRA_SUB, fontWeight: 700, textDecoration: "none" }}>/contracts</a>.
              </span>
            </div>

            {memoryMilestones.length === 0 ? (
              <div
                style={{
                  padding: 40,
                  borderRadius: 14,
                  border: `1px dashed ${HAIR}`,
                  textAlign: "center",
                }}
              >
                <div style={{ fontFamily: DISP, fontSize: 18, color: INK70, fontWeight: 700 }}>
                  No memories preserved yet
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                  gap: 16,
                }}
              >
                {memoryMilestones.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      padding: 18,
                      borderRadius: 14,
                      background: INSET,
                      border: `1px solid ${HAIR}`,
                      transition: "all 0.2s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: "rgba(190,79,40,0.1)",
                          border: `1px solid ${HAIR}`,
                          color: TERRA,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Icon name={MEMORY_TYPE_ICONS[m.memory_type] || "sparkling"} size={18} />
                      </div>
                      <div style={{ fontSize: 13, color: TERRA }}>
                        {"★".repeat(Math.max(1, Math.min(5, m.importance || 1)))}
                      </div>
                    </div>
                    <div
                      style={{
                        fontFamily: DISP,
                        fontSize: 14,
                        fontWeight: 700,
                        color: INK,
                        marginBottom: 5,
                        lineHeight: 1.3,
                      }}
                    >
                      {m.title}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: MUTED2,
                        fontFamily: BODY,
                        lineHeight: 1.55,
                        marginBottom: 12,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {m.description}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontFamily: MONO, fontSize: 13, color: MONO_CLR }}>
                        {formatDate(m.minted_at || m.recorded_at)}
                      </span>
                      {m.tx_hash && (
                        <a
                          href={`${BSCSCAN}/tx/${m.tx_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ed-underline-slide"
                          style={{
                            fontSize: 13,
                            fontFamily: MONO,
                            color: TERRA_SUB,
                            textDecoration: "none",
                            fontWeight: 700,
                          }}
                        >
                          on-chain ↗
                        </a>
                      )}
                      {!m.tx_hash && (
                        <span style={{ fontSize: 13, fontFamily: MONO, color: MUTED, fontWeight: 700 }}>
                          off-chain history
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Reveal>

          {/* ───── "What we hold about you" transparency snapshot ───── */}
          <Reveal
            dir="up"
            style={{
              padding: 30,
              borderRadius: 20,
              background: PAPER,
              border: `1px solid ${HAIR}`,
              boxShadow: CARD_SHADOW,
              marginBottom: 32,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 22, display: "inline-flex", color: TERRA }}><Icon name="crystal-ball" size={22} /></span>
              <h2 style={{ fontFamily: DISP, fontSize: 24, fontWeight: 800, color: INK, letterSpacing: "-0.02em" }}>
                What we hold about {selectedPet?.name || "your pet"}
              </h2>
              <span style={{
                fontSize: 13, padding: "3px 10px", borderRadius: 999,
                background: "rgba(92,138,78,0.14)", color: GOOD,
                fontFamily: MONO, fontWeight: 700, letterSpacing: "0.12em",
              }}>FULL TRANSPARENCY</span>
            </div>
            <p style={{
              fontSize: 14, color: MUTED2, lineHeight: 1.6, margin: "0 0 22px",
              fontFamily: BODY,
            }}>
              Every category of data the system holds, with a live count. Nothing hidden —
              everything here is <strong>exportable and deletable by you</strong> below.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 22 }}>
              <Stat label="Memories" value={memoryStats?.memoryCount ?? 0} />
              <Stat label="Profile facts" value={memoryStats?.profileCount ?? 0} />
              <Stat label="Learned patterns" value={memoryStats?.learnedSkillCount ?? 0} />
              <Stat label="Connected platforms" value={connectedCount ?? 0} />
              <Stat label="Installed skills" value={installedSkillCount ?? 0} />
              <Stat label="Soul checkpoints" value={checkpoints.length} />
              <Stat label="Memory milestones" value={memoryMilestones.length} />
            </div>

            <div style={{ fontSize: 13, fontFamily: MONO, fontWeight: 700, color: MONO_CLR, marginBottom: 8, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              Consent state
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { key: "allowPublicProfile", label: "Public profile" },
                { key: "allowDataSharing", label: "Data sharing" },
                { key: "allowAITraining", label: "AI training" },
                { key: "allowInteraction", label: "Pet interactions" },
              ].map(({ key, label }) => {
                const on = !!(consent as any)[key];
                return (
                  <span key={key} style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    fontSize: 13, padding: "5px 12px", borderRadius: 999,
                    fontFamily: BODY, fontWeight: 600,
                    background: on ? "rgba(92,138,78,0.12)" : INSET,
                    border: `1px solid ${HAIR}`,
                    color: on ? GOOD : MUTED,
                  }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: "50%",
                      background: on ? GOOD : "rgba(33,26,18,0.18)",
                    }} />
                    {label}: {on ? "ON" : "OFF"}
                  </span>
                );
              })}
            </div>
          </Reveal>
        </>
      )}

          {/* ───── Data Sovereignty (PetClaw) ───── */}
          <Reveal
            dir="up"
            threshold={0.1}
            style={{
              padding: 30,
              borderRadius: 20,
              background: PAPER,
              border: `1px solid ${HAIR}`,
              boxShadow: CARD_SHADOW,
              marginBottom: 32,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 22, display: "inline-flex", color: TERRA }}><Icon name="shield" size={22} /></span>
              <h2 style={{ fontFamily: DISP, fontSize: 24, fontWeight: 800, color: INK, letterSpacing: "-0.02em" }}>
                Data Sovereignty
              </h2>
              <span style={{
                fontSize: 13, padding: "3px 9px", borderRadius: 999,
                background: "rgba(190,79,40,0.1)", color: TERRA_SUB,
                fontFamily: MONO, fontWeight: 700, letterSpacing: "0.12em",
              }}>PetClaw v1</span>
            </div>
            <p style={{
              fontSize: 15, color: MUTED2, marginBottom: 20,
              fontFamily: BODY, lineHeight: 1.65,
            }}>
              Your pet, your data, your rules. <strong>Export SOUL Data</strong> downloads a portable JSON
              bundle containing your pet&apos;s identity, memory, skills, consent, and linked activity data.
              <strong> Delete Pet Data</strong> removes pet-scoped records and owned media from active
              systems immediately. Backup copies expire under the published retention schedule, and public
              on-chain records cannot be erased.
            </p>

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
              <button
                onClick={async () => {
                  if (!selectedPet) return;
                  if (guardDemo()) return;
                  setExporting(true);
                  setSovMsg(null);
                  try {
                    const data = await api.petclaw.export(selectedPet.id);
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${selectedPet.name}_SOUL.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    // Surface the bundle checksum recorded at export time.
                    const d = data as any;
                    setExportReceipt({
                      exportedAt: d?.exportedAt,
                      integrityHash: d?.integrityHash,
                      memoriesCount: Array.isArray(d?.memories) ? d.memories.length : 0,
                      skillsCount: Array.isArray(d?.skills) ? d.skills.length : 0,
                      checkpointsCount: Array.isArray(d?.checkpoints) ? d.checkpoints.length : 0,
                    });
                    setSovMsg("SOUL data exported successfully");
                  } catch (e: any) {
                    setSovMsg(e.message || "Export failed");
                  }
                  setExporting(false);
                  setTimeout(() => setSovMsg(null), 3000);
                }}
                disabled={exporting}
                style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                  padding: "12px 24px", borderRadius: 12, border: "none",
                  background: CTA,
                  color: "#fff", fontFamily: DISP, fontSize: 13, fontWeight: 700,
                  cursor: exporting ? "not-allowed" : "pointer", opacity: exporting ? 0.5 : 1,
                }}
              >
                {exporting ? "Exporting..." : <><Icon name="open-box" size={16} /> Export SOUL Data</>}
              </button>

              {!deleteConfirm ? (
                <button
                  onClick={() => { if (guardDemo()) return; setDeleteConfirm(true); }}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    padding: "12px 24px", borderRadius: 12,
                    background: PAPER, border: `1px solid ${HAIR}`,
                    color: DANGER, fontFamily: BODY, fontSize: 13, fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                    <path d="M4 7h16" />
                    <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                    <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
                    <path d="M10 11v7M14 11v7" />
                  </svg>
                  Delete Pet Data
                </button>
              ) : (
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={async () => {
                      if (!selectedPet || guardDemo()) return;
                      setDeleting(true);
                      try {
                        const result = await api.petclaw.delete(selectedPet.id);
                        const r = result as any;
                        setDeleteReceipt({ deletedAt: r?.deletedAt, deletionHash: r?.deletionHash });
                        setSovMsg("Pet data removed from active systems");
                        setDeleteConfirm(false);
                        fetchSovereigntyData();
                      } catch (e: any) {
                        setSovMsg(e.message || "Delete failed");
                      }
                      setDeleting(false);
                    }}
                    disabled={deleting}
                    style={{
                      padding: "12px 20px", borderRadius: 12, border: "none",
                      background: DANGER, color: "#fff",
                      fontFamily: DISP, fontSize: 13, fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {deleting ? "Deleting..." : "Confirm Delete"}
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(false)}
                    style={{
                      padding: "12px 16px", borderRadius: 12,
                      background: INSET, border: `1px solid ${HAIR}`,
                      color: MUTED, fontFamily: BODY, fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {sovMsg && (
              <div style={{
                marginBottom: 16, padding: "8px 14px", borderRadius: 8, fontSize: 13,
                fontFamily: MONO,
                background: sovMsg.includes("failed") ? "rgba(181,70,43,0.08)" : "rgba(92,138,78,0.1)",
                color: sovMsg.includes("failed") ? DANGER : GOOD,
                border: `1px solid ${HAIR}`,
              }}>
                {sovMsg}
              </div>
            )}

            {/* ── Export integrity receipt. Mounts after the action. ── */}
            {exportReceipt && (
              <Reveal dir="pop" style={{
                marginBottom: 16, padding: "16px 18px", borderRadius: 14,
                background: INSET, border: `1px solid ${HAIR}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 16, display: "inline-flex", color: GOOD }}><Icon name="open-box" size={16} /></span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: INK, fontFamily: DISP }}>Export integrity receipt</span>
                  <span style={{
                    fontSize: 13, padding: "2px 8px", borderRadius: 10,
                    background: "rgba(92,138,78,0.14)", color: GOOD,
                    fontFamily: MONO, fontWeight: 700, letterSpacing: "0.12em",
                  }}>SHA-256</span>
                  <span style={{ marginLeft: "auto", fontSize: 13, fontFamily: MONO, color: MONO_CLR }}>
                    {exportReceipt.exportedAt ? new Date(exportReceipt.exportedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 10 }}>
                  {[
                    { l: "Memories", v: exportReceipt.memoriesCount },
                    { l: "Skills", v: exportReceipt.skillsCount },
                    { l: "Checkpoints", v: exportReceipt.checkpointsCount },
                  ].map(({ l, v }) => (
                    <div key={l}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: GOOD, fontFamily: DISP, fontVariantNumeric: "tabular-nums" }}>{v}</div>
                      <div style={{ fontSize: 13, fontFamily: MONO, fontWeight: 700, color: MONO_CLR, textTransform: "uppercase", letterSpacing: "0.12em" }}>{l}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 13.5, color: MUTED2, fontFamily: BODY, lineHeight: 1.6 }}>
                  Integrity hash{" "}
                  <span style={{ fontFamily: MONO, color: INK, fontWeight: 700 }}>
                    {exportReceipt.integrityHash ? `${exportReceipt.integrityHash.slice(0, 16)}…` : "—"}
                  </span>
                  {" "}— compare it with the value recorded at export time to detect later file changes. It is an integrity checksum, not a server signature.
                </div>
              </Reveal>
            )}

            {/* ── Deletion receipt — records completion in active systems. ── */}
            {deleteReceipt && (
              <Reveal dir="pop" style={{
                marginBottom: 16, padding: "16px 18px", borderRadius: 14,
                background: INSET, border: `1px solid ${HAIR}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 16, display: "inline-flex" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={DANGER} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 7h16" />
                      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                      <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
                      <path d="M10 11v7M14 11v7" />
                    </svg>
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: INK, fontFamily: DISP }}>Deletion receipt</span>
                  <span style={{
                    fontSize: 13, padding: "2px 8px", borderRadius: 10,
                    background: "rgba(181,70,43,0.12)", color: DANGER,
                    fontFamily: MONO, fontWeight: 700, letterSpacing: "0.12em",
                  }}>SHA-256</span>
                  <span style={{ marginLeft: "auto", fontSize: 13, fontFamily: MONO, color: MONO_CLR }}>
                    {deleteReceipt.deletedAt ? new Date(deleteReceipt.deletedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—"}
                  </span>
                </div>
                <div style={{ fontSize: 13.5, color: MUTED2, fontFamily: BODY, lineHeight: 1.6 }}>
                  Deletion hash{" "}
                  <span style={{ fontFamily: MONO, color: DANGER, fontWeight: 700 }}>
                    {deleteReceipt.deletionHash ? `${deleteReceipt.deletionHash.slice(0, 16)}…` : "—"}
                  </span>
                  {" "}— identifies this completed server request; it is not third-party cryptographic proof. Pet-scoped data and owned media were removed from active systems. Backup copies
                  expire within 90 days; public on-chain records are unchanged.
                </div>
              </Reveal>
            )}

            {/* Consent Management */}
            <div style={{ borderTop: `1px solid ${HAIR}`, paddingTop: 16 }}>
              <div style={{ fontSize: 13, fontFamily: MONO, fontWeight: 700, color: MONO_CLR, marginBottom: 6, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                Data Consent
              </div>
              <div style={{ fontSize: 13.5, color: MUTED2, marginBottom: 14, lineHeight: 1.6, fontFamily: BODY }}>
                You decide how your pet&apos;s data is used; changes save instantly. Pet Interactions is enforced today. Data Sharing and AI Training are opt-in preferences reserved for the upcoming partner program — they record your choice now and take effect only when those features go live.
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                {[
                  { key: "allowPublicProfile", label: "Public Profile", desc: "On: your pet's profile, creations & stats show in the public gallery. Off: visible only to you." },
                  { key: "allowDataSharing", label: "Data Sharing", desc: "Your stated preference for the upcoming third-party app program (SDK / MCP clients). No external app can read your pet's data today regardless of this setting — when the partner program launches, access is gated on this opt-in." },
                  { key: "allowAITraining", label: "AI Training", desc: "Your stated preference for using anonymized interactions to improve models. We do not train on your data today; this opt-in records your choice and takes effect only if/when such a program goes live." },
                  { key: "allowInteraction", label: "Pet Interactions", desc: "On: other users' pets can interact with yours (social feed, buddy system). Off: solo mode." },
                ].map(({ key, label, desc }) => (
                  <div key={key} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "12px 16px", borderRadius: 12,
                    background: INSET, border: `1px solid ${HAIR}`,
                  }}>
                    <div>
                      <div style={{ fontSize: 14, fontFamily: DISP, fontWeight: 700, color: INK }}>{label}</div>
                      <div style={{ fontSize: 13.5, color: MUTED2, fontFamily: BODY, marginTop: 2 }}>{desc}</div>
                    </div>
                    <button
                      role="switch"
                      aria-checked={!!(consent as any)[key]}
                      aria-label={label}
                      disabled={consentSaving}
                      onClick={() => {
                        const previous = consent;
                        const next = { ...previous, [key]: !previous[key as keyof typeof previous] };
                        setConsent(next);
                        void saveConsent(next, previous);
                      }}
                      style={{
                        width: 44, height: 24, borderRadius: 12, padding: 0,
                        background: (consent as any)[key] ? CTA : "rgba(33,26,18,0.1)",
                        cursor: consentSaving ? "wait" : "pointer", position: "relative", transition: "all 0.2s",
                        opacity: consentSaving ? 0.65 : 1,
                        border: `1px solid ${(consent as any)[key] ? "transparent" : HAIR}`,
                      }}
                    >
                      <div style={{
                        width: 18, height: 18, borderRadius: 9,
                        background: "#fff",
                        position: "absolute", top: 2,
                        left: (consent as any)[key] ? 22 : 2,
                        transition: "left 0.2s",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                      }} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          {/* ───── PetClaw SDK ───── */}
          <Reveal
            dir="up"
            threshold={0.1}
            style={{
              borderRadius: 20, marginBottom: 32, overflow: "hidden",
              background: PAPER,
              border: `1px solid ${HAIR}`, boxShadow: CARD_SHADOW,
            }}
          >
            <div style={{ padding: 30 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 22, display: "inline-flex", color: TERRA }}><Icon name="paw" size={22} /></span>
                <h2 style={{ fontFamily: DISP, fontSize: 24, fontWeight: 800, color: INK, letterSpacing: "-0.02em" }}>PetClaw SDK</h2>
                <span style={{ fontSize: 13, padding: "3px 9px", borderRadius: 999, background: "rgba(190,79,40,0.1)", color: TERRA_SUB, fontFamily: MONO, fontWeight: 700, letterSpacing: "0.12em" }}>MEMORY · SESSION</span>
                <span style={{ fontSize: 13, padding: "3px 9px", borderRadius: 999, background: "rgba(92,138,78,0.1)", color: GOOD, fontFamily: MONO, fontWeight: 700, letterSpacing: "0.12em" }}>v{SDK_VERSION}</span>
              </div>
              <p style={{ fontSize: 15, color: MUTED2, fontFamily: BODY, lineHeight: 1.7, marginBottom: 24 }}>
                PetClaw is not a generic AI API wrapper — it is a <strong style={{ color: INK }}>memory &amp; session-specialized framework</strong>. Unlike stateless wrappers, Claw preserves full context across platform switches, restarts, and devices. Your pet remembers who you are, what you talked about, and what matters to you — everywhere.
              </p>

              {/* Why PetClaw — 6 cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 28 }}>
                {[
                  { icon: "crystal-ball", title: "Persistent Memory", desc: "Context survives sessions, restarts, and platform switches — no re-explaining yourself" },
                  { icon: "electric", title: "Real-time Sync", desc: "State changes on Telegram reflect instantly on Discord, Web, and wherever Claw runs" },
                  { icon: "lock", title: "Encrypted Sessions", desc: "AES-256 session keys. Only your pet can read its own history" },
                  { icon: "extension-icon", title: "MCP Compatible", desc: "Plug into any Model Context Protocol client in under 5 minutes" },
                  { icon: "scroll", title: "SOUL.md", desc: "Your pet's personality definition file — define its values and voice in plain markdown" },
                  { icon: "sparkling", title: "Self-improving", desc: "Skills evolve as interactions accumulate. The more your pet knows you, the better it converses" },
                ].map(({ icon, title, desc }) => (
                  <div key={title} style={{ padding: 18, borderRadius: 14, background: INSET, border: `1px solid ${HAIR}` }}>
                    <div style={{ fontSize: 26, marginBottom: 10, color: TERRA }}><Icon name={icon} size={26} /></div>
                    <div style={{ fontFamily: DISP, fontSize: 14, fontWeight: 700, color: INK, marginBottom: 6 }}>{title}</div>
                    <div style={{ fontSize: 13, color: MUTED2, fontFamily: BODY, lineHeight: 1.6 }}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* SOUL.md concept strip */}
            <div style={{
              borderTop: `1px solid ${HAIR}`, borderBottom: `1px solid ${HAIR}`,
              background: INSET, padding: "18px 30px",
              display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start",
            }}>
              <div style={{ flex: "0 1 auto", minWidth: 0, maxWidth: "100%" }}>
                <div style={{ fontSize: 13, fontFamily: MONO, color: TERRA_SUB, letterSpacing: "0.12em", marginBottom: 8, fontWeight: 700 }}>SOUL.md — A living definition of your pet</div>
                <div className="sov-soul-block" style={{ background: "#211A12", borderRadius: 10, padding: "14px 18px", fontFamily: "monospace", fontSize: 13, color: "#F5EFE2", lineHeight: 1.85, minWidth: 280, maxWidth: "100%", overflowX: "auto" }}>
                  <div style={{ color: "#F49B2A", fontWeight: 700 }}># SOUL — Sparky</div>
                  <div style={{ color: "rgba(251,246,236,0.65)", marginTop: 4 }}>{"> A living definition of who Sparky is."}</div>
                  <div style={{ marginTop: 10, color: "#E8A86A" }}>## Core Values</div>
                  <div>{"- Loyalty to their owner above all else"}</div>
                  <div>{"- Grows through every meaningful conversation"}</div>
                  <div style={{ marginTop: 8, color: "#E8A86A" }}>## Communication Style</div>
                  <div>{"- Short, vivid sentences. Never breaks character."}</div>
                  <div>{"- References past memories naturally."}</div>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 200, paddingTop: 26 }}>
                <div style={{ fontSize: 14, color: MUTED2, fontFamily: BODY, lineHeight: 1.9 }}>
                  <div>Part of PetClaw's VIGIL memory architecture.</div>
                  <div style={{ marginTop: 6 }}>Edit SOUL.md and your pet's voice and values update immediately.</div>
                  <div style={{ marginTop: 6 }}>Version-controlled — track your pet's growth with git.</div>
                </div>
                <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
                  {["petclaw-sdk soul init", "petclaw-sdk soul push"].map((cmd) => (
                    <span key={cmd} style={{ fontSize: 13, padding: "3px 8px", borderRadius: 6, background: "#211A12", color: "#E8A86A", fontFamily: "monospace" }}>{cmd}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* CLI Onboarding */}
            <div style={{ padding: "24px 30px" }}>
              <div style={{ fontSize: 13, fontFamily: MONO, fontWeight: 700, color: MONO_CLR, marginBottom: 12, letterSpacing: "0.12em", textTransform: "uppercase" }}>CLI Onboarding — Up in 5 Minutes</div>
              <div style={{ background: "#211A12", borderRadius: 14, padding: "18px 22px", fontFamily: "monospace", fontSize: 13, color: "#F5EFE2", lineHeight: 2.1, overflowX: "auto" }}>
                {[
                  { prompt: "$", cmd: "npm install -g @myaipet/petclaw-sdk", comment: "" },
                  { prompt: "$", cmd: "petclaw-sdk init", comment: "# set server URL + pet ID → saved to ~/.petclaw.json" },
                  { prompt: "$", cmd: "petclaw-sdk status", comment: "# ✓ Server Online · Skills: 18 · Ownership: user" },
                  { prompt: "$", cmd: "petclaw-sdk soul init", comment: "# generates SOUL.md — your pet's personality file" },
                  { prompt: "$", cmd: "petclaw-sdk chat \"hello\"", comment: "# 🐾 Hey! What's up? — 1234ms · grok-3-mini" },
                  { prompt: "$", cmd: "petclaw-sdk export", comment: "# Sparky_SOUL_1713200000.json saved" },
                ].map(({ prompt, cmd, comment }, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ color: "#7CB36A", userSelect: "none", flexShrink: 0 }}>{prompt}</span>
                    <span style={{ color: "#F5EFE2" }}>{cmd}</span>
                    {comment && <span style={{ color: "rgba(251,246,236,0.65)", marginLeft: 4 }}>{comment}</span>}
                  </div>
                ))}
                <div style={{ marginTop: 10, color: "rgba(251,246,236,0.65)", fontSize: 13 }}>
                  petclaw-sdk talk &nbsp;→ interactive chat mode &nbsp;|&nbsp; petclaw-sdk mcp → start MCP server
                </div>
              </div>

              {/* SDK quick setup */}
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 13, fontFamily: MONO, fontWeight: 700, color: MONO_CLR, marginBottom: 8, letterSpacing: "0.12em", textTransform: "uppercase" }}>SDK (TypeScript)</div>
                <div style={{ background: "#211A12", borderRadius: 12, padding: "16px 20px", fontFamily: "monospace", fontSize: 13, color: "#F5EFE2", lineHeight: 2, overflowX: "auto" }}>
                  <div><span style={{ color: "#E8A86A" }}>import</span> {"{ PetClawClient }"} <span style={{ color: "#E8A86A" }}>from</span> <span style={{ color: "#7CB36A" }}>'@myaipet/petclaw-sdk'</span></div>
                  <div style={{ marginTop: 8 }}><span style={{ color: "#E8A86A" }}>const</span> claw = <span style={{ color: "#E8A86A" }}>new</span> <span style={{ color: "#F49B2A" }}>PetClawClient</span>{"({ baseUrl: process.env.PETCLAW_URL })"}</div>
                  <div style={{ marginTop: 8, color: "rgba(251,246,236,0.65)" }}>{"// chat — personality & memory context auto-included"}</div>
                  <div><span style={{ color: "#E8A86A" }}>const</span> res = <span style={{ color: "#E8A86A" }}>await</span> claw.skills.<span style={{ color: "#F49B2A" }}>execute</span>(petId, <span style={{ color: "#7CB36A" }}>'companion-chat'</span>, {"{ message }"})</div>
                  <div style={{ marginTop: 6, color: "rgba(251,246,236,0.65)" }}>{"// data sovereignty — full portable export"}</div>
                  <div><span style={{ color: "#E8A86A" }}>const</span> soul = <span style={{ color: "#E8A86A" }}>await</span> claw.sovereignty.<span style={{ color: "#F49B2A" }}>export</span>(petId)</div>
                  <div style={{ marginTop: 6, color: "rgba(251,246,236,0.65)" }}>{"// discover pets on the network"}</div>
                  <div><span style={{ color: "#E8A86A" }}>const</span> {"{ nodes }"} = <span style={{ color: "#E8A86A" }}>await</span> claw.network.<span style={{ color: "#F49B2A" }}>discover</span>()</div>
                </div>
              </div>
            </div>
          </Reveal>

          {/* ───── Memory Ledger + Channel Connections ───── */}
          {/* Distinct key prefixes: these two are ADJACENT SIBLINGS, so sharing the
              bare selectedPet.id as key collided and made React duplicate the
              ledger. Prefix per-component to keep remount-on-pet-switch behavior
              (keys stay on the cards; the Reveal wrappers fire once and survive
              pet switches without re-running the entrance). */}
          {selectedPet && !isDemo && (
            <Reveal dir="up" threshold={0.1}>
              <MemoryInspectorCard key={`mem-${selectedPet.id}`} petId={selectedPet.id} />
            </Reveal>
          )}
          {selectedPet && !isDemo && (
            <Reveal dir="up" threshold={0.1}>
              <ChannelConnectionsCard key={`chan-${selectedPet.id}`} petId={selectedPet.id} />
            </Reveal>
          )}
          {isDemo && (
            <div className="sov-card" style={{ padding: "28px 30px", borderRadius: 20, background: PAPER, border: `1px solid ${HAIR}`, boxShadow: CARD_SHADOW, textAlign: "center" }}>
              <div style={{ fontFamily: DISP, fontSize: 18, fontWeight: 800, color: INK, marginBottom: 6 }}>
                Adopt a pet to unlock your sovereignty controls
              </div>
              <div style={{ fontFamily: BODY, fontSize: 14, color: MUTED, lineHeight: 1.6, maxWidth: 460, margin: "0 auto" }}>
                Memory ledger, channel connections, SOUL export &amp; delete all manage a real
                pet&apos;s data — this page is showing a demo preview.
              </div>
              <a href="/?section=my+pet" style={{ display: "inline-block", marginTop: 14, padding: "11px 22px", borderRadius: 12, background: "linear-gradient(180deg,#F49B2A,#E27D0C)", color: "#FFF8EE", fontFamily: DISP, fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
                Adopt your pet →
              </a>
            </div>
          )}

          {/* ───── Pet Network (public discovery) ───── */}
          <Reveal
            dir="up"
            threshold={0.1}
            style={{
              padding: 30,
              borderRadius: 20,
              background: PAPER,
              border: `1px solid ${HAIR}`, boxShadow: CARD_SHADOW,
              marginBottom: 32,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 22, display: "inline-flex", color: TERRA }}><Icon name="world-map" size={22} /></span>
              <h2 style={{ fontFamily: DISP, fontSize: 24, fontWeight: 800, color: INK, letterSpacing: "-0.02em" }}>
                Pet Network
              </h2>
              <span style={{
                fontSize: 13, padding: "3px 10px", borderRadius: 999,
                background: "rgba(190,79,40,0.1)", color: TERRA_SUB,
                fontFamily: MONO, fontWeight: 700, letterSpacing: "0.12em",
              }}>PUBLIC DISCOVERY</span>
            </div>
            <p style={{
              fontSize: 14, color: MUTED2, lineHeight: 1.6, margin: "0 0 22px",
              fontFamily: BODY,
            }}>
              Your pet can discover other public profiles on the open network. Remote skill
              invocation stays disabled until consent and caller funding are explicit.
            </p>

            {/* Network stats — ONLY the real number. "Online now" (= every active
                pet, no recency) and "Avg trust" (hardcoded 75) were fabricated
                metrics under a LIVE badge and were removed. */}
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 22 }}>
              <div>
                <div style={{ fontSize: 24, fontWeight: 800, color: INK, fontFamily: DISP, fontVariantNumeric: "tabular-nums" }}>
                  {networkStats?.totalNodes ?? 0}
                </div>
                <div style={{ fontSize: 13, fontFamily: MONO, fontWeight: 700, color: MONO_CLR, textTransform: "uppercase", letterSpacing: "0.12em" }}>Total pets</div>
              </div>
            </div>

            {/* Public nodes */}
            {(() => {
              const publicNodes = networkNodes;
              if (publicNodes.length === 0) {
                return (
                  <div style={{
                    padding: 24, borderRadius: 14, border: `1px dashed ${HAIR}`,
                    textAlign: "center", fontSize: 13, color: MUTED,
                    fontFamily: BODY,
                  }}>
                    No public pets yet — check back soon.
                  </div>
                );
              }
              return (
                <div style={{ display: "grid", gap: 8 }}>
                  {publicNodes.slice(0, 5).map((n) => (
                    <div key={n.petId} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "10px 14px", borderRadius: 12,
                      background: INSET, border: `1px solid ${HAIR}`,
                    }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: 10, flexShrink: 0, overflow: "hidden",
                        background: TERRA, color: CREAM_ON,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {n.avatarUrl ? (
                          <img src={n.avatarUrl} alt={n.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <Icon name="paw" size={18} />
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: INK, fontFamily: DISP, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {n.name}
                        </div>
                        <div style={{ fontSize: 13, color: MUTED, fontFamily: MONO, marginTop: 2 }}>
                          {[n.personality, n.element, n.level != null ? `Lv.${n.level}` : null].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 13, padding: "4px 10px", borderRadius: 999,
                        background: "rgba(92,138,78,0.12)", border: `1px solid ${HAIR}`,
                        color: GOOD, fontFamily: MONO, fontWeight: 700,
                      }}>
                        ⛨ {n.trustScore ?? 0}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </Reveal>

          {/* ───── Chrome Extension ───── */}
          <ChromeExtensionSection />

          {/* ───── PetClaw Ecosystem (Coming Soon) ───── */}
          <Reveal
            dir="up"
            threshold={0.1}
            style={{
              padding: 30,
              borderRadius: 20,
              background: PAPER,
              border: `1px solid ${HAIR}`, boxShadow: CARD_SHADOW,
              marginBottom: 32,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <span style={{ fontSize: 22, display: "inline-flex", color: TERRA }}><Icon name="extension-icon" size={22} /></span>
              <h2 style={{ fontFamily: DISP, fontSize: 24, fontWeight: 800, color: INK, letterSpacing: "-0.02em" }}>
                PetClaw Ecosystem
              </h2>
              <span style={{
                fontSize: 13, padding: "3px 9px", borderRadius: 999,
                background: "rgba(190,79,40,0.1)", color: TERRA_SUB,
                fontFamily: MONO, fontWeight: 700, letterSpacing: "0.12em",
              }}>19 CONNECTORS · 6 LIVE</span>
            </div>
            <p style={{
              fontSize: 15, color: MUTED2, marginBottom: 20,
              fontFamily: BODY, lineHeight: 1.65,
            }}>
              19 connectors in the registry; 6 are live today. Planned connectors are marked below.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
              {[
                { icon: "T", name: "Telegram", color: "#2AABEE", live: true },
                { icon: "𝕏", name: "Twitter/X", color: "#000", live: true },
                { icon: "D", name: "Discord", color: "#5865F2", live: true },
                { icon: "S", name: "Slack", color: "#4A154B" },
                { icon: "W", name: "WhatsApp", color: "#25D366" },
                { icon: "L", name: "LINE", color: "#06C755" },
                { icon: "I", name: "Instagram", color: "#E4405F" },
                { icon: "✉", name: "Gmail", color: "#EA4335" },
                { icon: "N", name: "Notion", color: "#000" },
                { icon: "📅", name: "Calendar", color: "#4285F4" },
                { icon: "G", name: "GitHub", color: "#181717" },
                { icon: "♫", name: "Spotify", color: "#1DB954" },
                { icon: "▶", name: "YouTube", color: "#FF0000" },
                { icon: "🔍", name: "Web Search", color: "#4285F4", live: true },
                { icon: "🦁", name: "Brave", color: "#FB542B" },
                { icon: "W", name: "Wikipedia", color: "#000", live: true },
                { icon: "🧠", name: "Memory", color: "#8B5CF6", live: true },
                { icon: "🦎", name: "CoinGecko", color: "#8BC53F" },
                { icon: "⛓", name: "BscScan", color: "#F0B90B" },
              ].map((c) => (
                <div key={c.name} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 10px", borderRadius: 10,
                  background: INSET,
                  border: `1px solid ${HAIR}`,
                  opacity: c.live ? 1 : 0.7,
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: 6,
                    background: c.color, color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 800, flexShrink: 0,
                  }}>{c.icon}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, fontFamily: BODY, color: c.live ? INK : MUTED }}>{c.name}</div>
                    <div style={{ fontSize: 13, fontFamily: MONO, fontWeight: 700, letterSpacing: "0.08em", color: c.live ? GOOD : MONO_CLR }}>
                      {c.live ? "● live" : "○ soon"}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontFamily: BODY, fontSize: 13, fontWeight: 600, padding: "5px 12px", borderRadius: 8, background: INSET, border: `1px solid ${HAIR}`, color: MUTED2 }}>
                18 Skills
              </span>
              <span style={{ fontFamily: BODY, fontSize: 13, fontWeight: 600, padding: "5px 12px", borderRadius: 8, background: INSET, border: `1px solid ${HAIR}`, color: MUTED2 }}>
                6 MCP Tools
              </span>
              <span style={{ fontFamily: MONO, fontSize: 13, padding: "5px 12px", borderRadius: 8, background: INSET, border: `1px solid ${HAIR}`, color: MUTED2 }}>
                @myaipet/petclaw-sdk
              </span>
            </div>
          </Reveal>
      </div>
    </div>
  );
}

// ── Shared styles for modal inputs ──
const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontFamily: MONO,
  fontWeight: 700,
  color: MONO_CLR,
  marginBottom: 6,
  letterSpacing: "0.12em",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  borderRadius: 10,
  background: INSET,
  border: `1px solid ${HAIR}`,
  color: INK,
  fontFamily: BODY,
  fontSize: 13,
  outline: "none",
};
