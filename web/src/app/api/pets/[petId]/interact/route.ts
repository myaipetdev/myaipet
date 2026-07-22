import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { awardPoints, awardPointsCapped, DAILY_POINT_CAPS } from "@/lib/seasonRewards";
import {
  BASE_EFFECTS,
  applyPersonality,
  gateInteraction,
  detectCombo,
  generateRequest,
  intimacyMultiplier,
  type InteractionType,
} from "@/lib/petMechanics";
import { rateLimit } from "@/lib/rateLimit";
import { executePetActionWithPaywall, getDailyUsage } from "@/lib/paywall";
import { NextRequest, NextResponse } from "next/server";
import { withLockedPetModifiers } from "@/lib/petclaw/modifier-store";
import { readBoundedJsonBody } from "@/lib/petclaw/bounded-json-body";
import type { Prisma } from "@/generated/prisma/client";

// Feed/play use a daily free allowance and paid overflow. Emotional actions stay free.
const PAID_INTERACTION_MAP: Record<string, string> = {
  feed: "feed_extra",
  play: "play_extra",
};

// Minimum authoritative gap between interactions to prevent point/exp farming.
const INTERACT_COOLDOWN_MS = 1500;
const INTERACT_BODY_MAX_BYTES = 1024;
const VALID_TYPES = Object.keys(BASE_EFFECTS) as InteractionType[];

const SPECIES_MAP: Record<number, string> = {
  0: "cat", 1: "dog", 2: "parrot", 3: "turtle",
  4: "hamster", 5: "rabbit", 6: "fox", 7: "pomeranian",
};

type InteractionDomainFailure =
  | { kind: "cooldown"; retryInMs: number }
  | { kind: "blocked"; reason: string };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Real, owner-scoped daily counters for the My Pet mission checklist. Every
 * number is read from rows the server already writes when it PAYS the reward
 * (DailyActionCount for capped season points + free-care quotas, Generation for
 * creations) — nothing here is fabricated or estimated. `ap:interact` /
 * `ap:pet_chat` counters store POINTS granted today (5 per care, 2 per chat),
 * so the client derives action counts by dividing by the per-action grant.
 */
async function todaySnapshot(userId: number) {
  const day = new Date().toISOString().slice(0, 10);
  const dayStart = new Date(`${day}T00:00:00.000Z`);
  const [apRows, feedFree, playFree, creations] = await Promise.all([
    prisma.dailyActionCount.findMany({
      where: { user_id: userId, day, action_key: { in: ["ap:interact", "ap:pet_chat"] } },
      select: { action_key: true, count: true },
    }),
    getDailyUsage(userId, "feed_extra"),
    getDailyUsage(userId, "play_extra"),
    prisma.generation.count({
      where: { user_id: userId, status: "completed", created_at: { gte: dayStart } },
    }),
  ]);
  const ap = (key: string) => apRows.find((r) => r.action_key === key)?.count ?? 0;
  return {
    day,
    care_points: ap("ap:interact"),          // season pts from cares today (5/care, +5 combo)
    care_points_cap: DAILY_POINT_CAPS.interact,
    chat_points: ap("ap:pet_chat"),          // season pts from pet chat today (2/message)
    chat_points_cap: DAILY_POINT_CAPS.pet_chat,
    creations,                               // completed generations today (pet + studio)
    feed_free_used: feedFree.used,
    feed_free_cap: feedFree.cap,
    play_free_used: playFree.used,
    play_free_cap: playFree.cap,
  };
}

function generateResponse(
  petName: string,
  species: string,
  personality: string,
  interactionType: string,
): string {
  const responses: Record<string, string[]> = {
    feed: [`${petName} happily munches on the food!`, `${petName} beams with joy at the delicious meal!`, `The ${species} gobbles up every last bite!`],
    play: [`${petName} bounces around excitedly!`, `The ${personality} ${species} plays enthusiastically!`, `${petName} is having so much fun playing with you!`],
    talk: [`${petName} listens intently and tilts their head.`, `The ${species} seems to understand every word!`, `${petName} responds with a cheerful sound!`],
    pet: [`${petName} nuzzles against your hand.`, `The ${species} relaxes contentedly as you pet them.`, `${petName} closes their eyes in bliss!`],
    walk: [`${petName} trots happily beside you!`, `The ${personality} ${species} explores everything on the walk!`, `${petName} found something interesting on the path!`],
    train: [`${petName} focuses hard and learns something new!`, `The ${species} is getting smarter with each session!`, `${petName} nailed the training exercise!`],
  };
  const options = responses[interactionType] || [`${petName} responds happily!`];
  return options[Math.floor(Math.random() * options.length)];
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> },
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimit(req, { key: "pet-interact", limit: 60, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const { petId } = await params;
  const parsedPetId = /^[1-9][0-9]*$/.test(petId) ? Number(petId) : Number.NaN;
  if (!Number.isSafeInteger(parsedPetId)) {
    return NextResponse.json({ error: "Pet not found" }, { status: 404 });
  }

  const parsedBody = await readBoundedJsonBody(req, INTERACT_BODY_MAX_BYTES);
  if (parsedBody.ok === false) {
    return NextResponse.json(
      { error: parsedBody.reason === "too_large" ? "Request body too large" : "Invalid JSON" },
      { status: parsedBody.reason === "too_large" ? 413 : 400 },
    );
  }
  const body = parsedBody.value;
  const interactionType = body && typeof body === "object" && !Array.isArray(body)
    ? (body as { interaction_type?: unknown }).interaction_type as InteractionType | undefined
    : undefined;
  if (!interactionType || !VALID_TYPES.includes(interactionType)) {
    return NextResponse.json(
      { error: `Invalid interaction_type. Valid types: ${VALID_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  const actionKey = PAID_INTERACTION_MAP[interactionType];
  const txHash = actionKey ? req.nextUrl.searchParams.get("tx_hash") || undefined : undefined;
  // Acquire the shared modifier lock before the paywall's authoritative pet-row
  // lock. Reuse this same transaction so quota/receipt, stats, modifier keys,
  // interaction row, and memory row remain one failure-atomic commit.
  const ownedPet = await prisma.pet.findFirst({
    where: { id: parsedPetId, user_id: user.id, is_active: true },
    select: { id: true },
  });
  if (!ownedPet) {
    return NextResponse.json({ error: "Pet not found" }, { status: 404 });
  }
  const action = await withLockedPetModifiers(parsedPetId, async ({ tx }) => {
    const lockedDb = {
      $transaction: async <T>(
        operation: (innerTx: Prisma.TransactionClient) => Promise<T>,
      ): Promise<T> => operation(tx),
    };
    return executePetActionWithPaywall<
    {
      updatedPet: any;
      paidAction: boolean;
      responseText: string;
      effects: { happiness: number; energy: number; hunger: number; experience: number; bond: number };
      leveledUp: boolean;
      combo: any;
      requestFulfilled: any;
      nextRequest: any;
    },
    InteractionDomainFailure
  >(
    lockedDb,
    {
      userId: user.id,
      petId: parsedPetId,
      actionKey,
      txHash,
    },
    {
      validate: (pet, now) => {
        if (pet.last_interaction_at) {
          const sinceMs = now.getTime() - new Date(pet.last_interaction_at).getTime();
          if (sinceMs < INTERACT_COOLDOWN_MS) {
            return {
              kind: "cooldown",
              retryInMs: Math.max(0, INTERACT_COOLDOWN_MS - sinceMs),
            };
          }
        }
        const blocked = gateInteraction(interactionType, {
          energy: pet.energy,
          hunger: pet.hunger,
          happiness: pet.happiness,
        });
        return blocked ? { kind: "blocked", reason: blocked } : null;
      },
      apply: async (tx, pet, access, now) => {
        const paidAction = access?.paid === true;
        const base = BASE_EFFECTS[interactionType];
        const adjusted = applyPersonality(interactionType, pet.personality_type, base);

        const rawMods: any = pet.personality_modifiers;
        const mods: any = rawMods && typeof rawMods === "object" && !Array.isArray(rawMods)
          ? rawMods
          : {};
        const history: InteractionType[] = Array.isArray(mods.interaction_history)
          ? mods.interaction_history
          : [];
        const pendingRequest = mods.pending_request;
        const combosUnlocked: string[] = Array.isArray(mods.combos_unlocked)
          ? mods.combos_unlocked
          : [];

        let requestFulfilled: {
          name: string;
          bonus: { happiness: number; bond: number; exp: number };
        } | null = null;
        let stillValidRequest = pendingRequest;
        if (pendingRequest?.type) {
          const expired = pendingRequest.expiresAt
            && new Date(pendingRequest.expiresAt).getTime() < now.getTime();
          if (expired) {
            stillValidRequest = null;
          } else if (pendingRequest.type === interactionType) {
            requestFulfilled = {
              name: "Request Fulfilled",
              bonus: pendingRequest.reward || { happiness: 10, bond: 5, exp: 5 },
            };
            stillValidRequest = null;
          }
        }

        const newHistory = [...history, interactionType].slice(-8);
        const combo = detectCombo(newHistory);
        const persistedHistory = combo ? [] : newHistory;
        let comboBonus = { happiness: 0, energy: 0, hunger: 0, exp: 0, bond: 0 };
        if (combo) {
          comboBonus = { ...comboBonus, ...combo.bonusEffects };
        }

        const intimacyMult = intimacyMultiplier(pet.personality_type, interactionType);
        const bondGain = Math.round(adjusted.bond * intimacyMult);
        const reqHap = requestFulfilled?.bonus.happiness || 0;
        const reqBond = requestFulfilled?.bonus.bond || 0;
        const reqExp = requestFulfilled?.bonus.exp || 0;

        const newHappiness = clamp(pet.happiness + adjusted.happiness + comboBonus.happiness + reqHap, 0, 100);
        const newEnergy = clamp(pet.energy + adjusted.energy + comboBonus.energy, 0, 100);
        const newHunger = clamp(pet.hunger + adjusted.hunger + comboBonus.hunger, 0, 100);
        const newExperience = pet.experience + adjusted.exp + comboBonus.exp + reqExp;
        const newBondLevel = clamp(pet.bond_level + bondGain + comboBonus.bond + reqBond, 0, 100);
        const newLevel = Math.floor(newExperience / 100) + 1;
        const leveledUp = newLevel > pet.level;

        const species = mods.species_name || SPECIES_MAP[pet.species] || pet.name;
        const responseText = generateResponse(
          pet.name,
          species,
          pet.personality_type,
          interactionType,
        );

        let nextRequest = stillValidRequest;
        if (!nextRequest) {
          nextRequest = generateRequest(
            {
              energy: newEnergy,
              hunger: newHunger,
              happiness: newHappiness,
              bond_level: newBondLevel,
              last_interaction_at: now,
            },
            pet.personality_type,
          );
        }

        let updatedCombos = combosUnlocked;
        if (combo && !combosUnlocked.includes(combo.name)) {
          updatedCombos = [...combosUnlocked, combo.name];
        }

        const effects = {
          happiness: adjusted.happiness + comboBonus.happiness + reqHap,
          energy: adjusted.energy + comboBonus.energy,
          hunger: adjusted.hunger + comboBonus.hunger,
          experience: adjusted.exp + comboBonus.exp + reqExp,
          bond: bondGain + comboBonus.bond + reqBond,
        };
        const updatedPet = await tx.pet.update({
          where: { id: pet.id },
          data: {
            happiness: newHappiness,
            energy: newEnergy,
            hunger: newHunger,
            experience: newExperience,
            level: newLevel,
            bond_level: newBondLevel,
            total_interactions: pet.total_interactions + 1,
            last_interaction_at: now,
            personality_modifiers: {
              ...mods,
              interaction_history: persistedHistory,
              pending_request: nextRequest,
              combos_unlocked: updatedCombos,
            },
          },
        });
        await tx.petInteraction.create({
          data: {
            pet_id: pet.id,
            user_id: user.id,
            interaction_type: interactionType,
            response_text: responseText,
            happiness_change: effects.happiness,
            energy_change: effects.energy,
            hunger_change: effects.hunger,
            experience_gained: effects.experience,
          },
        });
        await tx.petMemory.create({
          data: {
            pet_id: pet.id,
            memory_type: combo ? "combo" : "interaction",
            content: combo
              ? `${combo.emoji} ${combo.name} combo activated! ${combo.description}`
              : responseText,
            emotion: newHappiness >= 70 ? "happy" : newHappiness >= 40 ? "calm" : "sad",
            importance: leveledUp ? 3 : combo ? 4 : 1,
          },
        });
        return {
          updatedPet,
          paidAction,
          responseText,
          effects,
          leveledUp,
          combo,
          requestFulfilled,
          nextRequest,
        };
      },
    },
    );
  });

  if (action.ok !== true) {
    if (action.kind === "pet_not_found") {
      return NextResponse.json({ error: "Pet not found" }, { status: 404 });
    }
    if (action.kind === "domain") {
      if (action.domain.kind === "cooldown") {
        return NextResponse.json(
          {
            error: "Slow down — pet is still processing the last action",
            retryInMs: action.domain.retryInMs,
          },
          { status: 429 },
        );
      }
      return NextResponse.json(
        { error: action.domain.reason, blocked: true, reason: action.domain.reason },
        { status: 400 },
      );
    }
    if (action.kind === "receipt_already_consumed") {
      return NextResponse.json(
        {
          error: "This payment was already applied; refresh the pet to recover current state",
          code: "PAYMENT_ALREADY_APPLIED",
          refresh: true,
        },
        { status: 409 },
      );
    }
    const paused = action.paywall.reason === "payments_paused";
    return NextResponse.json(
      {
        error: paused ? "Payments are temporarily unavailable" : "Payment required",
        paywall: action.paywall,
      },
      { status: paused ? 503 : 402 },
    );
  }

  const {
    updatedPet,
    paidAction,
    responseText,
    effects,
    leveledUp,
    combo,
    requestFulfilled,
    nextRequest,
  } = action.value;

  // Recognition points never derive from a paid interaction. These post-commit
  // rewards are deliberately outside the paid-action core and may not turn an
  // already committed pet action into an error response.
  let actualPoints = 0;
  if (!paidAction) {
    try {
      const interactCap = DAILY_POINT_CAPS.interact;
      const pointsResult = await awardPointsCapped(user.id, "interact", 5, interactCap);
      actualPoints += pointsResult.points || 0;
      if (leveledUp) {
        const lv = await awardPoints(user.id, updatedPet.id, "level_up");
        actualPoints += lv.points || 0;
      }
      if (combo) {
        const cb = await awardPointsCapped(user.id, "interact", 5, interactCap);
        actualPoints += cb.points || 0;
      }
    } catch (error) {
      console.error("[interact] season points failed after committed action:", error);
    }
  }

  let streakResult: any = null;
  if (interactionType === "feed") {
    try {
      const { checkCareStreak } = await import("@/lib/petclaw/nft-mint");
      streakResult = await checkCareStreak(updatedPet.id);
    } catch (error: any) {
      console.error("[interact] streak check failed:", error?.message);
    }
  }

  // Post-commit, read-only mission counters — must never fail the committed care.
  let today: Awaited<ReturnType<typeof todaySnapshot>> | null = null;
  try {
    today = await todaySnapshot(user.id);
  } catch (error) {
    console.error("[interact] today snapshot failed:", error);
  }

  return NextResponse.json({
    pet: updatedPet,
    today,
    interaction: {
      type: interactionType,
      response: responseText,
      effects,
      leveled_up: leveledUp,
      points_earned: actualPoints,
      combo: combo
        ? { name: combo.name, description: combo.description, emoji: combo.emoji }
        : null,
      request_fulfilled: requestFulfilled,
      next_request: nextRequest,
      care_streak: streakResult
        ? { days: streakResult.streak, milestone: streakResult.milestone }
        : null,
    },
  });
}

// GET returns the pending request without performing an interaction.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> },
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { petId } = await params;
  const ownedPet = await prisma.pet.findFirst({
    where: { id: Number(petId), user_id: user.id, is_active: true },
    select: { id: true },
  });
  if (!ownedPet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

  // This GET has a deliberate write side effect (request generation/expiry),
  // so it participates in the same modifier serialization as care and memory.
  const state = await withLockedPetModifiers(ownedPet.id, async ({ tx, modifiers }) => {
    const pet = await tx.pet.findFirst({
      where: { id: ownedPet.id, user_id: user.id, is_active: true },
    });
    if (!pet) return null;

    let request: any = modifiers.pending_request;
    let shouldWrite = false;
    if (request?.expiresAt && new Date(request.expiresAt).getTime() < Date.now()) {
      request = null;
      shouldWrite = true;
    }
    if (!request) {
      request = generateRequest(
        {
          energy: pet.energy,
          hunger: pet.hunger,
          happiness: pet.happiness,
          bond_level: pet.bond_level,
          last_interaction_at: pet.last_interaction_at,
        },
        pet.personality_type,
      );
      if (request) shouldWrite = true;
    }
    if (shouldWrite) {
      await tx.pet.update({
        where: { id: pet.id },
        data: {
          personality_modifiers: { ...modifiers, pending_request: request } as any,
        },
      });
    }
    return {
      petId: pet.id,
      request,
      combosUnlocked: Array.isArray(modifiers.combos_unlocked) ? modifiers.combos_unlocked : [],
      history: Array.isArray(modifiers.interaction_history) ? modifiers.interaction_history : [],
    };
  });
  if (!state) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

  let today: Awaited<ReturnType<typeof todaySnapshot>> | null = null;
  try {
    today = await todaySnapshot(user.id);
  } catch (error) {
    console.error("[interact] today snapshot failed:", error);
  }

  return NextResponse.json({
    pet_id: state.petId,
    request: state.request,
    combos_unlocked: state.combosUnlocked,
    history: state.history,
    today,
  });
}
