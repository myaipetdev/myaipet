import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";

const DEFAULT_TTL_MS = 15 * 60_000;
const MIN_TTL_MS = 60_000;
const MAX_TTL_MS = 30 * 60_000;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

export type ArenaMatchChallengeRecord = {
  id: number;
  token_hash: string;
  user_id: number;
  player_pet_id: number;
  opponent_pet_id: number;
  player_level: number;
  opponent_level: number;
  issued_at: Date;
  expires_at: Date;
  consumed_at: Date | null;
};

export class InvalidArenaMatchChallengeError extends Error {
  constructor() {
    super("Invalid or expired Arena match challenge");
    this.name = "InvalidArenaMatchChallengeError";
  }
}

export function arenaMatchChallengeTtlMs(): number {
  const configured = Number(process.env.ARENA_MATCH_CHALLENGE_TTL_MS);
  return Number.isSafeInteger(configured) && configured >= MIN_TTL_MS && configured <= MAX_TTL_MS
    ? configured
    : DEFAULT_TTL_MS;
}

export function hashArenaMatchChallengeToken(token: string): string {
  if (!TOKEN_PATTERN.test(token)) throw new InvalidArenaMatchChallengeError();
  return createHash("sha256").update(token).digest("hex");
}

export async function issueArenaMatchChallenge(
  client: Prisma.TransactionClient,
  input: {
    userId: number;
    playerPetId: number;
    opponentPetId: number;
    playerLevel: number;
    opponentLevel: number;
    now?: Date;
  },
): Promise<{ token: string; expiresAt: Date }> {
  if (
    input.playerPetId === input.opponentPetId ||
    Math.abs(input.playerLevel - input.opponentLevel) > 3
  ) {
    throw new InvalidArenaMatchChallengeError();
  }

  const issuedAt = input.now || new Date();
  const expiresAt = new Date(issuedAt.getTime() + arenaMatchChallengeTtlMs());
  const token = randomBytes(32).toString("hex");
  await client.arenaMatchChallenge.create({
    data: {
      token_hash: hashArenaMatchChallengeToken(token),
      user_id: input.userId,
      player_pet_id: input.playerPetId,
      opponent_pet_id: input.opponentPetId,
      player_level: input.playerLevel,
      opponent_level: input.opponentLevel,
      issued_at: issuedAt,
      expires_at: expiresAt,
    },
  });
  return { token, expiresAt };
}

/** Atomically consume an exact user/player/opponent-bound challenge. */
export async function consumeArenaMatchChallenge(
  tx: Prisma.TransactionClient,
  input: {
    token: string;
    userId: number;
    playerPetId: number;
    opponentPetId: number;
    now?: Date;
  },
): Promise<ArenaMatchChallengeRecord> {
  const now = input.now || new Date();
  const tokenHash = hashArenaMatchChallengeToken(input.token);
  const challenge = await tx.arenaMatchChallenge.findUnique({
    where: { token_hash: tokenHash },
  }) as ArenaMatchChallengeRecord | null;

  if (
    !challenge ||
    challenge.user_id !== input.userId ||
    challenge.player_pet_id !== input.playerPetId ||
    challenge.opponent_pet_id !== input.opponentPetId ||
    challenge.player_pet_id === challenge.opponent_pet_id ||
    Math.abs(challenge.player_level - challenge.opponent_level) > 3 ||
    challenge.consumed_at !== null ||
    challenge.issued_at.getTime() > now.getTime() + 30_000 ||
    challenge.expires_at.getTime() <= now.getTime() ||
    challenge.expires_at.getTime() - challenge.issued_at.getTime() > MAX_TTL_MS
  ) {
    throw new InvalidArenaMatchChallengeError();
  }

  const consumed = await tx.arenaMatchChallenge.updateMany({
    where: {
      id: challenge.id,
      token_hash: tokenHash,
      user_id: input.userId,
      player_pet_id: input.playerPetId,
      opponent_pet_id: input.opponentPetId,
      consumed_at: null,
      expires_at: { gt: now },
    },
    data: { consumed_at: now },
  });
  if (consumed.count !== 1) throw new InvalidArenaMatchChallengeError();

  return { ...challenge, consumed_at: now };
}
