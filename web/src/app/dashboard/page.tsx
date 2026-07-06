/**
 * Power Leaderboard — public, server-rendered.
 *
 * Ranks pets by combined power. Recognition only — season points are a
 * non-financial loyalty score (no token, no payout, no weekly distribution).
 * Owners come here to see where they rank.
 *
 * Tone: Collectible Editorial — paper/ink/terracotta, var(--ed-*) fonts.
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
  description: "Top pets ranked by combined ATK+DEF+SPD. Raise your pet to climb the ranks — recognition standing for Season 1.",
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

// Season standing strip — REAL numbers only: active-pet count from the DB and
// the actual Season 1 close date. There is no prize pool and no weekly
// distribution — standing is non-financial recognition, frozen at season close.
async function loadSeasonStrip(): Promise<{ entries: number }> {
  const entries = await prisma.pet.count({ where: { is_active: true } });
  return { entries };
}

const PODIUM_COLOR: Record<number, string> = {
  1: "#C8932F",   // legend gold (editorial rarity ramp)
  2: "#7A6E5A",   // muted (silver)
  3: "#9A4E1E",   // terracotta-deep (bronze)
};

const MONO = "var(--ed-m, ui-monospace, monospace)";
const DISP = "var(--ed-disp, ui-sans-serif, sans-serif)";
const BODY = "var(--ed-body, ui-sans-serif, sans-serif)";
const INK = "#211A12";
const HAIR = "rgba(33,26,18,.13)";

export default async function DashboardPage() {
  const [leaderboard, strip] = await Promise.all([
    loadLeaderboard(),
    loadSeasonStrip(),
  ]);

  return (
    <main style={{
      minHeight: "100vh",
      background: "#ECE4D4",
      paddingTop: 40, paddingBottom: 80,
      fontFamily: BODY, color: INK,
    }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 20px" }}>
        <a href="/" style={{ display: "inline-block", marginBottom: 20, fontSize: 13, color: "#7A6E5A", textDecoration: "none", fontFamily: BODY }}>
          ← Back to MY AI PET
        </a>

        {/* Hero */}
        <div style={{ marginBottom: 30 }}>
          <span style={{
            display: "inline-block", padding: "5px 14px", borderRadius: 999,
            background: "rgba(190,79,40,0.10)", color: "#9A4E1E",
            fontSize: 13, fontWeight: 700, letterSpacing: "0.16em",
            textTransform: "uppercase", marginBottom: 12,
            fontFamily: MONO,
          }}>POWER LEADERBOARD · SEASON 1</span>
          <h1 style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.03em", margin: "0 0 8px", lineHeight: 1.1, fontFamily: DISP }}>
            Climb the ranks.
          </h1>
          <p style={{ fontSize: 16, color: "#5C5140", lineHeight: 1.6, maxWidth: 580, fontFamily: BODY }}>
            Raise your pet — combined power decides ranking. Standing is recognized
            when Season 1 closes: non-transferable recognition, no cash value.
          </p>
        </div>

        {/* Season strip — real numbers only */}
        <div style={{
          padding: "18px 22px", borderRadius: 16, marginBottom: 28,
          background: "#1E1710", color: "#FBF6EC",
          display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap",
        }}>
          <div>
            <div style={{
              fontSize: 13, color: "rgba(251,246,236,0.55)", letterSpacing: "0.12em",
              fontFamily: MONO, marginBottom: 4,
            }}>RAISING NOW</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: "#E8C77E", fontFamily: MONO }}>
              {strip.entries.toLocaleString()} <span style={{ fontSize: 16, color: "rgba(251,246,236,0.6)" }}>pets</span>
            </div>
          </div>
          <div style={{ width: 1, height: 40, background: "rgba(251,246,236,0.15)" }} />
          <div>
            <div style={{
              fontSize: 13, color: "rgba(251,246,236,0.55)", letterSpacing: "0.12em",
              fontFamily: MONO, marginBottom: 4,
            }}>SEASON 1 CLOSES</div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: MONO }}>
              Aug 1 · 00:00 UTC
            </div>
          </div>
          <div style={{ width: 1, height: 40, background: "rgba(251,246,236,0.15)" }} />
          <div style={{ fontSize: 13, fontFamily: MONO, color: "rgba(251,246,236,0.65)", maxWidth: 260, lineHeight: 1.5 }}>
            Final standings are frozen at close — recognition only, no token, no payout.
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
                  background: "#FBF6EC", border: `2px solid ${color}`,
                  boxShadow: "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                  textDecoration: "none", color: INK,
                }}>
                  <div style={{ fontSize: 26, fontFamily: MONO, fontWeight: 800, color }}>
                    #{visualRank}
                  </div>
                  <div style={{
                    width: 64, height: 64, borderRadius: 12, overflow: "hidden",
                    background: "#F5EFE2", marginBottom: 2,
                  }}>
                    {p.avatarUrl ? (
                      <img src={p.avatarUrl} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}><Icon name="paw" size={32} /></div>
                    )}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, textAlign: "center", fontFamily: DISP }}>{p.name}</div>
                  <div style={{ fontSize: 13, fontFamily: MONO, color: "#7A6E5A" }}>Lv.{p.level}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#9A4E1E", fontFamily: MONO }}>
                    {p.combinedPower}
                  </div>
                  <div style={{ fontSize: 13, color: "#9A7B4E", letterSpacing: "0.1em", fontFamily: MONO }}>POWER</div>
                </a>
              );
            })}
          </div>
        )}

        {/* Full list */}
        <DashboardList rows={leaderboard.slice(3)} />

        {/* Help — how to climb (real grant values only) */}
        <div style={{
          marginTop: 30, padding: 18, borderRadius: 12,
          background: "#F5EFE2", border: `1px solid ${HAIR}`,
          fontSize: 13, color: "#5C5140", lineHeight: 1.65, fontFamily: BODY,
        }}>
          <strong style={{ fontFamily: MONO, color: "#9A4E1E" }}>HOW TO CLIMB ↑</strong><br />
          Season points are gained free — care <strong>+5</strong>, image <strong>+10</strong>, video <strong>+20</strong>,
          level-up <strong>+50</strong> — and rank you for Season 1. Show up daily: a 7-day care streak marks a milestone
          in your pet&apos;s story. Points are non-financial recognition — no token, no cash value, no redemption.
        </div>
      </div>
    </main>
  );
}
