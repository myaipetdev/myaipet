import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const route = await readFile(
  resolve(root, "src/app/api/petclaw/mission-control/route.ts"),
  "utf8",
);

const ownerAuthAt = route.indexOf("await requirePetOwner(req, petId)");
const runReadAt = route.indexOf("prisma.petAgentRun.findMany({");
assert.ok(ownerAuthAt > 0 && runReadAt > ownerAuthAt, "run-ledger reads must follow owner auth");

assert.equal(
  (route.match(/prisma\.petAgentRun\.findMany\(\{/g) ?? []).length,
  2,
  "active and terminal receipts should use two bounded, purpose-specific reads",
);
assert.match(route, /user_id: user\.id,\s*pet_id: pet\.id,\s*state: \{ in: \["reserved", "running"\] \}/);
assert.match(route, /where: \{ user_id: user\.id, pet_id: pet\.id, state: "terminal" \}/);
assert.match(route, /take: ACTIVE_RUN_CAP/);
assert.match(route, /take: TERMINAL_RUN_CAP/);
assert.match(route, /const pending = activeAgentRuns[\s\S]*run\.state === "reserved"/);
assert.match(route, /const working = activeAgentRuns[\s\S]*run\.state === "running"/);

const terminalProjection = route.slice(
  route.indexOf("function publicTerminalRun"),
  route.indexOf("function publicActiveRun"),
);
for (const field of [
  "runId",
  "detail",
  "completed",
  "answer",
  "steps",
  "stoppedReason",
  "creditsRemaining",
]) {
  assert.match(terminalProjection, new RegExp(`${field}:`), `missing terminal ${field}`);
}
assert.match(terminalProjection, /\n\s+billing,\n/, "missing terminal billing");
assert.match(terminalProjection, /Stopped · \$\{readableStop\} · credits refunded\./);
assert.match(terminalProjection, /Completed without a chargeable deliverable · credits refunded\./);
assert.match(route, /latestAgentRun = terminalAgentRuns\[0\][\s\S]*publicTerminalRun\(terminalAgentRuns\[0\], true\)/);
assert.match(route, /!action\.action_taken\.startsWith\("tool_agent:"\)/);

assert.match(route, /const RUN_ANSWER_CAP = 8_000/);
assert.match(route, /const RUN_STEP_CAP = 8/);
assert.match(route, /\.slice\(0, RUN_STEP_CAP\)/);
const stepProjection = route.slice(
  route.indexOf("function publicStepSummaries"),
  route.indexOf("function publicBilling"),
);
assert.match(stepProjection, /skill,[\s\S]*ok: record\.ok === true/);
assert.match(stepProjection, /publicRecallEvidence\(record\.output\)/);
for (const privateStepField of ["input:", "output:", "thought:", "sideEffectCommitted:", "modelCalls:"]) {
  assert.doesNotMatch(
    stepProjection,
    new RegExp(privateStepField),
    `mission-control should not poll full private step field ${privateStepField}`,
  );
}
assert.match(route, /isValidTerminalPaidAgentRunBilling\(value\)/);
assert.match(route, /goal: boundedText\(run\.goal, fullReceipt \? 2_000 : 500\)/);
assert.match(route, /"Cache-Control": "private, no-store"/);
assert.match(
  route,
  /user_id: user\.id,\s*pet_id: pet\.id,\s*status: "completed"/,
  "pet Office generation history must be scoped to the selected pet as well as its owner",
);
for (const forbiddenSelection of [
  "reservation_id: true",
  "user_id: true",
  "pet_name: true",
]) {
  assert.doesNotMatch(
    route.slice(route.indexOf("const AGENT_RUN_SELECT"), route.indexOf("function startOfToday")),
    new RegExp(forbiddenSelection.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
}

for (const capability of [
  "recall_memory",
  "office-summarize",
  "office-review",
  "office-draft",
]) {
  assert.match(route, new RegExp(`id: "${capability}"`), `missing typed Office capability ${capability}`);
}
assert.doesNotMatch(route, /BUILTIN_SKILLS\.map/);
assert.match(route, /mode: pet\.is_active \? "core-in-process" as const : "locked" as const/);
assert.match(route, /availableInOffice: false/);
assert.match(route, /blockedReason:/);

assert.match(route, /const observed = !!routine\.lastRun \|\| !!routine\.nextRun/);
assert.match(route, /source: observed \? "observed" as const : "catalog" as const/);
assert.match(route, /mode: observed \? "observed-read-only" as const : "catalog-read-only" as const/);
assert.match(route, /readOnly: true/);
assert.match(route, /const observedRoutineCount = schedules\.filter/);
assert.match(route, /catalogCount: schedules\.length/);
assert.match(route, /observedCount: observedRoutineCount/);
assert.doesNotMatch(route, /routines: schedules\.length/);
assert.doesNotMatch(route, /"Autonomy on"/);

console.log("mission_control_ledger_contract=PASS");
