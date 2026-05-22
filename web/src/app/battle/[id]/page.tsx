/**
 * Shareable battle result page — server-rendered for OG embeds + SEO.
 * URL: /battle/[id]
 *
 * Public (no auth). Replays the battle via BattleArena from the stored log.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BattleArena, { type BattleData } from "@/components/BattleArena";
import { prisma } from "@/lib/prisma";

// DB-backed dynamic page
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getBattle(id: number): Promise<BattleData | null> {
  const battle = await prisma.battleHistory.findUnique({
    where: { id },
  });
  if (!battle) return null;

  const playerPet = await prisma.pet.findUnique({
    where: { id: battle.player_pet_id },
    include: { user: { select: { wallet_address: true } } },
  });
  const opponentPet = battle.opponent_pet_id ? await prisma.pet.findUnique({
    where: { id: battle.opponent_pet_id },
    include: { user: { select: { wallet_address: true } } },
  }) : null;

  const shortWallet = (w?: string | null) =>
    w ? `${w.slice(0, 6)}…${w.slice(-4)}` : null;

  return {
    battleId: battle.id,
    seed: battle.seed,
    txHash: battle.tx_hash,
    battleType: battle.battle_type,
    won: battle.won,
    turns: battle.turns,
    expGained: battle.exp_gained,
    pointsEarned: battle.points_earned,
    player: {
      petId: battle.player_pet_id,
      name: playerPet?.name || "Pet",
      avatar: battle.player_avatar || playerPet?.avatar_url || null,
      level: playerPet?.level || 1,
      stats: playerPet ? { atk: playerPet.atk, def: playerPet.def, spd: playerPet.spd } : null,
      hpLeft: battle.player_hp_left,
      hpMax: battle.player_hp_max,
      ownerWallet: shortWallet(playerPet?.user?.wallet_address),
    },
    opponent: {
      petId: battle.opponent_pet_id,
      name: battle.opponent_name,
      avatar: battle.opponent_avatar || opponentPet?.avatar_url || null,
      level: opponentPet?.level || null,
      stats: opponentPet ? { atk: opponentPet.atk, def: opponentPet.def, spd: opponentPet.spd } : null,
      hpLeft: 0,
      hpMax: battle.opponent_hp_max,
      ownerWallet: shortWallet(opponentPet?.user?.wallet_address),
      isNpc: battle.opponent_pet_id == null,
    },
    log: (battle.battle_log as any) || [],
  };
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  const battle = await getBattle(Number(id)).catch(() => null);
  if (!battle) return { title: "Battle not found — MY AI PET" };
  const verb = battle.won ? "defeated" : "fell to";
  const title = `${battle.player.name} ${verb} ${battle.opponent.name} — MY AI PET`;
  const desc = `${battle.turns} turns · ${battle.expGained || 0} EXP · deterministic on-chain verifiable battle.`;
  return {
    title, description: desc,
    openGraph: { title, description: desc, type: "article" },
    twitter: { card: "summary_large_image", title, description: desc },
  };
}

export default async function BattlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const battle = await getBattle(Number(id));
  if (!battle) notFound();

  return (
    <main style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #faf7f2 0%, #fff8eb 60%, #faf7f2 100%)",
      paddingTop: 40, paddingBottom: 80,
      fontFamily: "'Space Grotesk', sans-serif",
    }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 20px 18px" }}>
        <a href="/" style={{ fontSize: 12, color: "rgba(26,26,46,0.55)", textDecoration: "none" }}>
          ← Back to MY AI PET
        </a>
      </div>
      <BattleArena data={battle} autoPlay={true} />
      <div style={{
        maxWidth: 720, margin: "32px auto 0", padding: "16px 20px",
        fontSize: 12, color: "rgba(26,26,46,0.5)", textAlign: "center",
        fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.7,
      }}>
        Deterministic combat — same seed always yields the same outcome.<br />
        Verify the seed at <a href={`/api/battle/${battle.battleId}`}
          style={{ color: "#b45309", textDecoration: "none" }}>/api/battle/{battle.battleId}</a>
      </div>
    </main>
  );
}
