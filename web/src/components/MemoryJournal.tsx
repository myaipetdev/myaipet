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
import Icon from "@/components/Icon";

interface MemoryEntry { key: string; content: string; category: string; importance: number; createdAt: string; }
interface UserProfile { key: string; content: string; category: string; }
interface LearnedPattern { id?: string; topic: string; frequency?: number; successRate?: number; promotedToSkill?: boolean; }

// Memory-category → 3D icon name (was bare emoji; now real iconography).
const MEM_ICON: Record<string, string> = { fact: "crystal-ball", preference: "heart", event: "scroll", relationship: "chat", skill_learned: "medal" };
// User-profile-category → 3D icon name.
const PROFILE_ICON: Record<string, string> = { identity: "compass", preference: "heart", communication: "chat", interest: "sparkling", context: "world-map" };

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
  const [learned, setLearned] = useState<LearnedPattern[]>([]);
  const [bondNotes, setBondNotes] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/petclaw/memory?petId=${petId}`, { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return;
        setProfile(Array.isArray(d.userProfile) ? d.userProfile : []);
        setMemories(Array.isArray(d.memories) ? d.memories : []);
        setLearned(Array.isArray(d.learnedPatterns) ? d.learnedPatterns : []);
        setBondNotes(Array.isArray(d.bondNotes) ? d.bondNotes : []);
      })
      .catch(() => { if (alive) { setProfile([]); setMemories([]); setLearned([]); setBondNotes([]); } });
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
      background: "#FBF6EC",
      border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 17, lineHeight: 1, display: "inline-flex" }}><Icon name="scroll" size={18} /></span>
        <span style={{ fontFamily: "var(--ed-disp)", fontWeight: 800, fontSize: 15, color: "#211A12", letterSpacing: "-0.01em" }}>
          Your story with {petName}
        </span>
      </div>
      <div style={{ fontFamily: "var(--ed-body)", fontSize: 12, color: "#7A6E5A", marginBottom: 14 }}>
        {petName} carries this across every session — that&apos;s the whole point.
      </div>

      {empty && (
        <div style={{ padding: "14px 12px", textAlign: "center", fontFamily: "var(--ed-body)", fontSize: 13, color: "#9A7B4E", fontStyle: "italic" }}>
          Talk and care daily — {petName} is still getting to know you. Every chat teaches them something.
        </div>
      )}

      {profile.length > 0 && (
        <div style={{ marginBottom: memories.length > 0 ? 16 : 0 }}>
          <div style={{ fontFamily: "var(--ed-m)", fontSize: 9.5, letterSpacing: "0.12em", color: "#9A4E1E", fontWeight: 700, marginBottom: 8 }}>
            WHAT {petName.toUpperCase()} KNOWS ABOUT YOU
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {profile.slice(0, 10).map((p, i) => (
              <span key={p.key || i} style={{
                display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 999,
                background: "#F5EFE2", border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                fontFamily: "var(--ed-body)", fontSize: 12, color: "#211A12",
              }}>
                <span style={{ display: "inline-flex", alignItems: "center" }}>{PROFILE_ICON[p.category] ? <Icon name={PROFILE_ICON[p.category]} size={14} /> : "•"}</span>{p.content}
              </span>
            ))}
          </div>
        </div>
      )}

      {memories.length > 0 && (
        <div>
          <div style={{ fontFamily: "var(--ed-m)", fontSize: 9.5, letterSpacing: "0.12em", color: "#6B4FA0", fontWeight: 700, marginBottom: 8 }}>
            MOMENTS {petName.toUpperCase()} REMEMBERS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {topMemories.map((m, i) => (
              <div key={m.key || i} style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                <span style={{ fontSize: 15, lineHeight: 1.3, flexShrink: 0, display: "inline-flex" }}><Icon name={MEM_ICON[m.category] || "chat"} size={16} /></span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontFamily: "var(--ed-body)", fontSize: 13, color: "#5C5140", lineHeight: 1.45 }}>
                    {m.content}
                  </div>
                  {m.createdAt && (
                    <div style={{ fontFamily: "var(--ed-m)", fontSize: 9, color: "#9A7B4E", marginTop: 1 }}>
                      {timeAgo(m.createdAt)}
                    </div>
                  )}
                </div>
                {m.importance >= 4 && <span title="core memory" style={{ fontSize: 11, flexShrink: 0, display: "inline-flex" }}><Icon name="crown" size={13} alt="core memory" /></span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* How the pet is learning to treat YOU — the bond/adaptation signal.
          The relationship notes that shape the pet's tone live privately in the
          chat prompt and aren't exposed by the memory API, so we surface the
          learned patterns that ARE available and label this honestly: these are
          the topics the pet has adapted to, not invented bond text. */}
      {!empty && (
        <div style={{ marginTop: memories.length > 0 || profile.length > 0 ? 16 : 0 }}>
          <div style={{ fontFamily: "var(--ed-m)", fontSize: 9.5, letterSpacing: "0.12em", color: "#1A7E68", fontWeight: 700, marginBottom: 8 }}>
            HOW {petName.toUpperCase()} IS LEARNING TO TREAT YOU
          </div>
          <div style={{ fontFamily: "var(--ed-body)", fontSize: 11.5, color: "#7A6E5A", lineHeight: 1.55, marginBottom: 10 }}>
            Every few chats, {petName} quietly reflects on the relationship — what helps, what to avoid — and folds it into how it talks to you next time. Here&apos;s what it has noted so far.
          </div>
          {bondNotes.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: learned.length > 0 ? 12 : 0 }}>
              {bondNotes.slice().reverse().map((note, i) => (
                <div key={i} style={{
                  display: "flex", gap: 7, padding: "8px 11px", borderRadius: 10,
                  background: "rgba(26,126,104,0.06)", border: "1px solid rgba(26,126,104,0.22)",
                  fontFamily: "var(--ed-body)", fontSize: 12.5, color: "#211A12", lineHeight: 1.5,
                }}>
                  <span style={{ color: "#1A7E68", fontWeight: 700 }}>“</span>{note}
                </div>
              ))}
            </div>
          )}
          {learned.length > 0 ? (
            <>
              <div style={{ fontFamily: "var(--ed-m)", fontSize: 9, letterSpacing: "0.1em", color: "#9A7B4E", fontWeight: 700, margin: "2px 0 6px" }}>TOPICS IT&apos;S TUNED TO</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {[...learned]
                  .sort((a, b) => (b.frequency || 0) - (a.frequency || 0))
                  .slice(0, 10)
                  .map((p, i) => (
                    <span key={p.id || p.topic || i} title={`seen ${p.frequency ?? 0}× · ${Math.round((p.successRate || 0) * 100)}% landed well`} style={{
                      display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 999,
                      background: "#F5EFE2", border: `1px solid ${p.promotedToSkill ? "rgba(26,126,104,0.45)" : "var(--ed-hair, rgba(33,26,18,.13))"}`,
                      fontFamily: "var(--ed-body)", fontSize: 12, color: "#211A12",
                    }}>
                      <span style={{ display: "inline-flex", alignItems: "center" }}><Icon name={p.promotedToSkill ? "medal" : "grass"} size={14} /></span>{p.topic}
                    </span>
                  ))}
              </div>
            </>
          ) : bondNotes.length === 0 ? (
            <div style={{ fontFamily: "var(--ed-body)", fontSize: 12, color: "#9A7B4E", fontStyle: "italic" }}>
              Nothing noted yet — {petName} starts reflecting after a few real conversations.
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
