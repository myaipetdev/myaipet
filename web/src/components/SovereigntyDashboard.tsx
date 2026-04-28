"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import Icon from "@/components/Icon";

// ── Types ──
interface SoulState {
  token_id?: number | string;
  genesis_hash?: string;
  current_version?: number;
  current_hash?: string;
  birth_at?: string;
  last_heartbeat?: string;
  successor_wallet?: string | null;
  inactivity_days?: number;
  wallet_address?: string;
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

interface MemoryNft {
  id: number | string;
  token_id?: number | string;
  memory_type: string;
  title: string;
  description: string;
  importance: number;
  tx_hash?: string | null;
  minted_at?: string;
}

interface MintableMemory {
  id: number | string;
  content: string;
  memory_type?: string;
  importance?: number;
  created_at?: string;
}

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
  mintable: (petId: any) => api.memoryNfts.mintable(petId),
  mint: (petId: any, data: any) => api.memoryNfts.mint(petId, data),
};

// ── Chrome Extension in-app showcase ──
function ChromeExtensionSection() {
  const [installStep, setInstallStep] = useState<number | null>(null);

  const steps = [
    { n: 1, title: "Download", desc: 'Click "Download Extension" below to get the ZIP file.' },
    { n: 2, title: "Unzip", desc: "Extract the ZIP to any folder on your computer." },
    { n: 3, title: "Open Extensions", desc: "Go to chrome://extensions in Chrome and enable Developer Mode (top-right toggle)." },
    { n: 4, title: "Load Unpacked", desc: 'Click "Load unpacked" and select the extracted folder.' },
    { n: 5, title: "Done!", desc: "The MY AI PET companion icon appears in your toolbar — click it to meet your pet!" },
  ];

  return (
    <div
      className="sov-card"
      style={{
        borderRadius: 20, marginBottom: 32, overflow: "hidden",
        border: "1px solid rgba(66,133,244,0.18)",
        background: "linear-gradient(135deg, rgba(66,133,244,0.04) 0%, rgba(139,92,246,0.04) 100%)",
      }}
    >
      <div style={{ padding: 30 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 22 }}>🌐</span>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e", letterSpacing: "-0.02em" }}>Desktop Companion Extension</h2>
          <span style={{ fontSize: 8, padding: "2px 8px", borderRadius: 10, background: "rgba(74,222,128,0.15)", color: "#16a34a", fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.1em" }}>v2.0 READY</span>
        </div>
        <p style={{ fontSize: 13, color: "rgba(26,26,46,0.55)", fontFamily: "monospace", lineHeight: 1.65, marginBottom: 20 }}>
          Your pet lives in your browser. Browse any site with your AI companion active — it watches context, earns points passively, evolves through interaction, and runs mini-games right from your toolbar. Chrome Web Store submission is underway; install early via developer mode below.
        </p>
      </div>

      {/* Two-column: features left, popup mockup right */}
      <div style={{ display: "flex", gap: 0, flexWrap: "wrap", borderTop: "1px solid rgba(0,0,0,0.05)" }}>
        {/* Left: features + steps */}
        <div style={{ flex: "1 1 280px", padding: "24px 30px", borderRight: "1px solid rgba(0,0,0,0.05)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
            {[
              { icon: "🐾", title: "Always Alive", desc: "Your pet runs in the background and sends push notifications." },
              { icon: "🎯", title: "Airdrop Points", desc: "Earn $PET points for browsing, chats, streaks, and evolution." },
              { icon: "🎮", title: "Mini Games", desc: "Tap-to-feed, click-the-bug, and memory games built into the popup." },
              { icon: "🧠", title: "Context Aware", desc: "Pet reads the current page and reacts to what you're looking at." },
              { icon: "⚡", title: "Evolution", desc: "6 stages from Egg → Legend. Each stage unlocks new behaviors." },
              { icon: "🔔", title: "Mood System", desc: "Pet gets hungry, tired, or excited based on your activity." },
            ].map(({ icon, title, desc }) => (
              <div key={title} style={{ padding: 12, borderRadius: 10, background: "rgba(0,0,0,0.025)", border: "1px solid rgba(0,0,0,0.05)" }}>
                <div style={{ fontSize: 18, marginBottom: 6 }}>{icon}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#1a1a2e", marginBottom: 3 }}>{title}</div>
                <div style={{ fontSize: 10, color: "rgba(26,26,46,0.45)", fontFamily: "monospace", lineHeight: 1.55 }}>{desc}</div>
              </div>
            ))}
          </div>

          {/* Install steps */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(26,26,46,0.4)", letterSpacing: "0.1em", marginBottom: 12 }}>DEVELOPER MODE INSTALL</div>
            {steps.map((s) => (
              <div
                key={s.n}
                onClick={() => setInstallStep(installStep === s.n ? null : s.n)}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px",
                  borderRadius: 10, marginBottom: 6, cursor: "pointer",
                  background: installStep === s.n ? "rgba(66,133,244,0.07)" : "rgba(0,0,0,0.025)",
                  border: `1px solid ${installStep === s.n ? "rgba(66,133,244,0.2)" : "rgba(0,0,0,0.05)"}`,
                  transition: "all 0.2s",
                }}
              >
                <div style={{
                  width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                  background: installStep === s.n ? "#4285F4" : "rgba(0,0,0,0.08)",
                  color: installStep === s.n ? "#fff" : "rgba(26,26,46,0.5)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 800, fontFamily: "monospace",
                }}>
                  {s.n}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a2e" }}>{s.title}</div>
                  {installStep === s.n && (
                    <div style={{ fontSize: 11, color: "rgba(26,26,46,0.5)", fontFamily: "monospace", lineHeight: 1.55, marginTop: 3 }}>{s.desc}</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <a
            href="/petclaw-extension.zip"
            download="myaipet-extension.zip"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "12px 24px", borderRadius: 12,
              background: "linear-gradient(135deg, #4285F4, #3b5de7)",
              color: "#fff", fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700,
              textDecoration: "none", transition: "opacity 0.2s",
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = "0.88")}
            onMouseOut={(e) => (e.currentTarget.style.opacity = "1")}
          >
            ⬇ Download Extension
          </a>
          <div style={{ marginTop: 8, fontSize: 10, fontFamily: "monospace", color: "rgba(26,26,46,0.35)" }}>
            Chrome Web Store submission pending review
          </div>
        </div>

        {/* Right: popup mockup */}
        <div style={{ flex: "0 0 360px", padding: "24px 20px", display: "flex", flexDirection: "column", alignItems: "center", background: "rgba(10,10,20,0.03)" }}>
          <div style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(26,26,46,0.35)", letterSpacing: "0.1em", marginBottom: 12 }}>POPUP PREVIEW</div>
          {/* Extension popup mockup */}
          <div style={{
            width: 320, borderRadius: 14, overflow: "hidden",
            background: "#0a0a14", fontFamily: "'Segoe UI', -apple-system, sans-serif",
            boxShadow: "0 20px 60px rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.08)",
            fontSize: 12,
          }}>
            {/* Header */}
            <div style={{
              display: "flex", alignItems: "center", gap: 12, padding: "14px 16px 12px",
              background: "linear-gradient(135deg, rgba(251,191,36,0.08), rgba(139,92,246,0.06))",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14,
                border: "2px solid rgba(251,191,36,0.5)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 28, background: "rgba(251,191,36,0.08)",
                boxShadow: "0 0 18px rgba(251,191,36,0.15)",
                overflow: "hidden",
              }}>
                <img src="/mascot.jpg" alt="pet" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 3 }}>Sparky</div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {["⚡ Teen", "😄 Happy", "🔥 Fire"].map((tag) => (
                    <span key={tag} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 5, background: "rgba(255,255,255,0.06)", color: "#aaa" }}>{tag}</span>
                  ))}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#fbbf24" }}>2,841</div>
                <div style={{ fontSize: 9, color: "#888", fontFamily: "monospace" }}>$PET pts</div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", padding: "0 16px", gap: 2, background: "rgba(0,0,0,0.3)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              {["Status", "Points", "Game", "Settings"].map((t, i) => (
                <div key={t} style={{
                  flex: 1, padding: "8px 0", textAlign: "center", fontSize: 10, fontWeight: 600,
                  color: i === 0 ? "#fbbf24" : "#555", cursor: "pointer",
                  borderBottom: i === 0 ? "2px solid #fbbf24" : "2px solid transparent",
                }}>{t}</div>
              ))}
            </div>

            {/* Status tab body */}
            <div style={{ padding: "14px 16px" }}>
              {/* Mood bar */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 10, color: "#888" }}>😄 Happy</span>
                  <span style={{ fontSize: 10, color: "#fbbf24", fontFamily: "monospace" }}>78%</span>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.06)" }}>
                  <div style={{ height: "100%", width: "78%", borderRadius: 3, background: "linear-gradient(90deg, #fbbf24, #f59e0b)" }} />
                </div>
              </div>
              {[
                { label: "Energy", val: 65, color: "#60a5fa" },
                { label: "Hunger", val: 42, color: "#f87171" },
                { label: "Bond", val: 88, color: "#c084fc" },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 9, color: "#666" }}>{label}</span>
                    <span style={{ fontSize: 9, color, fontFamily: "monospace" }}>{val}%</span>
                  </div>
                  <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.05)" }}>
                    <div style={{ height: "100%", width: `${val}%`, borderRadius: 2, background: color }} />
                  </div>
                </div>
              ))}

              {/* Action buttons */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 14 }}>
                {["🍖 Feed", "🎮 Play", "💬 Chat", "🧠 Train"].map((a) => (
                  <div key={a} style={{
                    padding: "8px 0", borderRadius: 8, textAlign: "center",
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
                    color: "#aaa", fontSize: 11, cursor: "pointer",
                  }}>{a}</div>
                ))}
              </div>

              {/* Recent notif */}
              <div style={{ marginTop: 12, padding: "8px 10px", borderRadius: 8, background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.12)", display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ fontSize: 14 }}>⚡</span>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#fbbf24" }}>Level up! Teen stage unlocked</div>
                  <div style={{ fontSize: 9, color: "#666", fontFamily: "monospace" }}>+200 evolution points earned</div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: "8px 16px 12px", borderTop: "1px solid rgba(255,255,255,0.04)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 9, fontFamily: "monospace", color: "#444" }}>v2.0.0 · PetClaw enabled</span>
              <span style={{ fontSize: 9, color: "#16a34a", fontFamily: "monospace" }}>● connected</span>
            </div>
          </div>
          <div style={{ marginTop: 10, fontSize: 9, fontFamily: "monospace", color: "rgba(26,26,46,0.3)", textAlign: "center" }}>
            Actual extension popup (360×580px)
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SovereigntyDashboard() {
  const [pets, setPets] = useState<any[]>([]);
  const [selectedPet, setSelectedPet] = useState<any>(null);
  const [soul, setSoul] = useState<SoulState | null>(null);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [memoryNfts, setMemoryNfts] = useState<MemoryNft[]>([]);
  const [mintableMemories, setMintableMemories] = useState<MintableMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [successorInput, setSuccessorInput] = useState("");
  const [successorSaving, setSuccessorSaving] = useState(false);
  const [successorMsg, setSuccessorMsg] = useState<string | null>(null);
  const [mintModalOpen, setMintModalOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Mint modal form state
  const [mintSelectedMemoryId, setMintSelectedMemoryId] = useState<string>("");
  const [mintTitle, setMintTitle] = useState("");
  const [mintDesc, setMintDesc] = useState("");
  const [mintType, setMintType] = useState<string>("milestone");
  const [mintImportance, setMintImportance] = useState(3);
  const [minting, setMinting] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);

  // Data Sovereignty state
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [sovMsg, setSovMsg] = useState<string | null>(null);
  const [consent, setConsent] = useState({
    allowPublicProfile: true,
    allowDataSharing: false,
    allowAITraining: false,
    allowInteraction: true,
  });

  // ── Load pets (fallback to demo) ──
  useEffect(() => {
    api.pets.list().then((d: any) => {
      const list = d.pets || d || [];
      setPets(list);
      if (list.length > 0) setSelectedPet(list[0]);
    }).catch(() => {
      const demo = { id: 1, name: "Sparky", species: 7, personality_type: "playful", level: 15, element: "fire" };
      setPets([demo]);
      setSelectedPet(demo);
    });
  }, []);

  // ── Load sovereignty data when pet changes ──
  const fetchSovereigntyData = useCallback(async () => {
    if (!selectedPet) return;
    setLoading(true);
    try {
      const [soulRes, ckptRes, memsRes, mintableRes] = await Promise.all([
        soulApi.get(selectedPet.id).catch(() => null),
        soulApi.checkpoints(selectedPet.id, 50, 0).catch(() => null),
        memoryNftApi.list(selectedPet.id).catch(() => null),
        memoryNftApi.mintable(selectedPet.id).catch(() => null),
      ]);
      setSoul(soulRes?.soul || soulRes || null);
      setCheckpoints(ckptRes?.checkpoints || ckptRes || []);
      setMemoryNfts(memsRes?.memories || memsRes?.memory_nfts || memsRes || []);
      setMintableMemories(mintableRes?.memories || mintableRes || []);
      setSuccessorInput((soulRes?.soul?.successor_wallet || soulRes?.successor_wallet) || "");
    } catch {}
    setLoading(false);
  }, [selectedPet]);

  useEffect(() => { fetchSovereigntyData(); }, [fetchSovereigntyData]);

  // ── Copy-to-clipboard ──
  const copyHash = (hash: string, label: string) => {
    if (!hash) return;
    navigator.clipboard?.writeText(hash);
    setCopied(label);
    setTimeout(() => setCopied(null), 1600);
  };

  // ── Successor actions ──
  const handleSaveSuccessor = async () => {
    if (!selectedPet || !successorInput.trim()) return;
    if (!/^0x[a-fA-F0-9]{40}$/.test(successorInput.trim())) {
      setSuccessorMsg("Invalid wallet address");
      setTimeout(() => setSuccessorMsg(null), 2400);
      return;
    }
    setSuccessorSaving(true);
    setSuccessorMsg(null);
    try {
      await soulApi.setSuccessor(selectedPet.id, successorInput.trim());
      setSuccessorMsg("Successor saved on-chain");
      fetchSovereigntyData();
    } catch (err: any) {
      setSuccessorMsg(err?.message || "Failed to save");
    }
    setSuccessorSaving(false);
    setTimeout(() => setSuccessorMsg(null), 2400);
  };

  const handleRemoveSuccessor = async () => {
    if (!selectedPet) return;
    setSuccessorSaving(true);
    try {
      await soulApi.removeSuccessor(selectedPet.id);
      setSuccessorInput("");
      fetchSovereigntyData();
    } catch {}
    setSuccessorSaving(false);
  };

  // ── Mint memory ──
  const openMintModal = () => {
    setMintSelectedMemoryId("");
    setMintTitle("");
    setMintDesc("");
    setMintType("milestone");
    setMintImportance(3);
    setMintError(null);
    setMintModalOpen(true);
  };

  const handleMint = async () => {
    if (!selectedPet || !mintTitle.trim() || !mintDesc.trim()) {
      setMintError("Title and description are required");
      return;
    }
    setMinting(true);
    setMintError(null);
    try {
      await memoryNftApi.mint(selectedPet.id, {
        source_memory_id: mintSelectedMemoryId || undefined,
        title: mintTitle.trim(),
        description: mintDesc.trim(),
        memory_type: mintType,
        importance: mintImportance,
      });
      setMintModalOpen(false);
      fetchSovereigntyData();
    } catch (err: any) {
      setMintError(err?.message || "Mint failed");
    }
    setMinting(false);
  };

  // ── Render ──
  return (
    <div
      style={{
        padding: "40px 24px",
        maxWidth: 1100,
        margin: "0 auto",
        paddingTop: 100,
        minHeight: "100vh",
        
        
        
        
        position: "relative",
        fontFamily: "'Space Grotesk', sans-serif",
      }}
    >
      <style>{`
        @keyframes sovSlideIn { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes soulPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.45) } 50% { box-shadow: 0 0 0 6px rgba(16,185,129,0) } }
        @keyframes soulGlow { 0% { background-position: 0% 50% } 50% { background-position: 100% 50% } 100% { background-position: 0% 50% } }
        @keyframes copiedFade { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes spin { to { transform: rotate(360deg) } }
        .sov-card { animation: sovSlideIn 0.5s ease both; }
        .sov-hash:hover { color: #fbbf24; }
        .sov-copied { animation: copiedFade 0.2s ease both; }
      `}</style>

      {/* ───── Header Hero ───── */}
      <div
        className="sov-card"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 16,
          marginBottom: 32,
        }}
      >
        <div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 12px",
              borderRadius: 999,
              background: "rgba(16,185,129,0.08)",
              border: "1px solid rgba(16,185,129,0.25)",
              marginBottom: 14,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#10b981",
                animation: "soulPulse 2s ease-in-out infinite",
              }}
            />
            <span
              style={{
                fontFamily: "monospace",
                fontSize: 10,
                letterSpacing: "0.14em",
                color: "#10b981",
                fontWeight: 600,
              }}
            >
              ON-CHAIN IDENTITY
            </span>
          </div>
          <h1
            style={{
              fontSize: 40,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 40%, #c084fc 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              lineHeight: 1.1,
              marginBottom: 8,
            }}
          >
            Your Sovereign Self
          </h1>
          <p
            style={{
              fontSize: 15,
              color: "rgba(26,26,46,0.5)",
              fontFamily: "monospace",
              letterSpacing: "-0.01em",
            }}
          >
            The first AI you actually own
          </p>
        </div>

        {/* Pet selector */}
        {pets.length > 0 && (
          <div style={{ minWidth: 220 }}>
            <div
              style={{
                fontSize: 10,
                fontFamily: "monospace",
                color: "rgba(26,26,46,0.4)",
                marginBottom: 6,
                letterSpacing: "0.1em",
              }}
            >
              SELECTED PET
            </div>
            <select
              value={selectedPet?.id || ""}
              onChange={(e) => {
                const p = pets.find((x) => String(x.id) === e.target.value);
                if (p) setSelectedPet(p);
              }}
              style={{
                width: "100%",
                padding: "11px 14px",
                borderRadius: 12,
                background: "rgba(0,0,0,0.04)",
                border: "1px solid rgba(0,0,0,0.08)",
                backdropFilter: "blur(12px)",
                
                fontFamily: "'Space Grotesk',sans-serif",
                fontSize: 14,
                cursor: "pointer",
                outline: "none",
              }}
            >
              {pets.map((p) => (
                <option key={p.id} value={p.id} style={{ background: "#14142a", color: "#1a1a2e" }}>
                  {p.name || `Pet #${p.id}`}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ───── Sovereignty Overview Cards ───── */}
      <div
        className="sov-card"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 28 }}
      >
        {[
          {
            icon: "🔐",
            title: "Own Your AI Identity",
            desc: "Your pet's soul is minted as a Soulbound NFT on BNB Chain. Immutable, non-transferable, permanently yours — even if we shut down.",
            color: "rgba(245,158,11,0.07)", border: "rgba(245,158,11,0.2)",
          },
          {
            icon: "📊",
            title: "Sovereign Data Control",
            desc: "Export everything, delete anytime. Full GDPR-grade control over every memory, conversation, and interaction your pet generates.",
            color: "rgba(16,185,129,0.06)", border: "rgba(16,185,129,0.18)",
          },
          {
            icon: "🐾",
            title: "PetClaw Framework",
            desc: "Memory & session-specialized SDK. Your pet maintains full context across 19+ platforms — Telegram, Discord, Web — with zero data loss.",
            color: "rgba(139,92,246,0.06)", border: "rgba(139,92,246,0.18)",
          },
        ].map(({ icon, title, desc, color, border }) => (
          <div key={title} style={{ padding: "20px", borderRadius: 16, background: color, border: `1px solid ${border}` }}>
            <div style={{ fontSize: 26, marginBottom: 10 }}>{icon}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e", marginBottom: 6 }}>{title}</div>
            <div style={{ fontSize: 11, color: "rgba(26,26,46,0.55)", fontFamily: "monospace", lineHeight: 1.65 }}>{desc}</div>
          </div>
        ))}
      </div>

      {/* ───── No pet fallback ───── */}
      {!selectedPet && !loading && (
        <div
          className="sov-card"
          style={{
            padding: 48,
            borderRadius: 20,
            background: "rgba(0,0,0,0.03)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(0,0,0,0.06)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 16, color: "rgba(228,228,244,0.6)", marginBottom: 8 }}>
            No pets yet
          </div>
          <div style={{ fontSize: 13, color: "rgba(26,26,46,0.4)", fontFamily: "monospace" }}>
            Adopt a pet to birth your sovereign self on-chain
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
            background: "rgba(0,0,0,0.03)",
            border: "1px solid rgba(0,0,0,0.06)",
            textAlign: "center",
            color: "rgba(26,26,46,0.4)",
            fontFamily: "monospace",
            fontSize: 12,
          }}
        >
          Loading sovereignty data...
        </div>
      )}

      {/* ───── Soul NFT Card ───── */}
      {!loading && selectedPet && (
        <>
          {soul ? (
            <div
              className="sov-card"
              style={{
                position: "relative",
                borderRadius: 22,
                padding: 2,
                marginBottom: 32,
                background:
                  "linear-gradient(135deg, #f59e0b 0%, #c084fc 35%, #8b5cf6 65%, #f59e0b 100%)",
                backgroundSize: "300% 300%",
                animation: "soulGlow 8s ease infinite",
              }}
            >
              <div
                style={{
                  borderRadius: 20,
                  padding: "32px 34px",
                  background:
                    "linear-gradient(180deg, rgba(20,20,42,0.92) 0%, rgba(14,14,30,0.96) 100%)",
                  backdropFilter: "blur(18px)",
                }}
              >
                {/* SOULBOUND badge */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 14px",
                      borderRadius: 999,
                      background: "rgba(16,185,129,0.12)",
                      border: "1px solid rgba(16,185,129,0.4)",
                      boxShadow: "0 0 20px rgba(16,185,129,0.15)",
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: "#10b981",
                        animation: "soulPulse 1.8s ease-in-out infinite",
                      }}
                    />
                    <span
                      style={{
                        fontFamily: "monospace",
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: "0.16em",
                        color: "#10b981",
                      }}
                    >
                      SOUL-BOUND
                    </span>
                  </div>

                  {soul.token_id !== undefined && (
                    <div
                      style={{
                        fontFamily: "monospace",
                        fontSize: 11,
                        color: "rgba(26,26,46,0.5)",
                        letterSpacing: "0.06em",
                      }}
                    >
                      TOKEN #{soul.token_id}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "center" }}>
                  {/* Pet avatar */}
                  <div
                    style={{
                      width: 140,
                      height: 140,
                      borderRadius: 20,
                      background:
                        "linear-gradient(135deg, rgba(245,158,11,0.2), rgba(139,92,246,0.2))",
                      border: "2px solid rgba(245,158,11,0.35)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      flexShrink: 0,
                      boxShadow: "0 0 40px rgba(245,158,11,0.2)",
                    }}
                  >
                    {selectedPet?.image_url ? (
                      <img
                        src={selectedPet.image_url}
                        alt={selectedPet.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <Icon name="paw" size={64} />
                    )}
                  </div>

                  {/* Details */}
                  <div style={{ flex: 1, minWidth: 280 }}>
                    <div
                      style={{
                        fontSize: 26,
                        fontWeight: 700,
                        marginBottom: 16,
                        letterSpacing: "-0.02em",
                        color: "#1a1a2e",
                      }}
                    >
                      {selectedPet?.name || `Pet #${selectedPet?.id}`}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "10px 16px", fontSize: 13 }}>
                      <div style={{ color: "rgba(26,26,46,0.5)", fontFamily: "monospace", fontSize: 11 }}>
                        GENESIS
                      </div>
                      <div
                        className="sov-hash"
                        onClick={() => soul.genesis_hash && copyHash(soul.genesis_hash, "genesis")}
                        style={{
                          fontFamily: "monospace",
                          fontSize: 12,
                          color: "#fbbf24",
                          cursor: soul.genesis_hash ? "pointer" : "default",
                          transition: "color 0.2s",
                          position: "relative",
                        }}
                      >
                        {truncate(soul.genesis_hash, 6)}
                        {copied === "genesis" && (
                          <span className="sov-copied" style={{ marginLeft: 8, fontSize: 10, color: "#10b981" }}>
                            Copied!
                          </span>
                        )}
                      </div>

                      <div style={{ color: "rgba(26,26,46,0.5)", fontFamily: "monospace", fontSize: 11 }}>
                        VERSION
                      </div>
                      <div style={{ fontFamily: "monospace", fontSize: 13, color: "#c084fc", fontWeight: 600 }}>
                        v{soul.current_version ?? 1}
                      </div>

                      <div style={{ color: "rgba(26,26,46,0.5)", fontFamily: "monospace", fontSize: 11 }}>
                        CURRENT
                      </div>
                      <div
                        className="sov-hash"
                        onClick={() => soul.current_hash && copyHash(soul.current_hash, "current")}
                        style={{
                          fontFamily: "monospace",
                          fontSize: 12,
                          color: "#fbbf24",
                          cursor: soul.current_hash ? "pointer" : "default",
                          transition: "color 0.2s",
                        }}
                      >
                        {truncate(soul.current_hash, 6)}
                        {copied === "current" && (
                          <span className="sov-copied" style={{ marginLeft: 8, fontSize: 10, color: "#10b981" }}>
                            Copied!
                          </span>
                        )}
                      </div>

                      <div style={{ color: "rgba(26,26,46,0.5)", fontFamily: "monospace", fontSize: 11 }}>
                        BIRTH
                      </div>
                      <div style={{ fontFamily: "monospace", fontSize: 12, color: "rgba(228,228,244,0.85)" }}>
                        {formatDate(soul.birth_at)}
                      </div>

                      <div style={{ color: "rgba(26,26,46,0.5)", fontFamily: "monospace", fontSize: 11 }}>
                        HEARTBEAT
                      </div>
                      <div style={{ fontFamily: "monospace", fontSize: 12, color: "#10b981" }}>
                        {timeAgo(soul.last_heartbeat)}
                      </div>
                    </div>

                    {soul.genesis_hash && (
                      <a
                        href={`${BSCSCAN}/tx/${soul.genesis_hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          marginTop: 20,
                          padding: "8px 14px",
                          borderRadius: 10,
                          background: "rgba(245,158,11,0.1)",
                          border: "1px solid rgba(245,158,11,0.3)",
                          color: "#fbbf24",
                          fontSize: 12,
                          fontFamily: "monospace",
                          textDecoration: "none",
                          fontWeight: 600,
                          transition: "all 0.2s",
                        }}
                      >
                        View on BscScan ↗
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // Soul not yet initialized
            <div
              className="sov-card"
              style={{
                padding: 48,
                borderRadius: 20,
                background:
                  "linear-gradient(135deg, rgba(245,158,11,0.06), rgba(139,92,246,0.06))",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(245,158,11,0.2)",
                textAlign: "center",
                marginBottom: 32,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  border: "3px solid rgba(245,158,11,0.3)",
                  borderTopColor: "#f59e0b",
                  margin: "0 auto 20px",
                  animation: "spin 1.2s linear infinite",
                }}
              />
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: "#fbbf24",
                  marginBottom: 8,
                }}
              >
                Your pet is adopting...
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "rgba(26,26,46,0.5)",
                  fontFamily: "monospace",
                }}
              >
                Your sovereign self is being born on-chain
              </div>
            </div>
          )}

          {/* ───── Persona Evolution Timeline ───── */}
          <div
            className="sov-card"
            style={{
              padding: 30,
              borderRadius: 20,
              background: "rgba(0,0,0,0.03)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(0,0,0,0.06)",
              marginBottom: 32,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
              <div
                style={{
                  width: 4,
                  height: 22,
                  borderRadius: 2,
                  background: "linear-gradient(180deg, #f59e0b, #c084fc)",
                }}
              />
              <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e", letterSpacing: "-0.02em" }}>
                Persona Evolution
              </h2>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "monospace",
                  color: "rgba(26,26,46,0.4)",
                  marginLeft: "auto",
                }}
              >
                {checkpoints.length} checkpoint{checkpoints.length === 1 ? "" : "s"}
              </span>
            </div>

            {checkpoints.length === 0 ? (
              <div
                style={{
                  padding: 28,
                  textAlign: "center",
                  color: "rgba(26,26,46,0.4)",
                  fontFamily: "monospace",
                  fontSize: 12,
                }}
              >
                No persona checkpoints yet — interact with your pet to create the first one
              </div>
            ) : (
              <div style={{ position: "relative", paddingLeft: 6 }}>
                {checkpoints.map((ck, i) => {
                  const isLast = i === checkpoints.length - 1;
                  const verified = !!ck.tx_hash;
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
                            background: "linear-gradient(180deg, rgba(192,132,252,0.4), rgba(192,132,252,0.1))",
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
                          background: verified
                            ? "linear-gradient(135deg, #10b981, #059669)"
                            : "linear-gradient(135deg, #c084fc, #8b5cf6)",
                          boxShadow: verified
                            ? "0 0 10px rgba(16,185,129,0.5)"
                            : "0 0 10px rgba(192,132,252,0.4)",
                          border: "2px solid rgba(14,14,30,0.9)",
                        }}
                      />

                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 6,
                            background: "rgba(192,132,252,0.12)",
                            border: "1px solid rgba(192,132,252,0.3)",
                            color: "#c084fc",
                            fontFamily: "monospace",
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: "0.04em",
                          }}
                        >
                          v{ck.version}
                        </span>
                        <span
                          style={{
                            color: "#1a1a2e",
                            fontWeight: 600,
                            fontSize: 13,
                          }}
                        >
                          {ck.trigger_event}
                        </span>
                        <span
                          style={{
                            fontFamily: "monospace",
                            fontSize: 11,
                            color: "rgba(26,26,46,0.4)",
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
                              background: "rgba(16,185,129,0.1)",
                              border: "1px solid rgba(16,185,129,0.3)",
                              color: "#10b981",
                              fontFamily: "monospace",
                              fontSize: 10,
                              fontWeight: 600,
                              textDecoration: "none",
                            }}
                          >
                            ✓ on-chain
                          </a>
                        )}
                      </div>

                      {ck.summary && (
                        <div
                          style={{
                            fontSize: 12,
                            color: "rgba(26,26,46,0.5)",
                            fontFamily: "monospace",
                            lineHeight: 1.55,
                          }}
                        >
                          &quot;{ck.summary}&quot;
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ───── Inheritance Card ───── */}
          <div
            className="sov-card"
            style={{
              padding: 30,
              borderRadius: 20,
              background:
                "linear-gradient(135deg, rgba(139,92,246,0.06), rgba(245,158,11,0.04))",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(139,92,246,0.2)",
              marginBottom: 32,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 22 }}>🕊</span>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e", letterSpacing: "-0.02em" }}>
                Legacy &amp; Inheritance
              </h2>
            </div>
            <p
              style={{
                fontSize: 13,
                color: "rgba(26,26,46,0.5)",
                marginBottom: 20,
                fontFamily: "monospace",
                lineHeight: 1.6,
              }}
            >
              Your AI self outlives you. Designate a successor wallet to inherit your sovereign identity.
            </p>

            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontSize: 10,
                  fontFamily: "monospace",
                  color: "rgba(26,26,46,0.4)",
                  marginBottom: 6,
                  letterSpacing: "0.1em",
                }}
              >
                SUCCESSOR WALLET
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  value={successorInput}
                  onChange={(e) => setSuccessorInput(e.target.value)}
                  placeholder="0x..."
                  disabled={successorSaving}
                  style={{
                    flex: 1,
                    minWidth: 280,
                    padding: "11px 14px",
                    borderRadius: 10,
                    background: "rgba(0,0,0,0.05)",
                    border: "1px solid rgba(0,0,0,0.08)",
                    color: "#fbbf24",
                    fontFamily: "monospace",
                    fontSize: 13,
                    outline: "none",
                  }}
                />
                <button
                  onClick={handleSaveSuccessor}
                  disabled={successorSaving || !successorInput.trim()}
                  style={{
                    padding: "11px 22px",
                    borderRadius: 10,
                    background:
                      successorSaving || !successorInput.trim()
                        ? "rgba(0,0,0,0.05)"
                        : "linear-gradient(135deg, #f59e0b, #d97706)",
                    border: "none",
                    color: "#1a1a2e",
                    fontFamily: "'Space Grotesk',sans-serif",
                    fontSize: 13,
                    fontWeight: 600,
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
                      borderRadius: 10,
                      background: "rgba(248,113,113,0.1)",
                      border: "1px solid rgba(248,113,113,0.3)",
                      color: "#f87171",
                      fontFamily: "'Space Grotesk',sans-serif",
                      fontSize: 13,
                      fontWeight: 600,
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
                    fontSize: 11,
                    fontFamily: "monospace",
                    color: successorMsg.includes("saved") ? "#10b981" : "#f87171",
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
                borderTop: "1px solid rgba(0,0,0,0.05)",
              }}
            >
              <div>
                <div style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(26,26,46,0.4)", marginBottom: 4, letterSpacing: "0.1em" }}>
                  INHERITANCE TRIGGER
                </div>
                <div style={{ fontSize: 13,  fontFamily: "monospace" }}>
                  {soul?.inactivity_days ?? 180} days of inactivity
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(26,26,46,0.4)", marginBottom: 4, letterSpacing: "0.1em" }}>
                  LAST ACTIVE
                </div>
                <div style={{ fontSize: 13, color: "#10b981", fontFamily: "monospace" }}>
                  {timeAgo(soul?.last_heartbeat)}
                </div>
              </div>
            </div>
          </div>

          {/* ───── Memory NFT Collection ───── */}
          <div
            className="sov-card"
            style={{
              padding: 30,
              borderRadius: 20,
              background: "rgba(0,0,0,0.03)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(0,0,0,0.06)",
              marginBottom: 32,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
              <div
                style={{
                  width: 4,
                  height: 22,
                  borderRadius: 2,
                  background: "linear-gradient(180deg, #c084fc, #f59e0b)",
                }}
              />
              <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e", letterSpacing: "-0.02em" }}>
                Memory NFTs
              </h2>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "monospace",
                  color: "rgba(26,26,46,0.4)",
                }}
              >
                {memoryNfts.length} minted
              </span>
              <button
                onClick={openMintModal}
                style={{
                  marginLeft: "auto",
                  padding: "9px 18px",
                  borderRadius: 10,
                  background: "linear-gradient(135deg, #8b5cf6, #6d28d9)",
                  border: "none",
                  color: "#1a1a2e",
                  fontFamily: "'Space Grotesk',sans-serif",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                + Mint Memory
              </button>
            </div>

            {memoryNfts.length === 0 ? (
              <div
                style={{
                  padding: 40,
                  borderRadius: 14,
                  border: "1px dashed rgba(0,0,0,0.08)",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 14, color: "rgba(228,228,244,0.6)", marginBottom: 6 }}>
                  No memories minted yet
                </div>
                <div style={{ fontSize: 12, color: "rgba(26,26,46,0.4)", fontFamily: "monospace", marginBottom: 18 }}>
                  Your first milestone awaits
                </div>
                <button
                  onClick={openMintModal}
                  style={{
                    padding: "10px 22px",
                    borderRadius: 10,
                    background: "linear-gradient(135deg, #f59e0b, #c084fc)",
                    border: "none",
                    color: "#1a1a2e",
                    fontFamily: "'Space Grotesk',sans-serif",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Mint Your First Memory
                </button>
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                  gap: 16,
                }}
              >
                {memoryNfts.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      padding: 18,
                      borderRadius: 14,
                      background:
                        "linear-gradient(135deg, rgba(245,158,11,0.06), rgba(139,92,246,0.06))",
                      border: "1px solid rgba(0,0,0,0.06)",
                      transition: "all 0.2s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: "rgba(245,158,11,0.1)",
                          border: "1px solid rgba(245,158,11,0.25)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Icon name={MEMORY_TYPE_ICONS[m.memory_type] || "sparkling"} size={18} />
                      </div>
                      <div style={{ fontSize: 11, color: "#f59e0b" }}>
                        {"★".repeat(Math.max(1, Math.min(5, m.importance || 1)))}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "#1a1a2e",
                        marginBottom: 5,
                        lineHeight: 1.3,
                      }}
                    >
                      {m.title}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "rgba(26,26,46,0.5)",
                        fontFamily: "monospace",
                        lineHeight: 1.5,
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
                      <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(228,228,244,0.35)" }}>
                        {formatDate(m.minted_at)}
                      </span>
                      {m.tx_hash && (
                        <a
                          href={`${BSCSCAN}/tx/${m.tx_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: 10,
                            fontFamily: "monospace",
                            color: "#fbbf24",
                            textDecoration: "none",
                            fontWeight: 600,
                          }}
                        >
                          on-chain ↗
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ───── Mint Memory Modal ───── */}
      {mintModalOpen && (
        <div
          onClick={() => !minting && setMintModalOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(5,5,15,0.75)",
            backdropFilter: "blur(8px)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 480,
              borderRadius: 20,
              padding: 32,
              background: "linear-gradient(180deg, #14142a 0%, #0f0f22 100%)",
              border: "1px solid rgba(245,158,11,0.25)",
              boxShadow: "0 20px 80px rgba(0,0,0,0.08)",
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e", marginBottom: 6 }}>
              Mint Memory NFT
            </div>
            <div
              style={{
                fontSize: 12,
                color: "rgba(26,26,46,0.5)",
                fontFamily: "monospace",
                marginBottom: 20,
              }}
            >
              Preserve this moment forever on-chain
            </div>

            {mintableMemories.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>SOURCE MEMORY (optional)</label>
                <select
                  value={mintSelectedMemoryId}
                  onChange={(e) => {
                    setMintSelectedMemoryId(e.target.value);
                    const m = mintableMemories.find((x) => String(x.id) === e.target.value);
                    if (m) {
                      setMintTitle(m.content?.slice(0, 60) || "");
                      setMintDesc(m.content || "");
                      if (m.memory_type) setMintType(m.memory_type);
                      if (m.importance) setMintImportance(m.importance);
                    }
                  }}
                  style={inputStyle}
                >
                  <option value="" style={{ background: "#14142a" }}>— None —</option>
                  {mintableMemories.map((m) => (
                    <option key={m.id} value={m.id} style={{ background: "#14142a" }}>
                      {(m.content || "").slice(0, 50)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>TITLE</label>
              <input
                value={mintTitle}
                onChange={(e) => setMintTitle(e.target.value)}
                placeholder="A memory worth preserving"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>DESCRIPTION</label>
              <textarea
                value={mintDesc}
                onChange={(e) => setMintDesc(e.target.value)}
                placeholder="Describe this memory..."
                rows={3}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace" }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>TYPE</label>
              <select value={mintType} onChange={(e) => setMintType(e.target.value)} style={inputStyle}>
                <option value="conversation" style={{ background: "#14142a" }}>Conversation</option>
                <option value="milestone" style={{ background: "#14142a" }}>Milestone</option>
                <option value="dream" style={{ background: "#14142a" }}>Dream</option>
                <option value="achievement" style={{ background: "#14142a" }}>Achievement</option>
              </select>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>IMPORTANCE ({mintImportance}/5)</label>
              <input
                type="range"
                min={1}
                max={5}
                value={mintImportance}
                onChange={(e) => setMintImportance(Number(e.target.value))}
                style={{ width: "100%", accentColor: "#f59e0b" }}
              />
              <div style={{ fontSize: 14, color: "#f59e0b", marginTop: 4 }}>
                {"★".repeat(mintImportance)}
                <span style={{ color: "rgba(228,228,244,0.2)" }}>{"★".repeat(5 - mintImportance)}</span>
              </div>
            </div>

            {mintError && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "rgba(248,113,113,0.1)",
                  border: "1px solid rgba(248,113,113,0.3)",
                  color: "#f87171",
                  fontSize: 12,
                  fontFamily: "monospace",
                  marginBottom: 14,
                }}
              >
                {mintError}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setMintModalOpen(false)}
                disabled={minting}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: 10,
                  background: "rgba(0,0,0,0.04)",
                  border: "1px solid rgba(0,0,0,0.08)",
                  
                  fontFamily: "'Space Grotesk',sans-serif",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleMint}
                disabled={minting || !mintTitle.trim() || !mintDesc.trim()}
                style={{
                  flex: 2,
                  padding: "12px",
                  borderRadius: 10,
                  background:
                    minting || !mintTitle.trim() || !mintDesc.trim()
                      ? "rgba(0,0,0,0.05)"
                      : "linear-gradient(135deg, #f59e0b, #c084fc)",
                  border: "none",
                  color: "#1a1a2e",
                  fontFamily: "'Space Grotesk',sans-serif",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: minting ? "not-allowed" : "pointer",
                }}
              >
                {minting ? "Minting..." : "Mint as NFT"}
              </button>
            </div>
          </div>
        </div>
      )}

          {/* ───── Data Sovereignty (PetClaw) ───── */}
          <div
            className="sov-card"
            style={{
              padding: 30,
              borderRadius: 20,
              background: "linear-gradient(135deg, rgba(245,158,11,0.06) 0%, rgba(139,92,246,0.04) 100%)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(245,158,11,0.2)",
              marginBottom: 32,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 22 }}>🛡</span>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e", letterSpacing: "-0.02em" }}>
                Data Sovereignty
              </h2>
              <span style={{
                fontSize: 9, padding: "2px 8px", borderRadius: 10,
                background: "rgba(245,158,11,0.15)", color: "#f59e0b",
                fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.1em",
              }}>PetClaw v1</span>
            </div>
            <p style={{
              fontSize: 13, color: "rgba(26,26,46,0.5)", marginBottom: 20,
              fontFamily: "monospace", lineHeight: 1.6,
            }}>
              Your pet, your data, your rules. Export, import, or delete all data — with cryptographic proof.
            </p>

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
              <button
                onClick={async () => {
                  if (!selectedPet) return;
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
                    setSovMsg("SOUL data exported successfully");
                  } catch (e: any) {
                    setSovMsg(e.message || "Export failed");
                  }
                  setExporting(false);
                  setTimeout(() => setSovMsg(null), 3000);
                }}
                disabled={exporting}
                style={{
                  padding: "12px 24px", borderRadius: 12, border: "none",
                  background: "linear-gradient(135deg, #f59e0b, #d97706)",
                  color: "#1a1a2e", fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700,
                  cursor: exporting ? "not-allowed" : "pointer", opacity: exporting ? 0.5 : 1,
                }}
              >
                {exporting ? "Exporting..." : "📦 Export SOUL Data"}
              </button>

              {!deleteConfirm ? (
                <button
                  onClick={() => setDeleteConfirm(true)}
                  style={{
                    padding: "12px 24px", borderRadius: 12,
                    background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)",
                    color: "#f87171", fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  🗑 Delete All Data
                </button>
              ) : (
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={async () => {
                      if (!selectedPet) return;
                      setDeleting(true);
                      try {
                        const result = await api.petclaw.delete(selectedPet.id);
                        setSovMsg(`Data deleted. Proof: ${(result as any).deletionHash?.slice(0, 16)}...`);
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
                      background: "#dc2626", color: "#1a1a2e",
                      fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {deleting ? "Deleting..." : "Confirm Delete"}
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(false)}
                    style={{
                      padding: "12px 16px", borderRadius: 12,
                      background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.08)",
                      color: "#999", fontFamily: "'Space Grotesk',sans-serif", fontSize: 13,
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
                marginBottom: 16, padding: "8px 14px", borderRadius: 8, fontSize: 12,
                fontFamily: "monospace",
                background: sovMsg.includes("failed") ? "rgba(248,113,113,0.1)" : "rgba(16,185,129,0.1)",
                color: sovMsg.includes("failed") ? "#f87171" : "#10b981",
                border: `1px solid ${sovMsg.includes("failed") ? "rgba(248,113,113,0.2)" : "rgba(16,185,129,0.2)"}`,
              }}>
                {sovMsg}
              </div>
            )}

            {/* Consent Management */}
            <div style={{ borderTop: "1px solid rgba(0,0,0,0.05)", paddingTop: 16 }}>
              <div style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(26,26,46,0.4)", marginBottom: 12, letterSpacing: "0.1em" }}>
                DATA CONSENT
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                {[
                  { key: "allowPublicProfile", label: "Public Profile", desc: "Others can view your pet's profile" },
                  { key: "allowDataSharing", label: "Data Sharing", desc: "Share pet data with third-party services" },
                  { key: "allowAITraining", label: "AI Training", desc: "Allow pet data for AI model training" },
                  { key: "allowInteraction", label: "Pet Interactions", desc: "Other pets can interact with yours" },
                ].map(({ key, label, desc }) => (
                  <div key={key} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 14px", borderRadius: 10,
                    background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.04)",
                  }}>
                    <div>
                      <div style={{ fontSize: 13,  fontWeight: 600 }}>{label}</div>
                      <div style={{ fontSize: 10, color: "rgba(26,26,46,0.4)", fontFamily: "monospace" }}>{desc}</div>
                    </div>
                    <div
                      onClick={() => setConsent(prev => ({ ...prev, [key]: !prev[key as keyof typeof prev] }))}
                      style={{
                        width: 44, height: 24, borderRadius: 12,
                        background: (consent as any)[key] ? "linear-gradient(135deg, #f59e0b, #d97706)" : "rgba(0,0,0,0.08)",
                        cursor: "pointer", position: "relative", transition: "all 0.2s",
                        border: `1px solid ${(consent as any)[key] ? "rgba(245,158,11,0.3)" : "rgba(0,0,0,0.08)"}`,
                      }}
                    >
                      <div style={{
                        width: 18, height: 18, borderRadius: 9,
                        background: "#fff",
                        position: "absolute", top: 2,
                        left: (consent as any)[key] ? 22 : 2,
                        transition: "left 0.2s",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ───── PetClaw SDK ───── */}
          <div
            className="sov-card"
            style={{
              padding: 30, borderRadius: 20, marginBottom: 32,
              background: "linear-gradient(135deg, rgba(139,92,246,0.07) 0%, rgba(245,158,11,0.04) 100%)",
              border: "1px solid rgba(139,92,246,0.2)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 22 }}>🐾</span>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e", letterSpacing: "-0.02em" }}>PetClaw SDK</h2>
              <span style={{ fontSize: 8, padding: "2px 8px", borderRadius: 10, background: "rgba(139,92,246,0.15)", color: "#8b5cf6", fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.1em" }}>MEMORY · SESSION</span>
            </div>
            <p style={{ fontSize: 13, color: "rgba(26,26,46,0.55)", fontFamily: "monospace", lineHeight: 1.65, marginBottom: 20 }}>
              PetClaw is not a generic AI API — it is a <strong style={{ color: "#1a1a2e" }}>memory &amp; session-specialized framework</strong>. Unlike stateless wrappers, Claw maintains persistent context across platforms, restarts, and devices. Your pet remembers who you are, what you talked about, and what matters to you — everywhere.
            </p>

            {/* Why PetClaw */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))", gap: 10, marginBottom: 28 }}>
              {[
                { icon: "🧠", title: "Persistent Memory", desc: "Context survives sessions, restarts, and platform switches — no re-explaining yourself" },
                { icon: "⚡", title: "Real-time Sync", desc: "State changes on Telegram reflect instantly on Discord, Web, and wherever Claw runs" },
                { icon: "🔒", title: "Encrypted Sessions", desc: "AES-256 session keys. Only your pet can read its own history" },
                { icon: "🪝", title: "MCP Compatible", desc: "Plug into any Model Context Protocol client in under 5 minutes" },
              ].map(({ icon, title, desc }) => (
                <div key={title} style={{ padding: 14, borderRadius: 12, background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.06)" }}>
                  <div style={{ fontSize: 20, marginBottom: 8 }}>{icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a2e", marginBottom: 4 }}>{title}</div>
                  <div style={{ fontSize: 11, color: "rgba(26,26,46,0.5)", fontFamily: "monospace", lineHeight: 1.55 }}>{desc}</div>
                </div>
              ))}
            </div>

            {/* Install */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(26,26,46,0.4)", marginBottom: 8, letterSpacing: "0.1em" }}>INSTALL</div>
              <div style={{ background: "#0f0f1a", borderRadius: 12, padding: "14px 20px", fontFamily: "monospace", fontSize: 13, color: "#f8f8f8", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: "#4ade80", userSelect: "none" }}>$</span>
                <span>npm install <span style={{ color: "#a78bfa" }}>petclaw-sdk</span></span>
              </div>
            </div>

            {/* Quick setup */}
            <div>
              <div style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(26,26,46,0.4)", marginBottom: 8, letterSpacing: "0.1em" }}>QUICK SETUP</div>
              <div style={{ background: "#0f0f1a", borderRadius: 12, padding: "18px 20px", fontFamily: "monospace", fontSize: 12, color: "#f8f8f8", lineHeight: 1.9, overflowX: "auto" }}>
                <div><span style={{ color: "#a78bfa" }}>import</span> {"{ PetClaw }"} <span style={{ color: "#a78bfa" }}>from</span> <span style={{ color: "#4ade80" }}>'petclaw-sdk'</span></div>
                <div style={{ marginTop: 8 }}><span style={{ color: "#a78bfa" }}>const</span> claw = <span style={{ color: "#fbbf24" }}>new PetClaw</span>{"({"}</div>
                <div>&nbsp;&nbsp;petId: <span style={{ color: "#4ade80" }}>'your-pet-id'</span>,</div>
                <div>&nbsp;&nbsp;apiKey: <span style={{ color: "#4ade80" }}>process.env.PETCLAW_KEY</span>,</div>
                <div>{"})"}</div>
                <div style={{ marginTop: 8, color: "rgba(255,255,255,0.3)" }}>{"// Persistent memory across any session"}</div>
                <div><span style={{ color: "#a78bfa" }}>await</span> claw.<span style={{ color: "#fbbf24" }}>remember</span>(<span style={{ color: "#4ade80" }}>'User prefers TypeScript'</span>)</div>
                <div><span style={{ color: "#a78bfa" }}>await</span> claw.<span style={{ color: "#fbbf24" }}>getContext</span>() <span style={{ color: "rgba(255,255,255,0.3)" }}>{"// → full session history"}</span></div>
              </div>
            </div>
          </div>

          {/* ───── Chrome Extension ───── */}
          <ChromeExtensionSection />

          {/* ───── PetClaw Ecosystem (Coming Soon) ───── */}
          <div
            style={{
              padding: 30,
              borderRadius: 20,
              background: "rgba(0,0,0,0.02)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(0,0,0,0.05)",
              marginBottom: 32,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <span style={{ fontSize: 22 }}>🔌</span>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e", letterSpacing: "-0.02em" }}>
                PetClaw Ecosystem
              </h2>
              <span style={{
                fontSize: 8, padding: "2px 8px", borderRadius: 10,
                background: "rgba(139,92,246,0.15)", color: "#a78bfa",
                fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.1em",
              }}>COMING SOON</span>
            </div>
            <p style={{
              fontSize: 13, color: "rgba(26,26,46,0.45)", marginBottom: 20,
              fontFamily: "monospace", lineHeight: 1.6,
            }}>
              19 platform connectors. Your pet, everywhere you are.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
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
                  background: c.live ? "rgba(74,222,128,0.06)" : "rgba(0,0,0,0.02)",
                  border: `1px solid ${c.live ? "rgba(74,222,128,0.15)" : "rgba(0,0,0,0.04)"}`,
                  opacity: c.live ? 1 : 0.75,
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: 6,
                    background: c.color, color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 800, flexShrink: 0,
                  }}>{c.icon}</div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: c.live ? "#1a1a2e" : "rgba(26,26,46,0.55)" }}>{c.name}</div>
                    <div style={{ fontSize: 8, fontFamily: "monospace", color: c.live ? "#16a34a" : "rgba(26,26,46,0.35)" }}>
                      {c.live ? "● live" : "○ soon"}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "monospace", fontSize: 9, padding: "3px 8px", borderRadius: 6, background: "rgba(0,0,0,0.04)", color: "rgba(26,26,46,0.55)" }}>
                7 SKILLS
              </span>
              <span style={{ fontFamily: "monospace", fontSize: 9, padding: "3px 8px", borderRadius: 6, background: "rgba(0,0,0,0.04)", color: "rgba(26,26,46,0.55)" }}>
                5 MCP CLIENTS
              </span>
              <span style={{ fontFamily: "monospace", fontSize: 9, padding: "3px 8px", borderRadius: 6, background: "rgba(0,0,0,0.04)", color: "rgba(26,26,46,0.55)" }}>
                npm petclaw-sdk
              </span>
            </div>
          </div>
    </div>
  );
}

// ── Shared styles for modal inputs ──
const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 10,
  fontFamily: "monospace",
  color: "rgba(26,26,46,0.4)",
  marginBottom: 6,
  letterSpacing: "0.1em",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  borderRadius: 10,
  background: "rgba(0,0,0,0.05)",
  border: "1px solid rgba(0,0,0,0.08)",
  
  fontFamily: "'Space Grotesk',sans-serif",
  fontSize: 13,
  outline: "none",
};
