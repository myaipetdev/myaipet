import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGENT_OFFICE_TASK_MAX_INPUT,
  getAgentOfficeTaskInputError,
} from "../src/lib/petclaw/agent/office-task-contract.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(resolve(root, path), "utf8");
const [workbench, accountOverview] = await Promise.all([
  read("src/components/AgentWorkbench.tsx"),
  read("src/app/api/account/overview/route.ts"),
]);

assert.equal(AGENT_OFFICE_TASK_MAX_INPUT, 2_000);
assert.equal(
  getAgentOfficeTaskInputError("recall", "x".repeat(AGENT_OFFICE_TASK_MAX_INPUT)),
  null,
);
assert.match(
  getAgentOfficeTaskInputError("recall", "x".repeat(AGENT_OFFICE_TASK_MAX_INPUT + 1)) ?? "",
  /2000 characters or fewer/,
);
assert.match(workbench, /maxLength=\{AGENT_OFFICE_TASK_MAX_INPUT\}/);

const warning = "Do not paste secrets: input and output are sent to the configured AI provider when needed and stored in your private run history under the Privacy policy.";
assert.ok(workbench.includes(warning), "Workbench must show the exact private-input/provider warning");

assert.match(
  workbench,
  /localStorage\.removeItem\(LEGACY_RESULT_STORAGE_KEY\)/,
  "the obsolete origin-wide terminal cache must be cleared on mount",
);
assert.doesNotMatch(
  workbench,
  /localStorage\.(?:getItem|setItem)\(LEGACY_RESULT_STORAGE_KEY/,
  "the obsolete cache must never be read or written",
);
assert.doesNotMatch(workbench, /Loaded your last saved result|setRestored\(/);
assert.doesNotMatch(
  workbench,
  /localStorage\.setItem\([^)]*petclaw_workbench_session_v1/,
  "private terminal results must remain in memory only",
);

assert.match(workbench, /const composerLocked = running \|\| receiptMissing \|\| reconciling/);
assert.match(
  workbench,
  /async \(goalText: string\) => \{\s*if \(\s*running\s*\|\| receiptMissing\s*\|\| reconciling/,
  "the paid-run handler must fail closed during every paid or reconciliation state",
);
assert.match(
  workbench,
  /if \(\s*running\s*\|\| reconciling\s*\|\| !canReconcilePaidRun\(\)\s*\|\| reconcileAttemptRef\.current/,
  "receipt reconciliation must reject overlapping paid/reconciliation attempts",
);
assert.match(workbench, /disabled=\{running \|\| reconciling\}/);
assert.match(workbench, /aria-busy=\{running \|\| reconciling\}/);

const accountResponses = accountOverview.match(/return NextResponse\.json\(/g) ?? [];
const privateHeaders = accountOverview.match(/headers: ACCOUNT_OVERVIEW_RESPONSE_HEADERS/g) ?? [];
assert.equal(accountResponses.length, 3, "account overview response count changed; audit every exit");
assert.equal(
  privateHeaders.length,
  accountResponses.length,
  "every account overview response must attach the private no-store policy",
);
assert.match(
  accountOverview,
  /"Cache-Control": "private, no-store"/,
);

console.log("agent_workbench_privacy_contract=PASS");
