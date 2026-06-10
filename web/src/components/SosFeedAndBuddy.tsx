"use client";

/**
 * SOS feed (Save Our Streak) + Buddy panel — community-facing rescue surface.
 *
 *   LEFT: live SOS requests (last 24h)        → click "Help (50 cr)"
 *   RIGHT: my buddy state — invites in/out + active partnership
 */
import { useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/api";

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

  const help = async (id: number) => {
    setBusy(id);
    const r = await fetch(`/api/sos/${id}/help`, {
      method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    });
    const d = await r.json();
    if (!r.ok) alert(d?.error || "Failed");
    else alert(`✨ You saved their streak! +${d.reward_pts} pts.`);
    setBusy(null);
    await load();
  };

  const sendInvite = async () => {
    if (!inviteWallet.trim()) return;
    setBusy(-1);
    const r = await fetch("/api/buddy/invite", {
      method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ partnerWallet: inviteWallet.trim() }),
    });
    const d = await r.json();
    if (!r.ok) alert(d?.error || "Failed");
    else { setInviteWallet(""); alert("Invite sent."); }
    setBusy(null);
    await load();
  };

  const acceptInvite = async (id: number) => {
    setBusy(id);
    const r = await fetch("/api/buddy/accept", {
      method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ buddyId: id }),
    });
    const d = await r.json();
    if (!r.ok) alert(d?.error || "Failed");
    setBusy(null);
    await load();
  };

  return (
    <div style={{ maxWidth: 1060, margin: "20px auto", padding: "0 24px" }}>
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14,
      }} className="sos-buddy-grid">
        {/* SOS Feed */}
        <div style={card}>
          <div style={cardHeader}>
            <span style={{ fontSize: 22 }}>🆘</span>
            <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.14em", color: "rgba(26,26,46,0.55)" }}>
              SOS · SAVE OUR STREAKS
            </div>
          </div>
          <div style={{ padding: "10px 0", maxHeight: 340, overflowY: "auto" }}>
            {feed.length === 0 && (
              <div style={empty}>No active SOS right now — everyone's good.</div>
            )}
            {feed.map(item => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px" }}>
                {item.sender.pet?.avatar_url
                  ? <img src={item.sender.pet.avatar_url} alt="" style={{ width: 32, height: 32, borderRadius: 8, objectFit: "cover" }} />
                  : <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(0,0,0,0.05)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🐾</div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>
                    {item.sender.pet?.name || "—"} <span style={{ color: "#b45309", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>· 🔥 {item.sender_streak}d</span>
                  </div>
                  {item.message && (
                    <div style={{ fontSize: 11, color: "rgba(26,26,46,0.65)", marginTop: 1 }}>{item.message}</div>
                  )}
                </div>
                <button onClick={() => help(item.id)} disabled={busy === item.id} style={{
                  ...primaryBtn, padding: "7px 12px", fontSize: 12,
                  opacity: busy === item.id ? 0.5 : 1,
                }}>Help · 50cr</button>
              </div>
            ))}
          </div>
        </div>

        {/* Buddy panel */}
        <div style={card}>
          <div style={cardHeader}>
            <span style={{ fontSize: 22 }}>🤝</span>
            <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.14em", color: "rgba(26,26,46,0.55)" }}>
              BUDDY LOCK · SHARED STREAK
            </div>
          </div>

          <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
            {authed === false && (
              <div style={empty}>Sign in to find a buddy.</div>
            )}
            {authed && buddy?.active.length === 0 && buddy?.inboundInvites.length === 0 && buddy?.outboundInvites.length === 0 && (
              <div style={{ fontSize: 13, color: "rgba(26,26,46,0.65)", lineHeight: 1.55 }}>
                Pair with one friend. Both have to complete a mission each day for the shared streak to tick.
                Hardest accountability mechanism ever — that's the point.
              </div>
            )}

            {buddy?.active.map(b => (
              <div key={b.id} style={{
                padding: 14, borderRadius: 12,
                background: "rgba(245,158,11,0.06)",
                border: "1px solid rgba(245,158,11,0.20)",
                display: "flex", alignItems: "center", gap: 12,
              }}>
                {b.partner.pet?.avatar_url
                  ? <img src={b.partner.pet.avatar_url} alt="" style={{ width: 34, height: 34, borderRadius: 8, objectFit: "cover" }} />
                  : <div style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(0,0,0,0.05)", display: "flex", alignItems: "center", justifyContent: "center" }}>🐾</div>}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>{b.partner.pet?.name || b.partner.wallet}</div>
                  <div style={{ fontSize: 11, color: "rgba(26,26,46,0.55)", fontFamily: "'JetBrains Mono', monospace" }}>
                    🔥 shared streak · {b.shared_streak}d
                  </div>
                </div>
              </div>
            ))}

            {buddy?.inboundInvites.map(inv => (
              <div key={inv.id} style={{
                padding: 12, borderRadius: 12,
                background: "rgba(59,130,246,0.06)",
                border: "1px solid rgba(59,130,246,0.20)",
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <span style={{ fontSize: 18 }}>📨</span>
                <div style={{ fontSize: 12, flex: 1 }}>
                  Invite from <strong>{inv.sender.wallet}</strong>
                </div>
                <button onClick={() => acceptInvite(inv.id)} disabled={busy === inv.id} style={{ ...primaryBtn, padding: "6px 10px", fontSize: 12 }}>
                  Accept
                </button>
              </div>
            ))}

            {buddy?.outboundInvites.map(inv => (
              <div key={inv.id} style={{
                padding: 12, borderRadius: 12,
                background: "rgba(0,0,0,0.04)",
                fontSize: 12, color: "rgba(26,26,46,0.65)",
              }}>
                ⏳ Waiting for <strong>{inv.target.wallet}</strong> to accept…
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
                    border: "1px solid rgba(0,0,0,0.10)", fontSize: 13,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                />
                <button onClick={sendInvite} disabled={!inviteWallet.trim() || busy === -1} style={{
                  ...primaryBtn, padding: "9px 14px", fontSize: 12,
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
  background: "white", borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.06)", overflow: "hidden",
};
const cardHeader: React.CSSProperties = {
  padding: "16px 18px",
  borderBottom: "1px solid rgba(0,0,0,0.05)",
  display: "flex", alignItems: "center", gap: 10,
};
const empty: React.CSSProperties = {
  padding: "30px 18px", textAlign: "center",
  fontSize: 13, color: "rgba(26,26,46,0.5)",
};
const primaryBtn: React.CSSProperties = {
  padding: "9px 16px", borderRadius: 10, border: "none",
  background: "linear-gradient(135deg,#fbbf24,#f59e0b)",
  color: "white", fontWeight: 800, fontSize: 13,
  cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif",
  boxShadow: "0 2px 8px rgba(245,158,11,0.25)",
  whiteSpace: "nowrap",
};
