/**
 * Canonical privacy guard for every public Generation query.
 *
 * Two independent controls must be honoured before a creation can be public:
 *   1. Generation.source_kind must be exactly "user". This durable provenance
 *      remains fail-closed even if a mutable link row is missing. Historical
 *      rows start "unclassified" and stay private until an off-release,
 *      measured backfill can prove their source.
 *   2. Every row is private unless its owner explicitly publishes it. Pet-linked
 *      output additionally requires that exact pet's Public Profile consent;
 *      generic Studio output is governed by the row-level publish action.
 *
 * Keep all public feed/share routes on publicGenerationWhere(). Reimplementing
 * only part of this predicate is how the social feed and /c/[id] recommendations
 * previously leaked private auto-generations.
 */
import { prisma } from "@/lib/prisma";
import { publicPetWhere } from "@/lib/publicPet";

interface PublicGenerationExtraWhere {
  [key: string]: unknown;
}

/**
 * Build the single fail-closed predicate for a publicly visible creation.
 *
 * Database/privacy lookup errors deliberately propagate. A public endpoint may
 * return 500 during a database incident; it must never fail open and expose a
 * private prompt or media URL.
 */
export async function publicGenerationWhere(
  extra?: PublicGenerationExtraWhere,
): Promise<Record<string, unknown>> {
  const privacyClauses: Record<string, unknown>[] = [
    { status: "completed" },
    { visibility: "public" },
    // Generic publication is allowlisted, not denylisted. Any future or
    // unknown provenance stays private until a dedicated share policy exists.
    { source_kind: "user" },
    {
      OR: [
        { photo_path: { not: "" } },
        { video_path: { not: null } },
      ],
    },
    {
      OR: [
        // Generic Studio output has no pet. Publishing that one item is the
        // owner's explicit public action.
        { pet_id: null },
        // Pet-linked output additionally requires the pet-level public opt-in.
        { pet: { is: publicPetWhere() } },
      ],
    },
  ];
  if (extra) privacyClauses.push(extra);

  return { AND: privacyClauses };
}

/** True only when this id passes the same guard as every public feed. */
export async function isPublicGeneration(generationId: number): Promise<boolean> {
  if (!Number.isInteger(generationId) || generationId <= 0) return false;
  const row = await prisma.generation.findFirst({
    where: await publicGenerationWhere({ id: generationId }),
    select: { id: true },
  });
  return !!row;
}
