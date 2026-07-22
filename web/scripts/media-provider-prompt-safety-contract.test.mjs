import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(`${webRoot}${path}`, "utf8");

const generate = read("src/app/api/pets/[petId]/generate/route.ts");
const petDate = read("src/app/api/pet-date/route.ts");
const daydreamVideo = read("src/app/api/cron/daydream-to-video/route.ts");
const providerText = read("src/lib/petclaw/provider-safe-text.ts");

function sliceBetween(source, start, end) {
  const startAt = source.indexOf(start);
  assert.notEqual(startAt, -1, `missing contract marker: ${start}`);
  const endAt = source.indexOf(end, startAt + start.length);
  assert.notEqual(endAt, -1, `missing contract marker: ${end}`);
  return source.slice(startAt, endAt);
}

for (const [name, source] of [
  ["generate", generate],
  ["pet-date", petDate],
  ["daydream-video", daydreamVideo],
]) {
  assert.match(
    source,
    /providerSafeStoredText/,
    `${name} must use the bounded provider-safe stored-text boundary`,
  );
  assert.doesNotMatch(source, /function providerSafeStoredText\(/);
}
assert.match(providerText, /isProviderSafeRetainedText\(`\$\{label\} \$\{trimmed\}`\)/);
assert.ok(
  providerText.indexOf("isProviderSafeRetainedText") < providerText.indexOf("trimmed.slice(0, maxChars)"),
  "the complete stored value must be secret-checked before truncation",
);

// The generation prompt may use an explicit request-time prompt, but every
// durable pet text field must first become a provider-safe value. The original
// values remain available to local moderation, owner responses, and storage.
for (const [field, cap] of [
  ["pet.name", "50"],
  ["pet.personality_type", "20"],
  ["appearanceDesc", "2_000"],
  ["rawCustomTraits", "500"],
]) {
  assert.match(
    generate,
    new RegExp(`providerSafeStoredText\\(${field.replace(".", "\\.")}, [^,]+, ${cap}\\)`),
    `generate must sanitize and cap ${field}`,
  );
}
const generateBuild = sliceBetween(
  generate,
  "const personalizedPrompt = buildPetPrompt(",
  ");\n\n  // audit H13/H18",
);
assert.match(generateBuild, /providerPetName/);
assert.match(generateBuild, /providerPersonality/);
assert.match(generateBuild, /providerAppearanceDesc/);
assert.doesNotMatch(generateBuild, /pet\.name|pet\.personality_type|appearanceDesc\s*\|\|/);
assert.match(generate, /falLoraImage\(personalizedPrompt,/);
assert.match(generate, /generateGrokImageWithRef\(personalizedPrompt,/);
assert.match(generate, /generateGrokImage\(personalizedPrompt,/);
assert.match(generate, /submitGrokVideo\(\s*personalizedPrompt,/);

// Pet Date returns the real names to the signed-in owner, but its model system
// message must contain only neutralized names, personalities, and elements.
const petDateSystem = sliceBetween(petDate, "const system = `", "`;\n\n  const run =");
for (const safeField of [
  "providerMineName",
  "providerTheirName",
  "providerMinePersonality",
  "providerTheirPersonality",
  "providerMineElement",
  "providerTheirElement",
]) {
  assert.match(petDateSystem, new RegExp(`\\$\\{${safeField}\\}`));
}
assert.doesNotMatch(
  petDateSystem,
  /\$\{(?:mine|theirs)\.(?:name|personality_type|element)\b/,
  "pet-date provider prompt must not interpolate raw durable text",
);
assert.match(petDate, /pet_a: \{ name: mine\.name,/);
assert.match(petDate, /pet_b: \{ name: theirs\.name,/);

// Cron-derived video prompts are allowed only after every retained text field
// is checked. Private avatar locations are materialized before provider use.
for (const [value, label, cap] of [
  ["c.petName", "pet_name", "50"],
  ["c.appearanceDesc", "appearance", "2_000"],
  ["c.personalityType", "personality", "20"],
  ["c.mood", "mood", "40"],
  ["c.insight", "retained_insight", "1_200"],
]) {
  assert.match(
    daydreamVideo,
    new RegExp(`providerSafeStoredText\\(${value.replace(".", "\\.")}, \\\"${label}\\\", ${cap}\\)`),
    `daydream video must sanitize and cap ${value}`,
  );
}
const cronBuild = sliceBetween(
  daydreamVideo,
  "const prompt = buildPetPrompt(",
  ");\n\n      // Re-check after the scene LLM",
);
assert.doesNotMatch(cronBuild, /c\.(?:petName|appearanceDesc|personalityType|mood|insight)/);
assert.match(daydreamVideo, /prepareVisionImageInput\(c\.avatarUrl, \{ materializeExternal: true \}\)/);
assert.match(daydreamVideo, /submitGrokVideo\(prompt, DURATION_SEC, anchor\)/);

console.log("media provider prompt safety contract: ok");
