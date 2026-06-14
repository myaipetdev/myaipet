"use client";

/**
 * Daily Missions card — the user's primary "what to do today" surface.
 *
 *   ┌──────────────────────────────────────────────────────┐
 *   │  TODAY'S MISSIONS              🔥 12-day streak  🛡 1│
 *   │  ───────────────────────────────────────────────     │
 *   │  ✅ Check in                            +5 pts       │
 *   │  ⬜ Five-message conversation           +10 pts     [Do it]│
 *   │  ⬜ Generate one image in Studio        +15 pts     [Do it]│
 *   │  ⬜ Follow another pet                  +5 pts      [Do it]│
 *   │  ⬜ Tell your pet a joke                +10 pts     [Done]│
 *   │  ───────────────────────────────────────────────     │
 *   │  Earned today:    5 pts                              │
 *   │  Remaining:      40 pts   ← big                      │
 *   │                                                       │
 *   │  💎 Bonus: Complete all 5 → +25 pts streak shield     │
 *   └──────────────────────────────────────────────────────┘
 *
 * Sits on the home page. When a streak is broken, also surfaces the
 * Repair CTA. When pending_apology is true, shows "Sparky wonders where
 * you've been" with a link to chat.
 */

import { useEffect, useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { getAuthHeaders } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/components/Toast";

interface MissionView {
  id: string;
  category: string;
  title: string;
  description: string;
  points: number;
  status: "pending" | "completed";
  cta: { label: string; href: string } | null;
  verifier: "auto" | "manual";
  completed_at: string | null;
}

interface TodayResponse {
  date: string;
  missions: MissionView[];
  earnedToday: number;
  remainingToday: number;
  bonusAllComplete: number;
  streak: {
    current: number;
    longest: number;
    shields: number;
    next_milestone: number | null;
    pending_apology: boolean;
    pending_apology_days: number;
  };
}

interface StreakInfo {
  current: number;
  longest: number;
  shields: number;
  shield: { usd: number; credits: number; max_owned: number; owned: number };
  repair: { applicable: boolean; lost_days: number; kind: string; usd: number; credits: number } | null;
  next_milestone: number | null;
  pending_apology: boolean;
  pending_apology_days: number;
}

const CATEGORY_EMOJI: Record<string, string> = {
  checkin: "📅", conversation: "💬", memory: "🧠", creation: "🎬",
  social: "👥", care: "💝", reflection: "🪞", exploration: "🔍", streak: "🔥",
};

export default function MissionsCard() {
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [streak, setStreak] = useState<StreakInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [shieldModal, setShieldModal] = useState(false);
  const [repairModal, setRepairModal] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/missions/today", { headers: getAuthHeaders() });
      if (r.status === 401) { setAuthed(false); setLoading(false); return; }
      setAuthed(true);
      // A 5xx returns { error } with no missions/streak — storing it then reading
      // today.streak.current / today.missions.map white-screens the Earn tab.
      if (!r.ok) { setLoading(false); return; }
      const data: TodayResponse = await r.json();
      if (!data?.missions || !data?.streak) { setLoading(false); return; }
      setToday(data);
      const r2 = await fetch("/api/streak", { headers: getAuthHeaders() });
      if (r2.ok) setStreak(await r2.json());
    } catch { /* keep last state */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const markDone = async (id: string) => {
    setBusyId(id);
    try {
      const r = await fetch(`/api/missions/${id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      });
      const data = await r.json();
      if (!r.ok && data?.hint) toast(`Not yet — ${data.hint}`, "warning");
      else if (r.ok && data?.pointsEarned) toast(`+${data.pointsEarned} pts`, "success");
      await load();
    } catch { /* ignore */ }
    setBusyId(null);
  };

  const buyShield = async () => {
    setBusyId("shield");
    try {
      const r = await fetch("/api/streak/shield/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ paymentMethod: "credits" }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) toast(data?.error || "Something went wrong", "error");
      else toast("Done — streak protected", "success");
      setShieldModal(false);
      await load();
    } catch {
      // Network error or a non-JSON error page (e.g. 502) — without this the
      // throw escaped and left the button stuck spinning in busyId forever.
      toast("Something went wrong — try again.", "error");
    } finally {
      setBusyId(null);
    }
  };

  const buyRepair = async () => {
    setBusyId("repair");
    try {
      const r = await fetch("/api/streak/repair", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ paymentMethod: "credits" }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) toast(data?.error || "Something went wrong", "error");
      else toast("Done — streak protected", "success");
      setRepairModal(false);
      await load();
    } catch {
      toast("Something went wrong — try again.", "error");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <Skeleton />;
  }
  if (authed === false) {
    return <UnauthTeaser />;
  }
  if (!today) return null;

  const allComplete = today.missions.length > 0 && today.missions.every(m => m.status === "completed");
  const canBuyShield = !!streak && streak.shield.owned < streak.shield.max_owned;
  const totalPossible = today.earnedToday + today.remainingToday + (allComplete ? 0 : today.bonusAllComplete);

  return (
    <div className="mp-enter mp-enter-1" style={{ maxWidth: 1060, margin: "20px auto", padding: "0 24px" }}>
      <div style={{
        background: "white", borderRadius: 18,
        border: "1px solid rgba(0,0,0,0.06)", overflow: "hidden",
        boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
      }}>
        {/* Header */}
        <div style={{
          padding: "18px 24px", display: "flex", alignItems: "center", gap: 16,
          borderBottom: "1px solid rgba(0,0,0,0.05)",
          background: "linear-gradient(180deg, rgba(245,158,11,0.04) 0%, transparent 100%)",
        }}>
          <div style={{ fontSize: 22 }}>🎯</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.14em", color: "rgba(26,26,46,0.55)" }}>
              TODAY · {today.date}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.01em" }}>
              Daily Missions
            </div>
          </div>
          {/* Streak pill */}
          <button onClick={canBuyShield ? () => setShieldModal(true) : undefined} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 14px", borderRadius: 12,
            background: "rgba(245,158,11,0.10)",
            border: "1px solid rgba(245,158,11,0.25)",
            color: "#b45309", fontWeight: 800, fontSize: 14,
            fontFamily: "'JetBrains Mono', monospace",
            cursor: canBuyShield ? "pointer" : "default",
          }}>
            🔥 {today.streak.current}d
          </button>
          {streak && (
            <button onClick={() => setShieldModal(true)} style={shieldBtn}>
              🛡 {streak.shield.owned}
            </button>
          )}
        </div>

        {/* Pending apology — pet emotional memory hook */}
        {today.streak.pending_apology && (
          <div style={{
            padding: "10px 24px",
            background: "rgba(168,85,247,0.06)",
            borderBottom: "1px solid rgba(168,85,247,0.20)",
            display: "flex", alignItems: "center", gap: 10,
            fontSize: 13, color: "#7e22ce",
          }}>
            <span style={{ fontSize: 18 }}>🥺</span>
            <span style={{ flex: 1 }}>
              Sparky's been wondering where you've been{" "}
              {today.streak.pending_apology_days > 1 ? `(${today.streak.pending_apology_days} days)` : ""} —
              maybe say hi?
            </span>
            <a href="/?section=my pet" style={{
              padding: "5px 12px", borderRadius: 8,
              background: "white", border: "1px solid rgba(168,85,247,0.30)",
              color: "#7e22ce", fontWeight: 700, fontSize: 12,
              textDecoration: "none", fontFamily: "'JetBrains Mono', monospace",
            }}>Open chat →</a>
          </div>
        )}

        {/* Streak repair banner */}
        {streak?.repair?.applicable && (
          <div style={{
            padding: "12px 24px",
            background: "rgba(239,68,68,0.06)",
            borderBottom: "1px solid rgba(239,68,68,0.20)",
            display: "flex", alignItems: "center", gap: 10,
            fontSize: 13, color: "#991b1b",
          }}>
            <span style={{ fontSize: 18 }}>💔</span>
            <span style={{ flex: 1 }}>
              Your {streak.repair.lost_days}-day streak broke. Restore it for{" "}
              <strong>{streak.repair.credits} credits</strong> (${streak.repair.usd.toFixed(2)}).
            </span>
            <button onClick={() => setRepairModal(true)} style={{
              padding: "6px 14px", borderRadius: 8,
              background: "linear-gradient(135deg,#f87171,#dc2626)",
              border: "none", color: "white", fontWeight: 800, fontSize: 12,
              cursor: "pointer",
            }}>Restore →</button>
          </div>
        )}

        {/* Mission rows */}
        <div style={{ padding: "10px 0" }}>
          {today.missions.map(m => {
            const completed = m.status === "completed";
            const busy = busyId === m.id;
            return (
              <div key={m.id} style={{
                padding: "14px 24px",
                display: "flex", alignItems: "center", gap: 14,
                opacity: completed ? 0.62 : 1,
                background: completed ? "rgba(22,163,74,0.04)" : "transparent",
                transition: "background 160ms ease",
              }}
              onMouseEnter={e => { if (!completed) e.currentTarget.style.background = "rgba(245,158,11,0.04)"; }}
              onMouseLeave={e => { if (!completed) e.currentTarget.style.background = "transparent"; }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: completed ? "#16a34a" : "rgba(0,0,0,0.05)",
                  color: completed ? "white" : "rgba(26,26,46,0.4)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, fontWeight: 800,
                }}>
                  {completed ? "✓" : CATEGORY_EMOJI[m.category] || "•"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 700,
                    textDecoration: completed ? "line-through" : "none",
                  }}>{m.title}</div>
                  <div style={{ fontSize: 12, color: "rgba(26,26,46,0.55)", marginTop: 1 }}>
                    {m.description}
                  </div>
                </div>
                <div style={{
                  fontSize: 13, fontWeight: 800, color: completed ? "#16a34a" : "#b45309",
                  fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap",
                }}>
                  +{m.points} pts
                </div>
                {!completed && m.cta && (
                  <a href={m.cta.href} className="mp-lift" style={ctaBtnPrimary}>{m.cta.label} →</a>
                )}
                {!completed && m.verifier === "manual" && (
                  <button onClick={() => markDone(m.id)} disabled={busy} className="mp-lift" style={{
                    ...ctaBtnGhost, opacity: busy ? 0.5 : 1,
                  }}>{busy ? "…" : "Done"}</button>
                )}
              </div>
            );
          })}
        </div>

        {/* Totals */}
        <div style={{
          padding: "16px 24px 18px",
          borderTop: "1px solid rgba(0,0,0,0.05)",
          background: "rgba(0,0,0,0.02)",
          display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap",
        }}>
          <div>
            <div style={{
              fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.14em", color: "rgba(26,26,46,0.55)",
            }}>EARNED TODAY</div>
            <div style={{
              fontSize: 32, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "-0.02em", lineHeight: 1, marginTop: 4,
            }}>
              {today.earnedToday}<span style={{ fontSize: 16, color: "rgba(26,26,46,0.45)", fontWeight: 600 }}>{" "}pts</span>
            </div>
          </div>
          <div style={{ width: 1, alignSelf: "stretch", background: "rgba(0,0,0,0.08)" }} />
          <div>
            <div style={{
              fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.14em", color: "rgba(26,26,46,0.55)",
            }}>STILL ON THE TABLE</div>
            <div style={{
              fontSize: 48, fontWeight: 800,
              fontFamily: "'JetBrains Mono', monospace",
              color: today.remainingToday > 0 ? "#b45309" : "#16a34a",
              lineHeight: 1, letterSpacing: "-0.03em", marginTop: 4,
              textShadow: today.remainingToday > 0 ? "0 2px 24px rgba(245,158,11,0.20)" : "none",
            }}>
              {today.remainingToday}<span style={{ fontSize: 20, color: "rgba(26,26,46,0.45)", fontWeight: 600 }}>{" "}pts</span>
            </div>
          </div>
          <div style={{ flex: 1 }} />
          {!allComplete && (
            <div style={{
              padding: "8px 14px", borderRadius: 10,
              background: "linear-gradient(135deg, rgba(168,85,247,0.10), rgba(139,92,246,0.06))",
              border: "1px solid rgba(168,85,247,0.20)",
              color: "#7e22ce",
              fontSize: 12, fontWeight: 700,
            }}>
              💎 Complete all {today.missions.length} → <strong>+{today.bonusAllComplete}</strong> bonus
            </div>
          )}
          {allComplete && (
            <div style={{
              padding: "8px 14px", borderRadius: 10,
              background: "rgba(22,163,74,0.10)",
              border: "1px solid rgba(22,163,74,0.25)",
              color: "#15803d",
              fontSize: 13, fontWeight: 800,
            }}>
              ✓ All done — see you tomorrow
            </div>
          )}
        </div>
      </div>

      {/* Shield modal */}
      {shieldModal && streak && (
        <Modal onClose={() => setShieldModal(false)}>
          <div style={{ padding: 28 }}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>🛡</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px" }}>Streak Shield</h2>
            <p style={{ fontSize: 14, color: "rgba(26,26,46,0.7)", lineHeight: 1.55, margin: "0 0 18px" }}>
              Auto-bridges a missed day. Up to {streak.shield.max_owned} can stack — currently you own{" "}
              <strong>{streak.shield.owned}</strong>.
            </p>
            <div style={priceBlock}>
              <div>
                <div style={mini}>PRICE</div>
                <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>
                  {streak.shield.credits} cr
                </div>
                <div style={{ fontSize: 11, color: "rgba(26,26,46,0.5)", fontFamily: "'JetBrains Mono', monospace" }}>
                  ≈ ${streak.shield.usd.toFixed(2)}
                </div>
              </div>
              <button
                onClick={buyShield}
                disabled={busyId === "shield" || streak.shield.owned >= streak.shield.max_owned}
                style={{
                  ...purchaseBtn,
                  opacity: streak.shield.owned >= streak.shield.max_owned ? 0.5 : 1,
                }}>
                {streak.shield.owned >= streak.shield.max_owned
                  ? "Inventory full"
                  : busyId === "shield" ? "..." : "Buy 1 shield →"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Repair modal */}
      {repairModal && streak?.repair && (
        <Modal onClose={() => setRepairModal(false)}>
          <div style={{ padding: 28 }}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>💔→🔥</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px" }}>Restore Streak</h2>
            <p style={{ fontSize: 14, color: "rgba(26,26,46,0.7)", lineHeight: 1.55, margin: "0 0 18px" }}>
              Brings back your <strong>{streak.repair.lost_days}-day streak</strong> and starts counting
              from today. The pet remembers the gap but won't dock you for it.
            </p>
            <div style={priceBlock}>
              <div>
                <div style={mini}>PRICE</div>
                <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>
                  {streak.repair.credits} cr
                </div>
                <div style={{ fontSize: 11, color: "rgba(26,26,46,0.5)", fontFamily: "'JetBrains Mono', monospace" }}>
                  ≈ ${streak.repair.usd.toFixed(2)}
                </div>
              </div>
              <button onClick={buyRepair} disabled={busyId === "repair"} style={purchaseBtn}>
                {busyId === "repair" ? "..." : "Restore →"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Sub-components ──

function UnauthTeaser() {
  const { isConnected } = useAccount();
  const { isAuthenticating, authenticate, error } = useAuth();

  const subtitle = isConnected
    ? (isAuthenticating ? "Verifying wallet…" : (error || "Wallet connected — sign in to start"))
    : "5 missions a day · streak shields · pet that remembers when you miss";

  const headline = isConnected ? "One more step — sign in" : "Sign in to start your streak";

  return (
    <div style={{ maxWidth: 1060, margin: "20px auto", padding: "0 24px" }}>
      <div style={{
        background: "white", borderRadius: 18,
        border: "1px solid rgba(0,0,0,0.06)", padding: "26px 28px",
        display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap",
      }}>
        <div style={{ fontSize: 36 }}>🎯</div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.14em", color: "rgba(26,26,46,0.55)", marginBottom: 4 }}>
            DAILY MISSIONS · STREAK · LEADERBOARD
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.01em", marginBottom: 4 }}>
            {headline}
          </div>
          <div style={{ fontSize: 13, color: error ? "#b91c1c" : "rgba(26,26,46,0.6)" }}>
            {subtitle}
          </div>
        </div>
        {isConnected ? (
          <button onClick={async () => {
            try {
              await authenticate();
              // All sibling cards (Weekly, Buddy, SOS, etc.) fetched their data
              // with no auth header on first paint. Reload so they pick up the
              // fresh JWT instead of staying stuck on the unauth teaser.
              window.location.reload();
            } catch { /* state already shows error */ }
          }} disabled={isAuthenticating} style={{
            padding: "14px 24px", borderRadius: 12, border: "none",
            background: "linear-gradient(135deg,#fbbf24,#f59e0b)",
            color: "white", fontWeight: 800, fontSize: 16, cursor: "pointer",
            boxShadow: "0 4px 14px rgba(245,158,11,0.30)",
            fontFamily: "'Space Grotesk', sans-serif",
            opacity: isAuthenticating ? 0.6 : 1,
          }}>{isAuthenticating ? "Signing…" : "Sign in →"}</button>
        ) : (
          <ConnectButton chainStatus="none" accountStatus="address" showBalance={false} />
        )}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="mp-enter" style={{ maxWidth: 1060, margin: "20px auto", padding: "0 24px" }}>
      <div style={{
        background: "white", borderRadius: 18, padding: "22px 24px",
        border: "1px solid rgba(0,0,0,0.06)",
        display: "flex", flexDirection: "column", gap: 14,
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div className="mp-skel" style={{ width: 28, height: 28, borderRadius: 8 }} />
          <div className="mp-skel" style={{ width: 220, height: 18, borderRadius: 4 }} />
          <div style={{ flex: 1 }} />
          <div className="mp-skel" style={{ width: 72, height: 32, borderRadius: 12 }} />
          <div className="mp-skel" style={{ width: 48, height: 32, borderRadius: 10 }} />
        </div>
        {/* Five mission rows */}
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div className="mp-skel" style={{ width: 28, height: 28, borderRadius: 8 }} />
            <div style={{ flex: 1 }}>
              <div className="mp-skel" style={{ width: "60%", height: 14, borderRadius: 4, marginBottom: 6 }} />
              <div className="mp-skel" style={{ width: "85%", height: 11, borderRadius: 4 }} />
            </div>
            <div className="mp-skel" style={{ width: 64, height: 32, borderRadius: 10 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "white", borderRadius: 18,
        maxWidth: 480, width: "100%",
        boxShadow: "0 20px 60px rgba(0,0,0,0.30)",
      }}>{children}</div>
    </div>
  );
}

// ── Styles ──
const shieldBtn: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 4,
  padding: "8px 12px", borderRadius: 10,
  background: "white", border: "1px solid rgba(0,0,0,0.10)",
  color: "#1a1a2e", fontWeight: 800, fontSize: 13,
  fontFamily: "'JetBrains Mono', monospace", cursor: "pointer",
};
const ctaBtnPrimary: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 14px", borderRadius: 10,
  background: "linear-gradient(135deg,#fbbf24,#f59e0b)",
  color: "white", fontWeight: 700, fontSize: 12,
  textDecoration: "none",
  fontFamily: "'Space Grotesk', sans-serif",
  boxShadow: "0 2px 8px rgba(245,158,11,0.25)",
  whiteSpace: "nowrap",
};
const ctaBtnGhost: React.CSSProperties = {
  padding: "8px 14px", borderRadius: 10,
  background: "white", border: "1px solid rgba(0,0,0,0.10)",
  color: "#1a1a2e", fontWeight: 700, fontSize: 12,
  cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif",
  whiteSpace: "nowrap",
};
const priceBlock: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 16,
  padding: "16px 18px", borderRadius: 12,
  background: "rgba(0,0,0,0.03)",
  border: "1px solid rgba(0,0,0,0.06)",
};
const purchaseBtn: React.CSSProperties = {
  flex: 1, padding: "14px 18px", borderRadius: 12,
  background: "linear-gradient(135deg,#fbbf24,#f59e0b)",
  border: "none", color: "white", fontWeight: 800, fontSize: 14,
  cursor: "pointer",
  boxShadow: "0 4px 14px rgba(245,158,11,0.30)",
  fontFamily: "'Space Grotesk', sans-serif",
};
const mini: React.CSSProperties = {
  fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
  color: "rgba(26,26,46,0.55)", letterSpacing: "0.12em",
};
