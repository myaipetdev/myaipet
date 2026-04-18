"use client";

import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";

// ── Types ──
interface PersonaSetupProps {
  petId: number;
  petName: string;
  onComplete: () => void;
}

interface PersonaData {
  speech_style: string;
  speech_detail: string;
  tone: string[];
  interests: string[];
  expressions: string;
  language: string;
  bio: string;
}

interface AnalysisResult {
  detected_style: string;
  key_expressions: string[];
  topics: string[];
  sample_messages: string[];
}

interface ConnectedPlatform {
  platform: string;
  connected: boolean;
  learning: boolean;
}

// ── Constants ──
const TABS = [
  { key: "quick", label: "Quick Setup", icon: "Q", desc: "온보딩 질문" },
  { key: "chat", label: "Chat Import", icon: "C", desc: "대화 학습" },
  { key: "live", label: "Live Learning", icon: "L", desc: "Connected Agent" },
] as const;

const TONE_OPTIONS = [
  { value: "casual", label: "Casual", emoji: "😎" },
  { value: "meme", label: "Meme/Funny", emoji: "🤣" },
  { value: "chill", label: "Chill", emoji: "🧊" },
  { value: "professional", label: "Professional", emoji: "💼" },
  { value: "sassy", label: "Sassy", emoji: "💅" },
  { value: "sweet", label: "Sweet", emoji: "🥰" },
];

const SUGGESTED_TAGS = ["Crypto", "Gaming", "Music", "Food", "Travel", "Art", "Coding", "Memes"];

const SPEECH_OPTIONS = [
  { value: "casual", label: "반말 (캐주얼)" },
  { value: "formal", label: "존댓말 (정중)" },
  { value: "mix", label: "Mix (상황에 따라)" },
];

const LANGUAGE_OPTIONS = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "English" },
  { value: "mixed", label: "Mixed (both)" },
];

// ── Component ──
export default function PersonaSetup({ petId, petName, onComplete }: PersonaSetupProps) {
  const [activeTab, setActiveTab] = useState<"quick" | "chat" | "live">("quick");

  // Quick Setup state
  const [persona, setPersona] = useState<PersonaData>({
    speech_style: "casual",
    speech_detail: "",
    tone: [],
    interests: [],
    expressions: "",
    language: "ko",
    bio: "",
  });
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Chat Import state
  const [importMethod, setImportMethod] = useState<"paste" | "file">("paste");
  const [chatText, setChatText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [applyingAnalysis, setApplyingAnalysis] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Live Learning state
  const [platforms, setPlatforms] = useState<ConnectedPlatform[]>([]);
  const [observedTopics, setObservedTopics] = useState<string[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [liveLearning, setLiveLearning] = useState(true);
  const [loadingLive, setLoadingLive] = useState(false);

  // Load existing persona
  useEffect(() => {
    api.persona.get(petId).then((data: any) => {
      if (data) {
        setPersona(prev => ({
          ...prev,
          speech_style: data.speech_style || prev.speech_style,
          speech_detail: data.speech_detail || "",
          tone: data.tone || [],
          interests: data.interests || [],
          expressions: data.expressions || "",
          language: data.language || "ko",
          bio: data.bio || "",
        }));
        setObservedTopics(data.observed_topics || []);
        setLastUpdated(data.updated_at || null);
        setLiveLearning(data.live_learning ?? true);
      }
    }).catch(() => {});

    // Load connected platforms for live tab
    api.agent.status(petId).then((data: any) => {
      const conns = (data.connections || []).map((c: any) => ({
        platform: c.platform,
        connected: c.connected,
        learning: c.connected,
      }));
      setPlatforms(conns);
    }).catch(() => {});
  }, [petId]);

  // ── Handlers ──
  const toggleTone = (value: string) => {
    setPersona(prev => ({
      ...prev,
      tone: prev.tone.includes(value)
        ? prev.tone.filter(t => t !== value)
        : [...prev.tone, value],
    }));
  };

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !persona.interests.includes(trimmed)) {
      setPersona(prev => ({ ...prev, interests: [...prev.interests, trimmed] }));
    }
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    setPersona(prev => ({
      ...prev,
      interests: prev.interests.filter(t => t !== tag),
    }));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
    }
    if (e.key === "Backspace" && !tagInput && persona.interests.length > 0) {
      removeTag(persona.interests[persona.interests.length - 1]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveResult(null);
    try {
      await api.persona.save(petId, persona);
      setSaveResult({ type: "success", text: "Persona saved successfully!" });
      setTimeout(() => setSaveResult(null), 3000);
    } catch (err: any) {
      setSaveResult({ type: "error", text: err.message || "Failed to save" });
    }
    setSaving(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setChatText(text);
    };
    reader.readAsText(file);
  };

  const handleAnalyze = async () => {
    if (!chatText.trim()) return;
    setAnalyzing(true);
    setAnalysisResult(null);
    try {
      const res = await api.persona.analyze(petId, chatText);
      setAnalysisResult(res);
    } catch (err: any) {
      setSaveResult({ type: "error", text: err.message || "Analysis failed" });
    }
    setAnalyzing(false);
  };

  const handleApplyAnalysis = async () => {
    if (!analysisResult) return;
    setApplyingAnalysis(true);
    try {
      await api.persona.applyAnalysis(petId, analysisResult);
      // Update local state with analysis results
      setPersona(prev => ({
        ...prev,
        interests: [...new Set([...prev.interests, ...analysisResult.topics])],
        expressions: analysisResult.key_expressions.join(", "),
      }));
      setSaveResult({ type: "success", text: "Analysis results applied!" });
      setTimeout(() => setSaveResult(null), 3000);
    } catch (err: any) {
      setSaveResult({ type: "error", text: err.message || "Failed to apply" });
    }
    setApplyingAnalysis(false);
  };

  const handleToggleLiveLearning = async () => {
    setLoadingLive(true);
    try {
      await api.persona.updateLiveLearning(petId, !liveLearning);
      setLiveLearning(!liveLearning);
    } catch {}
    setLoadingLive(false);
  };

  // ── Shared styles ──
  const cardStyle: React.CSSProperties = {
    background: "linear-gradient(145deg, rgba(20,20,50,0.6), rgba(15,15,40,0.4))",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 16,
    padding: "24px",
    backdropFilter: "blur(12px)",
    marginBottom: 16,
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: "monospace",
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
    marginBottom: 8,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
  };

  const helpStyle: React.CSSProperties = {
    fontFamily: "monospace",
    fontSize: 10,
    color: "rgba(255,255,255,0.25)",
    marginTop: 6,
    lineHeight: 1.5,
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 16px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
    color: "#fff",
    fontFamily: "'Space Grotesk',sans-serif",
    fontSize: 13,
    outline: "none",
    transition: "border-color 0.2s",
    boxSizing: "border-box" as const,
  };

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    resize: "vertical" as const,
    minHeight: 100,
    lineHeight: 1.6,
  };

  // ── Render ──
  return (
    <div style={{ animation: "fadeUp 0.4s ease-out" }}>
      <style>{`
        .persona-input:focus { border-color: rgba(245,158,11,0.4) !important; }
        .persona-tab:hover { background: rgba(255,255,255,0.06) !important; }
        .persona-chip:hover { opacity: 0.85 !important; transform: scale(1.02); }
        .persona-tag:hover .persona-tag-x { opacity: 1 !important; }
        .persona-suggested:hover { border-color: rgba(139,92,246,0.4) !important; background: rgba(139,92,246,0.1) !important; }
        @keyframes analyzeDots { 0%,20% { content: '.' } 40% { content: '..' } 60%,100% { content: '...' } }
        @keyframes fadeSlide { from { opacity:0; transform:translateX(10px) } to { opacity:1; transform:translateX(0) } }
        @keyframes shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
      `}</style>

      {/* Section Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{
          fontFamily: "'Space Grotesk',sans-serif",
          fontSize: 16, fontWeight: 700, color: "#fff",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{
            width: 32, height: 32, borderRadius: 10,
            background: "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(245,158,11,0.15))",
            border: "1px solid rgba(139,92,246,0.2)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 16,
          }}>
            P
          </span>
          Persona Setup
          <span style={{
            fontFamily: "monospace", fontSize: 10,
            color: "#f59e0b", background: "rgba(245,158,11,0.1)",
            padding: "2px 8px", borderRadius: 6,
          }}>
            {petName}
          </span>
        </div>
        <div style={{
          fontFamily: "monospace", fontSize: 11,
          color: "rgba(255,255,255,0.3)", marginTop: 6, marginLeft: 42,
        }}>
          Configure your pet&apos;s personality to reflect you
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{
        display: "flex", gap: 4, marginBottom: 20,
        background: "rgba(255,255,255,0.02)",
        borderRadius: 14, padding: 4,
        border: "1px solid rgba(255,255,255,0.04)",
      }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className="persona-tab"
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1, padding: "12px 16px",
              borderRadius: 10, border: "none",
              background: activeTab === tab.key
                ? "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(139,92,246,0.1))"
                : "transparent",
              cursor: "pointer",
              transition: "all 0.25s ease",
              position: "relative",
            }}
          >
            {activeTab === tab.key && (
              <div style={{
                position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)",
                width: "60%", height: 2,
                background: "linear-gradient(90deg, transparent, #f59e0b, transparent)",
                borderRadius: 1,
              }} />
            )}
            <div style={{
              fontFamily: "'Space Grotesk',sans-serif",
              fontSize: 12, fontWeight: activeTab === tab.key ? 700 : 500,
              color: activeTab === tab.key ? "#fff" : "rgba(255,255,255,0.4)",
              transition: "color 0.2s",
            }}>
              {tab.label}
            </div>
            <div style={{
              fontFamily: "monospace", fontSize: 9,
              color: activeTab === tab.key ? "rgba(245,158,11,0.7)" : "rgba(255,255,255,0.2)",
              marginTop: 2,
            }}>
              {tab.desc}
            </div>
          </button>
        ))}
      </div>

      {/* Save Result Banner */}
      {saveResult && (
        <div style={{
          padding: "10px 16px", borderRadius: 12, marginBottom: 16,
          background: saveResult.type === "success"
            ? "rgba(74,222,128,0.08)"
            : "rgba(239,68,68,0.08)",
          border: `1px solid ${saveResult.type === "success" ? "rgba(74,222,128,0.2)" : "rgba(239,68,68,0.2)"}`,
          fontFamily: "monospace", fontSize: 12,
          color: saveResult.type === "success" ? "#4ade80" : "#f87171",
          animation: "fadeSlide 0.3s ease-out",
        }}>
          {saveResult.type === "success" ? "\u2713 " : "\u2717 "}{saveResult.text}
        </div>
      )}

      {/* ═══════════════ TAB 1: Quick Setup ═══════════════ */}
      {activeTab === "quick" && (
        <div style={{ animation: "fadeSlide 0.3s ease-out" }}>

          {/* Speech Style */}
          <div style={cardStyle}>
            <div style={labelStyle}>Speech Style / \ub9d0\ud22c \uc2a4\ud0c0\uc77c</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              {SPEECH_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setPersona(prev => ({ ...prev, speech_style: opt.value }))}
                  style={{
                    padding: "10px 18px",
                    borderRadius: 12,
                    border: persona.speech_style === opt.value
                      ? "1.5px solid rgba(245,158,11,0.4)"
                      : "1px solid rgba(255,255,255,0.08)",
                    background: persona.speech_style === opt.value
                      ? "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.05))"
                      : "rgba(255,255,255,0.03)",
                    color: persona.speech_style === opt.value ? "#f59e0b" : "rgba(255,255,255,0.6)",
                    fontFamily: "'Space Grotesk',sans-serif",
                    fontSize: 13, fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <input
              className="persona-input"
              placeholder="\ucd94\uac00 \uc124\uba85 (\uc608: \uc904\uc784\ub9d0 \ub9ce\uc774 \uc4f0, \u314b\u314b \uc790\uc8fc \uc0ac\uc6a9)"
              value={persona.speech_detail}
              onChange={e => setPersona(prev => ({ ...prev, speech_detail: e.target.value }))}
              style={inputStyle}
            />
            <div style={helpStyle}>How your pet talks - casual, formal, or a mix depending on context</div>
          </div>

          {/* Tone */}
          <div style={cardStyle}>
            <div style={labelStyle}>Tone / \ud1a4</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {TONE_OPTIONS.map(opt => {
                const isSelected = persona.tone.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    className="persona-chip"
                    onClick={() => toggleTone(opt.value)}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 24,
                      border: isSelected
                        ? "1.5px solid rgba(139,92,246,0.4)"
                        : "1px solid rgba(255,255,255,0.08)",
                      background: isSelected
                        ? "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(139,92,246,0.08))"
                        : "rgba(255,255,255,0.03)",
                      color: isSelected ? "#c4b5fd" : "rgba(255,255,255,0.5)",
                      fontFamily: "'Space Grotesk',sans-serif",
                      fontSize: 13, fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.2s",
                      display: "flex", alignItems: "center", gap: 6,
                    }}
                  >
                    <span style={{ fontSize: 16 }}>{opt.emoji}</span>
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <div style={helpStyle}>Select one or more tones that match your vibe (multiple OK)</div>
          </div>

          {/* Interests */}
          <div style={cardStyle}>
            <div style={labelStyle}>Interests / \uad00\uc2ec\uc0ac</div>
            <div style={{
              display: "flex", flexWrap: "wrap", gap: 6,
              padding: "10px 14px", borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.03)",
              minHeight: 44, alignItems: "center",
              marginBottom: 10,
            }}>
              {persona.interests.map(tag => (
                <span
                  key={tag}
                  className="persona-tag"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "5px 12px", borderRadius: 8,
                    background: "rgba(139,92,246,0.15)",
                    border: "1px solid rgba(139,92,246,0.25)",
                    color: "#c4b5fd",
                    fontFamily: "'Space Grotesk',sans-serif",
                    fontSize: 12, fontWeight: 600,
                  }}
                >
                  {tag}
                  <span
                    className="persona-tag-x"
                    onClick={() => removeTag(tag)}
                    style={{
                      cursor: "pointer", opacity: 0.5,
                      marginLeft: 2, fontSize: 14, lineHeight: 1,
                      transition: "opacity 0.15s",
                    }}
                  >
                    \u00d7
                  </span>
                </span>
              ))}
              <input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder={persona.interests.length === 0 ? "\ud0a4\uc6cc\ub4dc \uc785\ub825 \ud6c4 Enter" : ""}
                style={{
                  border: "none", background: "transparent",
                  color: "#fff", fontFamily: "'Space Grotesk',sans-serif",
                  fontSize: 13, outline: "none",
                  minWidth: 80, flex: 1,
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {SUGGESTED_TAGS.filter(t => !persona.interests.includes(t)).map(tag => (
                <button
                  key={tag}
                  className="persona-suggested"
                  onClick={() => addTag(tag)}
                  style={{
                    padding: "5px 12px", borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.06)",
                    background: "rgba(255,255,255,0.02)",
                    color: "rgba(255,255,255,0.35)",
                    fontFamily: "monospace", fontSize: 11,
                    cursor: "pointer", transition: "all 0.2s",
                  }}
                >
                  + {tag}
                </button>
              ))}
            </div>
            <div style={helpStyle}>Type keywords and press Enter to add, or click suggested tags</div>
          </div>

          {/* Expressions */}
          <div style={cardStyle}>
            <div style={labelStyle}>Frequent Expressions / \uc790\uc8fc \uc4f0\ub294 \ud45c\ud604</div>
            <input
              className="persona-input"
              placeholder="\u3139\u3147, \uc624\ud0a4, \u314b\u314b, \u3131\u3131, \uac1c\uc88b\uc544 \ub4f1"
              value={persona.expressions}
              onChange={e => setPersona(prev => ({ ...prev, expressions: e.target.value }))}
              style={inputStyle}
            />
            <div style={helpStyle}>Comma-separated phrases or abbreviations you use often</div>
          </div>

          {/* Language */}
          <div style={cardStyle}>
            <div style={labelStyle}>Language / \uc5b8\uc5b4</div>
            <div style={{ display: "flex", gap: 8 }}>
              {LANGUAGE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setPersona(prev => ({ ...prev, language: opt.value }))}
                  style={{
                    flex: 1, padding: "12px 16px",
                    borderRadius: 12,
                    border: persona.language === opt.value
                      ? "1.5px solid rgba(245,158,11,0.4)"
                      : "1px solid rgba(255,255,255,0.08)",
                    background: persona.language === opt.value
                      ? "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.05))"
                      : "rgba(255,255,255,0.03)",
                    color: persona.language === opt.value ? "#f59e0b" : "rgba(255,255,255,0.5)",
                    fontFamily: "'Space Grotesk',sans-serif",
                    fontSize: 13, fontWeight: 600,
                    cursor: "pointer", transition: "all 0.2s",
                    textAlign: "center" as const,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div style={helpStyle}>Primary language for your pet&apos;s responses</div>
          </div>

          {/* Bio */}
          <div style={cardStyle}>
            <div style={labelStyle}>About You / \uc790\uae30\uc18c\uac1c</div>
            <textarea
              className="persona-input"
              placeholder="\uc608: \ub098\ub294 26\uc0b4 \uac1c\ubc1c\uc790\uace0, \ud06c\ub9bd\ud1a0 \uc88b\uc544\ud558\uace0, \ubc24\uc5d0 \ucf54\ub529\ud558\ub294 \uac78 \uc88b\uc544\ud574. \uc720\uba38\ub7ec\uc2a4\ud55c \ud3b8\uc774\uace0..."
              value={persona.bio}
              onChange={e => setPersona(prev => ({ ...prev, bio: e.target.value }))}
              style={textareaStyle}
              rows={4}
            />
            <div style={helpStyle}>AI\uac00 \ub108\ub97c \uc774\ud574\ud560 \uc218 \uc788\uac8c \uc790\uc720\ub86d\uac8c \uc368\uc918 - Tell your pet about yourself freely</div>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              width: "100%", padding: "16px",
              borderRadius: 14, border: "none",
              background: saving
                ? "rgba(245,158,11,0.15)"
                : "linear-gradient(135deg, #f59e0b, #d97706)",
              color: saving ? "rgba(245,158,11,0.6)" : "#000",
              fontFamily: "'Space Grotesk',sans-serif",
              fontSize: 14, fontWeight: 800,
              cursor: saving ? "not-allowed" : "pointer",
              transition: "all 0.3s",
              boxShadow: saving ? "none" : "0 4px 20px rgba(245,158,11,0.25)",
              letterSpacing: "0.02em",
            }}
          >
            {saving ? "Saving..." : "Save Persona"}
          </button>
        </div>
      )}

      {/* ═══════════════ TAB 2: Chat Import ═══════════════ */}
      {activeTab === "chat" && (
        <div style={{ animation: "fadeSlide 0.3s ease-out" }}>

          {/* Import Method */}
          <div style={cardStyle}>
            <div style={labelStyle}>Import Method</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {(["paste", "file"] as const).map(method => (
                <button
                  key={method}
                  onClick={() => setImportMethod(method)}
                  style={{
                    flex: 1, padding: "12px 16px",
                    borderRadius: 12,
                    border: importMethod === method
                      ? "1.5px solid rgba(245,158,11,0.4)"
                      : "1px solid rgba(255,255,255,0.08)",
                    background: importMethod === method
                      ? "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.05))"
                      : "rgba(255,255,255,0.03)",
                    color: importMethod === method ? "#f59e0b" : "rgba(255,255,255,0.5)",
                    fontFamily: "'Space Grotesk',sans-serif",
                    fontSize: 13, fontWeight: 600,
                    cursor: "pointer", transition: "all 0.2s",
                    textAlign: "center" as const,
                  }}
                >
                  {method === "paste" ? "\ud14d\uc2a4\ud2b8 \ubd99\uc5ec\ub123\uae30" : "\ud30c\uc77c \uc5c5\ub85c\ub4dc"}
                </button>
              ))}
            </div>

            {importMethod === "paste" ? (
              <>
                <textarea
                  className="persona-input"
                  placeholder="\uce74\uce74\uc624\ud1a1, \ud154\ub808\uadf8\ub7a8, \ub514\uc2a4\ucf54\ub4dc \ub4f1\uc758 \ub300\ud654 \ub0b4\uc5ed\uc744 \uc5ec\uae30\uc5d0 \ubd99\uc5ec\ub123\uc73c\uc138\uc694"
                  value={chatText}
                  onChange={e => setChatText(e.target.value)}
                  style={{ ...textareaStyle, minHeight: 200 }}
                  rows={10}
                />
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  marginTop: 8,
                }}>
                  <div style={helpStyle}>Paste chat history from any platform for AI analysis</div>
                  <div style={{
                    fontFamily: "monospace", fontSize: 10,
                    color: chatText.length > 5000 ? "#f87171" : "rgba(255,255,255,0.25)",
                  }}>
                    {chatText.length.toLocaleString()} chars
                  </div>
                </div>
              </>
            ) : (
              <div style={{ textAlign: "center", padding: "30px 0" }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.json,.csv"
                  onChange={handleFileUpload}
                  style={{ display: "none" }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: "16px 32px",
                    borderRadius: 14,
                    border: "2px dashed rgba(139,92,246,0.3)",
                    background: "rgba(139,92,246,0.05)",
                    color: "#c4b5fd",
                    fontFamily: "'Space Grotesk',sans-serif",
                    fontSize: 13, fontWeight: 600,
                    cursor: "pointer", transition: "all 0.2s",
                  }}
                >
                  Click to upload .txt / .json file
                </button>
                {chatText && (
                  <div style={{
                    fontFamily: "monospace", fontSize: 11,
                    color: "#4ade80", marginTop: 12,
                  }}>
                    File loaded ({chatText.length.toLocaleString()} chars)
                  </div>
                )}
                <div style={{ ...helpStyle, marginTop: 12 }}>
                  Supports exported chat files from KakaoTalk, Telegram, Discord
                </div>
              </div>
            )}
          </div>

          {/* Analyze Button */}
          <button
            onClick={handleAnalyze}
            disabled={analyzing || !chatText.trim()}
            style={{
              width: "100%", padding: "16px",
              borderRadius: 14, border: "none",
              background: analyzing
                ? "linear-gradient(90deg, rgba(139,92,246,0.15), rgba(245,158,11,0.15), rgba(139,92,246,0.15))"
                : !chatText.trim()
                  ? "rgba(255,255,255,0.04)"
                  : "linear-gradient(135deg, #8b5cf6, #7c3aed)",
              backgroundSize: analyzing ? "200% 100%" : "100% 100%",
              animation: analyzing ? "shimmer 2s linear infinite" : "none",
              color: analyzing
                ? "#c4b5fd"
                : !chatText.trim()
                  ? "rgba(255,255,255,0.2)"
                  : "#fff",
              fontFamily: "'Space Grotesk',sans-serif",
              fontSize: 14, fontWeight: 700,
              cursor: analyzing || !chatText.trim() ? "not-allowed" : "pointer",
              transition: "all 0.3s",
              boxShadow: !chatText.trim() ? "none" : "0 4px 20px rgba(139,92,246,0.2)",
              marginBottom: 16,
            }}
          >
            {analyzing ? "AI\uac00 \ub300\ud654 \ud328\ud134\uc744 \ubd84\uc11d\ud558\uace0 \uc788\uc5b4\uc694..." : "Analyze Chat History"}
          </button>

          {/* Analysis Results */}
          {analysisResult && (
            <div style={{
              ...cardStyle,
              border: "1px solid rgba(139,92,246,0.2)",
              animation: "fadeSlide 0.4s ease-out",
            }}>
              <div style={{
                fontFamily: "'Space Grotesk',sans-serif",
                fontSize: 14, fontWeight: 700, color: "#c4b5fd",
                marginBottom: 16, display: "flex", alignItems: "center", gap: 8,
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: "#8b5cf6",
                  boxShadow: "0 0 8px rgba(139,92,246,0.5)",
                }} />
                Analysis Results
              </div>

              <div style={{ display: "grid", gap: 14 }}>
                {/* Detected Style */}
                <div style={{
                  padding: "12px 16px", borderRadius: 12,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}>
                  <div style={{ fontFamily: "monospace", fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 6 }}>
                    DETECTED STYLE / \uac10\uc9c0\ub41c \ub9d0\ud22c
                  </div>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, color: "#f59e0b", fontWeight: 600 }}>
                    {analysisResult.detected_style}
                  </div>
                </div>

                {/* Key Expressions */}
                <div style={{
                  padding: "12px 16px", borderRadius: 12,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}>
                  <div style={{ fontFamily: "monospace", fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>
                    KEY EXPRESSIONS / \uc8fc\uc694 \ud45c\ud604
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {analysisResult.key_expressions.map((expr, i) => (
                      <span key={i} style={{
                        padding: "4px 10px", borderRadius: 8,
                        background: "rgba(245,158,11,0.1)",
                        border: "1px solid rgba(245,158,11,0.2)",
                        color: "#fbbf24",
                        fontFamily: "monospace", fontSize: 12,
                      }}>
                        {expr}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Topics */}
                <div style={{
                  padding: "12px 16px", borderRadius: 12,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}>
                  <div style={{ fontFamily: "monospace", fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>
                    INTEREST TOPICS / \uad00\uc2ec \uc8fc\uc81c
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {analysisResult.topics.map((topic, i) => (
                      <span key={i} style={{
                        padding: "4px 10px", borderRadius: 8,
                        background: "rgba(139,92,246,0.1)",
                        border: "1px solid rgba(139,92,246,0.2)",
                        color: "#c4b5fd",
                        fontFamily: "monospace", fontSize: 12,
                      }}>
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Sample Messages */}
                <div style={{
                  padding: "12px 16px", borderRadius: 12,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}>
                  <div style={{ fontFamily: "monospace", fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>
                    SAMPLE MESSAGES / \ub300\ud45c \uba54\uc2dc\uc9c0 5\uac1c
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {analysisResult.sample_messages.map((msg, i) => (
                      <div key={i} style={{
                        padding: "8px 12px", borderRadius: 8,
                        background: "rgba(255,255,255,0.02)",
                        fontFamily: "monospace", fontSize: 12,
                        color: "rgba(255,255,255,0.6)",
                        borderLeft: "2px solid rgba(139,92,246,0.3)",
                      }}>
                        {msg}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Apply Button */}
              <button
                onClick={handleApplyAnalysis}
                disabled={applyingAnalysis}
                style={{
                  width: "100%", padding: "14px",
                  borderRadius: 12,
                  border: "1px solid rgba(139,92,246,0.2)",
                  background: applyingAnalysis
                    ? "rgba(139,92,246,0.15)"
                    : "linear-gradient(135deg, rgba(139,92,246,0.3), rgba(245,158,11,0.2))",
                  color: applyingAnalysis ? "rgba(139,92,246,0.5)" : "#fff",
                  fontFamily: "'Space Grotesk',sans-serif",
                  fontSize: 13, fontWeight: 700,
                  cursor: applyingAnalysis ? "not-allowed" : "pointer",
                  marginTop: 16, transition: "all 0.3s",
                }}
              >
                {applyingAnalysis ? "Applying..." : "\uc801\uc6a9\ud558\uae30 / Apply Results"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ TAB 3: Live Learning ═══════════════ */}
      {activeTab === "live" && (
        <div style={{ animation: "fadeSlide 0.3s ease-out" }}>

          {/* Status Card */}
          <div style={{
            ...cardStyle,
            border: liveLearning
              ? "1px solid rgba(74,222,128,0.15)"
              : "1px solid rgba(255,255,255,0.06)",
          }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: 16,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: liveLearning ? "#4ade80" : "rgba(255,255,255,0.15)",
                  boxShadow: liveLearning ? "0 0 12px rgba(74,222,128,0.4)" : "none",
                  animation: liveLearning ? "pulse 2s ease-in-out infinite" : "none",
                }} />
                <div style={{
                  fontFamily: "'Space Grotesk',sans-serif",
                  fontSize: 14, fontWeight: 600,
                  color: liveLearning ? "#4ade80" : "rgba(255,255,255,0.4)",
                }}>
                  {liveLearning ? "\uc5f0\uacb0\ub41c \ud50c\ub7ab\ud3fc\uc5d0\uc11c \uc2e4\uc2dc\uac04\uc73c\ub85c \ud559\uc2b5\ud569\ub2c8\ub2e4" : "\uc2e4\uc2dc\uac04 \ud559\uc2b5 \ube44\ud65c\uc131\ud654\ub428"}
                </div>
              </div>

              {/* Toggle */}
              <button
                onClick={handleToggleLiveLearning}
                disabled={loadingLive}
                style={{
                  width: 48, height: 26, borderRadius: 13,
                  background: liveLearning
                    ? "linear-gradient(135deg, #4ade80, #22c55e)"
                    : "rgba(255,255,255,0.08)",
                  border: "none", cursor: loadingLive ? "not-allowed" : "pointer",
                  position: "relative", transition: "all 0.3s ease",
                  boxShadow: liveLearning ? "0 0 12px rgba(74,222,128,0.2)" : "none",
                }}
              >
                <div style={{
                  width: 20, height: 20, borderRadius: "50%",
                  background: "#fff",
                  position: "absolute", top: 3,
                  left: liveLearning ? 25 : 3,
                  transition: "left 0.3s ease",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                }} />
              </button>
            </div>
            <div style={helpStyle}>
              \uc2e4\uc2dc\uac04 \ud559\uc2b5 \ud65c\uc131\ud654 - When enabled, your pet learns from conversations on connected platforms
            </div>
          </div>

          {/* Connected Platforms */}
          <div style={cardStyle}>
            <div style={labelStyle}>Connected Platforms</div>
            {platforms.length === 0 ? (
              <div style={{
                textAlign: "center", padding: "24px 0",
                fontFamily: "monospace", fontSize: 12,
                color: "rgba(255,255,255,0.25)",
              }}>
                No platforms connected yet. Connect in the Platform Connections section above.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {platforms.map(p => (
                  <div key={p.platform} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 16px", borderRadius: 12,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.05)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{
                        fontFamily: "'Space Grotesk',sans-serif",
                        fontSize: 14, fontWeight: 700, color: "#fff",
                        textTransform: "capitalize" as const,
                      }}>
                        {p.platform}
                      </span>
                    </div>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 6,
                    }}>
                      <div style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: p.connected && liveLearning ? "#4ade80" : "rgba(255,255,255,0.15)",
                      }} />
                      <span style={{
                        fontFamily: "monospace", fontSize: 11,
                        color: p.connected && liveLearning ? "#4ade80" : "rgba(255,255,255,0.3)",
                      }}>
                        {p.connected && liveLearning ? "\ud559\uc2b5 \uc911" : "\ubbf8\uc5f0\uacb0"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Observed Topics */}
          <div style={cardStyle}>
            <div style={labelStyle}>Observed Topics / \uac10\uc9c0\ub41c \uad00\uc2ec\uc0ac</div>
            {observedTopics.length === 0 ? (
              <div style={{
                textAlign: "center", padding: "24px 0",
                fontFamily: "monospace", fontSize: 12,
                color: "rgba(255,255,255,0.25)",
              }}>
                No topics detected yet. Topics will appear as your pet observes conversations.
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {observedTopics.map((topic, i) => {
                  // Vary opacity for a "tag cloud" effect
                  const opacity = 0.5 + (1 - i / Math.max(observedTopics.length, 1)) * 0.5;
                  return (
                    <span key={topic} style={{
                      padding: "6px 14px", borderRadius: 10,
                      background: `rgba(139,92,246,${0.08 + opacity * 0.12})`,
                      border: `1px solid rgba(139,92,246,${0.15 + opacity * 0.15})`,
                      color: `rgba(196,181,253,${opacity})`,
                      fontFamily: "'Space Grotesk',sans-serif",
                      fontSize: 11 + Math.floor(opacity * 3), fontWeight: 600,
                    }}>
                      {topic}
                    </span>
                  );
                })}
              </div>
            )}
            <div style={helpStyle}>Topics detected from platform conversations (read-only, auto-updated)</div>
          </div>

          {/* Last Updated */}
          {lastUpdated && (
            <div style={{
              textAlign: "center",
              fontFamily: "monospace", fontSize: 10,
              color: "rgba(255,255,255,0.2)",
              marginTop: 8,
            }}>
              Last updated: {new Date(lastUpdated).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
