import { prisma } from "@/lib/prisma";
import { withLockedPetModifiers } from "@/lib/petclaw/modifier-store";

export const DAYDREAM_VIDEO_SOURCE_KIND = "memory_daydream";
export const DAYDREAM_VIDEO_MAX_ATTEMPTS = 3;

export interface DaydreamVideoClaimOptions {
  minScore: number;
  windowStart: Date;
  cooldownStart: Date;
}

export interface DaydreamVideoCandidateRef {
  insightId: number;
  petId: number;
  score: number;
}

export interface DaydreamVideoClaim {
  insightId: number;
  generationId: number;
  petId: number;
  userId: number;
  memoryEpoch: number;
  attempt: number;
  insight: string;
  mood: string;
  petName: string;
  species: number;
  personalityType: string;
  avatarUrl: string | null;
  appearanceDesc: string | null;
}

interface CandidateRefRow {
  insight_id: number;
  pet_id: number;
  score: number;
}

interface ClaimableRow extends CandidateRefRow {
  insight: string;
  mood: string;
  user_id: number;
  memory_epoch: number;
  name: string;
  species: number;
  personality_type: string;
  avatar_url: string | null;
  appearance_desc: string | null;
  conversion_attempts: number;
}

/**
 * Local-only eligibility preview. It deliberately returns no insight text,
 * owner fields, prompts, or media URLs, so a dry run cannot export retained
 * memory. The actual claim revalidates every predicate under the pet lock.
 */
export async function listDaydreamVideoCandidateRefs(
  options: DaydreamVideoClaimOptions,
  limit: number,
): Promise<DaydreamVideoCandidateRef[]> {
  const boundedLimit = Math.max(1, Math.min(50, Math.trunc(limit) || 1));
  const rows = await prisma.$queryRaw<CandidateRefRow[]>`
    WITH ranked AS (
      SELECT pi.id AS insight_id, pi.pet_id, pi.score,
             ROW_NUMBER() OVER (
               PARTITION BY pi.pet_id
               ORDER BY pi.score DESC, pi.created_at DESC, pi.id ASC
             ) AS pet_rank
      FROM pet_insights pi
      JOIN pets p ON p.id = pi.pet_id
      WHERE pi.video_generation_id IS NULL
        AND pi.conversion_status = 'ready'
        AND (pi.conversion_retry_at IS NULL OR pi.conversion_retry_at <= CURRENT_TIMESTAMP)
        AND pi.mood <> 'deleted'
        AND pi.score >= ${options.minScore}
        AND pi.created_at >= ${options.windowStart}
        AND p.is_active = true
        AND NOT EXISTS (
          SELECT 1
          FROM pet_insights pi2
          JOIN generations g2 ON g2.id = pi2.video_generation_id
          WHERE pi2.pet_id = pi.pet_id
            AND g2.created_at >= ${options.cooldownStart}
        )
    )
    SELECT insight_id, pet_id, score
    FROM ranked
    WHERE pet_rank = 1
    ORDER BY score DESC, insight_id ASC
    LIMIT ${boundedLimit}`;
  return rows.map((row) => ({
    insightId: row.insight_id,
    petId: row.pet_id,
    score: row.score,
  }));
}

/**
 * Atomically reserve one insight and create its permanently private,
 * provenance-labelled Generation before any provider sees retained memory.
 */
export async function claimDaydreamVideoCandidate(
  candidate: DaydreamVideoCandidateRef,
  options: DaydreamVideoClaimOptions,
): Promise<DaydreamVideoClaim | null> {
  return withLockedPetModifiers(candidate.petId, async ({ tx, pet }) => {
    const rows = await tx.$queryRaw<ClaimableRow[]>`
      SELECT pi.id AS insight_id, pi.pet_id, pi.score, pi.insight, pi.mood,
             pi.conversion_attempts, p.user_id, p.memory_epoch, p.name,
             p.species, p.personality_type, p.avatar_url, p.appearance_desc
      FROM pet_insights pi
      JOIN pets p ON p.id = pi.pet_id
      WHERE pi.id = ${candidate.insightId}
        AND pi.pet_id = ${candidate.petId}
        AND pi.video_generation_id IS NULL
        AND pi.conversion_status = 'ready'
        AND (pi.conversion_retry_at IS NULL OR pi.conversion_retry_at <= CURRENT_TIMESTAMP)
        AND pi.mood <> 'deleted'
        AND pi.score >= ${options.minScore}
        AND pi.created_at >= ${options.windowStart}
        AND p.is_active = true
        AND NOT EXISTS (
          SELECT 1
          FROM pet_insights pi2
          JOIN generations g2 ON g2.id = pi2.video_generation_id
          WHERE pi2.pet_id = pi.pet_id
            AND g2.created_at >= ${options.cooldownStart}
        )
      FOR UPDATE OF pi`;
    const row = rows[0];
    if (!row || row.memory_epoch !== pet.memory_epoch) return null;

    const attempt = row.conversion_attempts + 1;
    const generation = await tx.generation.create({
      data: {
        user_id: row.user_id,
        pet_id: row.pet_id,
        pet_type: row.species,
        style: 1,
        prompt: null,
        duration: 5,
        photo_path: row.avatar_url || "",
        status: "reserved",
        visibility: "private",
        source_kind: DAYDREAM_VIDEO_SOURCE_KIND,
        credits_charged: 0,
      },
      select: { id: true },
    });
    await tx.petInsight.update({
      where: { id: row.insight_id },
      data: {
        video_generation_id: generation.id,
        conversion_status: "claimed",
        conversion_memory_epoch: pet.memory_epoch,
        conversion_claimed_at: new Date(),
        conversion_attempts: attempt,
        conversion_retry_at: null,
        conversion_error: null,
      },
    });

    return {
      insightId: row.insight_id,
      generationId: generation.id,
      petId: row.pet_id,
      userId: row.user_id,
      memoryEpoch: pet.memory_epoch,
      attempt,
      insight: row.insight,
      mood: row.mood,
      petName: row.name,
      species: row.species,
      personalityType: row.personality_type,
      avatarUrl: row.avatar_url,
      appearanceDesc: row.appearance_desc,
    };
  });
}

export async function claimNextDaydreamVideoCandidate(
  options: DaydreamVideoClaimOptions,
): Promise<DaydreamVideoClaim | null> {
  const candidates = await listDaydreamVideoCandidateRefs(options, 12);
  for (const candidate of candidates) {
    const claimed = await claimDaydreamVideoCandidate(candidate, options);
    if (claimed) return claimed;
  }
  return null;
}

/** Check the durable claim and deletion epoch immediately before provider use. */
export async function isDaydreamVideoClaimCurrent(
  claim: DaydreamVideoClaim,
): Promise<boolean> {
  return withLockedPetModifiers(claim.petId, async ({ tx, pet }) => {
    if (pet.memory_epoch !== claim.memoryEpoch) return false;
    const row = await tx.petInsight.findFirst({
      where: {
        id: claim.insightId,
        pet_id: claim.petId,
        video_generation_id: claim.generationId,
        conversion_status: "claimed",
        conversion_memory_epoch: claim.memoryEpoch,
      },
      select: { id: true },
    });
    if (!row) return false;
    const generation = await tx.generation.findFirst({
      where: {
        id: claim.generationId,
        pet_id: claim.petId,
        source_kind: DAYDREAM_VIDEO_SOURCE_KIND,
        status: "reserved",
      },
      select: { id: true },
    });
    return !!generation;
  });
}

export interface DaydreamClaimReleaseResult {
  retry: "scheduled" | "manual" | "revoked";
}

/**
 * Resolve a claimed reservation after a failure. Work that failed before the
 * video submission may retry with capped exponential backoff. Once submission
 * was attempted, replay is manual-only because a network failure can be an
 * ambiguous accepted request and automatic retry could double-spend.
 */
export async function releaseDaydreamVideoClaim(
  claim: DaydreamVideoClaim,
  error: string,
  options: { beforeVideoSubmission: boolean },
): Promise<DaydreamClaimReleaseResult> {
  return withLockedPetModifiers(claim.petId, async ({ tx, pet }) => {
    const message = error.slice(0, 500) || "Daydream video preparation failed";
    const currentEpoch = pet.memory_epoch === claim.memoryEpoch;
    const insight = await tx.petInsight.findFirst({
      where: {
        id: claim.insightId,
        pet_id: claim.petId,
        video_generation_id: claim.generationId,
      },
      select: { id: true, conversion_status: true },
    });

    await tx.generation.updateMany({
      where: {
        id: claim.generationId,
        source_kind: DAYDREAM_VIDEO_SOURCE_KIND,
        status: "reserved",
      },
      data: { status: "failed", error_message: message },
    });
    if (!insight) return { retry: "revoked" };

    if (
      currentEpoch
      && insight.conversion_status === "claimed"
      && options.beforeVideoSubmission
      && claim.attempt < DAYDREAM_VIDEO_MAX_ATTEMPTS
    ) {
      const backoffMinutes = 5 * (2 ** Math.max(0, claim.attempt - 1));
      await tx.petInsight.update({
        where: { id: claim.insightId },
        data: {
          video_generation_id: null,
          conversion_status: "ready",
          conversion_memory_epoch: null,
          conversion_claimed_at: null,
          conversion_retry_at: new Date(Date.now() + backoffMinutes * 60_000),
          conversion_error: message,
        },
      });
      return { retry: "scheduled" };
    }

    await tx.petInsight.update({
      where: { id: claim.insightId },
      data: {
        conversion_status: currentEpoch ? "failed" : "revoked",
        conversion_claimed_at: null,
        conversion_retry_at: null,
        conversion_error: currentEpoch
          ? `${message} Manual retry required; automatic replay is disabled after provider submission.`
          : "Memory changed while daydream video work was in flight; the claim was revoked.",
      },
    });
    return { retry: currentEpoch ? "manual" : "revoked" };
  });
}

export interface DaydreamSubmissionCommitResult {
  committed: boolean;
  discarded: boolean;
}

/**
 * Resolve process-crash claims after a bounded lease. They are terminal and
 * manual-only: a crash could have happened after upstream accepted a request
 * but before its id was committed, so automatic replay could double-spend.
 */
export async function expireStaleDaydreamVideoClaims(
  ttlMs: number,
  limit: number,
): Promise<number> {
  const cutoff = new Date(Date.now() - Math.max(60_000, ttlMs));
  const boundedLimit = Math.max(1, Math.min(50, Math.trunc(limit) || 1));
  const stale = await prisma.petInsight.findMany({
    where: {
      conversion_status: "claimed",
      conversion_claimed_at: { lte: cutoff },
      video_generation_id: { not: null },
    },
    orderBy: { conversion_claimed_at: "asc" },
    take: boundedLimit,
    select: {
      id: true,
      pet_id: true,
      video_generation_id: true,
      conversion_memory_epoch: true,
    },
  });

  let recovered = 0;
  for (const candidate of stale) {
    await withLockedPetModifiers(candidate.pet_id, async ({ tx, pet }) => {
      const row = await tx.petInsight.findFirst({
        where: {
          id: candidate.id,
          pet_id: candidate.pet_id,
          video_generation_id: candidate.video_generation_id,
          conversion_status: "claimed",
          conversion_claimed_at: { lte: cutoff },
        },
        select: { id: true, conversion_memory_epoch: true },
      });
      if (!row || !candidate.video_generation_id) return;
      const revoked = row.conversion_memory_epoch !== pet.memory_epoch;
      const error = revoked
        ? "Memory changed while a crashed daydream-video claim was pending; claim revoked."
        : "Daydream-video worker lease expired. Manual retry required to avoid replaying an ambiguous provider submission.";
      await tx.generation.updateMany({
        where: {
          id: candidate.video_generation_id,
          source_kind: DAYDREAM_VIDEO_SOURCE_KIND,
          status: "reserved",
        },
        data: { status: "failed", visibility: "private", error_message: error },
      });
      await tx.petInsight.update({
        where: { id: row.id },
        data: {
          conversion_status: revoked ? "revoked" : "failed",
          conversion_claimed_at: null,
          conversion_retry_at: null,
          conversion_error: error,
        },
      });
      recovered++;
    });
  }
  return recovered;
}

/** Persist an accepted upstream request while preserving fail-closed provenance. */
export async function commitDaydreamVideoSubmission(
  claim: DaydreamVideoClaim,
  requestId: string,
  prompt: string,
): Promise<DaydreamSubmissionCommitResult> {
  return withLockedPetModifiers(claim.petId, async ({ tx, pet }) => {
    const insight = await tx.petInsight.findFirst({
      where: {
        id: claim.insightId,
        pet_id: claim.petId,
        video_generation_id: claim.generationId,
      },
      select: { id: true, conversion_status: true, conversion_memory_epoch: true },
    });
    const current = !!insight
      && insight.conversion_status === "claimed"
      && insight.conversion_memory_epoch === claim.memoryEpoch
      && pet.memory_epoch === claim.memoryEpoch;

    // The request id is evidence and must survive even if deletion won after
    // submission; failed/revoked output is never settled into public media.
    const generationUpdate = await tx.generation.updateMany({
      where: { id: claim.generationId, source_kind: DAYDREAM_VIDEO_SOURCE_KIND },
      data: {
        prompt,
        fal_request_id: requestId,
        status: current ? "processing" : "failed",
        error_message: current
          ? null
          : "Memory changed after provider submission; output was revoked.",
      },
    });
    const committed = current && generationUpdate.count === 1;
    if (!insight) return { committed: false, discarded: true };

    await tx.petInsight.update({
      where: { id: claim.insightId },
      data: {
        conversion_status: committed ? "submitted" : "revoked",
        conversion_claimed_at: null,
        conversion_retry_at: null,
        conversion_error: committed
          ? null
          : "Memory changed while daydream video work was in flight; the output was revoked.",
      },
    });
    return { committed, discarded: !committed };
  });
}
