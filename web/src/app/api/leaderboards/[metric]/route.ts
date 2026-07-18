/**
 * GET /api/leaderboards/[metric]?limit=50
 *
 * Multi-dimensional leaderboards — there is no single "winner", there are
 * six different ways to top a chart. Categories:
 *   streak   — longest active streak
 *   chats    — total chats (lifetime)
 *   memories — total memories formed
 *   creator  — total Studio generations
 *   bond     — best pet's bond_level
 *   oldest   — pet adopted earliest, still active
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { publicPetWhere } from "@/lib/publicPet";

type Metric = "streak" | "chats" | "memories" | "creator" | "bond" | "oldest";
const ALLOWED: Metric[] = ["streak", "chats", "memories", "creator", "bond", "oldest"];

const META: Record<Metric, { label: string; unit: string; emoji: string; description: string }> = {
  streak:   { label: "Streak King",      unit: "days",   emoji: "🔥", description: "Longest active mission-streak." },
  chats:    { label: "Most Talked To",   unit: "chats",  emoji: "💬", description: "Total lifetime chats with any pet." },
  memories: { label: "Memory Master",    unit: "memories", emoji: "🧠", description: "Total memories captured across all pets." },
  creator:  { label: "Top Creator",      unit: "generations", emoji: "🎬", description: "Total Studio generations." },
  bond:     { label: "Most Bonded",      unit: "bond",   emoji: "💝", description: "Highest bond across your pets — ties broken by pet level, then tenure." },
  oldest:   { label: "Day-One Trainer",  unit: "days",   emoji: "🎂", description: "Active pet adopted earliest." },
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ metric: string }> },
) {
  const { metric } = await params;
  if (!ALLOWED.includes(metric as Metric)) {
    return NextResponse.json({ error: "Unknown metric" }, { status: 400 });
  }
  const limit = Math.min(100, parseInt(req.nextUrl.searchParams.get("limit") || "50"));
  const m = metric as Metric;

  let currentUser: any = null;
  try { currentUser = await getUser(req); } catch {}

  type Row = { user_id: number; wallet: string; value: number; pet_name: string | null; pet_avatar: string | null; pet_id: number | null };
  let rows: Row[] = [];

  if (m === "streak") {
    const data = await prisma.userStreak.findMany({
      orderBy: { current_streak: "desc" },
      take: limit,
      include: { user: { include: { pets: { where: publicPetWhere(), orderBy: { level: "desc" }, take: 1 } } } },
    });
    rows = data.filter(s => s.user.pets.length > 0).map(s => ({
      user_id: s.user_id,
      wallet: s.user.wallet_address,
      value: s.current_streak,
      pet_name: s.user.pets[0]?.name || null,
      pet_avatar: s.user.pets[0]?.avatar_url || null,
      pet_id: s.user.pets[0]?.id ?? null,
    }));
  } else if (m === "chats") {
    const raw: any[] = await prisma.$queryRawUnsafe(`
      SELECT u.id AS user_id, u.wallet_address AS wallet, COUNT(*)::int AS value,
             p.name AS pet_name, p.avatar_url AS pet_avatar
        FROM users u
        JOIN pet_interactions pi ON pi.user_id = u.id AND pi.interaction_type = 'chat'
        JOIN pets ip ON ip.id = pi.pet_id
          AND ip.is_active = true
          AND (
            ip.personality_modifiers->>'consent_public_profile' = 'true'
            OR ip.personality_modifiers->'consent'->>'allowPublicProfile' = 'true'
          )
        LEFT JOIN LATERAL (
          SELECT name, avatar_url FROM pets
           WHERE user_id = u.id AND is_active = true
             AND (
               personality_modifiers->>'consent_public_profile' = 'true'
               OR personality_modifiers->'consent'->>'allowPublicProfile' = 'true'
             )
           ORDER BY level DESC LIMIT 1
        ) p ON true
       GROUP BY u.id, u.wallet_address, p.name, p.avatar_url
       ORDER BY value DESC
       LIMIT $1
    `, limit);
    rows = raw.map(r => ({ user_id: r.user_id, wallet: r.wallet, value: Number(r.value), pet_name: r.pet_name, pet_avatar: r.pet_avatar, pet_id: null }));
  } else if (m === "memories") {
    const raw: any[] = await prisma.$queryRawUnsafe(`
      SELECT u.id AS user_id, u.wallet_address AS wallet, COUNT(pm.id)::int AS value,
             p.name AS pet_name, p.avatar_url AS pet_avatar
        FROM users u
        JOIN pets p2 ON p2.user_id = u.id
          AND p2.is_active = true
          AND (
            p2.personality_modifiers->>'consent_public_profile' = 'true'
            OR p2.personality_modifiers->'consent'->>'allowPublicProfile' = 'true'
          )
        JOIN pet_memories pm ON pm.pet_id = p2.id
        LEFT JOIN LATERAL (
          SELECT name, avatar_url FROM pets
           WHERE user_id = u.id AND is_active = true
             AND (
               personality_modifiers->>'consent_public_profile' = 'true'
               OR personality_modifiers->'consent'->>'allowPublicProfile' = 'true'
             )
           ORDER BY level DESC LIMIT 1
        ) p ON true
       GROUP BY u.id, u.wallet_address, p.name, p.avatar_url
       ORDER BY value DESC
       LIMIT $1
    `, limit);
    rows = raw.map(r => ({ user_id: r.user_id, wallet: r.wallet, value: Number(r.value), pet_name: r.pet_name, pet_avatar: r.pet_avatar, pet_id: null }));
  } else if (m === "creator") {
    const raw: any[] = await prisma.$queryRawUnsafe(`
      SELECT u.id AS user_id, u.wallet_address AS wallet, COUNT(g.id)::int AS value,
             p.id AS pet_id, p.name AS pet_name, p.avatar_url AS pet_avatar
        FROM users u
        JOIN generations g ON g.user_id = u.id
        LEFT JOIN LATERAL (
          SELECT id, name, avatar_url FROM pets
           WHERE user_id = u.id AND is_active = true
             AND (
               personality_modifiers->>'consent_public_profile' = 'true'
               OR personality_modifiers->'consent'->>'allowPublicProfile' = 'true'
             )
           ORDER BY level DESC LIMIT 1
        ) p ON true
       WHERE g.status = 'completed'
         AND g.visibility = 'public'
         AND NOT EXISTS (SELECT 1 FROM pet_insights pi WHERE pi.video_generation_id = g.id)
         AND (
           g.pet_id IS NULL OR EXISTS (
             SELECT 1 FROM pets gp WHERE gp.id = g.pet_id AND gp.is_active = true
               AND (
                 gp.personality_modifiers->>'consent_public_profile' = 'true'
                 OR gp.personality_modifiers->'consent'->>'allowPublicProfile' = 'true'
               )
           )
         )
       GROUP BY u.id, u.wallet_address, p.id, p.name, p.avatar_url
       ORDER BY value DESC
       LIMIT $1
    `, limit);
    rows = raw.map(r => ({
      user_id: r.user_id, wallet: r.wallet, value: Number(r.value),
      pet_name: r.pet_name, pet_avatar: r.pet_avatar, pet_id: r.pet_id,
    }));
  } else if (m === "bond") {
    // SCRUM-103: bond_level caps at 100, so a raw bond sort ties everyone at the
    // cap (#1..#10 all show 100) with no ranking differentiation. Break ties with
    // real, differentiating signals — pet level (deeper investment), then adoption
    // tenure (earliest adopter wins) — so equal-bond users still get a stable order.
    const pets = await prisma.pet.findMany({
      where: publicPetWhere(),
      orderBy: [{ bond_level: "desc" }, { level: "desc" }, { created_at: "asc" }],
      take: limit,
      include: { user: true },
    });
    rows = pets.map(p => ({
      user_id: p.user_id, wallet: p.user.wallet_address, value: p.bond_level,
      pet_name: p.name, pet_avatar: p.avatar_url, pet_id: p.id,
    }));
  } else if (m === "oldest") {
    const pets = await prisma.pet.findMany({
      where: publicPetWhere(),
      orderBy: { created_at: "asc" },
      take: limit,
      include: { user: true },
    });
    const now = Date.now();
    rows = pets.map(p => ({
      user_id: p.user_id, wallet: p.user.wallet_address,
      value: Math.floor((now - p.created_at.getTime()) / 86400_000),
      pet_name: p.name, pet_avatar: p.avatar_url, pet_id: p.id,
    }));
  }

  const entries = rows.map((r, i) => ({
    rank: i + 1,
    wallet: `${r.wallet.slice(0, 6)}...${r.wallet.slice(-4)}`,
    isMe: currentUser?.id === r.user_id,
    value: r.value,
    pet: r.pet_name ? { id: r.pet_id, name: r.pet_name, avatar_url: r.pet_avatar } : null,
  }));

  let myRank: any = null;
  if (currentUser) {
    myRank = entries.find(e => e.isMe) || null;
  }

  return NextResponse.json({
    metric: m,
    meta: META[m],
    entries,
    myRank,
  });
}
