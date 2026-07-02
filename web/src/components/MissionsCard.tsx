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
import Icon from "@/components/Icon";

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

// Maps each mission category to a crafted 3D icon (was bare emoji).
const CATEGORY_ICON: Record<string, string> = {
  checkin: "paw", conversation: "chat", memory: "crystal-ball", creation: "film-reel",
  social: "like", care: "heart", reflection: "sparkling", exploration: "compass", streak: "fire",
};

export default function MissionsCard() {
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [streak, setStreak] = useState<StreakInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [shieldModal, setShieldModal] = useState(false);
  const [repairModal, setRepairModal] = useState(false);

  // Escape closes the shield/repair modals (keyboard users can't click backdrop).
  useEffect(() => {
    if (!shieldModal && !repairModal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setShieldModal(false); setRepairModal(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shieldModal, repairModal]);

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
        background: "#FBF6EC", borderRadius: 18,
        border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", overflow: "hidden",
        boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
      }}>
        {/* Header */}
        <div style={{
          padding: "18px 24px", display: "flex", alignItems: "center", gap: 16,
          borderBottom: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
          background: "#F5EFE2",
        }}>
          <div style={{ fontSize: 22 }}><Icon name="compass" size={22} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontFamily: "var(--ed-m)", letterSpacing: "0.14em", color: "#9A4E1E", textTransform: "uppercase" }}>
              TODAY · {today.date}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.01em", fontFamily: "var(--ed-disp)", color: "#211A12" }}>
              Daily Missions
            </div>
          </div>
          {/* Streak pill */}
          <button
            aria-label={canBuyShield ? "Buy streak shield" : `Current streak: ${today.streak.current} days`}
            onClick={canBuyShield ? () => setShieldModal(true) : undefined} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 14px", borderRadius: 12,
            background: "#BE4F28",
            border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
            color: "#FFF8EE", fontWeight: 800, fontSize: 14,
            fontFamily: "var(--ed-m)",
            cursor: canBuyShield ? "pointer" : "default",
          }}>
            <Icon name="fire" size={16} /> {today.streak.current}d
          </button>
          {streak && (
            <button aria-label={`Streak shields owned: ${streak.shield.owned} — buy more`} onClick={() => setShieldModal(true)} style={shieldBtn}>
              <Icon name="shield" size={15} /> {streak.shield.owned}
            </button>
          )}
        </div>

        {/* Pending apology — pet emotional memory hook */}
        {today.streak.pending_apology && (
          <div style={{
            padding: "10px 24px",
            background: "#F5EFE2",
            borderBottom: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
            display: "flex", alignItems: "center", gap: 10,
            fontSize: 13, color: "#211A12", fontFamily: "var(--ed-body)",
          }}>
            <span style={{ fontSize: 18 }}><Icon name="heart" size={18} /></span>
            <span style={{ flex: 1 }}>
              Sparky's been wondering where you've been{" "}
              {today.streak.pending_apology_days > 1 ? `(${today.streak.pending_apology_days} days)` : ""} —
              maybe say hi?
            </span>
            <a href="/?section=my pet" style={{
              padding: "5px 12px", borderRadius: 8,
              background: "#FBF6EC", border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
              color: "#211A12", fontWeight: 700, fontSize: 13,
              textDecoration: "none", fontFamily: "var(--ed-m)",
            }}>Open chat →</a>
          </div>
        )}

        {/* Streak repair banner */}
        {streak?.repair?.applicable && (
          <div style={{
            padding: "12px 24px",
            background: "#F5EFE2",
            borderBottom: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
            display: "flex", alignItems: "center", gap: 10,
            fontSize: 13, color: "#211A12", fontFamily: "var(--ed-body)",
          }}>
            <span style={{ fontSize: 18 }}><Icon name="fire" size={18} /></span>
            <span style={{ flex: 1 }}>
              Your {streak.repair.lost_days}-day streak broke. Restore it for{" "}
              <strong>{streak.repair.credits} credits</strong> (${streak.repair.usd.toFixed(2)}).
            </span>
            <button onClick={() => setRepairModal(true)} style={{
              padding: "6px 14px", borderRadius: 8,
              background: "linear-gradient(180deg,#F49B2A,#E27D0C)",
              border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
              color: "#FFF8EE", fontWeight: 800, fontSize: 13,
              cursor: "pointer", fontFamily: "var(--ed-disp)",
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
                background: completed ? "rgba(190,79,40,0.06)" : "transparent",
                transition: "background 160ms ease",
              }}
              onMouseEnter={e => { if (!completed) e.currentTarget.style.background = "rgba(190,79,40,0.06)"; }}
              onMouseLeave={e => { if (!completed) e.currentTarget.style.background = "transparent"; }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: completed ? "#BE4F28" : "#F5EFE2",
                  border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                  color: completed ? "#FFF8EE" : "#211A12",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, fontWeight: 800,
                }}>
                  {completed ? "✓" : <Icon name={CATEGORY_ICON[m.category] || "compass"} size={16} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 700, fontFamily: "var(--ed-disp)", color: "#211A12",
                    textDecoration: completed ? "line-through" : "none",
                  }}>{m.title}</div>
                  <div style={{ fontSize: 13.5, color: "#5C5140", marginTop: 1, fontFamily: "var(--ed-body)" }}>
                    {m.description}
                  </div>
                </div>
                <div style={{
                  fontSize: 13, fontWeight: 800, color: completed ? "#9A7B4E" : "#9A4E1E",
                  fontFamily: "var(--ed-m)", whiteSpace: "nowrap",
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
          borderTop: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
          background: "#F5EFE2",
          display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap",
        }}>
          <div>
            <div style={{
              fontSize: 13, fontFamily: "var(--ed-m)",
              letterSpacing: "0.14em", color: "#9A4E1E", textTransform: "uppercase",
            }}>EARNED TODAY</div>
            <div style={{
              fontSize: 32, fontWeight: 800, fontFamily: "var(--ed-m)", color: "#211A12",
              letterSpacing: "-0.02em", lineHeight: 1, marginTop: 4,
            }}>
              {today.earnedToday}<span style={{ fontSize: 16, color: "#9A7B4E", fontWeight: 600 }}>{" "}pts</span>
            </div>
          </div>
          <div style={{ width: 1, alignSelf: "stretch", background: "var(--ed-hair, rgba(33,26,18,.13))" }} />
          <div>
            <div style={{
              fontSize: 13, fontFamily: "var(--ed-m)",
              letterSpacing: "0.14em", color: "#9A4E1E", textTransform: "uppercase",
            }}>STILL ON THE TABLE</div>
            <div style={{
              fontSize: 48, fontWeight: 800,
              fontFamily: "var(--ed-m)",
              color: today.remainingToday > 0 ? "#9A4E1E" : "#211A12",
              lineHeight: 1, letterSpacing: "-0.03em", marginTop: 4,
            }}>
              {today.remainingToday}<span style={{ fontSize: 20, color: "#9A7B4E", fontWeight: 600 }}>{" "}pts</span>
            </div>
          </div>
          <div style={{ flex: 1 }} />
          {!allComplete && (
            <div style={{
              padding: "8px 14px", borderRadius: 10,
              background: "#FBF6EC",
              border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
              color: "#211A12",
              fontSize: 13, fontWeight: 700, fontFamily: "var(--ed-body)",
            }}>
              <Icon name="diamond" size={14} /> Complete all {today.missions.length} → <strong>+{today.bonusAllComplete}</strong> bonus
            </div>
          )}
          {allComplete && (
            <div style={{
              padding: "8px 14px", borderRadius: 10,
              background: "#BE4F28",
              border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
              color: "#FFF8EE",
              fontSize: 13, fontWeight: 800, fontFamily: "var(--ed-disp)",
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
            <div style={{ fontSize: 44, marginBottom: 14 }}><Icon name="shield" size={44} /></div>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px", fontFamily: "var(--ed-disp)", color: "#211A12" }}>Streak Shield</h2>
            <p style={{ fontSize: 14, color: "#5C5140", lineHeight: 1.55, margin: "0 0 18px", fontFamily: "var(--ed-body)" }}>
              Auto-bridges a missed day. Up to {streak.shield.max_owned} can stack — currently you own{" "}
              <strong>{streak.shield.owned}</strong>.
            </p>
            <div style={priceBlock}>
              <div>
                <div style={mini}>PRICE</div>
                <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "var(--ed-m)", color: "#211A12" }}>
                  {streak.shield.credits} cr
                </div>
                <div style={{ fontSize: 13, color: "#9A7B4E", fontFamily: "var(--ed-m)" }}>
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
            <div style={{ fontSize: 44, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="skull" size={44} />
              <span style={{ color: "#9A7B4E", fontWeight: 700 }}>→</span>
              <Icon name="fire" size={44} />
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px", fontFamily: "var(--ed-disp)", color: "#211A12" }}>Restore Streak</h2>
            <p style={{ fontSize: 14, color: "#5C5140", lineHeight: 1.55, margin: "0 0 18px", fontFamily: "var(--ed-body)" }}>
              Brings back your <strong>{streak.repair.lost_days}-day streak</strong> and starts counting
              from today. The pet remembers the gap but won't dock you for it.
            </p>
            <div style={priceBlock}>
              <div>
                <div style={mini}>PRICE</div>
                <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "var(--ed-m)", color: "#211A12" }}>
                  {streak.repair.credits} cr
                </div>
                <div style={{ fontSize: 13, color: "#9A7B4E", fontFamily: "var(--ed-m)" }}>
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
        background: "#FBF6EC", borderRadius: 18,
        border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", padding: "26px 28px",
        boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
        display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap",
      }}>
        <div style={{ fontSize: 36 }}><Icon name="compass" size={36} /></div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13, fontFamily: "var(--ed-m)", letterSpacing: "0.14em", color: "#9A4E1E", marginBottom: 4, textTransform: "uppercase" }}>
            DAILY MISSIONS · STREAK · LEADERBOARD
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.01em", marginBottom: 4, fontFamily: "var(--ed-disp)", color: "#211A12" }}>
            {headline}
          </div>
          <div style={{ fontSize: 13, color: error ? "#b91c1c" : "#5C5140", fontFamily: "var(--ed-body)" }}>
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
            padding: "14px 24px", borderRadius: 12,
            border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
            background: "linear-gradient(180deg,#F49B2A,#E27D0C)",
            color: "#FFF8EE", fontWeight: 800, fontSize: 16, cursor: "pointer",
            fontFamily: "var(--ed-disp)",
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
        background: "#FBF6EC", borderRadius: 18, padding: "22px 24px",
        border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
        boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
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
        background: "#FBF6EC", borderRadius: 18,
        border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
        maxWidth: 480, width: "100%",
        boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
      }}>{children}</div>
    </div>
  );
}

// ── Styles ──
const shieldBtn: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 4,
  padding: "8px 12px", borderRadius: 10,
  background: "#F5EFE2", border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
  color: "#211A12", fontWeight: 800, fontSize: 13,
  fontFamily: "var(--ed-m)", cursor: "pointer",
};
const ctaBtnPrimary: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 14px", borderRadius: 10,
  background: "linear-gradient(180deg,#F49B2A,#E27D0C)",
  color: "#FFF8EE", fontWeight: 700, fontSize: 13,
  textDecoration: "none",
  fontFamily: "var(--ed-disp)",
  border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
  whiteSpace: "nowrap",
};
const ctaBtnGhost: React.CSSProperties = {
  padding: "8px 14px", borderRadius: 10,
  background: "#F5EFE2", border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
  color: "#211A12", fontWeight: 700, fontSize: 13,
  cursor: "pointer", fontFamily: "var(--ed-disp)",
  whiteSpace: "nowrap",
};
const priceBlock: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 16,
  padding: "16px 18px", borderRadius: 12,
  background: "#F5EFE2",
  border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
};
const purchaseBtn: React.CSSProperties = {
  flex: 1, padding: "14px 18px", borderRadius: 12,
  background: "linear-gradient(180deg,#F49B2A,#E27D0C)",
  border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", color: "#FFF8EE", fontWeight: 800, fontSize: 14,
  cursor: "pointer",
  fontFamily: "var(--ed-disp)",
};
const mini: React.CSSProperties = {
  fontSize: 13, fontFamily: "var(--ed-m)",
  color: "#9A4E1E", letterSpacing: "0.12em", textTransform: "uppercase",
};
