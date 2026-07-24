import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

const office = read("src/components/AgentOffice.tsx");
const hotel = read("src/components/GrandPawOffice.tsx");
const scene = read("src/components/GrandPaw3D.tsx");
const sceneEngine = read("src/lib/grandpaw/agent-cafe-3d.js");
const mission = read("src/app/api/petclaw/mission-control/route.ts");
const app = read("src/components/App.tsx");
const account = read("src/app/account/AccountOverview.tsx");

assert.match(mission, /personaVersion: persona\?\.persona_version \?\? null/);
assert.match(mission, /configuredAt: persona\?\.created_at \?\? null/);
assert.match(mission, /updatedAt: persona\?\.updated_at \?\? null/);
assert.doesNotMatch(mission, /checkpoints: pet\.soul_version/);
assert.doesNotMatch(office + hotel, /persona frozen|persona is locked/i);

assert.match(mission, /terminalAgentRuns\.map\(\(run\) => publicTerminalRun\(run\)\)/);
assert.match(mission, /answer: fullReceipt \? boundedText\(run\.answer, RUN_ANSWER_CAP\) : ""/);
assert.match(office, /Open saved result/);
assert.match(hotel, /Open saved result/);
assert.match(office, /api\.pets\.agentRunStatus\(petId, item\.runId\)/);
assert.match(hotel, /api\.pets\.agentRunStatus\(petId, item\.runId\)/);
assert.match(office + hotel, /onToggle=/);
assert.match(office + hotel, /reopening does not run or charge again|NO REPLAY · NO NEW CHARGE/);

for (const label of [
  "RETAINED RECORDS",
  "REFLECTIONS",
  "REACTION SIGNALS",
  "RETAINED PATTERNS",
  "SELECTIONS",
]) {
  assert.match(mission, new RegExp(`metricLabel: "${label}"`));
}
assert.doesNotMatch(hotel, /\{s\.runs\} RUNS/);

assert.match(hotel, /room: "VISUAL SET"/);
assert.match(hotel, /LIVE STATUS · VISUAL LOCATION/);
assert.match(hotel, /DECORATIVE POSITIONS/);
assert.doesNotMatch(hotel, /room: "FRONT DESK"|SELECTED PET LIVE/);
assert.match(hotel, /aria-pressed=\{tab === t\}/);
assert.match(hotel, /aria-pressed=\{pane === p\}/);

for (const source of [office, hotel]) {
  assert.match(source, /role="radiogroup"/);
  assert.match(source, /role="radio"/);
  assert.match(source, /aria-checked=/);
  assert.match(source, /tabIndex=.*\? 0 : -1/);
  assert.match(source, /ArrowRight/);
  assert.match(source, /ArrowLeft/);
  assert.match(source, /aria-invalid=/);
  assert.match(source, /aria-errormessage=/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /AGENT_OFFICE_TASK_MAX_INPUT/);
  assert.match(source, /href="\/privacy"/);
  assert.doesNotMatch(source, /maxLength=\{AGENT_OFFICE_TASK_MAX_INPUT\}/);
  assert.match(source, /aria-live=\{showTaskInputError \? "assertive" : undefined\}/);
  assert.match(source, /View original input/);
  assert.match(source, /Copy run ID/);
  assert.match(source, /Recall evidence/);
}
assert.match(app, /<AgentOffice onCreditsChange=\{handleCreditsChange\} \/>/);
assert.match(office, /onCreditsChange\?\.\(evt\.creditsRemaining\)/);
assert.match(office, /if \(clearInputAfterSettlement\) setGoal\(""\)/);
assert.match(office, /id=\{taskValidationId\} role=\{showTaskInputError \? "alert" : undefined\}/);
assert.match(office, /id=\{`\$\{taskValidationId\}-count`\}>\{goal\.length\}/);
assert.match(hotel, /id="gp-task-validation" role=\{showTaskInputError \? "alert" : undefined\}/);
assert.match(hotel, /id="gp-task-count">\{goal\.length\}/);
for (const [source, marker] of [
  [office, "id={taskValidationId}"],
  [hotel, 'id="gp-task-validation"'],
]) {
  const start = source.indexOf(marker);
  const liveErrorOnly = source.slice(start, source.indexOf("</span>", start));
  assert.doesNotMatch(liveErrorOnly, /goal\.length/);
}
for (const source of [office, hotel]) {
  assert.match(source, /Owner-scoped receipt loaded\./);
  assert.doesNotMatch(source, /aria-live="polite"[^>]*>[\s\S]{0,500}answer \|\| "No answer was returned/);
}
assert.match(mission, /publicRecallEvidence/);
assert.match(mission, /agentOfficeTaskKindFromExecutionContract/);
assert.match(account, /Run ID copied/);
assert.match(account, /fontSize: 13, fontWeight: 700, cursor: "pointer"/);

assert.equal(
  (office.match(/<h1/g) || []).length + (hotel.match(/<h1/g) || []).length,
  1,
  "Agent Office and its hotel child must expose one h1",
);
assert.match(hotel, /const LABEL = "#6D522E"/);
assert.match(scene, /prefers-reduced-motion: reduce/);
assert.match(scene, /Open interactive 3D/);
assert.match(scene, /Pause rotation/);
assert.match(scene, /touchAction: "pan-y"/);
assert.match(sceneEngine, /style\.touchAction[\s\S]*'pan-y'/);

assert.match(office, /petsError/);
assert.match(office, /Retry loading pets/);
assert.match(office, /This is a loading error, not an empty account/);
assert.match(office, /href="\/\?section=my%20pet"/);

console.log("agent-office-ui-truth-contract=PASS");
