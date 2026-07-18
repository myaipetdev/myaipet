import { prisma } from "@/lib/prisma";

const DEFAULT_USER_DAILY_CAP = 20;
const DEFAULT_GLOBAL_DAILY_CAP = 1_000;
const HARD_USER_DAILY_CAP = 100;
const HARD_GLOBAL_DAILY_CAP = 10_000;

export class AvatarUploadQuotaExceededError extends Error {
  readonly status = 429;
  readonly code = "avatar_upload_daily_cap_exceeded";

  constructor(readonly scope: "user" | "global") {
    super("Avatar upload limit reached for today");
    this.name = "AvatarUploadQuotaExceededError";
  }
}

export class AvatarUploadQuotaStoreError extends Error {
  readonly status = 503;
  readonly code = "avatar_upload_quota_store_unavailable";

  constructor() {
    super("Avatar uploads are temporarily unavailable because the durable quota could not be verified");
    this.name = "AvatarUploadQuotaStoreError";
  }
}

export interface AvatarUploadQuotaTransaction {
  $queryRaw<T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

export interface AvatarUploadQuotaReservation {
  usageDate: string;
  userId: number;
  userCap: number;
  globalCap: number;
}

function boundedEnvCap(name: string, fallback: number, hardMaximum: number): number {
  const parsed = Number(process.env[name]);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, hardMaximum);
}

async function incrementCappedScope(
  tx: AvatarUploadQuotaTransaction,
  usageDate: string,
  scopeKey: string,
  cap: number,
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ attempts: number }>>`
    INSERT INTO "llm_platform_usage" ("usage_date", "scope_key", "attempts", "updated_at")
    VALUES (CAST(${usageDate} AS date), ${scopeKey}, 1, CURRENT_TIMESTAMP)
    ON CONFLICT ("usage_date", "scope_key") DO UPDATE
      SET "attempts" = "llm_platform_usage"."attempts" + 1,
          "updated_at" = CURRENT_TIMESTAMP
      WHERE "llm_platform_usage"."attempts" < ${cap}
    RETURNING "attempts"
  `;
  return rows.length === 1;
}

/**
 * Reserve global then per-owner quota inside one PostgreSQL transaction. The
 * UPSERT row locks serialize concurrent instances; throwing on either cap makes
 * the caller roll the global increment back when the user bucket is full.
 */
export async function reserveAvatarUploadQuotaInTransaction(
  tx: AvatarUploadQuotaTransaction,
  reservation: AvatarUploadQuotaReservation,
): Promise<void> {
  const { usageDate, userId, userCap, globalCap } = reservation;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(usageDate)
    || !Number.isSafeInteger(userId) || userId <= 0
    || !Number.isSafeInteger(userCap) || userCap <= 0
    || !Number.isSafeInteger(globalCap) || globalCap <= 0) {
    throw new Error("Invalid avatar upload quota reservation");
  }

  if (!await incrementCappedScope(tx, usageDate, "avatar-upload:global", globalCap)) {
    throw new AvatarUploadQuotaExceededError("global");
  }
  if (!await incrementCappedScope(tx, usageDate, `avatar-upload:user:${userId}`, userCap)) {
    throw new AvatarUploadQuotaExceededError("user");
  }
}

/** Reserve one authenticated avatar-validation/upload attempt, failing closed. */
export async function consumeAvatarUploadQuota(userId: number): Promise<void> {
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    console.error("[avatar-upload] durable quota called without a valid authenticated user id");
    throw new AvatarUploadQuotaStoreError();
  }

  const reservation: AvatarUploadQuotaReservation = {
    usageDate: new Date().toISOString().slice(0, 10),
    userId,
    userCap: boundedEnvCap(
      "AVATAR_UPLOAD_USER_DAILY_CAP",
      DEFAULT_USER_DAILY_CAP,
      HARD_USER_DAILY_CAP,
    ),
    globalCap: boundedEnvCap(
      "AVATAR_UPLOAD_GLOBAL_DAILY_CAP",
      DEFAULT_GLOBAL_DAILY_CAP,
      HARD_GLOBAL_DAILY_CAP,
    ),
  };

  try {
    await prisma.$transaction(
      (tx: AvatarUploadQuotaTransaction) => reserveAvatarUploadQuotaInTransaction(tx, reservation),
      { maxWait: 5_000, timeout: 10_000 },
    );
  } catch (error) {
    if (error instanceof AvatarUploadQuotaExceededError) throw error;
    console.error(`[avatar-upload] persistent quota unavailable (${error instanceof Error ? error.name : "unknown"})`);
    throw new AvatarUploadQuotaStoreError();
  }
}
