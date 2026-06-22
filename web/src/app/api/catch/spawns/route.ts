/**
 * /api/catch/spawns — Wild Encounters (game spawns, "track 2").
 *   GET  ?lat&lng → the deterministic spawn set near you this hour, each flagged
 *                   with whether you've already caught it.
 *   POST { id, lat, lng } → catch a spawn. The server RE-DERIVES the spawn set
 *                   from (lat,lng,period) and rejects any id that isn't really
 *                   there, so a client can't fabricate a catch.
 *
 * These are game creatures, not real animals — no camera / vision involved.
 */
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { rollStats, rarityMeta } from "@/lib/catch/game";
import { spawnsFor, findSpawn, currentPeriod, withSpawnMeta, WILD_POINTS } from "@/lib/catch/spawns";
import { awardPointsCapped, DAILY_POINT_CAPS } from "@/lib/seasonRewards";

export const runtime = "nodejs";

function parseLatLng(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const lat = parseLatLng(req.nextUrl.searchParams.get("lat"));
  const lng = parseLatLng(req.nextUrl.searchParams.get("lng"));
  if (lat == null || lng == null) return NextResponse.json({ spawns: [], needGeo: true });

  const period = currentPeriod(Date.now());
  const spawns = spawnsFor(lat, lng, period);
  const caught = await prisma.caughtCat.findMany({
    where: { owner_user_id: user.id, spawn_key: { in: spawns.map((s) => s.id) } },
    select: { spawn_key: true },
  });
  const caughtSet = new Set(caught.map((c) => c.spawn_key));
  return NextResponse.json({
    period,
    spawns: spawns.map((s) => ({ ...withSpawnMeta(s), caught: caughtSet.has(s.id) })),
  });
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { key: "wild-catch", limit: 60, windowMs: 60 * 60_000 });
  if (!rl.ok) return rl.response;

  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const id = String(body?.id || "");
  const lat = typeof body?.lat === "number" ? body.lat : null;
  const lng = typeof body?.lng === "number" ? body.lng : null;
  if (!id || lat == null || lng == null) return NextResponse.json({ error: "id, lat, lng required" }, { status: 400 });

  // Anti-cheat: the spawn must actually exist in the caller's current cell+period.
  const period = currentPeriod(Date.now());
  const spawn = findSpawn(lat, lng, period, id);
  if (!spawn) return NextResponse.json({ caught: false, reason: "That spawn isn't here anymore — it may have moved or rotated. Refresh the map." }, { status: 200 });

  const stats = rollStats(spawn.rarity);
  let cat;
  try {
    cat = await prisma.caughtCat.create({
      data: {
        owner_user_id: user.id,
        kind: spawn.kind,
        name: spawn.name,
        breed: spawn.species,
        rarity: spawn.rarity,
        element: spawn.element,
        hp: stats.hp, atk: stats.atk, def: stats.def, spd: stats.spd,
        photo_path: `/icons/${spawn.kind}.png`, // game creature → 3D icon, not a real photo
        lat: spawn.lat, lng: spawn.lng,
        source: "wild",
        spawn_key: id,
      },
    });
  } catch (e: any) {
    // Unique (owner_user_id, spawn_key) → already caught this spawn.
    if (e?.code === "P2002") return NextResponse.json({ caught: false, alreadyCaught: true, reason: "You already caught this one." }, { status: 200 });
    throw e;
  }

  const pts = await awardPointsCapped(user.id, "wild_catch", WILD_POINTS[spawn.rarity], DAILY_POINT_CAPS.wild_catch);
  const m = rarityMeta(spawn.rarity);
  return NextResponse.json({
    caught: true,
    cat: { ...cat, rarityLabel: m.label, rarityColor: m.color },
    pointsAwarded: pts.points || 0,
  });
}
