import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isKnownEngagementCount,
  normalizeGalleryFallbackItem,
} from "../src/lib/communityFallback";

const counted = normalizeGalleryFallbackItem({
  id: 7,
  photo_path: "/media/real.jpg",
  _count: { likes: 12, comments: 3 },
  is_liked: true,
});
assert.equal(counted.generation_id, 7);
assert.equal(counted.likes_count, 12);
assert.equal(counted.comments_count, 3);
assert.equal(counted.is_liked, true);

const legacyRelations = normalizeGalleryFallbackItem({
  id: 8,
  likes: [{ id: 1 }, { id: 2 }],
  comments: [],
});
assert.equal(legacyRelations.likes_count, 2);
assert.equal(legacyRelations.comments_count, 0);
assert.equal("is_liked" in legacyRelations, false);

const unavailable = normalizeGalleryFallbackItem({
  id: 9,
  photo_path: "/media/real-but-partial.jpg",
});
assert.equal("likes_count" in unavailable, false);
assert.equal("comments_count" in unavailable, false);
assert.equal("is_liked" in unavailable, false);
assert.equal(isKnownEngagementCount(undefined), false);
assert.equal(isKnownEngagementCount(0), true);

const gallerySource = readFileSync(
  new URL("../src/components/SocialGallery.tsx", import.meta.url),
  "utf8",
);
const galleryRouteSource = readFileSync(
  new URL("../src/app/api/gallery/route.ts", import.meta.url),
  "utf8",
);
assert.match(galleryRouteSource, /gen_type: item\.gen_type/);
assert.match(gallerySource, /\.map\(normalizeGalleryFallbackItem\)/);
assert.match(gallerySource, /zeroWorks && !search && <SampleShowcase \/>/);

const commentsStart = gallerySource.indexOf("function CommentSection(");
const commentsEnd = gallerySource.indexOf("// ── Detail Modal ──", commentsStart);
assert.ok(commentsStart >= 0 && commentsEnd > commentsStart);
const commentsSource = gallerySource.slice(commentsStart, commentsEnd);
assert.match(commentsSource, /Comments unavailable\./);
assert.doesNotMatch(commentsSource, /catch\s*\{[\s\S]*?setComments\(\[\]\)/);

const sampleStart = gallerySource.indexOf("function SampleShowcase()");
const sampleEnd = gallerySource.indexOf("// ── Main ──", sampleStart);
assert.ok(sampleStart >= 0 && sampleEnd > sampleStart);
const sampleSource = gallerySource.slice(sampleStart, sampleEnd);
assert.match(sampleSource, />SAMPLE<\/span>/);
assert.doesNotMatch(sampleSource, /onClick=|likes_count|comments_count|display_name|wallet_address/);

console.log("community fallback contract passed");
