"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import PersonaSetup from "@/components/PersonaSetup";

// ── Types ──
interface PlatformConnection {
  platform: string;
  is_active: boolean;
  bot_username?: string | null;
  bot_name?: string | null;
  connected_at?: string;
  last_active_at?: string;
}

interface AgentConfig {
  is_enabled: boolean;
  daily_credit_limit: number;
  posting_frequency: "low" | "medium" | "high";
  quiet_hours_start: number;
  quiet_hours_end: number;
}

interface AgentMessage {
  id: number;
  platform: string;
  direction: "in" | "out";
  content: string;
  created_at: string;
}

interface AgentStats {
  total_messages: number;
  messages_today: number;
  credits_used_today: number;
}

// ── Platform Config ──
const PLATFORMS = [
  { key: "telegram", label: "Telegram", color: "#2AABEE", icon: "T", tokenLabel: "Bot Token", helpUrl: "https://core.telegram.org/bots#botfather", helpText: "Get token from @BotFather" },
  { key: "twitter", label: "Twitter", color: "#1DA1F2", icon: "X", tokenLabel: "API Bearer Token", helpUrl: "https://developer.twitter.com", helpText: "Create app at developer.twitter.com" },
  // Discord intentionally omitted — the connect route only supports
  // telegram/twitter, so a Discord card just 400'd "Invalid platform".
];

const FREQUENCY_OPTIONS = [
  { value: "low", label: "Low", desc: "2-3 posts/day" },
  { value: "medium", label: "Medium", desc: "5-8 posts/day" },
  { value: "high", label: "High", desc: "10-15 posts/day" },
];

export default function AgentDashboard() {
  const [pets, setPets] = useState<any[]>([]);
  const [selectedPet, setSelectedPet] = useState<any>(null);
  const [connections, setConnections] = useState<PlatformConnection[]>([]);
  const [config, setConfig] = useState<AgentConfig>({
    is_enabled: false,
    daily_credit_limit: 50,
    posting_frequency: "medium",
    quiet_hours_start: 23,
    quiet_hours_end: 7,
  });
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [stats, setStats] = useState<AgentStats>({ total_messages: 0, messages_today: 0, credits_used_today: 0 });
  const [loading, setLoading] = useState(false);
  const [msgOffset, setMsgOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Modal state
  const [connectModal, setConnectModal] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [connectStatus, setConnectStatus] = useState<"idle" | "checking" | "success" | "error">("idle");
  const [connectError, setConnectError] = useState("");
  const [connectedUsername, setConnectedUsername] = useState("");
  const [disconnectConfirm, setDisconnectConfirm] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [personaExpanded, setPersonaExpanded] = useState(false);

  // Load pets (fallback to demo data if auth fails)
  useEffect(() => {
    api.pets.list().then((d: any) => {
      const list = d.pets || d || [];
      setPets(list);
      if (list.length > 0) setSelectedPet(list[0]);
    }).catch(() => {
      // Fallback: show demo pet for preview
      const demo = { id: 1, name: "Sparky", species: 7, personality_type: "playful", level: 15, element: "fire" };
      setPets([demo]);
      setSelectedPet(demo);
    });
  }, []);

  // Tracks the selected pet so async loaders bail if the user switched pets
  // mid-fetch — a slow response must not paint the old pet's data on the new one.
  const selectedPetIdRef = useRef<number | null>(null);
  useEffect(() => { selectedPetIdRef.current = selectedPet?.id ?? null; }, [selectedPet]);

  // Load agent data when pet changes
  const fetchAgentData = useCallback(async () => {
    if (!selectedPet) return;
    const pid = selectedPet.id;
    setLoading(true);
    try {
      const [statusRes, configRes, msgRes] = await Promise.all([
        api.agent.status(pid).catch(() => null),
        api.agent.config(pid).catch(() => null),
        api.agent.messages(pid, undefined, 20, 0).catch(() => null),
      ]);

      if (selectedPetIdRef.current !== pid) return; // pet switched mid-fetch
      if (statusRes) {
        setConnections(statusRes.connections || []);
        setStats(statusRes.stats || { total_messages: 0, messages_today: 0, credits_used_today: 0 });
      }
      if (configRes) {
        setConfig({
          is_enabled: configRes.is_enabled ?? false,
          daily_credit_limit: configRes.daily_credit_limit ?? 50,
          posting_frequency: configRes.posting_frequency ?? "medium",
          quiet_hours_start: configRes.quiet_hours_start ?? 23,
          quiet_hours_end: configRes.quiet_hours_end ?? 7,
        });
      }
      if (msgRes) {
        setMessages(msgRes.messages || []);
        setMsgOffset(20);
        setHasMore(msgRes.pagination?.has_more ?? (msgRes.messages || []).length >= 20);
      }
    } catch {}
    if (selectedPetIdRef.current === pid) setLoading(false);
  }, [selectedPet]);

  useEffect(() => { fetchAgentData(); }, [fetchAgentData]);

  // Connect platform
  const handleConnect = async () => {
    if (!selectedPet || !connectModal || !tokenInput.trim()) return;
    if (connectStatus === "checking") return; // don't fire a second connect while one is pending
    setConnectStatus("checking");
    setConnectError("");
    try {
      // The connect route reads bot_token (telegram) / api_key (twitter), not a
      // generic `token` — sending `token` made every real connect 400.
      const creds = connectModal === "telegram"
        ? { bot_token: tokenInput.trim() }
        : { api_key: tokenInput.trim() };
      const res = await api.agent.connect(selectedPet.id, connectModal, creds);
      setConnectedUsername(res.bot_username || "Connected");
      setConnectStatus("success");
      fetchAgentData();
    } catch (err: any) {
      setConnectError(err.message || "Invalid token");
      setConnectStatus("error");
    }
  };

  // Disconnect platform
  const handleDisconnect = async (platform: string) => {
    if (!selectedPet) return;
    try {
      await api.agent.disconnect(selectedPet.id, platform);
      setDisconnectConfirm(null);
      fetchAgentData();
    } catch {}
  };

  // Save config
  const handleSaveConfig = async (updates: Partial<AgentConfig>) => {
    if (!selectedPet) return;
    const prev = config;
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    setSaving(true);
    try {
      await api.agent.updateConfig(selectedPet.id, newConfig);
    } catch {
      setConfig(prev); // revert the optimistic change so UI matches the server
    }
    setSaving(false);
  };

  // Load more messages
  const loadMore = async () => {
    if (!selectedPet || loadingMore) return;
    const pid = selectedPet.id;
    setLoadingMore(true);
    try {
      const res = await api.agent.messages(pid, undefined, 20, msgOffset);
      if (selectedPetIdRef.current !== pid) return; // pet switched — don't cross-append
      const newMsgs = res.messages || [];
      setMessages(prev => [...prev, ...newMsgs]);
      setMsgOffset(prev => prev + 20);
      setHasMore(newMsgs.length >= 20);
    } catch {}
    setLoadingMore(false);
  };

  const closeModal = () => {
    setConnectModal(null);
    setTokenInput("");
    setConnectStatus("idle");
    setConnectError("");
    setConnectedUsername("");
  };

  const getConnection = (platform: string) => connections.find(c => c.platform === platform);

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const platformOf = (key: string) => PLATFORMS.find(p => p.key === key);

  return (
    <div style={{
      padding: "40px", maxWidth: 1000, margin: "0 auto", paddingTop: 100,
      minHeight: "100vh",
      
      
    }}>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
        @keyframes modalFadeIn { from { opacity:0 } to { opacity:1 } }
        @keyframes modalSlideUp { from { opacity:0; transform:translateY(20px) scale(0.95) } to { opacity:1; transform:translateY(0) scale(1) } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.5 } }
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        .agent-card:hover { border-color: rgba(190,79,40,0.35) !important; transform: translateY(-2px); }
        .agent-btn:hover { opacity: 0.85 !important; }
      `}</style>

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 32, flexWrap: "wrap", gap: 16,
        animation: "fadeUp 0.4s ease-out",
      }}>
        <div>
          <div style={{
            fontFamily: "var(--ed-disp)", fontSize: 28, fontWeight: 800,
            color: "#211A12", letterSpacing: "-0.03em",
          }}>
            <span style={{ color: "#BE4F28" }}>AI</span> Agent
          </div>
          <div style={{ fontFamily: "var(--ed-body)", fontSize: 12, color: "#7A6E5A", marginTop: 4 }}>
            Deploy your pet as an autonomous AI agent across platforms
          </div>
        </div>

        {/* Pet Selector */}
        {pets.length > 0 && (
          <select
            value={selectedPet?.id || ""}
            onChange={e => {
              const pet = pets.find(p => p.id === Number(e.target.value));
              if (pet) setSelectedPet(pet);
            }}
            style={{
              background: "#F5EFE2",
              border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
              borderRadius: 12, padding: "10px 16px",
              color: "#211A12", fontFamily: "var(--ed-disp)", fontSize: 14,
              fontWeight: 600, cursor: "pointer",
              outline: "none", appearance: "none",
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%23211A12' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 12px center",
              paddingRight: 36, minWidth: 180,
            }}
          >
            {pets.map((p: any) => (
              <option key={p.id} value={p.id} style={{ background: "#FBF6EC", color: "#211A12" }}>
                {p.name} (Lv.{p.level || 1})
              </option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "#9A7B4E", fontFamily: "var(--ed-m)", fontSize: 13 }}>
          <div style={{ animation: "spin 1s linear infinite", display: "inline-block", marginBottom: 12 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#BE4F28" strokeWidth="2">
              <path d="M12 2v4m0 12v4m-10-10h4m12 0h4m-3.5-6.5l-2.8 2.8m-5.4 5.4l-2.8 2.8m0-11l2.8 2.8m5.4 5.4l2.8 2.8" />
            </svg>
          </div>
          <div>Loading agent data...</div>
        </div>
      ) : (
        <>
          {/* Stats Bar */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12,
            marginBottom: 28, animation: "fadeUp 0.4s ease-out 0.1s both",
          }}>
            {[
              { label: "Total Messages", value: stats.total_messages.toLocaleString(), icon: "M" },
              { label: "Today", value: stats.messages_today.toLocaleString(), icon: "T" },
              { label: "Credits Used", value: `${stats.credits_used_today}/${config.daily_credit_limit}`, icon: "C" },
            ].map((s, i) => (
              <div key={i} style={{
                background: "#FBF6EC",
                border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                borderRadius: 14, padding: "16px 20px",
                textAlign: "center",
                boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
              }}>
                <div style={{ fontFamily: "var(--ed-m)", fontSize: 10, color: "#9A4E1E", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.12em" }}>
                  {s.label}
                </div>
                <div style={{ fontFamily: "var(--ed-disp)", fontSize: 22, fontWeight: 800, color: "#211A12" }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          {/* Connection Cards */}
          <div style={{ marginBottom: 32, animation: "fadeUp 0.4s ease-out 0.15s both" }}>
            <div style={{
              fontFamily: "var(--ed-disp)", fontSize: 16, fontWeight: 700,
              color: "#211A12", marginBottom: 14,
            }}>
              Platform Connections
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
              {PLATFORMS.map(platform => {
                const conn = getConnection(platform.key);
                const isConnected = conn?.is_active;
                return (
                  <div
                    key={platform.key}
                    className="agent-card"
                    style={{
                      background: "#FBF6EC",
                      border: `1px solid ${isConnected ? `${platform.color}44` : "var(--ed-hair, rgba(33,26,18,.13))"}`,
                      borderRadius: 16, padding: "24px 20px",
                      boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
                      transition: "all 0.3s ease",
                      position: "relative", overflow: "hidden",
                    }}
                  >
                    {/* Platform Icon */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 12,
                        background: `${platform.color}1A`,
                        border: `1px solid ${platform.color}44`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontFamily: "var(--ed-disp)", fontSize: 20, fontWeight: 800,
                        color: platform.color,
                      }}>
                        {platform.icon}
                      </div>
                      <div>
                        <div style={{ fontFamily: "var(--ed-disp)", fontSize: 15, fontWeight: 700, color: "#211A12" }}>
                          {platform.label}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                          <div style={{
                            width: 7, height: 7, borderRadius: "50%",
                            background: isConnected ? "#5C8A4E" : "rgba(33,26,18,0.18)",
                          }} />
                          <span style={{ fontFamily: "var(--ed-m)", fontSize: 11, color: isConnected ? "#5C8A4E" : "#9A7B4E" }}>
                            {isConnected ? "Connected" : "Not connected"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Bot username */}
                    {isConnected && conn?.bot_username && (
                      <div style={{
                        fontFamily: "var(--ed-m)", fontSize: 11, color: "#7A6E5A",
                        marginBottom: 14, padding: "6px 10px",
                        background: "#F5EFE2", borderRadius: 8,
                      }}>
                        @{conn.bot_username}
                      </div>
                    )}

                    {/* Action Button */}
                    {isConnected ? (
                      <button
                        className="agent-btn"
                        onClick={() => setDisconnectConfirm(platform.key)}
                        style={{
                          width: "100%", padding: "10px",
                          borderRadius: 10, border: "1px solid rgba(190,79,40,0.25)",
                          background: "rgba(190,79,40,0.06)",
                          color: "#9A4E1E", fontFamily: "var(--ed-m)", fontSize: 11,
                          fontWeight: 600, cursor: "pointer", transition: "all 0.2s",
                        }}
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        className="agent-btn"
                        onClick={() => setConnectModal(platform.key)}
                        style={{
                          width: "100%", padding: "10px",
                          borderRadius: 10, border: "none",
                          background: "linear-gradient(180deg,#F49B2A,#E27D0C)",
                          color: "#FFF8EE", fontFamily: "var(--ed-disp)", fontSize: 12,
                          fontWeight: 700, cursor: "pointer", transition: "all 0.2s",
                        }}
                      >
                        Connect
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Persona Setup Section */}
          {selectedPet && (
            <div style={{
              marginBottom: 32, animation: "fadeUp 0.4s ease-out 0.18s both",
            }}>
              <button
                onClick={() => setPersonaExpanded(!personaExpanded)}
                className="agent-card"
                style={{
                  width: "100%",
                  background: "#FBF6EC",
                  border: personaExpanded
                    ? "1px solid rgba(107,79,160,0.3)"
                    : "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                  borderRadius: 18, padding: "20px 28px",
                  boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  textAlign: "left" as const,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 12,
                    background: "rgba(107,79,160,0.12)",
                    border: "1px solid rgba(107,79,160,0.3)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "var(--ed-disp)", fontSize: 18, fontWeight: 800,
                    color: "#6B4FA0",
                  }}>
                    P
                  </div>
                  <div>
                    <div style={{
                      fontFamily: "var(--ed-disp)", fontSize: 15, fontWeight: 700,
                      color: "#211A12",
                    }}>
                      Persona Setup
                    </div>
                    <div style={{
                      fontFamily: "var(--ed-body)", fontSize: 11,
                      color: "#7A6E5A", marginTop: 2,
                    }}>
                      Configure {selectedPet.name}&apos;s personality to reflect you
                    </div>
                  </div>
                </div>
                <div style={{
                  fontFamily: "var(--ed-disp)", fontSize: 18, fontWeight: 300,
                  color: "#9A7B4E",
                  transform: personaExpanded ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.3s ease",
                }}>
                  &#9660;
                </div>
              </button>

              {personaExpanded && (
                <div style={{
                  marginTop: 2,
                  background: "#F5EFE2",
                  border: "1px solid rgba(107,79,160,0.18)",
                  borderTop: "none",
                  borderRadius: "0 0 18px 18px",
                  padding: "24px 28px",
                  animation: "fadeUp 0.3s ease-out",
                }}>
                  <PersonaSetup
                    petId={selectedPet.id}
                    petName={selectedPet.name}
                    onComplete={() => setPersonaExpanded(false)}
                  />
                </div>
              )}
            </div>
          )}

          {/* Autonomous Mode Section */}
          <div style={{
            marginBottom: 32, animation: "fadeUp 0.4s ease-out 0.2s both",
            background: "#FBF6EC",
            border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
            borderRadius: 18, padding: "28px",
            boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
          }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: 24,
            }}>
              <div>
                <div style={{ fontFamily: "var(--ed-disp)", fontSize: 16, fontWeight: 700, color: "#211A12" }}>
                  Autonomous Mode
                </div>
                <div style={{ fontFamily: "var(--ed-body)", fontSize: 11, color: "#7A6E5A", marginTop: 3 }}>
                  Let your pet post and interact on its own
                </div>
              </div>

              {/* Toggle Switch */}
              <button
                onClick={() => handleSaveConfig({ is_enabled: !config.is_enabled })}
                style={{
                  width: 52, height: 28, borderRadius: 14,
                  background: config.is_enabled
                    ? "linear-gradient(180deg,#F49B2A,#E27D0C)"
                    : "rgba(33,26,18,0.10)",
                  border: "none", cursor: "pointer",
                  position: "relative", transition: "all 0.3s ease",
                }}
              >
                <div style={{
                  width: 22, height: 22, borderRadius: "50%",
                  background: "#FFF8EE",
                  position: "absolute", top: 3,
                  left: config.is_enabled ? 27 : 3,
                  transition: "left 0.3s ease",
                  boxShadow: "0 2px 6px rgba(80,55,20,0.25)",
                }} />
              </button>
            </div>

            <div style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20,
              opacity: config.is_enabled ? 1 : 0.4,
              pointerEvents: config.is_enabled ? "auto" : "none",
              transition: "opacity 0.3s ease",
            }}>
              {/* Credit Limit Slider */}
              <div>
                <div style={{ fontFamily: "var(--ed-body)", fontSize: 11, color: "#7A6E5A", marginBottom: 8 }}>
                  Daily Credit Limit
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <input
                    type="range"
                    min={10} max={200} step={10}
                    value={config.daily_credit_limit}
                    // Move locally while dragging; PUT once on release — onChange
                    // per-step fired a burst of full-config PUTs (write storm).
                    onChange={e => { const v = Number(e.target.value); setConfig(c => ({ ...c, daily_credit_limit: v })); }}
                    onMouseUp={e => handleSaveConfig({ daily_credit_limit: Number((e.target as HTMLInputElement).value) })}
                    onTouchEnd={e => handleSaveConfig({ daily_credit_limit: Number((e.target as HTMLInputElement).value) })}
                    style={{
                      flex: 1, height: 4, appearance: "none",
                      background: `linear-gradient(to right, #BE4F28 ${((config.daily_credit_limit - 10) / 190) * 100}%, rgba(33,26,18,0.10) ${((config.daily_credit_limit - 10) / 190) * 100}%)`,
                      borderRadius: 2, outline: "none", cursor: "pointer",
                      accentColor: "#BE4F28",
                    }}
                  />
                  <span style={{
                    fontFamily: "var(--ed-disp)", fontSize: 16, fontWeight: 800,
                    color: "#BE4F28", minWidth: 40, textAlign: "right",
                  }}>
                    {config.daily_credit_limit}
                  </span>
                </div>
              </div>

              {/* Posting Frequency */}
              <div>
                <div style={{ fontFamily: "var(--ed-body)", fontSize: 11, color: "#7A6E5A", marginBottom: 8 }}>
                  Posting Frequency
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {FREQUENCY_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => handleSaveConfig({ posting_frequency: opt.value as AgentConfig["posting_frequency"] })}
                      style={{
                        flex: 1, padding: "8px 6px", borderRadius: 10,
                        background: config.posting_frequency === opt.value
                          ? "rgba(190,79,40,0.10)"
                          : "#F5EFE2",
                        border: config.posting_frequency === opt.value
                          ? "1.5px solid rgba(190,79,40,0.35)"
                          : "1.5px solid var(--ed-hair, rgba(33,26,18,.13))",
                        color: config.posting_frequency === opt.value ? "#BE4F28" : "#7A6E5A",
                        fontFamily: "var(--ed-disp)", fontSize: 12, fontWeight: 700,
                        cursor: "pointer", transition: "all 0.25s", textAlign: "center",
                      }}
                    >
                      {opt.label}
                      <div style={{ fontFamily: "var(--ed-m)", fontSize: 9, opacity: 0.7, marginTop: 2 }}>
                        {opt.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quiet Hours */}
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ fontFamily: "var(--ed-body)", fontSize: 11, color: "#7A6E5A", marginBottom: 8 }}>
                  Quiet Hours (no autonomous posts)
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <select
                    value={config.quiet_hours_start}
                    onChange={e => handleSaveConfig({ quiet_hours_start: Number(e.target.value) })}
                    style={{
                      background: "#F5EFE2",
                      border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                      borderRadius: 10, padding: "8px 12px",
                      color: "#211A12", fontFamily: "var(--ed-m)", fontSize: 13,
                      outline: "none", cursor: "pointer",
                    }}
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i} style={{ background: "#FBF6EC" }}>
                        {i.toString().padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                  <span style={{ fontFamily: "var(--ed-m)", fontSize: 12, color: "#9A7B4E" }}>to</span>
                  <select
                    value={config.quiet_hours_end}
                    onChange={e => handleSaveConfig({ quiet_hours_end: Number(e.target.value) })}
                    style={{
                      background: "#F5EFE2",
                      border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                      borderRadius: 10, padding: "8px 12px",
                      color: "#211A12", fontFamily: "var(--ed-m)", fontSize: 13,
                      outline: "none", cursor: "pointer",
                    }}
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i} style={{ background: "#FBF6EC" }}>
                        {i.toString().padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                  {saving && (
                    <span style={{ fontFamily: "var(--ed-m)", fontSize: 10, color: "#BE4F28", animation: "pulse 1s infinite" }}>
                      Saving...
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Activity Feed */}
          <div style={{
            animation: "fadeUp 0.4s ease-out 0.25s both",
            background: "#FBF6EC",
            border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
            borderRadius: 18, padding: "28px",
            boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
          }}>
            <div style={{
              fontFamily: "var(--ed-disp)", fontSize: 16, fontWeight: 700,
              color: "#211A12", marginBottom: 18,
            }}>
              Activity Feed
            </div>

            {messages.length === 0 ? (
              <div style={{
                textAlign: "center", padding: "40px 20px",
                color: "#9A7B4E", fontFamily: "var(--ed-m)", fontSize: 12,
              }}>
                No activity yet. Connect a platform and enable autonomous mode to get started.
              </div>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {messages.map((msg, i) => {
                    const plt = platformOf(msg.platform);
                    return (
                      <div
                        key={msg.id || i}
                        style={{
                          display: "flex", alignItems: "center", gap: 12,
                          padding: "12px 14px", borderRadius: 12,
                          background: "#F5EFE2",
                          border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                          transition: "background 0.2s",
                        }}
                      >
                        {/* Timestamp */}
                        <span style={{ fontFamily: "var(--ed-m)", fontSize: 10, color: "#9A7B4E", minWidth: 55, flexShrink: 0 }}>
                          {formatTime(msg.created_at)}
                        </span>

                        {/* Platform dot */}
                        <div style={{
                          width: 24, height: 24, borderRadius: 6,
                          background: `${plt?.color || "#9A7B4E"}1A`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontFamily: "var(--ed-disp)", fontSize: 11, fontWeight: 800,
                          color: plt?.color || "#9A7B4E", flexShrink: 0,
                        }}>
                          {plt?.icon || "?"}
                        </div>

                        {/* Direction arrow */}
                        <span style={{
                          fontFamily: "var(--ed-m)", fontSize: 12,
                          color: msg.direction === "out" ? "#BE4F28" : "#5C8A4E",
                          flexShrink: 0,
                        }}>
                          {msg.direction === "out" ? "\u2192" : "\u2190"}
                        </span>

                        {/* Message preview */}
                        <span style={{
                          fontFamily: "var(--ed-m)", fontSize: 12, color: "#5C5140",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          flex: 1,
                        }}>
                          {msg.content}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {hasMore && (
                  <button
                    className="agent-btn"
                    onClick={loadMore}
                    disabled={loadingMore}
                    style={{
                      display: "block", margin: "16px auto 0", padding: "10px 28px",
                      borderRadius: 10, border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                      background: "#F5EFE2",
                      color: "#7A6E5A", fontFamily: "var(--ed-m)", fontSize: 11,
                      fontWeight: 600, cursor: loadingMore ? "wait" : "pointer",
                      transition: "all 0.2s", opacity: loadingMore ? 0.5 : 1,
                    }}
                  >
                    {loadingMore ? "Loading..." : "Load More"}
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* ── Connect Modal ── */}
      {connectModal && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            background: "rgba(33,26,18,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
            animation: "modalFadeIn 0.3s ease-out",
          }}
          onClick={closeModal}
        >
          <div
            style={{
              background: "#FBF6EC",
              borderRadius: 20, padding: "32px",
              border: `1px solid ${platformOf(connectModal)?.color || "#BE4F28"}44`,
              boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
              maxWidth: 440, width: "90%",
              animation: "modalSlideUp 0.3s ease-out",
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14,
                background: `${platformOf(connectModal)?.color || "#9A7B4E"}1A`,
                border: `1px solid ${platformOf(connectModal)?.color || "#9A7B4E"}44`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--ed-disp)", fontSize: 22, fontWeight: 800,
                color: platformOf(connectModal)?.color,
              }}>
                {platformOf(connectModal)?.icon}
              </div>
              <div>
                <div style={{ fontFamily: "var(--ed-disp)", fontSize: 18, fontWeight: 800, color: "#211A12" }}>
                  Connect {platformOf(connectModal)?.label}
                </div>
                <div style={{ fontFamily: "var(--ed-body)", fontSize: 11, color: "#7A6E5A" }}>
                  Link your bot to {selectedPet?.name || "your pet"}
                </div>
              </div>
            </div>

            {connectStatus === "success" ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{
                  width: 56, height: 56, borderRadius: "50%", margin: "0 auto 16px",
                  background: "rgba(92,138,78,0.12)", border: "1.5px solid rgba(92,138,78,0.35)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 24, color: "#5C8A4E",
                }}>
                  <span role="img" aria-label="check">&#10003;</span>
                </div>
                <div style={{ fontFamily: "var(--ed-disp)", fontSize: 18, fontWeight: 700, color: "#5C8A4E", marginBottom: 6 }}>
                  Connected!
                </div>
                <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: "#7A6E5A" }}>
                  @{connectedUsername}
                </div>
                <button
                  onClick={closeModal}
                  style={{
                    marginTop: 24, padding: "12px 32px", borderRadius: 12,
                    border: "none", background: "linear-gradient(180deg,#F49B2A,#E27D0C)",
                    color: "#FFF8EE", fontFamily: "var(--ed-disp)", fontSize: 14,
                    fontWeight: 700, cursor: "pointer",
                  }}
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                {/* Token Input */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontFamily: "var(--ed-m)", fontSize: 11, color: "#9A7B4E", display: "block", marginBottom: 8 }}>
                    {platformOf(connectModal)?.tokenLabel}
                  </label>
                  <input
                    type="password"
                    value={tokenInput}
                    onChange={e => { setTokenInput(e.target.value); setConnectStatus("idle"); setConnectError(""); }}
                    placeholder="Paste your bot token here..."
                    style={{
                      width: "100%", padding: "14px 16px",
                      background: "#F5EFE2",
                      border: connectStatus === "error"
                        ? "1.5px solid rgba(190,79,40,0.45)"
                        : "1.5px solid var(--ed-hair, rgba(33,26,18,.13))",
                      borderRadius: 12, color: "#211A12",
                      fontFamily: "var(--ed-m)", fontSize: 13,
                      outline: "none", transition: "border-color 0.2s",
                      boxSizing: "border-box",
                    }}
                    onFocus={e => { if (connectStatus !== "error") e.target.style.borderColor = `${platformOf(connectModal)?.color || "#BE4F28"}66`; }}
                    onBlur={e => { if (connectStatus !== "error") e.target.style.borderColor = "rgba(33,26,18,0.13)"; }}
                  />
                  {connectStatus === "error" && (
                    <div style={{ fontFamily: "var(--ed-m)", fontSize: 11, color: "#9A4E1E", marginTop: 6 }}>
                      {connectError}
                    </div>
                  )}
                </div>

                {/* Help Link */}
                <a
                  href={platformOf(connectModal)?.helpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-block", fontFamily: "var(--ed-m)", fontSize: 11,
                    color: platformOf(connectModal)?.color || "#BE4F28",
                    textDecoration: "none", marginBottom: 24, opacity: 0.9,
                  }}
                >
                  {platformOf(connectModal)?.helpText} &rarr;
                </a>

                {/* Actions */}
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={closeModal}
                    style={{
                      flex: 1, padding: "12px", borderRadius: 12,
                      background: "#F5EFE2",
                      border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                      color: "#7A6E5A",
                      fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 600,
                      cursor: "pointer", transition: "all 0.2s",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConnect}
                    disabled={!tokenInput.trim() || connectStatus === "checking"}
                    style={{
                      flex: 1, padding: "12px", borderRadius: 12,
                      border: "none",
                      background: !tokenInput.trim()
                        ? "#ECE4D4"
                        : `linear-gradient(135deg, ${platformOf(connectModal)?.color}, ${platformOf(connectModal)?.color}cc)`,
                      color: !tokenInput.trim() ? "#9A7B4E" : "#fff",
                      fontFamily: "var(--ed-disp)", fontSize: 13, fontWeight: 700,
                      cursor: !tokenInput.trim() || connectStatus === "checking" ? "not-allowed" : "pointer",
                      transition: "all 0.2s",
                      opacity: connectStatus === "checking" ? 0.7 : 1,
                    }}
                  >
                    {connectStatus === "checking" ? "Checking..." : "Connect"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Disconnect Confirm Modal ── */}
      {disconnectConfirm && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            background: "rgba(33,26,18,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
            animation: "modalFadeIn 0.3s ease-out",
          }}
          onClick={() => setDisconnectConfirm(null)}
        >
          <div
            style={{
              background: "#FBF6EC",
              borderRadius: 20, padding: "32px",
              border: "1px solid rgba(190,79,40,0.25)",
              boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
              maxWidth: 380, width: "90%", textAlign: "center",
              animation: "modalSlideUp 0.3s ease-out",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{
              fontFamily: "var(--ed-disp)", fontSize: 18, fontWeight: 800,
              color: "#211A12", marginBottom: 8,
            }}>
              Disconnect {platformOf(disconnectConfirm)?.label}?
            </div>
            <div style={{ fontFamily: "var(--ed-body)", fontSize: 12, color: "#7A6E5A", marginBottom: 24 }}>
              Your bot will stop responding on this platform.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setDisconnectConfirm(null)}
                style={{
                  flex: 1, padding: "12px", borderRadius: 12,
                  background: "#F5EFE2",
                  border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                  color: "#7A6E5A",
                  fontFamily: "var(--ed-m)", fontSize: 12, fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDisconnect(disconnectConfirm)}
                style={{
                  flex: 1, padding: "12px", borderRadius: 12,
                  border: "none",
                  background: "linear-gradient(135deg, #C4462A, #A5361F)",
                  color: "#FFF8EE", fontFamily: "var(--ed-disp)", fontSize: 13,
                  fontWeight: 700, cursor: "pointer",
                }}
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
