import { prisma } from "@/lib/prisma";
import { applicationMediaKey } from "@/lib/mediaOwnership";

export interface MediaDeletionOwnership {
  ownerUserId?: number | null;
  sourcePetId?: number | null;
  reason?: string;
  notBefore?: Date;
}

/**
 * Durably schedule a newly-persisted application object for reference-aware
 * cleanup. The worker re-checks every live owner before deleting bytes, so it
 * is safe to enqueue a deterministic/shared path after a lost DB-finalize race.
 */
export async function enqueueMediaDeletionReference(
  value: string,
  ownership: MediaDeletionOwnership = {},
): Promise<string> {
  const key = applicationMediaKey(value);
  if (!key) throw new Error("Cannot enqueue an invalid application media reference");
  const objectRef = `/uploads/${key}`;
  const ownerUserId = Number.isInteger(ownership.ownerUserId) && Number(ownership.ownerUserId) > 0
    ? Number(ownership.ownerUserId)
    : 0;
  const sourcePetId = Number.isInteger(ownership.sourcePetId) && Number(ownership.sourcePetId) > 0
    ? Number(ownership.sourcePetId)
    : 0;
  const reason = String(ownership.reason || "Awaiting reference-aware media cleanup").slice(0, 500);
  const notBefore = ownership.notBefore instanceof Date && !Number.isNaN(ownership.notBefore.getTime())
    ? ownership.notBefore
    : new Date();

  await prisma.mediaDeletionTask.upsert({
    where: { object_ref: objectRef },
    create: {
      object_ref: objectRef,
      owner_user_id: ownerUserId,
      source_pet_id: sourcePetId,
      last_error: reason,
      updated_at: notBefore,
    },
    update: {
      ...(ownerUserId > 0 ? { owner_user_id: ownerUserId } : {}),
      ...(sourcePetId > 0 ? { source_pet_id: sourcePetId } : {}),
      last_error: reason,
      updated_at: notBefore,
    },
  });
  return objectRef;
}
