/** Owner-scoped publication and deletion controls for one caught animal. */
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enqueueMediaDeletionReference } from "@/lib/mediaDeletion";

export const runtime = "nodejs";

async function ownCatch(req: NextRequest, idRaw: string) {
  const user = await getUser(req);
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return { error: NextResponse.json({ error: "Invalid catch id" }, { status: 400 }) };
  }
  const cat = await prisma.caughtCat.findFirst({
    where: { id, owner_user_id: user.id },
  });
  if (!cat) {
    return { error: NextResponse.json({ error: "Catch not found" }, { status: 404 }) };
  }
  return { user, cat };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const own = await ownCatch(req, id);
  if ("error" in own) return own.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const mapPublic = (body as { map_public?: unknown } | null)?.map_public;
  if (typeof mapPublic !== "boolean") {
    return NextResponse.json({ error: "Send { map_public: boolean }" }, { status: 400 });
  }

  if (
    mapPublic
    && (own.cat.source !== "camera" || own.cat.lat == null || own.cat.lng == null)
  ) {
    return NextResponse.json(
      { error: "Only camera catches with a location can be shown on the map" },
      { status: 400 },
    );
  }

  const updated = await prisma.caughtCat.update({
    where: { id: own.cat.id },
    data: { map_public: mapPublic },
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

  // Queue cleanup before removing the ownership row. If the durable outbox is
  // unavailable, fail closed and leave the catch intact so a privacy deletion
  // can be retried without orphaning media. The worker is reference-aware, so
  // a later DB-delete failure cannot erase bytes that still have a live row.
  if (own.cat.source === "camera" && own.cat.photo_path) {
    try {
      await enqueueMediaDeletionReference(own.cat.photo_path, {
        ownerUserId: own.cat.owner_user_id,
        reason: "Owner deleted a caught animal",
      });
    } catch (error) {
      console.error("Catch delete: photo cleanup enqueue failed:", error);
      return NextResponse.json(
        { error: "Deletion is temporarily unavailable. Please try again." },
        { status: 503 },
      );
    }
  }

  await prisma.caughtCat.delete({ where: { id: own.cat.id } });

  return NextResponse.json({ ok: true, deleted: own.cat.id });
}
