"use client";

/**
 * "Your story with {pet}" — makes the memory moat FELT. Pulls what the pet has
 * actually learned about you (user profile) and the moments it remembers
 * (persistent memories) and shows them warmly, so the "it remembers you"
 * differentiator is experienced, not just described in /architecture docs.
 *
 * Read-only over the existing /api/petclaw/memory endpoint.
 */

import { useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/api";

interface MemoryEntry { key: string; content: string; category: string; importance: number; createdAt: string; }
interface UserProfile { key: string; content: string; category: string; }

const MEM_ICON: Record<string, string> = { fact: "💡", preference: "💝", event: "📅", relationship: "🤝", skill_learned: "🎓" };
const PROFILE_ICON: Record<string, string> = { identity: "🪪", preference: "💝", communication: "💬", interest: "✨", context: "📍" };

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!t) return "";
  const diff = Date.now() - t;
  const d = Math.floor(diff / 86_400_000);
  if (d > 0) return `${d}d ago`;
  const h = Math.floor(diff / 3_600_000);
  if (h > 0) return `${h}h ago`;
  const m = Math.floor(diff / 60_000);
  return m > 0 ? `${m}m ago` : "just now";
}

export default function MemoryJournal({ petId, petName }: { petId: number; petName: string }) {
  const [profile, setProfile] = useState<UserProfile[] | null>(null);
  const [memories, setMemories] = useState<MemoryEntry[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/petclaw/memory?petId=${petId}`, { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return;
        setProfile(Array.isArray(d.userProfile) ? d.userProfile : []);
        setMemories(Array.isArray(d.memories) ? d.memories : []);
      })
      .catch(() => { if (alive) { setProfile([]); setMemories([]); } });
    return () => { alive = false; };
  }, [petId]);

  if (profile === null || memories === null) return null;

  const topMemories = [...memories]
    .sort((a, b) => (b.importance || 0) - (a.importance || 0) || (new Date(b.createdAt).getTime() || 0) - (new Date(a.createdAt).getTime() || 0))
    .slice(0, 8);
  const empty = profile.length === 0 && memories.length === 0;

  return (
    <div style={{
      marginTop: 14, padding: "16px 18px", borderRadius: 16,
      background: "linear-gradient(135deg, rgba(245,158,11,0.05), rgba(168,85,247,0.04))",
      border: "1px solid rgba(245,158,11,0.18)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 17 }}>📖</span>
        <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800, fontSize: 15, color: "#1a1a2e", letterSpacing: "-0.01em" }}>
          Your story with {petName}
        </span>
      </div>
      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: "rgba(26,26,46,0.5)", marginBottom: 14 }}>
        {petName} carries this across every session — that&apos;s the whole point.
      </div>

      {empty && (
        <div style={{ padding: "14px 12px", textAlign: "center", fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: "rgba(26,26,46,0.45)", fontStyle: "italic" }}>
          Talk and care daily — {petName} is still getting to know you. Every chat teaches them something.
        </div>
      )}

      {profile.length > 0 && (
        <div style={{ marginBottom: memories.length > 0 ? 16 : 0 }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.12em", color: "rgba(180,83,9,0.75)", fontWeight: 700, marginBottom: 8 }}>
            WHAT {petName.toUpperCase()} KNOWS ABOUT YOU
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {profile.slice(0, 10).map((p, i) => (
              <span key={p.key || i} style={{
                display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 999,
                background: "white", border: "1px solid rgba(0,0,0,0.06)",
                fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, color: "#1a1a2e",
              }}>
                <span>{PROFILE_ICON[p.category] || "•"}</span>{p.content}
              </span>
            ))}
          </div>
        </div>
      )}

      {memories.length > 0 && (
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.12em", color: "rgba(124,58,237,0.75)", fontWeight: 700, marginBottom: 8 }}>
            MOMENTS {petName.toUpperCase()} REMEMBERS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {topMemories.map((m, i) => (
              <div key={m.key || i} style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                <span style={{ fontSize: 15, lineHeight: 1.3, flexShrink: 0 }}>{MEM_ICON[m.category] || "💭"}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, color: "rgba(26,26,46,0.82)", lineHeight: 1.45 }}>
                    {m.content}
                  </div>
                  {m.createdAt && (
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "rgba(26,26,46,0.35)", marginTop: 1 }}>
                      {timeAgo(m.createdAt)}
                    </div>
                  )}
                </div>
                {m.importance >= 4 && <span title="core memory" style={{ fontSize: 11, flexShrink: 0 }}>⭐</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
