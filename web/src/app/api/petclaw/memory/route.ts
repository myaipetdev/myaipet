/**
 * Owner-facing memory inspection and edit API.
 *
 *   GET    /api/petclaw/memory?petId=N
 *           → { memories[], userProfile[], sessions[], stats }
 *
 *   DELETE /api/petclaw/memory?petId=N&entryType=memory&key=user_name
 *           → drop a single entry (sovereignty: redact, not just bulk-export)
 *
 *   DELETE /api/petclaw/memory?petId=N&entryType=session&id=42
 *           → drop one session log row
 *
 *   PATCH  /api/petclaw/memory?petId=N&entryType=memory   body: {key, content?, importance?}
 *           → edit an entry's content/importance (e.g. correct a wrong fact)
 *
 * Sovereignty principle: the owner can see and edit anything the pet has stored
 * about them. Tokens still never appear — those live in pet_platform_connections.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { containsHangul, generatedEnglishOrFallback } from "@/lib/generatedLanguage";

async function ownsPet(req: NextRequest): Promise<{ user: { id: number } | null; petId: number; pet: any | null }> {
  const user = await getUser(req);
  const petId = Number(req.nextUrl.searchParams.get("petId"));
  if (!user || !Number.isInteger(petId) || petId <= 0) {
    return { user: null, petId, pet: null };
  }
  const pet = await prisma.pet.findFirst({ where: { id: petId, user_id: user.id, is_active: true } });
  return { user, petId, pet };
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, { key: "memory-read", limit: 60, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const { user, petId, pet } = await ownsPet(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

  const mods = (pet.personality_modifiers as any) || {};
  // Legacy generated rows remain untouched and exportable, but this English-only
  // inspection surface hides them rather than silently translating owner data.
  const memories = (Array.isArray(mods.persistent_memories) ? mods.persistent_memories : [])
    .filter((entry: any) => !containsHangul(entry?.content));
  const userProfile = (Array.isArray(mods.user_profile) ? mods.user_profile : [])
    .filter((entry: any) => !containsHangul(entry?.content));
  const learnedPatterns = (Array.isArray(mods.learned_patterns) ? mods.learned_patterns : [])
    .filter((entry: any) => !containsHangul(entry));
  // VIGIL bond-loop relationship notes — the second-person, actionable notes the
  // pet wrote about how to treat you (capped ring in bond_reflections).
  const bondNotes = Array.isArray(mods.bond_reflections)
    ? mods.bond_reflections
        .map((r: any) => (typeof r === "string" ? r : r?.note))
        .filter((note: unknown) => typeof note === "string" && !containsHangul(note))
        .slice(-8)
    : [];

  const sessions = await prisma.petMemory.findMany({
    where: { pet_id: petId, memory_type: { startsWith: "session_" } },
    orderBy: { created_at: "desc" },
    take: 100,
    select: { id: true, memory_type: true, content: true, created_at: true },
  });

  return NextResponse.json({
    petId,
    memories,
    userProfile,
    learnedPatterns,
    bondNotes,
    sessions: sessions.map(s => {
      const petGenerated = /^\[pet\]\s*/.test(s.content);
      return {
        id: s.id,
        platform: s.memory_type.replace("session_", ""),
        // Owner-authored turns remain intact. Only legacy pet-generated turns
        // receive a neutral English display fallback.
        content: petGenerated
          ? generatedEnglishOrFallback(
              s.content,
              "[pet] A previous pet reply is unavailable in this English-only release.",
            )
          : s.content,
        createdAt: s.created_at,
      };
    }),
    stats: {
      memoryCount: memories.length,
      profileCount: userProfile.length,
      learnedSkillCount: learnedPatterns.filter((p: any) => p.promotedToSkill).length,
      sessionCount: sessions.length,
      lastConsolidatedAt: mods.last_consolidation_at || null,
    },
  });
}

export async function DELETE(req: NextRequest) {
  const rl = rateLimit(req, { key: "memory-delete", limit: 30, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const { user, petId, pet } = await ownsPet(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

  const entryType = req.nextUrl.searchParams.get("entryType");
  const all = req.nextUrl.searchParams.get("all") === "1";

  if (entryType === "session") {
    if (all) {
      const r = await prisma.petMemory.deleteMany({
        where: { pet_id: petId, memory_type: { startsWith: "session_" } },
      });
      return NextResponse.json({ ok: true, deleted: r.count });
    }
    const id = Number(req.nextUrl.searchParams.get("id"));
    if (!Number.isInteger(id)) return NextResponse.json({ error: "id required" }, { status: 400 });
    const r = await prisma.petMemory.deleteMany({ where: { id, pet_id: petId } });
    return NextResponse.json({ ok: true, deleted: r.count });
  }

  const mods = (pet.personality_modifiers as any) || {};
  if (entryType === "memory") {
    if (all) {
      await prisma.pet.update({
        where: { id: petId },
        data: { personality_modifiers: { ...mods, persistent_memories: [] } as any },
      });
      return NextResponse.json({ ok: true });
    }
    const key = req.nextUrl.searchParams.get("key");
    if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
    const arr = (mods.persistent_memories || []).filter((m: any) => m.key !== key);
    await prisma.pet.update({
      where: { id: petId },
      data: { personality_modifiers: { ...mods, persistent_memories: arr } as any },
    });
    return NextResponse.json({ ok: true });
  }

  if (entryType === "profile") {
    if (all) {
      await prisma.pet.update({
        where: { id: petId },
        data: { personality_modifiers: { ...mods, user_profile: [] } as any },
      });
      return NextResponse.json({ ok: true });
    }
    const key = req.nextUrl.searchParams.get("key");
    if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
    const arr = (mods.user_profile || []).filter((u: any) => u.key !== key);
    await prisma.pet.update({
      where: { id: petId },
      data: { personality_modifiers: { ...mods, user_profile: arr } as any },
    });
    return NextResponse.json({ ok: true });
  }

  if (entryType === "learned") {
    if (all) {
      await prisma.pet.update({
        where: { id: petId },
        data: { personality_modifiers: { ...mods, learned_patterns: [] } as any },
      });
      return NextResponse.json({ ok: true });
    }
    const id = req.nextUrl.searchParams.get("key");
    if (!id) return NextResponse.json({ error: "key required" }, { status: 400 });
    const arr = (mods.learned_patterns || []).filter((p: any) => p.id !== id && p.topic !== id);
    await prisma.pet.update({
      where: { id: petId },
      data: { personality_modifiers: { ...mods, learned_patterns: arr } as any },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown entryType" }, { status: 400 });
}

export async function PATCH(req: NextRequest) {
  const rl = rateLimit(req, { key: "memory-edit", limit: 30, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  const { user, petId, pet } = await ownsPet(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

  const entryType = req.nextUrl.searchParams.get("entryType");
  const body = await req.json().catch(() => ({}));
  const { key, content, importance, category } = body;
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });

  const mods = (pet.personality_modifiers as any) || {};

  if (entryType === "memory") {
    const arr = Array.isArray(mods.persistent_memories) ? [...mods.persistent_memories] : [];
    const idx = arr.findIndex((m: any) => m.key === key);
    if (idx === -1) return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    if (typeof content === "string") arr[idx].content = content.slice(0, 400);
    if (typeof importance === "number") arr[idx].importance = Math.max(1, Math.min(5, importance));
    if (typeof category === "string") arr[idx].category = category;
    arr[idx].updatedAt = new Date().toISOString();
    arr[idx].source = "user_edit";
    await prisma.pet.update({
      where: { id: petId },
      data: { personality_modifiers: { ...mods, persistent_memories: arr } as any },
    });
    return NextResponse.json({ ok: true, entry: arr[idx] });
  }

  if (entryType === "profile") {
    const arr = Array.isArray(mods.user_profile) ? [...mods.user_profile] : [];
    const idx = arr.findIndex((u: any) => u.key === key);
    if (idx === -1) return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    if (typeof content === "string") arr[idx].content = content.slice(0, 400);
    if (typeof category === "string") arr[idx].category = category;
    arr[idx].updatedAt = new Date().toISOString();
    arr[idx].source = "user_edit";
    await prisma.pet.update({
      where: { id: petId },
      data: { personality_modifiers: { ...mods, user_profile: arr } as any },
    });
    return NextResponse.json({ ok: true, entry: arr[idx] });
  }

  return NextResponse.json({ error: "Unknown entryType" }, { status: 400 });
}
