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
  { key: "quick", label: "Quick Setup", icon: "Q", desc: "Onboarding questions" },
  { key: "chat", label: "Chat Import", icon: "C", desc: "Chat learning" },
  { key: "live", label: "Live Learning", icon: "L", desc: "Planned · unavailable" },
] as const;

// Flat line-icons (16px, currentColor) replacing bare tone emoji — they inherit
// each chip's selected/unselected text color, matching the pill surface style.
const ToneIcon = ({ tone }: { tone: string }) => {
  const c: React.SVGProps<SVGSVGElement> = {
    width: 16, height: 16, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: 1.6,
    strokeLinecap: "round", strokeLinejoin: "round",
    style: { flexShrink: 0 },
  };
  switch (tone) {
    case "casual": // sunglasses (cool / laid-back)
      return (
        <svg {...c}>
          <path d="M3 9h18" />
          <rect x="3" y="9" width="7.5" height="5.5" rx="2.5" />
          <rect x="13.5" y="9" width="7.5" height="5.5" rx="2.5" />
          <path d="M10.5 11h3" />
        </svg>
      );
    case "meme": // grinning face (funny)
      return (
        <svg {...c}>
          <circle cx="12" cy="12" r="9" />
          <path d="M8.5 14a4 4 0 0 0 7 0" />
          <path d="M8 9.5h.01M16 9.5h.01" />
        </svg>
      );
    case "chill": // snowflake (cool / chill)
      return (
        <svg {...c}>
          <path d="M12 3v18M3 12h18" />
          <path d="m5.6 5.6 12.8 12.8M18.4 5.6 5.6 18.4" />
        </svg>
      );
    case "professional": // briefcase
      return (
        <svg {...c}>
          <rect x="3" y="7.5" width="18" height="12" rx="2" />
          <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" />
          <path d="M3 13h18" />
        </svg>
      );
    case "sassy": // spark / wink (attitude)
      return (
        <svg {...c}>
          <path d="M12 3c.6 4.2 1.8 5.4 6 6-4.2.6-5.4 1.8-6 6-.6-4.2-1.8-5.4-6-6 4.2-.6 5.4-1.8 6-6Z" />
          <path d="M18.5 16.5c.3 1.8.7 2.2 2.5 2.5-1.8.3-2.2.7-2.5 2.5-.3-1.8-.7-2.2-2.5-2.5 1.8-.3 2.2-.7 2.5-2.5Z" />
        </svg>
      );
    case "sweet": // heart
      return (
        <svg {...c}>
          <path d="M12 20s-7-4.6-7-9.6A3.9 3.9 0 0 1 12 7a3.9 3.9 0 0 1 7 3.4c0 5-7 9.6-7 9.6Z" />
        </svg>
      );
    default:
      return null;
  }
};

const TONE_OPTIONS = [
  { value: "casual", label: "Casual" },
  { value: "meme", label: "Meme/Funny" },
  { value: "chill", label: "Chill" },
  { value: "professional", label: "Professional" },
  { value: "sassy", label: "Sassy" },
  { value: "sweet", label: "Sweet" },
];

const SUGGESTED_TAGS = ["Crypto", "Gaming", "Music", "Food", "Travel", "Art", "Coding", "Memes"];

const SPEECH_OPTIONS = [
  { value: "casual", label: "Casual" },
  { value: "formal", label: "Formal" },
  { value: "mix", label: "Mix (situational)" },
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
    language: "en",
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
  const observedTopics: string[] = [];
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  // There is no live-learning persistence or ingestion pipeline yet. Keep the
  // preview tab explicitly OFF so the UI never implies background collection.
  const liveLearning = false;

  // Load existing persona
  useEffect(() => {
    let cancelled = false; // drop responses if the pet switched mid-fetch
    api.persona.get(petId).then((data: any) => {
      if (cancelled) return;
      // The route returns { persona, has_persona }; the persona row stores
      // owner_* columns (and tone/interests as strings). Reading data.X off the
      // top level with form field names left the form blank on every reopen.
      const p = data?.persona;
      if (p) {
        const toArr = (v: any): string[] =>
          Array.isArray(v) ? v
          : (typeof v === "string" && v.trim() ? v.split(",").map((s: string) => s.trim()).filter(Boolean) : []);
        setPersona(prev => ({
          ...prev,
          speech_style: p.owner_speech_style || prev.speech_style,
          tone: toArr(p.owner_tone),
          interests: toArr(p.owner_interests),
          expressions: p.owner_expressions || "",
          // Responses are English-only in this release. Normalize legacy
          // profile values so the settings UI never promises unsupported output.
          language: "en",
          bio: p.owner_bio || "",
        }));
        setLastUpdated(p.updated_at || null);
      }
    }).catch(() => {});

    // Load connected platforms for live tab
    api.agent.status(petId).then((data: any) => {
      if (cancelled) return;
      const conns = (data.connections || []).map((c: any) => ({
        platform: c.platform,
        connected: c.is_active,
        learning: c.is_active,
      }));
      setPlatforms(conns);
    }).catch(() => {});
    return () => { cancelled = true; };
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
      // tone/interests are multi-select arrays in the form but the persona row
      // stores them as scalar strings — send CSV so the route doesn't 400 on an
      // array tone or slice()-mangle an array of interests. (Load splits back.)
      const payload = {
        ...persona,
        tone: (persona.tone || []).join(","),
        interests: (persona.interests || []).join(","),
      };
      await api.persona.save(petId, payload);
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
      // Route returns { analysis: { patterns, sample_messages, vocabulary_style,
      // detected_tone, detected_language, interests } }. Normalize into the
      // AnalysisResult shape the UI renders — reading res.* directly left
      // key_expressions/topics undefined and crashed the tab on .map().
      const res: any = await api.persona.analyze(petId, chatText);
      const a = res?.analysis || res || {};
      setAnalysisResult({
        detected_style: a.detected_tone || a.vocabulary_style || "—",
        key_expressions: a.patterns && typeof a.patterns === "object"
          ? Object.entries(a.patterns).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
          : [],
        topics: Array.isArray(a.interests) ? a.interests : [],
        sample_messages: Array.isArray(a.sample_messages) ? a.sample_messages : [],
      });
    } catch (err: any) {
      setSaveResult({ type: "error", text: err.message || "Analysis failed" });
    }
    setAnalyzing(false);
  };

  const handleApplyAnalysis = async () => {
    if (!analysisResult) return;
    setApplyingAnalysis(true);
    // The analyze step already persisted results server-side (saveChatAnalysis),
    // and there is no /persona/apply route — "Apply" just merges the detected
    // topics/expressions into the editable form so the user can save them.
    setPersona(prev => ({
      ...prev,
      interests: [...new Set([...prev.interests, ...analysisResult.topics])],
      expressions: analysisResult.key_expressions.join(", "),
    }));
    setSaveResult({ type: "success", text: "Analysis results applied!" });
    setTimeout(() => setSaveResult(null), 3000);
    setApplyingAnalysis(false);
  };

  // ── Shared styles ──
  const cardStyle: React.CSSProperties = {
    background: "#FBF6EC",
    border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
    borderRadius: 16,
    padding: "24px",
    boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
    marginBottom: 16,
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: "var(--ed-m)",
    fontSize: 13,
    color: "#7A6E5A",
    marginBottom: 8,
    textTransform: "uppercase" as const,
    letterSpacing: "0.12em",
  };

  const helpStyle: React.CSSProperties = {
    fontFamily: "var(--ed-m)",
    fontSize: 13,
    color: "#9A7B4E",
    marginTop: 6,
    lineHeight: 1.5,
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 16px",
    borderRadius: 12,
    border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
    background: "#F5EFE2",
    color: "#211A12",
    fontFamily: "var(--ed-body)",
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
        .persona-input:focus { border-color: rgba(190,79,40,0.5) !important; }
        .persona-tab:hover { background: rgba(33,26,18,0.04) !important; }
        .persona-chip:hover { opacity: 0.85 !important; transform: scale(1.02); }
        .persona-tag:hover .persona-tag-x { opacity: 1 !important; }
        .persona-suggested:hover { border-color: rgba(190,79,40,0.4) !important; background: rgba(190,79,40,0.08) !important; }
        @keyframes analyzeDots { 0%,20% { content: '.' } 40% { content: '..' } 60%,100% { content: '...' } }
        @keyframes fadeSlide { from { opacity:0; transform:translateX(10px) } to { opacity:1; transform:translateX(0) } }
        @keyframes shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
      `}</style>

      {/* Section Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{
          fontFamily: "var(--ed-disp)",
          fontSize: 16, fontWeight: 700, color: "#211A12",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{
            width: 32, height: 32, borderRadius: 10,
            background: "#F5EFE2",
            border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, color: "#BE4F28",
          }}>
            P
          </span>
          Persona Setup
          <span style={{
            fontFamily: "var(--ed-m)", fontSize: 13,
            color: "#9A4E1E", background: "rgba(190,79,40,0.1)",
            padding: "2px 8px", borderRadius: 6,
          }}>
            {petName}
          </span>
        </div>
        <div style={{
          fontFamily: "var(--ed-m)", fontSize: 13,
          color: "#7A6E5A", marginTop: 6, marginLeft: 42,
        }}>
          Configure your pet&apos;s personality to reflect you
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{
        display: "flex", gap: 4, marginBottom: 20,
        background: "#ECE4D4",
        borderRadius: 14, padding: 4,
        border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
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
                ? "#FBF6EC"
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
                background: "#BE4F28",
                borderRadius: 1,
              }} />
            )}
            <div style={{
              fontFamily: "var(--ed-disp)",
              fontSize: 13, fontWeight: activeTab === tab.key ? 700 : 500,
              color: activeTab === tab.key ? "#211A12" : "#7A6E5A",
              transition: "color 0.2s",
            }}>
              {tab.label}
            </div>
            <div style={{
              fontFamily: "var(--ed-m)", fontSize: 13,
              color: activeTab === tab.key ? "#9A4E1E" : "#9A7B4E",
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
            ? "rgba(92,138,78,0.1)"
            : "rgba(190,79,40,0.08)",
          border: `1px solid ${saveResult.type === "success" ? "rgba(92,138,78,0.25)" : "rgba(190,79,40,0.25)"}`,
          fontFamily: "var(--ed-m)", fontSize: 13,
          color: saveResult.type === "success" ? "#5C8A4E" : "#BE4F28",
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
            <div style={labelStyle}>Speech Style</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              {SPEECH_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setPersona(prev => ({ ...prev, speech_style: opt.value }))}
                  style={{
                    padding: "10px 18px",
                    borderRadius: 12,
                    border: persona.speech_style === opt.value
                      ? "1.5px solid rgba(190,79,40,0.4)"
                      : "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                    background: persona.speech_style === opt.value
                      ? "rgba(190,79,40,0.1)"
                      : "#F5EFE2",
                    color: persona.speech_style === opt.value ? "#BE4F28" : "#5C5140",
                    fontFamily: "var(--ed-disp)",
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
              aria-label="Additional speech style details"
              placeholder="Additional details (e.g. uses lots of abbreviations and internet slang)"
              value={persona.speech_detail}
              onChange={e => setPersona(prev => ({ ...prev, speech_detail: e.target.value }))}
              style={inputStyle}
            />
            <div style={helpStyle}>How your pet talks - casual, formal, or a mix depending on context</div>
          </div>

          {/* Tone */}
          <div style={cardStyle}>
            <div style={labelStyle}>Tone</div>
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
                        ? "1.5px solid rgba(190,79,40,0.4)"
                        : "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                      background: isSelected
                        ? "rgba(190,79,40,0.1)"
                        : "#F5EFE2",
                      color: isSelected ? "#BE4F28" : "#7A6E5A",
                      fontFamily: "var(--ed-disp)",
                      fontSize: 13, fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.2s",
                      display: "flex", alignItems: "center", gap: 6,
                    }}
                  >
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 16, height: 16,
                    }}>
                      <ToneIcon tone={opt.value} />
                    </span>
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <div style={helpStyle}>Select one or more tones that match your vibe (multiple OK)</div>
          </div>

          {/* Interests */}
          <div style={cardStyle}>
            <div style={labelStyle}>Interests</div>
            <div style={{
              display: "flex", flexWrap: "wrap", gap: 6,
              padding: "10px 14px", borderRadius: 12,
              border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
              background: "#F5EFE2",
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
                    background: "rgba(190,79,40,0.12)",
                    border: "1px solid rgba(190,79,40,0.25)",
                    color: "#9A4E1E",
                    fontFamily: "var(--ed-disp)",
                    fontSize: 13, fontWeight: 600,
                  }}
                >
                  {tag}
                  <button
                    type="button"
                    className="persona-tag-x"
                    onClick={() => removeTag(tag)}
                    aria-label={`Remove ${tag}`}
                    style={{
                      cursor: "pointer", opacity: 0.5,
                      marginLeft: 2, fontSize: 14, lineHeight: 1,
                      transition: "opacity 0.15s", border: 0, padding: 0,
                      background: "transparent", color: "inherit", font: "inherit",
                    }}
                  >
                    \u00d7
                  </button>
                </span>
              ))}
              <input
                aria-label="Add an interest keyword"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder={persona.interests.length === 0 ? "Enter a keyword, then press Enter" : ""}
                style={{
                  border: "none", background: "transparent",
                  color: "#211A12", fontFamily: "var(--ed-body)",
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
                    border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                    background: "#F5EFE2",
                    color: "#9A7B4E",
                    fontFamily: "var(--ed-m)", fontSize: 13,
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
            <div style={labelStyle}>Frequent Expressions</div>
            <input
              className="persona-input"
              aria-label="Frequent expressions"
              placeholder="e.g. fr, okay, lol, let's go, love it"
              value={persona.expressions}
              onChange={e => setPersona(prev => ({ ...prev, expressions: e.target.value }))}
              style={inputStyle}
            />
            <div style={helpStyle}>Comma-separated phrases or abbreviations you use often</div>
          </div>

          {/* Language */}
          <div style={cardStyle}>
            <div style={labelStyle}>Language</div>
            <div style={{
              padding: "12px 16px", borderRadius: 12,
              border: "1.5px solid rgba(190,79,40,0.4)",
              background: "rgba(190,79,40,0.1)", color: "#BE4F28",
              fontFamily: "var(--ed-disp)", fontSize: 13, fontWeight: 600,
              textAlign: "center",
            }}>
              English
            </div>
            <div style={helpStyle}>Pet responses are English-only in this release.</div>
          </div>

          {/* Bio */}
          <div style={cardStyle}>
            <div style={labelStyle}>About You</div>
            <textarea
              aria-label="About you"
              className="persona-input"
              placeholder="e.g. I'm a 26-year-old developer who likes crypto and coding at night. I have a playful sense of humor..."
              value={persona.bio}
              onChange={e => setPersona(prev => ({ ...prev, bio: e.target.value }))}
              style={textareaStyle}
              rows={4}
            />
            <div style={helpStyle}>Tell your pet about yourself freely</div>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              width: "100%", padding: "16px",
              borderRadius: 14, border: "none",
              background: saving
                ? "rgba(190,79,40,0.15)"
                : "linear-gradient(180deg,#F49B2A,#E27D0C)",
              color: saving ? "rgba(190,79,40,0.6)" : "#FFF8EE",
              fontFamily: "var(--ed-disp)",
              fontSize: 14, fontWeight: 800,
              cursor: saving ? "not-allowed" : "pointer",
              transition: "all 0.3s",
              boxShadow: saving ? "none" : "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
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
                      ? "1.5px solid rgba(190,79,40,0.4)"
                      : "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                    background: importMethod === method
                      ? "rgba(190,79,40,0.1)"
                      : "#F5EFE2",
                    color: importMethod === method ? "#BE4F28" : "#7A6E5A",
                    fontFamily: "var(--ed-disp)",
                    fontSize: 13, fontWeight: 600,
                    cursor: "pointer", transition: "all 0.2s",
                    textAlign: "center" as const,
                  }}
                >
                  {method === "paste" ? "Paste text" : "Upload file"}
                </button>
              ))}
            </div>

            {importMethod === "paste" ? (
              <>
                <textarea
                  aria-label="Chat history"
                  className="persona-input"
                  placeholder="Paste chat history from KakaoTalk, Telegram, Discord, or another platform here"
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
                    fontFamily: "var(--ed-m)", fontSize: 13,
                    color: chatText.length > 5000 ? "#BE4F28" : "#9A7B4E",
                  }}>
                    {chatText.length.toLocaleString()} chars
                  </div>
                </div>
              </>
            ) : (
              <div style={{ textAlign: "center", padding: "30px 0" }}>
                <input
                  aria-hidden="true"
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
                    border: "2px dashed rgba(190,79,40,0.35)",
                    background: "rgba(190,79,40,0.06)",
                    color: "#9A4E1E",
                    fontFamily: "var(--ed-disp)",
                    fontSize: 13, fontWeight: 600,
                    cursor: "pointer", transition: "all 0.2s",
                  }}
                >
                  Click to upload .txt / .json file
                </button>
                {chatText && (
                  <div style={{
                    fontFamily: "var(--ed-m)", fontSize: 13,
                    color: "#5C8A4E", marginTop: 12,
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
                ? "linear-gradient(90deg, rgba(107,79,160,0.12), rgba(190,79,40,0.12), rgba(107,79,160,0.12))"
                : !chatText.trim()
                  ? "#ECE4D4"
                  : "linear-gradient(135deg, #6B4FA0, #5A3F8C)",
              backgroundSize: analyzing ? "200% 100%" : "100% 100%",
              animation: analyzing ? "shimmer 2s linear infinite" : "none",
              color: analyzing
                ? "#6B4FA0"
                : !chatText.trim()
                  ? "#9A7B4E"
                  : "#FFF8EE",
              fontFamily: "var(--ed-disp)",
              fontSize: 14, fontWeight: 700,
              cursor: analyzing || !chatText.trim() ? "not-allowed" : "pointer",
              transition: "all 0.3s",
              boxShadow: !chatText.trim() ? "none" : "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
              marginBottom: 16,
            }}
          >
            {analyzing ? "AI is analyzing your chat patterns..." : "Analyze Chat History"}
          </button>

          {/* Analysis Results */}
          {analysisResult && (
            <div style={{
              ...cardStyle,
              border: "1px solid rgba(107,79,160,0.25)",
              animation: "fadeSlide 0.4s ease-out",
            }}>
              <div style={{
                fontFamily: "var(--ed-disp)",
                fontSize: 14, fontWeight: 700, color: "#6B4FA0",
                marginBottom: 16, display: "flex", alignItems: "center", gap: 8,
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: "#6B4FA0",
                }} />
                Analysis Results
              </div>

              <div style={{ display: "grid", gap: 14 }}>
                {/* Detected Style */}
                <div style={{
                  padding: "12px 16px", borderRadius: 12,
                  background: "#F5EFE2",
                  border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                }}>
                  <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: "#7A6E5A", letterSpacing: "0.12em", marginBottom: 6 }}>
                    DETECTED STYLE
                  </div>
                  <div style={{ fontFamily: "var(--ed-disp)", fontSize: 14, color: "#BE4F28", fontWeight: 600 }}>
                    {analysisResult.detected_style}
                  </div>
                </div>

                {/* Key Expressions */}
                <div style={{
                  padding: "12px 16px", borderRadius: 12,
                  background: "#F5EFE2",
                  border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                }}>
                  <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: "#7A6E5A", letterSpacing: "0.12em", marginBottom: 8 }}>
                    KEY EXPRESSIONS
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {analysisResult.key_expressions.map((expr, i) => (
                      <span key={i} style={{
                        padding: "4px 10px", borderRadius: 8,
                        background: "rgba(190,79,40,0.1)",
                        border: "1px solid rgba(190,79,40,0.22)",
                        color: "#9A4E1E",
                        fontFamily: "var(--ed-m)", fontSize: 13,
                      }}>
                        {expr}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Topics */}
                <div style={{
                  padding: "12px 16px", borderRadius: 12,
                  background: "#F5EFE2",
                  border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                }}>
                  <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: "#7A6E5A", letterSpacing: "0.12em", marginBottom: 8 }}>
                    INTEREST TOPICS
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {analysisResult.topics.map((topic, i) => (
                      <span key={i} style={{
                        padding: "4px 10px", borderRadius: 8,
                        background: "rgba(107,79,160,0.1)",
                        border: "1px solid rgba(107,79,160,0.22)",
                        color: "#6B4FA0",
                        fontFamily: "var(--ed-m)", fontSize: 13,
                      }}>
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Sample Messages */}
                <div style={{
                  padding: "12px 16px", borderRadius: 12,
                  background: "#F5EFE2",
                  border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                }}>
                  <div style={{ fontFamily: "var(--ed-m)", fontSize: 13, color: "#7A6E5A", letterSpacing: "0.12em", marginBottom: 8 }}>
                    SAMPLE MESSAGES (5)
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {analysisResult.sample_messages.map((msg, i) => (
                      <div key={i} style={{
                        padding: "8px 12px", borderRadius: 8,
                        background: "#FBF6EC",
                        fontFamily: "var(--ed-m)", fontSize: 13,
                        color: "#5C5140",
                        borderLeft: "2px solid rgba(107,79,160,0.4)",
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
                  border: "none",
                  background: applyingAnalysis
                    ? "rgba(190,79,40,0.15)"
                    : "linear-gradient(180deg,#F49B2A,#E27D0C)",
                  color: applyingAnalysis ? "rgba(190,79,40,0.5)" : "#FFF8EE",
                  fontFamily: "var(--ed-disp)",
                  fontSize: 13, fontWeight: 700,
                  cursor: applyingAnalysis ? "not-allowed" : "pointer",
                  marginTop: 16, transition: "all 0.3s",
                }}
              >
                {applyingAnalysis ? "Applying..." : "Apply Results"}
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
              ? "1px solid rgba(92,138,78,0.25)"
              : "1px solid var(--ed-hair, rgba(33,26,18,.13))",
          }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: 16,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: liveLearning ? "#5C8A4E" : "rgba(33,26,18,0.15)",
                  animation: liveLearning ? "pulse 2s ease-in-out infinite" : "none",
                }} />
                <div style={{
                  fontFamily: "var(--ed-disp)",
                  fontSize: 14, fontWeight: 600,
                  color: liveLearning ? "#5C8A4E" : "#7A6E5A",
                }}>
                  Planned — not active
                </div>
              </div>

              {/* Toggle */}
              <button
                type="button"
                disabled
                aria-label="Live Learning is planned and unavailable"
                title="Live Learning is not available yet"
                style={{
                  width: 48, height: 26, borderRadius: 13,
                  background: liveLearning
                    ? "#5C8A4E"
                    : "rgba(33,26,18,0.12)",
                  border: "none", cursor: "not-allowed",
                  position: "relative", transition: "all 0.3s ease",
                }}
              >
                <div style={{
                  width: 20, height: 20, borderRadius: "50%",
                  background: "#FFF8EE",
                  position: "absolute", top: 3,
                  left: liveLearning ? 25 : 3,
                  transition: "left 0.3s ease",
                  boxShadow: "0 1px 3px rgba(80,55,20,0.25)",
                }} />
              </button>
            </div>
            <div style={helpStyle}>
              Live Learning is not running. Connected-platform conversations are not observed by this feature.
            </div>
          </div>

          {/* Connected Platforms */}
          <div style={cardStyle}>
            <div style={labelStyle}>Connected Platforms</div>
            {platforms.length === 0 ? (
              <div style={{
                textAlign: "center", padding: "24px 0",
                fontFamily: "var(--ed-m)", fontSize: 13,
                color: "#9A7B4E",
              }}>
                No platforms connected yet. Connect in the Platform Connections section above.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {platforms.map(p => (
                  <div key={p.platform} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 16px", borderRadius: 12,
                    background: "#F5EFE2",
                    border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{
                        fontFamily: "var(--ed-disp)",
                        fontSize: 14, fontWeight: 700, color: "#211A12",
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
                        background: p.connected ? "#5C8A4E" : "rgba(33,26,18,0.15)",
                      }} />
                      <span style={{
                        fontFamily: "var(--ed-m)", fontSize: 13,
                        color: p.connected ? "#5C8A4E" : "#9A7B4E",
                      }}>
                        {p.connected ? "Connected" : "Not connected"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Observed Topics */}
          <div style={cardStyle}>
            <div style={labelStyle}>Observed Topics</div>
            {observedTopics.length === 0 ? (
              <div style={{
                textAlign: "center", padding: "24px 0",
                fontFamily: "var(--ed-m)", fontSize: 13,
                color: "#9A7B4E",
              }}>
                Live Learning is not available yet. No platform conversations are being observed.
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {observedTopics.map((topic, i) => {
                  // Vary opacity for a "tag cloud" effect
                  const opacity = 0.5 + (1 - i / Math.max(observedTopics.length, 1)) * 0.5;
                  return (
                    <span key={topic} style={{
                      padding: "6px 14px", borderRadius: 10,
                      background: `rgba(107,79,160,${0.06 + opacity * 0.1})`,
                      border: `1px solid rgba(107,79,160,${0.15 + opacity * 0.15})`,
                      color: `rgba(107,79,160,${opacity})`,
                      fontFamily: "var(--ed-disp)",
                      fontSize: 13 + Math.floor(opacity * 3), fontWeight: 600,
                    }}>
                      {topic}
                    </span>
                  );
                })}
              </div>
            )}
            <div style={helpStyle}>Planned feature — no collection is active.</div>
          </div>

          {/* Last Updated */}
          {lastUpdated && (
            <div style={{
              textAlign: "center",
              fontFamily: "var(--ed-m)", fontSize: 13,
              color: "#9A7B4E",
              marginTop: 8,
            }}>
              Last updated: {new Date(lastUpdated).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
