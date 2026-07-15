"use client";

import { useMemo } from "react";

type ActivityItem = {
  icon?: string;
  wallet?: string;
  text?: string;
  time?: string;
  // Optional — present when the event is tied to a specific pet.
  pet_name?: string;
  pet_avatar?: string;
};

// Guard against raw full-hex addresses; the API usually pre-truncates.
function shortWallet(w: string): string {
  return /^0x[0-9a-fA-F]{10,}$/.test(w) ? `${w.slice(0, 6)}…${w.slice(-4)}` : w;
}

// Real counts only — n comes from actual consecutive identical events.
function groupedText(text: string, n: number): string {
  if (n <= 1) return text;
  const media = text.match(/^Created an AI (video|image)$/i);
  if (media) return `Created ${n} AI ${media[1].toLowerCase()}s`;
  if (/^Adopted a new pet$/i.test(text)) return `Adopted ${n} new pets`;
  return `${text} ×${n}`;
}

export default function Feed({ activities }: { activities: ActivityItem[] }) {
  // Collapse consecutive same-actor-same-verb events into one row.
  // Items arrive newest-first, so the first item of a run carries the
  // freshest timestamp — keep it as the row's time.
  const rows = useMemo(() => {
    const out: { item: ActivityItem; count: number }[] = [];
    for (const a of activities) {
      const prev = out[out.length - 1];
      if (prev && prev.item.wallet === a.wallet && prev.item.text === a.text) prev.count++;
      else out.push({ item: a, count: 1 });
    }
    return out;
  }, [activities]);

  return (
    <div style={{
      background: "#FBF6EC", borderRadius: 14,
      border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", overflow: "hidden",
      boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
    }}>
      <div style={{
        padding: "14px 18px", borderBottom: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{
            width: 7, height: 7, borderRadius: "50%", background: "#1A7E68",
            animation: "pulse 2s infinite",
          }} />
          <span style={{
            fontFamily: "var(--ed-m)", fontSize: 13, color: "#7A6E5A",
            fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em",
          }}>
            Recent Activity
          </span>
        </div>
      </div>
      <div style={{ maxHeight: 340, overflow: "hidden" }}>
        {rows.map(({ item: a, count }, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "10px 18px",
            borderBottom: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
            opacity: 1 - i * 0.07,
            animation: i === 0 ? "slideIn 0.4s ease-out" : "none",
          }}>
            <span style={{ fontSize: 14, width: 22, flexShrink: 0, textAlign: "center" }}>{a.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                {a.pet_name && a.pet_avatar && (
                  <img
                    src={a.pet_avatar}
                    alt=""
                    width={18}
                    height={18}
                    style={{
                      width: 18, height: 18, borderRadius: "50%", objectFit: "cover",
                      flexShrink: 0, border: "1.5px solid #FBF6EC",
                      boxShadow: "1.5px 2px 0 rgba(33,26,18,.12), 0 0 0 1px rgba(33,26,18,.18)",
                    }}
                  />
                )}
                <span style={{
                  fontFamily: "var(--ed-m)", fontSize: 13, color: "#9A4E1E", fontWeight: 700,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {a.pet_name || shortWallet(a.wallet || "")}
                </span>
              </div>
              <span style={{
                display: "block", fontFamily: "var(--ed-m)", fontSize: 13, color: "#5C5140",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {groupedText(a.text || "", count)}
              </span>
            </div>
            <span style={{
              fontFamily: "var(--ed-m)", fontSize: 13, color: "#9A7B4E", whiteSpace: "nowrap", flexShrink: 0,
            }}>
              {a.time}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
