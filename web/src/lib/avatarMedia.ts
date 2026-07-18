import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  deleteStoredFile,
  downloadRemoteMediaForStorage,
  storageKey,
  StorageCapacityError,
  uploadFile,
  type UploadResult,
} from "@/lib/storage";

const DEFAULT_PREVIEW_TTL_HOURS = 24;
const MAX_PREVIEW_TTL_HOURS = 168;
const UUID_SOURCE = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

export interface AvatarMediaSqlClient {
  $queryRaw<T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number>;
}

export class AvatarMediaAssignmentError extends Error {
  readonly status = 403;
  readonly code = "avatar_media_not_assignable";

  constructor(message = "Avatar media is not assignable to this pet") {
    super(message);
    this.name = "AvatarMediaAssignmentError";
  }
}

function previewTtlMs(): number {
  const configured = Number(process.env.AVATAR_PREVIEW_TTL_HOURS);
  const hours = Number.isSafeInteger(configured) && configured > 0
    ? Math.min(configured, MAX_PREVIEW_TTL_HOURS)
    : DEFAULT_PREVIEW_TTL_HOURS;
  return hours * 60 * 60_000;
}

export function canonicalAvatarMediaRef(value: string): string | null {
  const key = storageKey(value);
  if (!key || !key.startsWith("avatars/")) return null;
  return `/uploads/${key}`;
}

export function newAvatarFilename(
  ownerUserId: number,
  extension: "jpg" | "png" | "webp" | "gif",
): string {
  if (!Number.isSafeInteger(ownerUserId) || ownerUserId <= 0) {
    throw new Error("Invalid avatar media owner");
  }
  return `avatars/${ownerUserId}/${randomUUID()}.${extension}`;
}

function stagedFilenameIdentity(ownerUserId: number, filename: string): string {
  const match = new RegExp(
    `^avatars/${ownerUserId}/(${UUID_SOURCE})\\.(?:jpg|png|webp|gif)$`,
  ).exec(filename);
  if (!match) throw new Error("Avatar preview filename is not a server-issued UUID key");
  return match[1];
}

export async function enqueueFailedPendingAvatarMedia(
  id: string,
  objectRef: string,
  ownerUserId: number,
  db: AvatarMediaSqlClient = prisma,
): Promise<void> {
  // One statement guarantees that lifecycle metadata disappears only when the
  // durable outbox row exists. If PostgreSQL is unavailable, the pending row is
  // intentionally left behind for the normal TTL sweep.
  await db.$executeRaw`
    WITH "pending" AS MATERIALIZED (
      SELECT "id", "object_ref", "owner_user_id"
      FROM "avatar_media_objects"
      WHERE "id" = CAST(${id} AS uuid)
        AND "object_ref" = ${objectRef}
        AND "owner_user_id" = ${ownerUserId}
        AND "pet_id" IS NULL
      FOR UPDATE
    ),
    "queued" AS (
      INSERT INTO "media_deletion_tasks"
        ("object_ref", "owner_user_id", "source_pet_id", "last_error", "created_at", "updated_at")
      SELECT
        "object_ref", "owner_user_id", 0,
        'Avatar storage write did not complete cleanly', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM "pending"
      ON CONFLICT ("object_ref") DO UPDATE
        SET "last_error" = EXCLUDED."last_error",
            "updated_at" = CURRENT_TIMESTAMP
      RETURNING "object_ref"
    )
    DELETE FROM "avatar_media_objects" AS a
    USING "pending" AS p
    WHERE a."id" = p."id"
      AND EXISTS (SELECT 1 FROM "queued" AS q WHERE q."object_ref" = p."object_ref")
  `;
}

/**
 * Insert durable ownership before writing bytes. A crash before the write leaves
 * a harmless row whose TTL worker performs an idempotent delete; a crash after
 * the write leaves a tracked object instead of an uncollectable orphan.
 */
export async function persistPendingAvatarMedia(input: {
  ownerUserId: number;
  filename: string;
  data: Buffer;
  contentType: string;
}): Promise<UploadResult> {
  const { ownerUserId, filename, data, contentType } = input;
  const id = stagedFilenameIdentity(ownerUserId, filename);
  const objectRef = canonicalAvatarMediaRef(`/uploads/${filename}`);
  if (!objectRef) throw new Error("Invalid avatar media reference");
  const expiresAt = new Date(Date.now() + previewTtlMs());

  await prisma.$executeRaw`
    INSERT INTO "avatar_media_objects"
      ("id", "object_ref", "owner_user_id", "expires_at", "created_at", "updated_at")
    VALUES
      (CAST(${id} AS uuid), ${objectRef}, ${ownerUserId}, ${expiresAt}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `;

  let lastUploadError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await uploadFile(filename, data, contentType);
      if (canonicalAvatarMediaRef(result.url) !== objectRef) {
        await deleteStoredFile(result.url).catch(() => undefined);
        throw new Error("Storage returned a mismatched avatar media key");
      }
      return result;
    } catch (error) {
      lastUploadError = error;
      if (error instanceof StorageCapacityError || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  // A timed-out S3 PUT can have committed bytes even though uploadFile threw.
  // Never discard the only ownership record without first creating a durable
  // deletion task. If this conversion fails, the pending TTL row remains.
  await enqueueFailedPendingAvatarMedia(id, objectRef, ownerUserId).catch(() => undefined);
  throw lastUploadError instanceof Error ? lastUploadError : new Error("Avatar storage write failed");
}

/** Persist a provider avatar as a tracked pending preview. */
export async function persistRemoteAvatarPreview(
  providerUrl: string,
  ownerUserId: number,
): Promise<string> {
  let media: Awaited<ReturnType<typeof downloadRemoteMediaForStorage>> | undefined;
  let lastDownloadError: unknown;
  for (let attempt = 0; attempt < 3 && !media; attempt++) {
    try {
      media = await downloadRemoteMediaForStorage(providerUrl, "image");
    } catch (error) {
      lastDownloadError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  if (!media) {
    throw lastDownloadError instanceof Error
      ? lastDownloadError
      : new Error("Avatar provider media download failed");
  }
  const filename = newAvatarFilename(ownerUserId, media.extension as "jpg" | "png" | "webp" | "gif");
  const result = await persistPendingAvatarMedia({
    ownerUserId,
    filename,
    data: media.buffer,
    contentType: media.contentType,
  });
  return result.url;
}

export async function ownerHasRegisteredAvatarMedia(
  ownerUserId: number,
  value: string,
  db: AvatarMediaSqlClient = prisma,
): Promise<boolean> {
  const objectRef = canonicalAvatarMediaRef(value);
  if (!objectRef || !Number.isSafeInteger(ownerUserId) || ownerUserId <= 0) return false;
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT "id"::text AS "id"
    FROM "avatar_media_objects"
    WHERE "object_ref" = ${objectRef}
      AND "owner_user_id" = ${ownerUserId}
      AND ("pet_id" IS NOT NULL OR "expires_at" > CURRENT_TIMESTAMP)
    LIMIT 1
  `;
  return rows.length === 1;
}

/**
 * Lock and claim a registered preview. Returns false for non-preview media so
 * the caller may prove ownership through Generation/CaughtCat instead.
 */
export async function claimRegisteredAvatarMedia(
  tx: Prisma.TransactionClient | AvatarMediaSqlClient,
  ownerUserId: number,
  petId: number,
  value: string,
): Promise<boolean> {
  const objectRef = canonicalAvatarMediaRef(value);
  if (!objectRef) return false;
  const rows = await (tx as AvatarMediaSqlClient).$queryRaw<Array<{
    id: string;
    owner_user_id: number;
    pet_id: number | null;
  }>>`
    SELECT "id"::text AS "id", "owner_user_id", "pet_id"
    FROM "avatar_media_objects"
    WHERE "object_ref" = ${objectRef}
    FOR UPDATE
  `;
  const row = rows[0];
  if (!row) return false;
  if (Number(row.owner_user_id) !== ownerUserId) {
    throw new AvatarMediaAssignmentError("Avatar media is owned by another account");
  }
  if (row.pet_id !== null) {
    if (Number(row.pet_id) !== petId) {
      throw new AvatarMediaAssignmentError("Avatar media was already assigned to another pet");
    }
    return true;
  }
  const updated = await (tx as AvatarMediaSqlClient).$executeRaw`
    UPDATE "avatar_media_objects"
    SET "pet_id" = ${petId},
        "claimed_at" = CURRENT_TIMESTAMP,
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = CAST(${row.id} AS uuid)
      AND "pet_id" IS NULL
      AND "expires_at" > CURRENT_TIMESTAMP
  `;
  if (updated !== 1) {
    throw new AvatarMediaAssignmentError("Avatar preview expired; upload it again");
  }
  return true;
}

/**
 * Release lifecycle metadata for a replaced avatar and durably queue its bytes.
 * The deletion worker still checks every live Generation/Pet/Profile reference.
 */
export async function releaseClaimedAvatarMedia(
  tx: Prisma.TransactionClient | AvatarMediaSqlClient,
  ownerUserId: number,
  petId: number,
  value: string | null | undefined,
): Promise<boolean> {
  if (!value) return false;
  const objectRef = canonicalAvatarMediaRef(value);
  if (!objectRef) return false;
  const db = tx as AvatarMediaSqlClient;
  const removed = await db.$queryRaw<Array<{ id: string }>>`
    DELETE FROM "avatar_media_objects"
    WHERE "object_ref" = ${objectRef}
      AND "owner_user_id" = ${ownerUserId}
      AND "pet_id" = ${petId}
    RETURNING "id"::text AS "id"
  `;
  if (!removed[0]) return false;

  await db.$executeRaw`
    INSERT INTO "media_deletion_tasks"
      ("object_ref", "owner_user_id", "source_pet_id", "last_error", "created_at", "updated_at")
    VALUES
      (${objectRef}, ${ownerUserId}, ${petId}, 'Replaced claimed avatar media', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("object_ref") DO UPDATE
      SET "last_error" = EXCLUDED."last_error",
          "updated_at" = CURRENT_TIMESTAMP
  `;
  return true;
}

/**
 * Atomically turn expired, still-unclaimed previews into normal deletion tasks.
 * SKIP LOCKED lets several cron instances cooperate without racing a Pet claim.
 */
export async function enqueueExpiredAvatarMediaObjects(
  limit = 200,
  db: AvatarMediaSqlClient = prisma,
): Promise<number> {
  const boundedLimit = Math.min(Math.max(Math.floor(limit), 1), 500);
  const rows = await db.$queryRaw<Array<{ removed: number }>>`
    WITH "expired" AS MATERIALIZED (
      SELECT "id", "object_ref", "owner_user_id"
      FROM "avatar_media_objects"
      WHERE "pet_id" IS NULL
        AND "expires_at" <= CURRENT_TIMESTAMP
      ORDER BY "expires_at" ASC, "id" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${boundedLimit}
    ),
    "queued" AS (
      INSERT INTO "media_deletion_tasks"
        ("object_ref", "owner_user_id", "source_pet_id", "last_error", "created_at", "updated_at")
      SELECT
        "object_ref", "owner_user_id", 0,
        'Expired unclaimed avatar preview', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM "expired"
      ON CONFLICT ("object_ref") DO UPDATE
        SET "last_error" = EXCLUDED."last_error",
            "updated_at" = CURRENT_TIMESTAMP
      RETURNING "object_ref"
    ),
    "deleted" AS (
      DELETE FROM "avatar_media_objects" AS a
      USING "expired" AS e
      WHERE a."id" = e."id"
        AND EXISTS (SELECT 1 FROM "queued" AS q WHERE q."object_ref" = e."object_ref")
      RETURNING a."id"
    )
    SELECT COUNT(*)::int AS "removed" FROM "deleted"
  `;
  return Number(rows[0]?.removed ?? 0);
}
