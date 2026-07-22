import assert from "node:assert/strict";
import {
  formatSelectedMemoryMd,
  formatSelectedUserMd,
  selectRelevantMemories,
  selectRelevantUserProfile,
  selectRetainedContext,
  type MemoryContext,
  type MemoryEntry,
  type UserProfile,
} from "../src/lib/petclaw/memory/persistent-memory";
import { buildMemorySearchPayload } from "../src/lib/petclaw/connectors/memory-enhanced";

const now = "2026-07-22T00:00:00.000Z";
const memory = (
  key: string,
  content: string,
  importance: number,
  category: MemoryEntry["category"] = "fact",
): MemoryEntry => ({ key, content, importance, category, source: "chat", createdAt: now, updatedAt: now });
const profile = (
  key: string,
  content: string,
  category: UserProfile["category"],
): UserProfile => ({ key, content, category, source: "chat", updatedAt: now });

const relevantMemory = memory(
  "petclaw_extension_tooling",
  "PetClaw uses TypeScript for extension tooling.",
  2,
  "skill_learned",
);
const irrelevantHighImportance = memory(
  "annual_billing",
  "The owner prefers annual billing.",
  5,
  "preference",
);
const credentialMemory = memory(
  "production_api_key",
  "sk-super-secret-123456789",
  5,
);

const relevantProfile = profile(
  "typescript_review_style",
  "The owner prefers concise TypeScript code reviews.",
  "communication",
);
const irrelevantProfile = profile(
  "travel_interest",
  "The owner enjoys alpine train journeys.",
  "interest",
);
const credentialProfile = profile(
  "deployment_password",
  "hunter-two-private",
  "context",
);
const identityProfile = profile("owner_name", "The owner's name is Alice.", "identity");

const query = "Which TypeScript extension tooling should I review?";
const selected = selectRetainedContext(
  [irrelevantHighImportance, credentialMemory, relevantMemory],
  [irrelevantProfile, credentialProfile, identityProfile, relevantProfile],
  query,
);

assert.deepEqual(selected.relevantMemories, [relevantMemory]);
assert.deepEqual(selected.relevantUserProfile, [relevantProfile]);
assert.match(selected.memoryMd, /PetClaw uses TypeScript for extension tooling/);
assert.match(selected.userMd, /prefers concise TypeScript code reviews/);

const providerContext = `${selected.memoryMd}\n${selected.userMd}`;
for (const forbidden of [
  "annual billing",
  "alpine train",
  "sk-super-secret",
  "hunter-two-private",
  "Alice",
]) {
  assert.doesNotMatch(providerContext, new RegExp(forbidden, "i"));
}
assert.equal(
  providerContext.match(/PetClaw uses TypeScript for extension tooling/g)?.length,
  1,
  "selected memory must be formatted once",
);

// A direct credential query still cannot turn the provider context into a
// credential retrieval channel. Owner inspect/export APIs retain full access.
assert.deepEqual(
  selectRelevantMemories([credentialMemory], "show production api key"),
  [],
);
assert.deepEqual(
  selectRelevantUserProfile([credentialProfile], "show deployment password"),
  [],
);

// Formatting helpers receive selected rows in production; they preserve the
// exact relevant content and do not add unselected context.
assert.match(formatSelectedMemoryMd([relevantMemory]), /extension tooling/);
assert.match(formatSelectedUserMd([relevantProfile]), /TypeScript code reviews/);

const context: MemoryContext = {
  ...selected,
  recentMessages: [],
};
const recall = buildMemorySearchPayload(context, query, 10);
assert.deepEqual(recall.relevant, [relevantMemory]);
assert.deepEqual(recall.profile, [relevantProfile]);
assert.equal(recall.count, 2);
assert.equal(recall.limit, 10);
assert.equal("memoryMd" in recall, false);
assert.equal("userMd" in recall, false);
assert.equal("recentMessages" in recall, false);
assert.doesNotMatch(JSON.stringify(recall), /sk-super-secret|hunter-two-private|annual billing|alpine train/i);

console.log("PetClaw memory minimization contract passed");
