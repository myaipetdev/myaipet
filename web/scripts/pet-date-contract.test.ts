import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  parsePetDateOutput,
  runReservedPetDate,
  type PetDateOutput,
} from "../src/lib/petDateContract";

async function main() {
const validOutput: PetDateOutput = {
  log: Array.from({ length: 6 }, (_, index) => ({
    speaker: index % 2 === 0 ? "A" as const : "B" as const,
    text: `Turn ${index + 1}`,
  })),
  vibe: "playful",
  friendship: 12,
};
const encoded = (value: unknown) => JSON.stringify(value);

assert.deepEqual(parsePetDateOutput(encoded(validOutput)), { ok: true, value: validOutput });
for (const invalid of [
  { ...validOutput, log: validOutput.log.slice(0, 5) },
  { ...validOutput, log: [...validOutput.log, ...validOutput.log.slice(0, 5)] },
  { ...validOutput, log: validOutput.log.map((turn, index) => index === 1 ? { ...turn, speaker: "A" } : turn) },
  { ...validOutput, log: validOutput.log.map((turn, index) => index === 0 ? { ...turn, text: "x".repeat(81) } : turn) },
  { ...validOutput, log: validOutput.log.map((turn, index) => index === 0 ? { ...turn, extra: true } : turn) },
  { ...validOutput, vibe: "romantic" },
  { ...validOutput, friendship: -21 },
  { ...validOutput, friendship: 31 },
  { ...validOutput, friendship: 1.5 },
  { ...validOutput, extra: true },
  { ...validOutput, log: validOutput.log.map((turn, index) => index === 0 ? { ...turn, text: "안녕" } : turn) },
]) {
  assert.equal(parsePetDateOutput(encoded(invalid)).ok, false, `accepted invalid output: ${encoded(invalid)}`);
}
assert.equal(parsePetDateOutput(`\`\`\`json\n${encoded(validOutput)}\n\`\`\``).ok, false);
assert.equal(parsePetDateOutput("x".repeat(8_001)).ok, false);

// Lifecycle regression: provider work never starts without a reservation, and
// provider/contract/settlement failures restore the reservation exactly once.
{
  const events: string[] = [];
  const result = await runReservedPetDate({
    reserve: async () => { events.push("reserve"); return null; },
    invokeProvider: async () => { events.push("provider"); return encoded(validOutput); },
    settle: async () => { events.push("settle"); return { id: 1 }; },
    refund: async () => { events.push("refund"); return 20; },
  });
  assert.equal(result.kind, "insufficient");
  assert.deepEqual(events, ["reserve"]);
}
{
  const events: string[] = [];
  let wallet = 0;
  const providerError = new Error("synthetic provider failure");
  const result = await runReservedPetDate({
    reserve: async () => { events.push("reserve"); return { id: "r1" }; },
    invokeProvider: async () => { events.push("provider"); throw providerError; },
    settle: async () => { events.push("settle"); return { id: 1 }; },
    refund: async () => { events.push("refund"); wallet += 20; return wallet; },
  });
  assert.equal(result.kind, "failed");
  assert.equal(result.kind === "failed" ? result.phase : null, "provider");
  assert.deepEqual(events, ["reserve", "provider", "refund"]);
  assert.equal(wallet, 20, "provider failure must refund the reserved credits");
}
{
  const events: string[] = [];
  const result = await runReservedPetDate({
    reserve: async () => { events.push("reserve"); return { id: "r2" }; },
    invokeProvider: async () => { events.push("provider"); return "{}"; },
    settle: async () => { events.push("settle"); return { id: 1 }; },
    refund: async () => { events.push("refund"); return 20; },
  });
  assert.equal(result.kind, "invalid_output");
  assert.deepEqual(events, ["reserve", "provider", "refund"]);
}
{
  const events: string[] = [];
  const result = await runReservedPetDate({
    reserve: async () => { events.push("reserve"); return { id: "r3" }; },
    invokeProvider: async () => { events.push("provider"); return encoded(validOutput); },
    settle: async () => { events.push("settle"); throw new Error("synthetic write failure"); },
    refund: async () => { events.push("refund"); return 20; },
  });
  assert.equal(result.kind, "failed");
  assert.equal(result.kind === "failed" ? result.phase : null, "settlement");
  assert.deepEqual(events, ["reserve", "provider", "settle", "refund"]);
}
{
  const events: string[] = [];
  const result = await runReservedPetDate({
    reserve: async () => { events.push("reserve"); return { id: "r4" }; },
    invokeProvider: async () => { events.push("provider"); return encoded(validOutput); },
    settle: async (_reservation, output) => { events.push("settle"); return { id: 1, output }; },
    refund: async () => { events.push("refund"); return 20; },
  });
  assert.equal(result.kind, "success");
  assert.deepEqual(events, ["reserve", "provider", "settle"]);
}

// Static concurrency/settlement guard: reservation precedes the provider,
// PetDate + charge commit share one transaction, and the route has no ad-hoc
// debit/refund that could double-credit under retries.
const webRoot = fileURLToPath(new URL("../", import.meta.url));
const route = readFileSync(`${webRoot}src/app/api/pet-date/route.ts`, "utf8");
const reservations = readFileSync(`${webRoot}src/lib/agentCreditReservation.ts`, "utf8");
const hub = readFileSync(`${webRoot}src/lib/petclaw/pethub.ts`, "utf8");
const reserveAt = route.indexOf('reserveAgentCredits(user.id, mine.id, COST_CREDITS, "pet_date")');
const providerAt = route.indexOf("const out = await callLLM(");
assert.ok(reserveAt > 0 && providerAt > reserveAt, "credit reservation must precede provider work");
assert.match(route, /const myPetIdNumber = Number\(myPetId\)/);
assert.match(route, /const theirPetIdNumber = Number\(theirPetId\)/);
assert.match(route, /Number\.isSafeInteger\(myPetIdNumber\)[\s\S]*Number\.isSafeInteger\(theirPetIdNumber\)/);
assert.match(route, /if \(myPetIdNumber === theirPetIdNumber\)/);
assert.match(route, /where: \{ id: myPetIdNumber,/);
assert.match(route, /id: theirPetIdNumber,/);
assert.doesNotMatch(route, /myPetId === theirPetId/);
assert.match(route, /settle:[\s\S]*prisma\.\$transaction[\s\S]*tx\.petDate\.create[\s\S]*commitAgentCreditsWithDb\(tx, reservation\)/);
assert.match(route, /refund:\s*refundAgentCreditsOnce/);
assert.doesNotMatch(route, /credits:\s*\{\s*(?:decrement|increment):/);
assert.match(reservations, /credits:\s*\{\s*gte:\s*amount\s*\}/);
assert.match(reservations, /data:\s*\{\s*credits:\s*\{\s*decrement:\s*amount\s*\}\s*\}/);
assert.ok(
  reservations.indexOf("await tx.user.updateMany") < reservations.indexOf("await tx.agentCreditReservation.create"),
  "guarded debit and durable reservation must share the reservation transaction",
);
assert.match(hub, /id:\s*"pet-date"[\s\S]*minItems:\s*6,\s*maxItems:\s*10[\s\S]*maxLength:\s*80[\s\S]*enum:\s*\["playful", "deep", "rivalry", "shy"\][\s\S]*minimum:\s*-20,\s*maximum:\s*30/);

  console.log("pet_date_contract=PASS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
