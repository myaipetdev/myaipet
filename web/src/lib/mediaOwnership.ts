import { prisma } from "@/lib/prisma";
import { storedFileExists } from "@/lib/storage";
import type { Prisma } from "@/generated/prisma/client";
import {
  AvatarMediaAssignmentError,
  claimRegisteredAvatarMedia,
  ownerHasRegisteredAvatarMedia,
} from "@/lib/avatarMedia";

const APP_MEDIA_ORIGINS = new Set([
  "https://app.myaipet.ai",
  "https://www.app.myaipet.ai",
]);

/** Return the canonical key only for a traversal-free first-party /uploads URL. */
export function applicationMediaKey(value: string): string | null {
  if (typeof value !== "string" || value.length > 2048 || value.includes("%") || value.includes("\\") || value.includes("?") || value.includes("#")) {
    return null;
  }
  const rawPath = value.replace(/^https?:\/\/[^/]+/i, "");
  if (/(?:^|\/)\.{1,2}(?:\/|$)/.test(rawPath)) return null;
  let pathname: string;
  if (value.startsWith("/uploads/")) {
    pathname = value;
  } else {
    try {
      const parsed = new URL(value);
      if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
      if (!APP_MEDIA_ORIGINS.has(parsed.origin.toLowerCase())) return null;
      pathname = parsed.pathname;
    } catch {
      return null;
    }
  }
  if (!pathname.startsWith("/uploads/")) return null;
  let key: string;
  try { key = decodeURIComponent(pathname.slice("/uploads/".length)); }
  catch { return null; }
  if (!key || key.length > 600 || !/^[A-Za-z0-9._/-]+$/.test(key)) return null;
  if (key.split("/").some((part) => !part || part.length > 255 || part === "." || part === "..")) return null;
  return key;
}

export function applicationMediaReferences(key: string): string[] {
  return [
    `/uploads/${key}`,
    `/api/media/${key}`,
    `https://app.myaipet.ai/uploads/${key}`,
    `https://www.app.myaipet.ai/uploads/${key}`,
    `http://app.myaipet.ai/uploads/${key}`,
  ];
}

export function isFreshOwnerUploadKey(userId: number, key: string): boolean {
  const ownerId = String(userId); // validated positive integer; regex-safe digits only
  // Deployment bridge for timestamp-key objects created before durable avatar
  // ownership rows existed. The fallback is deliberately short-lived; all new
  // UUID avatar previews require their PostgreSQL record.
  const patterns = [
    new RegExp(`^avatars/${ownerId}/([0-9]{10,17})(?:-[0-9a-f]{12})?\\.(?:jpe?g|png|webp|gif)$`),
    new RegExp(`^catches/${ownerId}-([0-9]{10,17})\\.jpg$`),
    new RegExp(`^videos/${ownerId}/([0-9]{10,17})-[0-9a-f-]{36}\\.mp4$`, "i"),
  ];
  const match = patterns.map((pattern) => pattern.exec(key)).find(Boolean);
  if (!match) return false;
  const timestamp = Number(match[1]);
  const age = Date.now() - timestamp;
  return Number.isSafeInteger(timestamp) && age >= -5 * 60_000 && age <= 24 * 60 * 60_000;
}

/**
 * Prove ownership before a DB row is allowed to reference first-party media.
 * Never count the destination Pet/UserProfile row itself: doing so would let a
 * caller claim a known victim key and then use that forged row as proof.
 */
export async function userOwnsApplicationMedia(userId: number, value: string): Promise<boolean> {
  const key = applicationMediaKey(value);
  if (!key || !Number.isInteger(userId) || userId <= 0) return false;
  const references = applicationMediaReferences(key);

  const [registeredAvatar, generation, caught] = await Promise.all([
    ownerHasRegisteredAvatarMedia(userId, value),
    prisma.generation.findFirst({
      where: {
        user_id: userId,
        OR: [{ photo_path: { in: references } }, { video_path: { in: references } }],
      },
      select: { id: true },
    }),
    prisma.caughtCat.findFirst({
      where: { owner_user_id: userId, photo_path: { in: references } },
      select: { id: true },
    }),
  ]);
  if (registeredAvatar || generation || caught) return true;

  // Bounded deployment bridge only: pre-lifecycle timestamp previews have no
  // DB row. Accept an exact recent server-issued filename and prove existence;
  // new UUID previews can never reach this fallback.
  return isFreshOwnerUploadKey(userId, key) && await storedFileExists(`/uploads/${key}`);
}

/** Assignment is stricter than serving an existing live shared reference. */
export async function userCanAssignApplicationMedia(userId: number, value: string): Promise<boolean> {
  const key = applicationMediaKey(value);
  if (!key || !Number.isInteger(userId) || userId <= 0) return false;
  const pendingDeletion = await prisma.mediaDeletionTask.findFirst({
    where: { object_ref: { in: applicationMediaReferences(key) } },
    select: { id: true },
  });
  if (pendingDeletion) return false;
  return userOwnsApplicationMedia(userId, value);
}

/**
 * Re-prove and, for pending avatar previews, claim ownership in the same
 * transaction as the destination Pet write. This closes cleanup-vs-PATCH and
 * double-claim races that a preflight-only check cannot close.
 */
export async function claimOrVerifyApplicationMediaForPet(
  tx: Prisma.TransactionClient,
  userId: number,
  petId: number,
  value: string,
): Promise<void> {
  const key = applicationMediaKey(value);
  if (!key || !Number.isSafeInteger(userId) || userId <= 0
    || !Number.isSafeInteger(petId) || petId <= 0) {
    throw new AvatarMediaAssignmentError();
  }
  const references = applicationMediaReferences(key);
  const pendingDeletion = await tx.mediaDeletionTask.findFirst({
    where: { object_ref: { in: references } },
    select: { id: true },
  });
  if (pendingDeletion) {
    throw new AvatarMediaAssignmentError("Avatar media is already pending deletion");
  }

  if (await claimRegisteredAvatarMedia(tx, userId, petId, value)) return;

  const [generation, caught] = await Promise.all([
    tx.generation.findFirst({
      where: {
        user_id: userId,
        OR: [{ photo_path: { in: references } }, { video_path: { in: references } }],
      },
      select: { id: true },
    }),
    tx.caughtCat.findFirst({
      where: { owner_user_id: userId, photo_path: { in: references } },
      select: { id: true },
    }),
  ]);
  if (generation || caught) return;

  // At most 24 hours of deployment overlap: timestamp-key previews created by
  // the previous release have no lifecycle row. UUID keys never use this path.
  if (isFreshOwnerUploadKey(userId, key) && await storedFileExists(`/uploads/${key}`)) return;
  throw new AvatarMediaAssignmentError();
}

export { AvatarMediaAssignmentError };
