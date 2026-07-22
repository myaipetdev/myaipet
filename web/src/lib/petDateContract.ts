import { containsHangul } from "./generatedLanguage";

export const PET_DATE_VIBES = ["playful", "deep", "rivalry", "shy"] as const;
export type PetDateVibe = typeof PET_DATE_VIBES[number];

export interface PetDateTurn {
  speaker: "A" | "B";
  text: string;
}

export interface PetDateOutput {
  log: PetDateTurn[];
  vibe: PetDateVibe;
  friendship: number;
}

export type PetDateOutputValidation =
  | { ok: true; value: PetDateOutput }
  | { ok: false; reason: string };

const EXACT_OUTPUT_KEYS = ["friendship", "log", "vibe"];
const EXACT_TURN_KEYS = ["speaker", "text"];
const MAX_PROVIDER_OUTPUT_CHARS = 8_000;
const MIN_TURNS = 6;
const MAX_TURNS = 10;
const MAX_TURN_CHARS = 80;

function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

/** Validate the exact PetHub wire contract before any charge or persistence. */
export function parsePetDateOutput(raw: unknown): PetDateOutputValidation {
  if (typeof raw !== "string" || !raw.trim() || raw.length > MAX_PROVIDER_OUTPUT_CHARS) {
    return { ok: false, reason: "invalid_json" };
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw.trim());
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    return { ok: false, reason: "invalid_shape" };
  }
  const object = decoded as Record<string, unknown>;
  if (!hasExactKeys(object, EXACT_OUTPUT_KEYS)) {
    return { ok: false, reason: "invalid_shape" };
  }
  if (!Array.isArray(object.log)
    || object.log.length < MIN_TURNS
    || object.log.length > MAX_TURNS) {
    return { ok: false, reason: "invalid_log_length" };
  }

  const log: PetDateTurn[] = [];
  for (let index = 0; index < object.log.length; index += 1) {
    const row = object.log[index];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return { ok: false, reason: "invalid_turn" };
    }
    const turn = row as Record<string, unknown>;
    if (!hasExactKeys(turn, EXACT_TURN_KEYS)) {
      return { ok: false, reason: "invalid_turn" };
    }
    const expectedSpeaker = index % 2 === 0 ? "A" : "B";
    if (turn.speaker !== expectedSpeaker || typeof turn.text !== "string") {
      return { ok: false, reason: "invalid_turn" };
    }
    const text = turn.text.trim();
    if (!text || [...text].length > MAX_TURN_CHARS) {
      return { ok: false, reason: "invalid_turn_text" };
    }
    log.push({ speaker: expectedSpeaker, text });
  }

  if (typeof object.vibe !== "string"
    || !PET_DATE_VIBES.includes(object.vibe as PetDateVibe)) {
    return { ok: false, reason: "invalid_vibe" };
  }
  if (!Number.isInteger(object.friendship)
    || (object.friendship as number) < -20
    || (object.friendship as number) > 30) {
    return { ok: false, reason: "invalid_friendship" };
  }

  const value: PetDateOutput = {
    log,
    vibe: object.vibe as PetDateVibe,
    friendship: object.friendship as number,
  };
  if (containsHangul(value)) {
    return { ok: false, reason: "non_english_output" };
  }
  return { ok: true, value };
}

export type ReservedPetDateResult<TSettlement> =
  | { kind: "success"; output: PetDateOutput; settlement: TSettlement }
  | { kind: "insufficient" }
  | { kind: "invalid_output"; reason: string; creditsRemaining: number }
  | {
    kind: "failed";
    phase: "reservation" | "provider" | "settlement" | "refund";
    error: unknown;
    originalError?: unknown;
    creditsRemaining?: number;
  };

/**
 * Run one paid Pet Date without ever starting provider work on unreserved
 * credit. Every non-settled terminal path refunds through the caller's durable
 * CAS transition; settlement is responsible for atomically persisting output
 * and committing the same reservation.
 */
export async function runReservedPetDate<TReservation, TSettlement>(deps: {
  reserve: () => Promise<TReservation | null>;
  invokeProvider: () => Promise<string>;
  settle: (reservation: TReservation, output: PetDateOutput) => Promise<TSettlement>;
  refund: (reservation: TReservation) => Promise<number>;
}): Promise<ReservedPetDateResult<TSettlement>> {
  let reservation: TReservation | null;
  try {
    reservation = await deps.reserve();
  } catch (error) {
    return { kind: "failed", phase: "reservation", error };
  }
  if (!reservation) return { kind: "insufficient" };

  let raw: string;
  try {
    raw = await deps.invokeProvider();
  } catch (error) {
    try {
      const creditsRemaining = await deps.refund(reservation);
      return { kind: "failed", phase: "provider", error, creditsRemaining };
    } catch (refundError) {
      return { kind: "failed", phase: "refund", error: refundError, originalError: error };
    }
  }

  const validated = parsePetDateOutput(raw);
  if (validated.ok === false) {
    try {
      const creditsRemaining = await deps.refund(reservation);
      return {
        kind: "invalid_output",
        reason: validated.reason,
        creditsRemaining,
      };
    } catch (error) {
      return { kind: "failed", phase: "refund", error };
    }
  }

  try {
    const settlement = await deps.settle(reservation, validated.value);
    return { kind: "success", output: validated.value, settlement };
  } catch (error) {
    try {
      const creditsRemaining = await deps.refund(reservation);
      return { kind: "failed", phase: "settlement", error, creditsRemaining };
    } catch (refundError) {
      return { kind: "failed", phase: "refund", error: refundError, originalError: error };
    }
  }
}
