"use client";

/**
 * SOS feed (Save Our Streak) + Buddy panel — community-facing rescue surface.
 *
 *   LEFT: live SOS requests (last 24h)        → click "Help (50 cr)"
 *   RIGHT: my buddy state — invites in/out + active partnership
 */
import { useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/api";
import { toast } from "@/components/Toast";

interface SosItem {
  id: number; sender_streak: number; message: string | null;
  created_at: string; expires_at: string;
  sender: { wallet: string; pet: { name: string; avatar_url: string | null } | null };
}
interface BuddyStatus {
  active: { id: number; shared_streak: number; partner: { wallet: string; pet: { name: string; avatar_url: string | null } | null } }[];
  inboundInvites: { id: number; sender: { wallet: string; pet: any } }[];
  outboundInvites: { id: number; target: { wallet: string; pet: any } }[];
}

export default function SosFeedAndBuddy() {
  const [feed, setFeed] = useState<SosItem[]>([]);
  const [buddy, setBuddy] = useState<BuddyStatus | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [inviteWallet, setInviteWallet] = useState("");

  const load = async () => {
    try {
      const fr = await fetch("/api/sos/feed");
      if (fr.ok) setFeed((await fr.json()).items || []);
      const br = await fetch("/api/buddy/status", { headers: getAuthHeaders() });
      if (br.status === 401) { setAuthed(false); return; }
      setAuthed(true);
      if (br.ok) setBuddy(await br.json());
    } catch { /* ignore */ }
  };
  useEffect(() => { load(); }, []);

  // Each mutator wraps its fetch in try/catch with setBusy(null) in finally — a
  // network reject or a non-JSON error page (e.g. 502) would otherwise skip the
  // reset and leave the button spinning/disabled forever.
  const help = async (id: number) => {
    setBusy(id);
    try {
      const r = await fetch(`/api/sos/${id}/help`, {
        method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) toast("Sign in first to help", "error");
      else if (!r.ok) toast(d?.error || "Couldn't help — try again", "error");
      else toast(`You saved their streak  ·  +${d.reward_pts} Savior pts (lifetime)`, "success");
      await load();
    } catch {
      toast("Something went wrong — try again.", "error");
    } finally {
      setBusy(null);
    }
  };

  const sendInvite = async () => {
    if (!inviteWallet.trim()) return;
    setBusy(-1);
    try {
      const r = await fetch("/api/buddy/invite", {
        method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ partnerWallet: inviteWallet.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) toast(d?.error || "Couldn't send invite", "error");
      else { setInviteWallet(""); toast("Invite sent", "success"); }
      await load();
    } catch {
      toast("Something went wrong — try again.", "error");
    } finally {
      setBusy(null);
    }
  };

  const acceptInvite = async (id: number) => {
    setBusy(id);
    try {
      const r = await fetch("/api/buddy/accept", {
        method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ buddyId: id }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) toast(d?.error || "Couldn't accept", "error");
      else toast("Buddy connected — shared streak starts now", "success");
      await load();
    } catch {
      toast("Something went wrong — try again.", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mp-enter mp-enter-3" style={{ maxWidth: 1060, margin: "20px auto", padding: "0 24px" }}>
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14,
      }} className="sos-buddy-grid">
        {/* SOS Feed */}
        <div style={card}>
          <div style={cardHeader}>
            <span style={{ fontSize: 22, display: "inline-flex", lineHeight: 0 }}>
              <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="#BE4F28" strokeWidth="2" />
                <circle cx="12" cy="12" r="3.5" stroke="#BE4F28" strokeWidth="2" />
                <path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21" stroke="#BE4F28" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
            <div style={{ fontSize: 13, fontFamily: "var(--ed-m)", letterSpacing: "0.14em", color: "#9A4E1E" }}>
              SOS · SAVE OUR STREAKS
            </div>
          </div>
          <div style={{ padding: "10px 0", maxHeight: 340, overflowY: "auto" }}>
            {feed.length === 0 && (
              <div style={{
                padding: "32px 22px", textAlign: "center",
              }}>
                <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.7, display: "flex", justifyContent: "center" }}>
                  <svg width={36} height={36} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M5 11.5h11v3a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-3Z" stroke="#211A12" strokeWidth="1.6" strokeLinejoin="round" />
                    <path d="M16 12.5h1.5a2 2 0 0 1 0 4H16" stroke="#211A12" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M8 4.5c-.7.8-.7 1.7 0 2.5M11.5 4.5c-.7.8-.7 1.7 0 2.5" stroke="#211A12" strokeWidth="1.6" strokeLinecap="round" />
                    <path d="M5 20.5h11" stroke="#211A12" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, color: "#211A12", fontFamily: "var(--ed-disp)" }}>
                  Everyone's streak is safe
                </div>
                <div style={{
                  fontSize: 13, color: "#5C5140",
                  maxWidth: 280, margin: "0 auto", lineHeight: 1.5, fontFamily: "var(--ed-body)",
                }}>
                  When someone's about to break a streak, their call for help shows up here.
                  Help a stranger — earns <strong style={{ color: "#9A4E1E" }}>Streak Savior</strong> recognition (lifetime, not season rank).
                </div>
              </div>
            )}
            {feed.map(item => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px" }}>
                {item.sender.pet?.avatar_url
                  ? <img src={item.sender.pet.avatar_url} alt="" style={{ width: 32, height: 32, borderRadius: 8, objectFit: "cover" }} />
                  : <img src="/mascot.jpg" alt="" style={{ width: 32, height: 32, borderRadius: 8, objectFit: "cover" }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--ed-disp)" }}>
                    {item.sender.pet?.name || "—"} <span style={{ color: "#9A4E1E", fontFamily: "var(--ed-m)", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4 }}>·
                      <svg width={11} height={11} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ display: "inline-block" }}>
                        <path d="M12 3c1 3 4 4 4 8a4 4 0 0 1-8 0c0-1.5.5-2.5 1.5-3.5C10 8 11 6 12 3Z" stroke="#BE4F28" strokeWidth="1.8" strokeLinejoin="round" />
                      </svg>
                      {item.sender_streak}d</span>
                  </div>
                  {item.message && (
                    <div style={{ fontSize: 13, color: "#7A6E5A", marginTop: 1, fontFamily: "var(--ed-body)" }}>{item.message}</div>
                  )}
                </div>
                {authed === false ? (
                  <button disabled style={{
                    ...primaryBtn, padding: "7px 12px", fontSize: 13,
                    opacity: 0.5, cursor: "default",
                  }}>Sign in to help</button>
                ) : (
                  <button onClick={() => help(item.id)} disabled={busy === item.id} style={{
                    ...primaryBtn, padding: "7px 12px", fontSize: 13,
                    opacity: busy === item.id ? 0.5 : 1,
                  }}>Help · 50cr</button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Buddy panel */}
        <div style={card}>
          <div style={cardHeader}>
            <span style={{ fontSize: 22, display: "inline-flex", lineHeight: 0 }}>
              <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="8.5" cy="12" r="5" stroke="#BE4F28" strokeWidth="2" />
                <circle cx="15.5" cy="12" r="5" stroke="#BE4F28" strokeWidth="2" />
              </svg>
            </span>
            <div style={{ fontSize: 13, fontFamily: "var(--ed-m)", letterSpacing: "0.14em", color: "#9A4E1E" }}>
              BUDDY LOCK · SHARED STREAK
            </div>
          </div>

          <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
            {authed === false && (
              <div style={{ padding: "32px 22px", textAlign: "center" }}>
                <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.7, display: "flex", justifyContent: "center" }}>
                  <svg width={36} height={36} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="8.5" cy="12" r="5.5" stroke="#211A12" strokeWidth="1.6" />
                    <circle cx="15.5" cy="12" r="5.5" stroke="#211A12" strokeWidth="1.6" />
                  </svg>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, color: "#211A12", fontFamily: "var(--ed-disp)" }}>
                  Pair up with one friend
                </div>
                <div style={{ fontSize: 13, color: "#5C5140", lineHeight: 1.55, fontFamily: "var(--ed-body)" }}>
                  Both of you have to keep the streak alive — strongest accountability mechanism we know.
                </div>
              </div>
            )}
            {authed && buddy?.active.length === 0 && buddy?.inboundInvites.length === 0 && buddy?.outboundInvites.length === 0 && (
              <div style={{
                padding: "16px 18px", borderRadius: 12,
                background: "#F5EFE2",
                border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
              }}>
                <div style={{ fontSize: 14, color: "#211A12", lineHeight: 1.55, marginBottom: 6, fontWeight: 600, fontFamily: "var(--ed-disp)" }}>
                  Pair with one friend
                </div>
                <div style={{ fontSize: 13, color: "#7A6E5A", lineHeight: 1.55, fontFamily: "var(--ed-body)" }}>
                  Both of you have to complete a mission each day for the shared streak to tick.
                  Hardest accountability mechanism ever — that's the point.
                </div>
              </div>
            )}

            {buddy?.active.map(b => (
              <div key={b.id} style={{
                padding: 14, borderRadius: 12,
                background: "#F5EFE2",
                border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
                display: "flex", alignItems: "center", gap: 12,
              }}>
                {b.partner.pet?.avatar_url
                  ? <img src={b.partner.pet.avatar_url} alt="" style={{ width: 34, height: 34, borderRadius: 8, objectFit: "cover" }} />
                  : <img src="/mascot.jpg" alt="" style={{ width: 34, height: 34, borderRadius: 8, objectFit: "cover" }} />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "var(--ed-disp)" }}>{b.partner.pet?.name || b.partner.wallet}</div>
                  <div style={{ fontSize: 13, color: "#7A6E5A", fontFamily: "var(--ed-m)", display: "flex", alignItems: "center", gap: 4 }}>
                    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ display: "inline-block" }}>
                      <path d="M12 3c1 3 4 4 4 8a4 4 0 0 1-8 0c0-1.5.5-2.5 1.5-3.5C10 8 11 6 12 3Z" stroke="#BE4F28" strokeWidth="1.8" strokeLinejoin="round" />
                    </svg>
                    shared streak · {b.shared_streak}d
                  </div>
                </div>
              </div>
            ))}

            {buddy?.inboundInvites.map(inv => (
              <div key={inv.id} style={{
                padding: 12, borderRadius: 12,
                background: "#FBF6EC",
                border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <span style={{ fontSize: 18, display: "inline-flex", lineHeight: 0 }}>
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="3" y="5.5" width="18" height="13" rx="2.5" stroke="#BE4F28" strokeWidth="1.8" />
                    <path d="M4 7.5l8 5.5 8-5.5" stroke="#BE4F28" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <div style={{ fontSize: 13, flex: 1, fontFamily: "var(--ed-body)" }}>
                  Invite from <strong>{inv.sender.wallet}</strong>
                </div>
                <button onClick={() => acceptInvite(inv.id)} disabled={busy === inv.id} style={{ ...primaryBtn, padding: "6px 10px", fontSize: 13 }}>
                  Accept
                </button>
              </div>
            ))}

            {buddy?.outboundInvites.map(inv => (
              <div key={inv.id} style={{
                padding: 12, borderRadius: 12,
                background: "#FBF6EC",
                border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
                boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
                fontSize: 13, color: "#7A6E5A", fontFamily: "var(--ed-body)",
              }}>
                Waiting for <strong>{inv.target.wallet}</strong> to accept…
              </div>
            ))}

            {authed && (buddy?.active.length || 0) === 0 && (
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={inviteWallet}
                  onChange={e => setInviteWallet(e.target.value)}
                  placeholder="Partner wallet 0x…"
                  style={{
                    flex: 1, padding: "9px 12px", borderRadius: 10,
                    border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", fontSize: 13,
                    fontFamily: "var(--ed-m)",
                    background: "#F5EFE2", color: "#211A12",
                  }}
                />
                <button onClick={sendInvite} disabled={!inviteWallet.trim() || busy === -1} style={{
                  ...primaryBtn, padding: "9px 14px", fontSize: 13,
                  opacity: !inviteWallet.trim() ? 0.5 : 1,
                }}>Invite</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 760px) {
          .sos-buddy-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

// ── Styles ──
const card: React.CSSProperties = {
  background: "#FBF6EC", borderRadius: 16,
  border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", overflow: "hidden",
  boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
};
const cardHeader: React.CSSProperties = {
  padding: "16px 18px",
  borderBottom: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
  display: "flex", alignItems: "center", gap: 10,
};
const empty: React.CSSProperties = {
  padding: "30px 18px", textAlign: "center",
  fontSize: 13, color: "#9A7B4E", fontFamily: "var(--ed-body)",
};
const primaryBtn: React.CSSProperties = {
  padding: "9px 16px", borderRadius: 10,
  border: "none",
  background: "linear-gradient(180deg,#F49B2A,#E27D0C)",
  color: "#FFF8EE", fontWeight: 800, fontSize: 13,
  cursor: "pointer", fontFamily: "var(--ed-disp)",
  whiteSpace: "nowrap",
};
