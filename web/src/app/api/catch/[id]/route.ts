/**
 * /api/catch/[id] — owner-scoped controls for one caught animal.
 *   PATCH  { map_public: boolean } → publish to / remove from the community
 *          map. Default is PRIVATE; this explicit per-catch opt-in is the ONLY
 *          thing that makes a catch visible on /api/catch/nearby (rounded
 *          coords). Camera catches only — wild game spawns never publish as
 *          real sightings.
 *   DELETE → hard-delete the catch row and enqueue its stored photo for
 *          reference-aware cleanup. Owner only.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enqueueMediaDeletionReference } from "@/lib/mediaDeletion";

export const runtime = "nodejs";

async function ownCatch(req: NextRequest, idRaw: string) {
  const user = await getUser(req);
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return { error: NextResponse.json({ error: "Invalid catch id" }, { status: 400 }) };
  }
  const cat = await prisma.caughtCat.findFirst({ where: { id, owner_user_id: user.id } });
  if (!cat) return { error: NextResponse.json({ error: "Catch not found" }, { status: 404 }) };
  return { user, cat };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const own = await ownCatch(req, id);
  if ("error" in own) return own.error;

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (typeof body?.map_public !== "boolean") {
    return NextResponse.json({ error: "Send { map_public: boolean }" }, { status: 400 });
  }

  // Only real camera catches can appear on the community-sightings layer, and
  // publishing needs a location to publish (rounded server-side on read).
  if (body.map_public && (own.cat.source !== "camera" || own.cat.lat == null || own.cat.lng == null)) {
    return NextResponse.json(
      { error: "Only camera catches with a location can be shown on the map" },
      { status: 400 },
    );
  }

  const updated = await prisma.caughtCat.update({
    where: { id: own.cat.id },
    data: { map_public: body.map_public },
    select: { id: true, map_public: true },
  });
  return NextResponse.json({ ok: true, id: updated.id, map_public: updated.map_public });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const own = await ownCatch(req, id);
  if ("error" in own) return own.error;

  await prisma.caughtCat.delete({ where: { id: own.cat.id } });

  // Camera catches own a stored photo — schedule it for reference-aware
  // cleanup. Wild game spawns point at shared /icons/ assets (never deleted).
  if (own.cat.source === "camera" && own.cat.photo_path) {
    try {
      await enqueueMediaDeletionReference(own.cat.photo_path, {
        ownerUserId: own.cat.owner_user_id,
        reason: "Owner deleted a caught animal",
      });
    } catch (e) {
      console.error("Catch delete: photo cleanup enqueue failed:", e);
    }
  }

  return NextResponse.json({ ok: true, deleted: own.cat.id });
}
