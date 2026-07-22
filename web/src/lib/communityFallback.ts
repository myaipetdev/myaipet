type GalleryFallbackItem = Record<string, unknown>;

/**
 * Engagement counts are trustworthy only when the API actually supplied a
 * non-negative integer (or a loaded relation whose length is known). Missing
 * data must stay missing: treating it as zero makes an outage look like real
 * community inactivity.
 */
export function isKnownEngagementCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function relationCount(item: GalleryFallbackItem, relation: "likes" | "comments") {
  const aggregate = item._count && typeof item._count === "object"
    ? (item._count as Record<string, unknown>)[relation]
    : undefined;
  const candidates = [item[`${relation}_count`], aggregate];
  for (const candidate of candidates) {
    if (isKnownEngagementCount(candidate)) return candidate;
  }

  const loadedRelation = item[relation];
  if (Array.isArray(loadedRelation)) return loadedRelation.length;
  if (isKnownEngagementCount(loadedRelation)) return loadedRelation;
  return undefined;
}

/** Normalize the public-gallery response without inventing social activity. */
export function normalizeGalleryFallbackItem(item: GalleryFallbackItem) {
  const normalized: GalleryFallbackItem = {
    ...item,
    generation_id: item.generation_id ?? item.id,
  };
  const likesCount = relationCount(item, "likes");
  const commentsCount = relationCount(item, "comments");

  if (likesCount === undefined) delete normalized.likes_count;
  else normalized.likes_count = likesCount;

  if (commentsCount === undefined) delete normalized.comments_count;
  else normalized.comments_count = commentsCount;

  // An unauthenticated/legacy gallery response cannot tell us whether the
  // current viewer liked an item. Keep that state unknown instead of false.
  if (typeof item.is_liked !== "boolean") delete normalized.is_liked;

  return normalized;
}
