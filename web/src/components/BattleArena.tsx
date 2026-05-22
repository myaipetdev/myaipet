"use client";

/**
 * BattleArena — PetClaw-tone deterministic combat visualizer.
 *
 * Three sections, top-to-bottom:
 *   1. Protocol header (monospace) — seed, tx_hash, "battle/v1" tag
 *   2. Versus cards — two pet avatars, stats, live-decreasing HP bars
 *   3. Turn log — typewriter-paced, monospace, crits/misses highlighted
 *
 * Matches /architecture, /skills, Hermes Memory Inspector tone:
 * cream background, amber accents, mono labels, 1a1a2e text.
 *
 * Accepts either a fresh result (from /api/battle/create) or a replay
 * snapshot (from /api/battle/[id]). Both have the same shape.
 */

import { useEffect, useState } from "react";

export interface BattleData {
  battleId: number;
  seed?: string | null;
  txHash?: string | null;
  battleType?: string;
  won: boolean;
  turns: number;
  expGained?: number;
  pointsEarned?: number;
  exp_gained?: number;        // alt key from create response
  points_earned?: number;
  player: {
    petId: number;
    name: string;
    avatar?: string | null;
    level?: number | null;
    stats?: { atk: number; def: number; spd: number } | null;
    hpLeft: number;
    hpMax: number;
    ownerWallet?: string | null;
  };
  opponent: {
    petId?: number | null;
    name: string;
    avatar?: string | null;
    level?: number | null;
    stats?: { atk: number; def: number; spd: number } | null;
    hpLeft: number;
    hpMax: number;
    ownerWallet?: string | null;
    isNpc?: boolean;
  };
  log: Array<{
    turn: number;
    actor: "you" | "them";
    dmg: number;
    your_hp: number;
    their_hp: number;
    crit?: boolean;
    miss?: boolean;
  }>;
}

const TURN_INTERVAL_MS = 90;     // tight pacing — 8 turns ≈ 720ms

function hpBar(hp: number, hpMax: number, width = 14): string {
  if (hpMax <= 0) return "▱".repeat(width);
  const filled = Math.max(0, Math.min(width, Math.round((hp / hpMax) * width)));
  return "▰".repeat(filled) + "▱".repeat(width - filled);
}

function shortHash(s?: string | null, head = 6, tail = 4): string {
  if (!s) return "—";
  if (s.length < head + tail + 3) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

export default function BattleArena({ data, autoPlay = true }: { data: BattleData; autoPlay?: boolean }) {
  const [revealed, setRevealed] = useState(autoPlay ? 0 : data.log.length);
  const [done, setDone] = useState(!autoPlay);

  useEffect(() => {
    if (!autoPlay) return;
    setRevealed(0);
    setDone(false);
    const timer = setInterval(() => {
      setRevealed(prev => {
        if (prev >= data.log.length) {
          clearInterval(timer);
          setDone(true);
          return prev;
        }
        return prev + 1;
      });
    }, TURN_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [data.log.length, data.battleId, autoPlay]);

  // Derive live HP from the last revealed turn
  const lastTurn = revealed > 0 ? data.log[revealed - 1] : null;
  const playerHpNow = lastTurn ? lastTurn.your_hp : data.player.hpMax;
  const opponentHpNow = lastTurn ? lastTurn.their_hp : data.opponent.hpMax;

  const exp = data.expGained ?? data.exp_gained ?? 0;
  const pts = data.pointsEarned ?? data.points_earned ?? 0;

  return (
    <div style={{
      maxWidth: 720, margin: "0 auto", padding: 24,
      background: "#faf7f2", color: "#1a1a2e",
      fontFamily: "'Space Grotesk', sans-serif",
    }}>
      {/* ── 1. Protocol header ── */}
      <div style={{
        padding: "14px 18px", borderRadius: 12, marginBottom: 18,
        background: "white", border: "1px solid rgba(245,158,11,0.18)",
        fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
        color: "rgba(26,26,46,0.7)", lineHeight: 1.65,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ color: "#b45309", fontWeight: 700 }}>▣ PETCLAW BATTLE</span>
          <span style={{ color: "rgba(26,26,46,0.4)" }}>· battle/v1 · {data.battleType || "pvp"}</span>
        </div>
        <div>
          <span style={{ color: "rgba(26,26,46,0.4)" }}>seed: </span>
          <span style={{ color: "#1a1a2e" }}>{shortHash(data.seed)}</span>
          {data.txHash && (
            <>
              <span style={{ color: "rgba(26,26,46,0.4)" }}> · tx: </span>
              <a href={`https://bscscan.com/tx/${data.txHash}`} target="_blank" rel="noreferrer"
                style={{ color: "#b45309", textDecoration: "none" }}>
                {shortHash(data.txHash)} ↗
              </a>
            </>
          )}
          <span style={{ color: "rgba(26,26,46,0.4)" }}> · turns: </span>
          <span style={{ color: "#1a1a2e" }}>{data.turns}</span>
        </div>
      </div>

      {/* ── 2. Versus cards ── */}
      <div className="versus-row" style={{
        display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12, alignItems: "stretch",
        marginBottom: 22,
      }}>
        <PetCard side="player" pet={data.player} hpNow={playerHpNow} isWinner={done && data.won} />
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, fontFamily: "'JetBrains Mono', monospace",
          color: "rgba(26,26,46,0.35)", fontWeight: 700, letterSpacing: "0.2em",
        }}>vs</div>
        <PetCard side="opponent" pet={data.opponent} hpNow={opponentHpNow} isWinner={done && !data.won} />
      </div>

      {/* ── 3. Turn log (typewriter) ── */}
      <div style={{
        padding: "16px 18px", borderRadius: 12, marginBottom: 18,
        background: "#0f0f1a", color: "#f8f8f8",
        fontFamily: "'JetBrains Mono', monospace", fontSize: 12, lineHeight: 1.8,
        maxHeight: 320, overflowY: "auto",
      }}>
        {data.log.slice(0, revealed).map((entry, i) => (
          <LogLine key={i} entry={entry} playerName={data.player.name} opponentName={data.opponent.name} />
        ))}
        {revealed === 0 && (
          <span style={{ color: "rgba(255,255,255,0.4)" }}>$ awaiting first turn…</span>
        )}
        {done && (
          <div style={{
            marginTop: 14, paddingTop: 14, borderTop: "1px dashed rgba(255,255,255,0.18)",
            display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
          }}>
            <span style={{ color: data.won ? "#34d399" : "#f87171", fontWeight: 700 }}>
              {data.won ? "═══ VICTORY ═══" : "═══ DEFEAT ═══"}
            </span>
            <span style={{ color: "#fbbf24" }}>+{exp} EXP</span>
            <span style={{ color: "rgba(255,255,255,0.55)" }}>+{pts} pts</span>
          </div>
        )}
      </div>

      {/* ── Actions ── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {data.battleId > 0 && (
          <ShareButton url={`/battle/${data.battleId}`} text={data.won
            ? `${data.player.name} defeated ${data.opponent.name} in ${data.turns} turns. ⚔️`
            : `${data.player.name} fell to ${data.opponent.name} after ${data.turns} turns.`} />
        )}
        {data.txHash && (
          <a href={`https://bscscan.com/tx/${data.txHash}`} target="_blank" rel="noreferrer" style={btnSecondary}>
            Verify on BscScan ↗
          </a>
        )}
        {!autoPlay && (
          <button onClick={() => { setRevealed(0); setDone(false); setTimeout(() => setRevealed(1), 50); }}
            style={btnSecondary}>
            Replay
          </button>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──

type AnyPet = BattleData["player"] | BattleData["opponent"];
function PetCard({ side, pet, hpNow, isWinner }: { side: "player" | "opponent"; pet: AnyPet; hpNow: number; isWinner: boolean }) {
  return (
    <div style={{
      padding: 14, borderRadius: 14, background: "white",
      border: isWinner ? "1.5px solid #fbbf24" : "1px solid rgba(0,0,0,0.06)",
      boxShadow: isWinner ? "0 0 40px rgba(251,191,36,0.35)" : "0 2px 6px rgba(0,0,0,0.04)",
      transition: "box-shadow 240ms ease, border-color 240ms ease",
      display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{
        aspectRatio: "1/1", borderRadius: 10, overflow: "hidden",
        background: "rgba(0,0,0,0.04)", position: "relative",
      }}>
        {pet.avatar
          ? <img src={pet.avatar} alt={pet.name}
              style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <div style={{
              width: "100%", height: "100%", display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 40,
            }}>{(pet as any).isNpc ? "👻" : "🐾"}</div>
        }
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{pet.name}</div>
      {pet.level != null && (
        <div style={{ fontSize: 10, fontFamily: "mono", color: "rgba(26,26,46,0.5)" }}>
          Lv.{pet.level}
          {pet.ownerWallet && <span> · {pet.ownerWallet}</span>}
        </div>
      )}
      {pet.stats && (
        <div style={{ fontSize: 10, fontFamily: "mono", color: "rgba(26,26,46,0.6)", display: "flex", gap: 8, marginTop: 2 }}>
          <span>ATK {pet.stats.atk}</span>
          <span>DEF {pet.stats.def}</span>
          <span>SPD {pet.stats.spd}</span>
        </div>
      )}
      <div style={{ marginTop: 6 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: side === "player" ? "#34d399" : "#f87171", letterSpacing: "0.05em" }}>
          {hpBar(hpNow, pet.hpMax, 14)}
        </div>
        <div style={{ fontSize: 10, fontFamily: "mono", color: "rgba(26,26,46,0.55)", marginTop: 2 }}>
          HP {hpNow} / {pet.hpMax}
        </div>
      </div>
    </div>
  );
}

function LogLine({ entry, playerName, opponentName }: {
  entry: BattleData["log"][number]; playerName: string; opponentName: string;
}) {
  const attacker = entry.actor === "you" ? playerName : opponentName;
  const target = entry.actor === "you" ? opponentName : playerName;
  const targetHp = entry.actor === "you" ? entry.their_hp : entry.your_hp;
  const turnNum = String(entry.turn).padStart(2, "0");
  const attackerCol = entry.actor === "you" ? "#34d399" : "#f87171";

  let damageStr;
  if (entry.miss) damageStr = <span style={{ color: "rgba(255,255,255,0.45)" }}>──miss──</span>;
  else if (entry.crit) damageStr = <span style={{ color: "#fbbf24", fontWeight: 700 }}>──CRIT {entry.dmg}▶</span>;
  else damageStr = <span style={{ color: "#fbbf24" }}>──{entry.dmg}▶</span>;

  return (
    <div style={{ whiteSpace: "pre", overflow: "hidden", textOverflow: "ellipsis" }}>
      <span style={{ color: "rgba(255,255,255,0.4)" }}>{`> turn ${turnNum}  `}</span>
      <span style={{ color: attackerCol }}>{attacker.padEnd(10).slice(0, 10)}</span>
      {"  "}
      {damageStr}
      {"  "}
      <span style={{ color: "rgba(255,255,255,0.7)" }}>{target.padEnd(10).slice(0, 10)}</span>
      {"  "}
      <span style={{ color: "rgba(255,255,255,0.5)" }}>HP {targetHp}</span>
    </div>
  );
}

function ShareButton({ url, text }: { url: string; text: string }) {
  const full = typeof window !== "undefined" ? window.location.origin + url : url;
  const onClick = () => {
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      (navigator as any).share({ url: full, text }).catch(() => {});
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(full).then(() => alert("Battle URL copied to clipboard."));
    } else {
      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(full)}`, "_blank");
    }
  };
  return <button onClick={onClick} style={btnPrimary}>Share Battle</button>;
}

const btnPrimary: React.CSSProperties = {
  padding: "10px 18px", borderRadius: 10, border: "none",
  background: "linear-gradient(135deg,#fbbf24,#f59e0b)",
  color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer",
};
const btnSecondary: React.CSSProperties = {
  padding: "10px 18px", borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)", background: "white",
  color: "#1a1a2e", fontWeight: 600, fontSize: 13, cursor: "pointer",
  textDecoration: "none", display: "inline-block",
};
