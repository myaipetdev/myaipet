/**
 * GET /api/catch/nearby?lat=&lng= — recent catches near a point, for the map.
 * CONSENT-GATED: only rows the owner explicitly opted in (map_public=true) are
 * ever returned — catches are private by default, and browser geolocation
 * permission is not publication consent. Coordinates are rounded (~110m)
 * before returning so exact locations aren't exposed. Falls back to recent
 * global (opted-in) catches when no point is given.
 */
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rarityMeta } from "@/lib/catch/game";

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const latParam = req.nextUrl.searchParams.get("lat");
  const lngParam = req.nextUrl.searchParams.get("lng");
  if ((latParam === null) !== (lngParam === null)) {
    return NextResponse.json({ error: "Send both lat and lng, or neither" }, { status: 400 });
  }
  const hasPoint = latParam !== null && lngParam !== null;
  const lat = hasPoint ? Number(latParam) : Number.NaN;
  const lng = hasPoint ? Number(lngParam) : Number.NaN;
  if (
    hasPoint
    && (
      !Number.isFinite(lat)
      || !Number.isFinite(lng)
      || lat < -90
      || lat > 90
      || lng < -180
      || lng > 180
    )
  ) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }
  const D = 0.25; // ~27km bounding box

  // Only REAL camera catches on this layer — wild game spawns have their own
  // (clearly-labelled) layer, so they must not masquerade as real sightings.
  // And ONLY rows the owner opted onto the map (map_public=true): existing
  // catches default to false, so the map honestly shows nothing until owners
  // opt in per catch.
  const where = hasPoint
    ? { source: "camera", map_public: true, lat: { gte: lat - D, lte: lat + D }, lng: { gte: lng - D, lte: lng + D } }
    : { source: "camera", map_public: true, lat: { not: null } };

  const rows = await prisma.caughtCat.findMany({
    where: where as any,
    orderBy: { caught_at: "desc" },
    take: 80,
    select: { id: true, kind: true, name: true, breed: true, rarity: true, element: true, photo_path: true, lat: true, lng: true, caught_at: true },
  });

  const catches = rows
    .filter((r) => r.lat != null && r.lng != null)
    .map((r) => {
      const m = rarityMeta(r.rarity);
      return {
        id: r.id, kind: r.kind, name: r.name, breed: r.breed, element: r.element,
        rarity: r.rarity, rarityLabel: m.label, rarityColor: m.color,
        photo_path: r.photo_path, lat: round3(r.lat as number), lng: round3(r.lng as number),
      };
    });

  return NextResponse.json({ catches });
}
