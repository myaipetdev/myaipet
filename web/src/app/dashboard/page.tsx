/**
 * Power Leaderboard — public, server-rendered.
 *
 * Ranks pets by combined power. Top-100 earn weekly Season Rewards points
 * (off-chain loyalty — no token, no USDT payout). Owners come here to see
 * where they rank.
 *
 * Tone: PetClaw protocol — cream background, amber accents, monospace
 * for rank + power numbers. Matches /architecture, /skills.
 */

import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import DashboardList from "@/components/DashboardList";
import Icon from "@/components/Icon";

// DB-backed: never prerender at build time (no DB connection there)
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Power Leaderboard — MY AI PET",
  description: "Top pets ranked by combined ATK+DEF+SPD. Raise your pet to climb the ranks and earn weekly Season Rewards points.",
};

interface LeaderEntry {
  rank: number;
  petId: number;
  name: string;
  level: number;
  evolutionStage: number;
  atk: number;
  def: number;
  spd: number;
  combinedPower: number;
  avatarUrl: string | null;
  ownerWallet: string;
  totalInteractions: number;
  careStreak: number;
}

async function loadLeaderboard(): Promise<LeaderEntry[]> {
  const rows = await prisma.$queryRaw<Array<any>>`
    SELECT
      p.id, p.name, p.level, p.evolution_stage,
      p.atk, p.def, p.spd, (p.atk + p.def + p.spd) AS combined_power,
      p.avatar_url, p.total_interactions, p.care_streak,
      u.wallet_address
    FROM pets p
    JOIN users u ON u.id = p.user_id
    WHERE p.is_active = true
    ORDER BY combined_power DESC, p.level DESC, p.total_interactions DESC
    LIMIT 100
  `;
  return rows.map((r, i) => ({
    rank: i + 1,
    petId: r.id,
    name: r.name,
    level: r.level,
    evolutionStage: r.evolution_stage,
    atk: r.atk,
    def: r.def,
    spd: r.spd,
    combinedPower: Number(r.combined_power),
    avatarUrl: r.avatar_url,
    ownerWallet: `${r.wallet_address.slice(0, 6)}…${r.wallet_address.slice(-4)}`,
    totalInteractions: r.total_interactions,
    careStreak: r.care_streak,
  }));
}

// Weekly Season Rewards pool — a FIXED off-chain points allocation split among
// the Top-100 by rank. Not proportional to anyone's USDT spend (avoids any
// pay-to-share-the-pool framing) and not a token/USDT payout.
const SEASON_POOL_POINTS = 100_000;

async function loadWeeklyPool(): Promise<{ poolPoints: number; entries: number; closesAt: string }> {
  const entries = await prisma.pet.count({ where: { is_active: true } });
  // Pool closes at next Sunday 00:00 UTC
  const closes = new Date();
  closes.setUTCDate(closes.getUTCDate() + ((7 - closes.getUTCDay()) % 7));
  closes.setUTCHours(0, 0, 0, 0);
  return {
    poolPoints: SEASON_POOL_POINTS,
    entries,
    closesAt: closes.toISOString(),
  };
}

const PODIUM_COLOR: Record<number, string> = {
  1: "#fbbf24",   // gold
  2: "#9ca3af",   // silver
  3: "#cd7f32",   // bronze
};

export default async function DashboardPage() {
  const [leaderboard, pool] = await Promise.all([
    loadLeaderboard(),
    loadWeeklyPool(),
  ]);

  return (
    <main style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #faf7f2 0%, #fff8eb 50%, #faf7f2 100%)",
      paddingTop: 40, paddingBottom: 80,
      fontFamily: "'Space Grotesk', sans-serif", color: "#1a1a2e",
    }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 20px" }}>
        <a href="/" style={{ display: "inline-block", marginBottom: 20, fontSize: 13, color: "rgba(26,26,46,0.55)", textDecoration: "none" }}>
          ← Back to MY AI PET
        </a>

        {/* Hero */}
        <div style={{ marginBottom: 30 }}>
          <span style={{
            display: "inline-block", padding: "5px 14px", borderRadius: 999,
            background: "rgba(245,158,11,0.12)", color: "#b45309",
            fontSize: 11, fontWeight: 700, letterSpacing: "0.16em",
            textTransform: "uppercase", marginBottom: 12,
            fontFamily: "'JetBrains Mono', monospace",
          }}>POWER LEADERBOARD · SEASON REWARDS</span>
          <h1 style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.03em", margin: "0 0 8px", lineHeight: 1.1 }}>
            Climb the ranks.
          </h1>
          <p style={{ fontSize: 16, color: "rgba(26,26,46,0.65)", lineHeight: 1.6, maxWidth: 580 }}>
            Raise your pet — combined power decides ranking.
            Top-100 earn Season Rewards points every Sunday.
          </p>
        </div>

        {/* Pool widget */}
        <div style={{
          padding: "18px 22px", borderRadius: 16, marginBottom: 28,
          background: "#0f0f1a", color: "white",
          display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap",
        }}>
          <div>
            <div style={{
              fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: "0.12em",
              fontFamily: "'JetBrains Mono', monospace", marginBottom: 4,
            }}>WEEKLY SEASON REWARDS POOL</div>
            <div style={{
              fontSize: 32, fontWeight: 800, color: "#fbbf24",
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {pool.poolPoints.toLocaleString()} <span style={{ fontSize: 16, color: "rgba(255,255,255,0.6)" }}>pts</span>
            </div>
          </div>
          <div style={{ width: 1, height: 40, background: "rgba(255,255,255,0.15)" }} />
          <div>
            <div style={{
              fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: "0.12em",
              fontFamily: "'JetBrains Mono', monospace", marginBottom: 4,
            }}>ENTRIES</div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
              {pool.entries}
            </div>
          </div>
          <div style={{ width: 1, height: 40, background: "rgba(255,255,255,0.15)" }} />
          <div>
            <div style={{
              fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: "0.12em",
              fontFamily: "'JetBrains Mono', monospace", marginBottom: 4,
            }}>CLOSES</div>
            <div style={{ fontSize: 14, fontFamily: "'JetBrains Mono', monospace", color: "rgba(255,255,255,0.85)" }}>
              {new Date(pool.closesAt).toUTCString().slice(0, 17)} UTC
            </div>
          </div>
        </div>

        {/* Top-3 podium */}
        {leaderboard.length >= 3 && (
          <div className="podium-row" style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 26,
          }}>
            {[leaderboard[1], leaderboard[0], leaderboard[2]].map((p, idx) => {
              const visualRank = idx === 0 ? 2 : idx === 1 ? 1 : 3;
              const color = PODIUM_COLOR[visualRank];
              const heightOffset = idx === 1 ? 0 : 14;
              return (
                <a key={p.petId} href={`/p/${p.petId}`} style={{
                  marginTop: heightOffset,
                  padding: 18, borderRadius: 14,
                  background: "white", border: `2px solid ${color}`,
                  boxShadow: `0 0 30px ${color}40`,
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                  textDecoration: "none", color: "#1a1a2e",
                }}>
                  <div style={{ fontSize: 26, fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, color }}>
                    #{visualRank}
                  </div>
                  <div style={{
                    width: 64, height: 64, borderRadius: 12, overflow: "hidden",
                    background: "rgba(0,0,0,0.04)", marginBottom: 2,
                  }}>
                    {p.avatarUrl ? (
                      <img src={p.avatarUrl} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}><Icon name="paw" size={32} /></div>
                    )}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, textAlign: "center" }}>{p.name}</div>
                  <div style={{ fontSize: 11, fontFamily: "mono", color: "rgba(26,26,46,0.5)" }}>Lv.{p.level}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#b45309", fontFamily: "'JetBrains Mono', monospace" }}>
                    {p.combinedPower}
                  </div>
                  <div style={{ fontSize: 9, color: "rgba(26,26,46,0.4)", letterSpacing: "0.1em" }}>POWER</div>
                </a>
              );
            })}
          </div>
        )}

        {/* Full list */}
        <DashboardList rows={leaderboard.slice(3)} />

        {/* Help — what to spend to climb */}
        <div style={{
          marginTop: 30, padding: 18, borderRadius: 12,
          background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)",
          fontSize: 12, color: "rgba(26,26,46,0.7)", lineHeight: 1.65,
        }}>
          <strong style={{ fontFamily: "'JetBrains Mono', monospace", color: "#b45309" }}>HOW TO CLIMB ↑</strong><br />
          Season Rewards points are earned free — care <strong>+5</strong>, create <strong>+10</strong>, evolve <strong>+200</strong> —
          and rank you for Season 1. Show up daily: a 7-day care streak earns a Memory NFT (mints at on-chain go-live).
        </div>
      </div>
    </main>
  );
}
