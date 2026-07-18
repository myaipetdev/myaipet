import { prisma } from "@/lib/prisma";
import { getAuthContext, getUser } from "@/lib/auth";
import { applyDecay } from "@/lib/petMechanics";
import { isHumanAvatar } from "@/lib/services/petAvatarGuard";
import { getLLMBudgetFailureStatus } from "@/lib/llm/router";
import { NextRequest, NextResponse } from "next/server";
import { containsHangul } from "@/lib/generatedLanguage";
import {
  applicationMediaKey,
  AvatarMediaAssignmentError,
  claimOrVerifyApplicationMediaForPet,
  userCanAssignApplicationMedia,
} from "@/lib/mediaOwnership";
import { releaseClaimedAvatarMedia } from "@/lib/avatarMedia";
import {
  EXTENSION_PET_DETAIL_SELECT,
  toExtensionPetDetailView,
} from "@/lib/extensionPetView";

function visionBudgetResponse(error: unknown): NextResponse | null {
  const status = getLLMBudgetFailureStatus(error);
  if (!status) return null;
  return NextResponse.json({
    error: status === 429
      ? "Pet image verification has reached today's limit. Please try again tomorrow."
      : "Pet image verification is temporarily unavailable. Please try again later.",
  }, { status });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> }
) {
  const auth = await getAuthContext(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { user } = auth;

  const { petId } = await params;

  if (auth.credential === "extension") {
    const pet = await prisma.pet.findFirst({
      where: { id: Number(petId), user_id: user.id, is_active: true },
      select: EXTENSION_PET_DETAIL_SELECT,
    });
    if (!pet) {
      return NextResponse.json({ error: "Pet not found" }, { status: 404 });
    }
    // Keep extension sync behavior compatible with the first-party detail view
    // without selecting the private personality_modifiers decay clock. Prisma's
    // updated_at advances whenever that clock is written, so these non-private
    // timestamps are sufficient inputs and are stripped by the safe serializer.
    const decayClockMs = Math.max(
      pet.last_interaction_at?.getTime() || 0,
      pet.updated_at.getTime(),
    );
    const decayed = applyDecay(
      { happiness: pet.happiness, energy: pet.energy, hunger: pet.hunger },
      Date.now() - decayClockMs,
    );
    return NextResponse.json(toExtensionPetDetailView({ ...pet, ...decayed }));
  }

  const pet = await prisma.pet.findFirst({
    where: { id: Number(petId), user_id: user.id },
    include: {
      memories: {
        // The Memory Timeline shows curated milestones/emotions — NOT raw chat.
        // Exclude session_* turns (the "[user]/[pet]" lines, which may be legacy
        // Korean) so they never surface here. Mirrors retrieval.ts.
        where: { NOT: { memory_type: { startsWith: "session_" } } },
        orderBy: { created_at: "desc" },
        take: 10,
      },
    },
  });

  if (!pet) {
    return NextResponse.json({ error: "Pet not found" }, { status: 404 });
  }

  // ── Lazy time-based decay ──
  // A neglected pet should get hungry/tired/sad even when never clicked.
  // Uses a DEDICATED decay clock (personality_modifiers.last_decay_at), measured
  // from the most recent meaningful event. It NEVER writes last_interaction_at —
  // that timestamp drives neglect detection ("Pet Wants") and active-pet crons,
  // so merely viewing the pet must not look like an interaction.
  const mods = (pet.personality_modifiers as Record<string, any>) || {};
  const lastDecay = mods.last_decay_at ? new Date(mods.last_decay_at).getTime() : 0;
  const lastInteract = pet.last_interaction_at ? new Date(pet.last_interaction_at).getTime() : 0;
  const decayClockMs = Math.max(lastDecay, lastInteract, new Date(pet.updated_at).getTime());
  const elapsedMs = Date.now() - decayClockMs;
  const decayed = applyDecay(
    { happiness: pet.happiness, energy: pet.energy, hunger: pet.hunger },
    elapsedMs
  );

  if (decayed.changed) {
    try {
      await prisma.pet.update({
        where: { id: pet.id },
        data: {
          happiness: decayed.happiness,
          energy: decayed.energy,
          hunger: decayed.hunger,
          // Advance the dedicated decay clock — does NOT touch last_interaction_at.
          personality_modifiers: { ...mods, last_decay_at: new Date().toISOString() },
        },
      });
    } catch {
      // Best-effort persistence; still serve the decayed view below.
    }
    pet.happiness = decayed.happiness;
    pet.energy = decayed.energy;
    pet.hunger = decayed.hunger;
  }

  // Calculate mood based on (decayed) stats
  let current_mood = "neutral";
  if (pet.happiness >= 80 && pet.energy >= 50) current_mood = "ecstatic";
  else if (pet.happiness >= 60) current_mood = "happy";
  else if (pet.hunger >= 80) current_mood = "starving";
  else if (pet.hunger >= 60) current_mood = "hungry";
  else if (pet.energy <= 15) current_mood = "exhausted";
  else if (pet.energy <= 30) current_mood = "tired";
  else if (pet.happiness <= 20) current_mood = "grumpy";
  else if (pet.happiness <= 40) current_mood = "sad";

  const visibleMemories = pet.memories.filter((memory) => !containsHangul(memory.content));
  return NextResponse.json({
    ...pet,
    memories: visibleMemories,
    current_mood,
    recent_memories: visibleMemories,
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> }
) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { petId } = await params;

  const pet = await prisma.pet.findFirst({
    where: { id: Number(petId), user_id: user.id },
  });

  if (!pet) {
    return NextResponse.json({ error: "Pet not found" }, { status: 404 });
  }

  await prisma.pet.update({
    where: { id: pet.id },
    data: { is_active: false },
  });

  await prisma.petMemory.create({
    data: {
      pet_id: pet.id,
      memory_type: "farewell",
      content: `${pet.name} was released. Farewell, dear friend.`,
      emotion: "sad",
      importance: 5,
    },
  });

  return NextResponse.json({ message: "Pet released successfully" });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ petId: string }> }
) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { petId } = await params;
  const body = await req.json();

  const pet = await prisma.pet.findFirst({
    where: { id: Number(petId), user_id: user.id, is_active: true },
  });

  if (!pet) {
    return NextResponse.json({ error: "Pet not found" }, { status: 404 });
  }

  // SCRUM-53/55: lazy-import sanitizers (keeps cold-start small for read paths)
  const { sanitizeName, sanitizeText, safeUrlOrEmpty } = await import("@/lib/sanitize");

  const updateData: any = {};
  // SCRUM-60: name was previously silently ignored. Now accepted + sanitized.
  if (body.name !== undefined) {
    const cleanName = sanitizeName(body.name, 50);
    if (cleanName) updateData.name = cleanName;
  }
  if (body.appearance_desc !== undefined) {
    updateData.appearance_desc = sanitizeText(body.appearance_desc, 2000);
  }
  if (body.avatar_url !== undefined) {
    const safeAvatar = safeUrlOrEmpty(body.avatar_url);
    if (safeAvatar) {
      if (applicationMediaKey(safeAvatar) && !await userCanAssignApplicationMedia(user.id, safeAvatar)) {
        return NextResponse.json({ error: "Avatar media is not owned by this account" }, { status: 403 });
      }
      // Pet avatars must be an animal/creature, not a human — this mirrors into
      // the public Community showcase. Ordinary vendor errors fail closed,
      // while spend-cap/store failures return 429/503 and cannot be bypassed.
      try {
        if (await isHumanAvatar(safeAvatar, user.id)) {
          return NextResponse.json(
            { error: "Pet avatars must be an animal or creature, not a person" },
            { status: 400 },
          );
        }
      } catch (error) {
        const response = visionBudgetResponse(error);
        if (response) return response;
        throw error;
      }
      updateData.avatar_url = safeAvatar;
    }
  }
  // Codex art (the AI "collectible creature sticker"). Separate from avatar_url so
  // the real photo is never overwritten. Empty string clears it (flip fully back
  // to the photo everywhere).
  if (body.codex_url !== undefined) {
    updateData.codex_url = body.codex_url === "" ? null : safeUrlOrEmpty(body.codex_url) || undefined;
    if (updateData.codex_url && applicationMediaKey(updateData.codex_url)
      && !await userCanAssignApplicationMedia(user.id, updateData.codex_url)) {
      return NextResponse.json({ error: "Codex media is not owned by this account" }, { status: 403 });
    }
    if (updateData.codex_url === undefined) delete updateData.codex_url;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  // Re-lock and re-authorize the destination at the write boundary. Pet
  // deletion takes the same row lock before collecting avatar/codex refs, so a
  // PATCH either commits first and is included in deletion, or observes the
  // deleted row and cannot attach media after the cleanup snapshot.
  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{
        id: number;
        avatar_url: string | null;
        codex_url: string | null;
      }>>`
        SELECT "id", "avatar_url", "codex_url"
        FROM "pets"
        WHERE "id" = ${pet.id}
          AND "user_id" = ${user.id}
          AND "is_active" = TRUE
        FOR UPDATE
      `;
      const current = locked[0];
      if (!current) return null;

      const nextAvatar = Object.prototype.hasOwnProperty.call(updateData, "avatar_url")
        ? updateData.avatar_url as string | null
        : current.avatar_url;
      const nextCodex = Object.prototype.hasOwnProperty.call(updateData, "codex_url")
        ? updateData.codex_url as string | null
        : current.codex_url;

      // Claim each new first-party object while the Pet and preview rows are
      // locked. Cleanup either wins first (and assignment fails) or skips this
      // row; it can never delete bytes after a successful binding.
      const mediaToClaim = new Map<string, string>();
      const changedMedia = [
        Object.prototype.hasOwnProperty.call(updateData, "avatar_url") ? nextAvatar : null,
        Object.prototype.hasOwnProperty.call(updateData, "codex_url") ? nextCodex : null,
      ];
      for (const value of changedMedia) {
        if (!value) continue;
        const key = applicationMediaKey(value);
        if (key) mediaToClaim.set(key, value);
      }
      for (const value of mediaToClaim.values()) {
        await claimOrVerifyApplicationMediaForPet(tx, user.id, pet.id, value);
      }

      const result = await tx.pet.update({ where: { id: pet.id }, data: updateData });
      const retainedKeys = new Set(
        [nextAvatar, nextCodex]
          .map((value) => value ? applicationMediaKey(value) : null)
          .filter((key): key is string => Boolean(key)),
      );
      const releasedKeys = new Set<string>();
      for (const oldValue of [current.avatar_url, current.codex_url]) {
        if (!oldValue) continue;
        const oldKey = applicationMediaKey(oldValue);
        if (!oldKey || retainedKeys.has(oldKey) || releasedKeys.has(oldKey)) continue;
        await releaseClaimedAvatarMedia(tx, user.id, pet.id, oldValue);
        releasedKeys.add(oldKey);
      }
      return result;
    });
  } catch (error) {
    if (error instanceof AvatarMediaAssignmentError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
  if (!updated) {
    return NextResponse.json({ error: "Pet not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
