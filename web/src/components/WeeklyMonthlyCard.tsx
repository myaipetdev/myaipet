"use client";

/**
 * Side-by-side weekly + monthly missions. Progress bars instead of pass/fail
 * because these are accumulator goals (chat 30 times, generate 5 things, …).
 */
import { useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/api";
import Icon from "@/components/Icon";

interface PeriodicView {
  id: string;
  category: string;
  title: string;
  description: string;
  target: number;
  progress: number;
  points: number;
  status: "pending" | "completed";
}

interface PeriodicResponse {
  period: "week" | "month";
  period_key: string;
  starts_at: string;
  ends_at: string;
  missions: PeriodicView[];
  earned: number;
  remaining: number;
}

export default function WeeklyMonthlyCard() {
  const [weekly, setWeekly] = useState<PeriodicResponse | null>(null);
  const [monthly, setMonthly] = useState<PeriodicResponse | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/missions/weekly", { headers: getAuthHeaders() }),
      fetch("/api/missions/monthly", { headers: getAuthHeaders() }),
    ]).then(async ([wr, mr]) => {
      if (wr.status === 401) { setAuthed(false); return; }
      setAuthed(true);
      if (wr.ok)  setWeekly(await wr.json());
      if (mr.ok)  setMonthly(await mr.json());
    }).catch(() => {});
  }, []);

  if (authed === false || authed === null) return null;
  if (!weekly && !monthly) return null;

  return (
    <div className="mp-enter mp-enter-2" style={{ maxWidth: 1060, margin: "16px auto", padding: "0 24px" }}>
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14,
      }} className="weekly-monthly-grid">
        {weekly && <Block period={weekly} title="THIS WEEK" icon="scroll" />}
        {monthly && <Block period={monthly} title="THIS MONTH" icon="medal" />}
      </div>

      <style>{`
        @media (max-width: 760px) {
          .weekly-monthly-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function Block({ period, title, icon }: { period: PeriodicResponse; title: string; icon: string }) {
  return (
    <div style={{
      background: "#FBF6EC", borderRadius: 16,
      border: "1px solid var(--ed-hair, rgba(33,26,18,.13))",
      boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
      padding: "18px 20px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 22, display: "inline-flex" }}><Icon name={icon} size={22} /></span>
        <div style={{
          fontSize: 12, fontFamily: "var(--ed-m)",
          letterSpacing: "0.14em", color: "#7A6E5A",
        }}>{title} · {period.period_key}</div>
        <div style={{ flex: 1 }} />
        <div style={{
          fontSize: 12, fontFamily: "var(--ed-m)",
          color: "#9A4E1E", fontWeight: 800,
        }}>
          +{period.earned}/{period.earned + period.remaining}pt
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {period.missions.map(m => {
          const pct = Math.min(100, Math.round((m.progress / Math.max(1, m.target)) * 100));
          const done = m.status === "completed";
          return (
            <div key={m.id}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 5 }}>
                <div style={{
                  fontSize: 13, fontWeight: 700, flex: 1,
                  textDecoration: done ? "line-through" : "none",
                  color: done ? "#9A7B4E" : "#211A12",
                }}>{m.title}</div>
                <div style={{
                  fontSize: 12, fontFamily: "var(--ed-m)",
                  color: done ? "#9A4E1E" : "#7A6E5A",
                  fontWeight: 800,
                }}>
                  {done ? `✓ +${m.points}` : `${m.progress}/${m.target} · +${m.points}`}
                </div>
              </div>
              <div style={{
                height: 8, borderRadius: 6, background: "#F5EFE2",
                border: "1px solid var(--ed-hair, rgba(33,26,18,.13))", overflow: "hidden",
              }}>
                <div style={{
                  height: "100%", width: `${pct}%`,
                  background: "#BE4F28",
                  transition: "width 280ms ease",
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
