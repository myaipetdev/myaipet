import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

const thought = read("src/app/api/pets/[petId]/thought/route.ts");
const diary = read("src/app/api/pets/[petId]/diary/route.ts");
const greeting = read("src/app/api/pets/[petId]/greeting/route.ts");
const petRoute = read("src/app/api/pets/[petId]/route.ts");
const interact = read("src/app/api/pets/[petId]/interact/route.ts");
const moodPortrait = read("src/app/api/pets/[petId]/mood-portrait/route.ts");
const persona = read("src/lib/services/persona.ts");
const modifierStore = read("src/lib/petclaw/modifier-store.ts");
const petWallet = read("src/lib/petclaw/pet-wallet.ts");
const paywall = read("src/lib/paywall.ts");

for (const [name, source, ownedKey] of [
  ["thought", thought, "thought_of_day"],
  ["diary", diary, "weekly_diary"],
  ["greeting", greeting, "proactive"],
]) {
  assert.match(source, /withLockedPetModifiers\(/, `${name} must use the shared modifier lock`);
  assert.match(source, /const startEpoch = pet\.memory_epoch/,
    `${name} must fence the long model call with memory_epoch`);
  assert.match(source, /sourceLedgerSnapshot/,
    `${name} must capture and compare its generation source`);
  assert.match(source, /lockedPet\.memory_epoch !== startEpoch/,
    `${name} must discard a result generated before an owner edit/clear`);
  assert.match(source, /memoryEpoch: startEpoch/,
    `${name} cache must be bound to the deletion generation`);
  assert.match(
    source,
    new RegExp(`personality_modifiers:\\s*\\{[\\s\\S]*?\\.\\.\\.modifiers,[\\s\\S]*?${ownedKey}`),
    `${name} must merge only its owned cache key into current modifiers`,
  );
  assert.doesNotMatch(source, /await prisma\.pet\.update\(/,
    `${name} must not bypass the shared modifier lock`);
}

assert.match(petRoute, /const pet = await withLockedPetModifiers\(/,
  "GET decay side effects must use the shared modifier lock");
assert.match(
  petRoute,
  /happiness: decayed\.happiness,[\s\S]*?personality_modifiers:\s*\{[\s\S]*?\.\.\.modifiers,[\s\S]*?last_decay_at:/,
  "decayed stats and the JSON clock must remain one atomic update",
);

assert.match(interact, /const action = await withLockedPetModifiers\(/,
  "interaction paywall transaction must start under the shared modifier lock");
assert.match(interact, /\$transaction:[\s\S]*?operation\(tx\)/,
  "interaction must reuse the locked transaction rather than nest a second commit");
assert.match(interact, /personality_modifiers:\s*\{\s*\.\.\.mods,[\s\S]*?interaction_history:/,
  "interaction must merge its owned keys into the locked current document");
assert.match(interact, /const state = await withLockedPetModifiers\(/,
  "pending-request GET side effects must use the shared modifier lock");
assert.doesNotMatch(interact, /await prisma\.pet\.update\(/,
  "interaction endpoints must not bypass modifier serialization");

assert.match(moodPortrait, /return withLockedPetModifiers\(petId/,
  "mood portrait RMW must use the shared modifier lock");
assert.match(
  moodPortrait,
  /personality_modifiers:\s*\{ \.\.\.modifiers, mood_portraits: portraits \}/,
  "mood portrait must merge only its owned key into current modifiers",
);
assert.doesNotMatch(moodPortrait, /prisma\.\$transaction\(/,
  "an ordinary fresh-read transaction is not sufficient modifier serialization");

assert.ok((persona.match(/withLockedPetModifiers\(/g) || []).length >= 4,
  "persona snapshots, commits, onboarding, and analysis must share modifier serialization");
assert.match(
  persona,
  /personality_modifiers:\s*\{\s*\.\.\.modifiers,[\s\S]*?user_profile:/,
  "onboarding must merge USER.md entries into current modifiers",
);
assert.match(persona, /memory_epoch:\s*\{ increment: 1 \}/,
  "explicit persona edits must invalidate in-flight generated work");
assert.match(persona, /pet\.memory_epoch !== start\.memoryEpoch/,
  "platform observation must drop after a clear/edit");
assert.match(persona, /current\.persona_version !== start\.personaVersion/,
  "platform observation must not overwrite a newer persona observation");
assert.doesNotMatch(persona, /await prisma\.pet\.update\(/,
  "persona modifier writes must not bypass the shared lock");

assert.match(modifierStore, /export async function lockPetModifiersInTransaction/,
  "existing transactions need the same shared modifier-lock primitive");
assert.match(modifierStore, /new Set\([\s\S]*?\.sort\(\(a, b\) => a - b\)/,
  "multi-pet modifier locks must be de-duplicated and globally ordered");
assert.match(
  modifierStore,
  /for \(const petId of ids\)[\s\S]*?pg_advisory_xact_lock/,
  "each sorted pet id must receive the transaction-scoped advisory lock",
);

assert.match(
  paywall,
  /lockPetModifiersInTransaction\(tx, input\.petId\);[\s\S]*?FROM "pets"[\s\S]*?FOR UPDATE/,
  "paywall must acquire the modifier lock before its pet row lock",
);
assert.match(
  petWallet,
  /lockPetModifiersInTransaction\(client, petId\);[\s\S]*?SELECT personality_modifiers FROM pets[\s\S]*?FOR UPDATE/,
  "pet wallet must acquire the modifier lock before its pet row lock",
);
assert.match(petWallet, /lockPetModifiersInTransaction\(tx, petIds\)/,
  "multi-pet wallet callers must be told to pre-acquire the sorted batch",
);

console.log("Pet modifier writer serialization contract passed");
