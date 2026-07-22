import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(resolve(root, path), "utf8");

const [agent, route, statusRoute, workbench, office, consoleView, apiClient, pethub, router, persistentMemory, selfLearning, consolidate, platformResilience, deadline, browserRunClient, deleteRoute, accountRoute, accountView, cli, mcp] = await Promise.all([
  read("src/lib/petclaw/agent/tool-agent.ts"),
  read("src/app/api/pets/[petId]/agent/route.ts"),
  read("src/app/api/pets/[petId]/agent/runs/[runId]/route.ts"),
  read("src/components/AgentWorkbench.tsx"),
  read("src/components/AgentOffice.tsx"),
  read("src/components/PetClawConsole.tsx"),
  read("src/lib/api.ts"),
  read("src/lib/petclaw/pethub.ts"),
  read("src/lib/llm/router.ts"),
  read("src/lib/petclaw/memory/persistent-memory.ts"),
  read("src/lib/petclaw/memory/self-learning.ts"),
  read("src/lib/petclaw/memory/consolidate.ts"),
  read("src/lib/llm/platform-resilience.ts"),
  read("src/lib/petclaw/agent/deadline.ts"),
  read("src/lib/petclaw/agent-run-client.ts"),
  read("src/app/api/petclaw/delete/route.ts"),
  read("src/app/api/account/overview/route.ts"),
  read("src/app/account/AccountOverview.tsx"),
  read("../packages/petclaw/bin/petclaw.js"),
  read("../packages/petclaw/mcp/server.js"),
]);

// Arbitrary server-side URL fetches stay unavailable until every redirect hop
// is resolved and checked by a redirect-safe SSRF policy.
assert.doesNotMatch(agent, /name:\s*["']web_read["']/);
assert.doesNotMatch(agent, /WebSearchConnector\(\)\.summarize/);
assert.doesNotMatch(agent, /name:\s*["'](?:web_search|wikipedia_lookup|crypto_price)["']/);
assert.match(agent, /explicit owner approval \+ data-taint policy/);

for (const reason of ["completed", "max_steps", "timeout", "planner_error"]) {
  assert.match(agent, new RegExp(`\\|?\\s*["']${reason}["']`));
}
assert.match(agent, /return \{ answer: synthesis\.answer, trace, completed, stoppedReason, usage \}/);
assert.match(
  agent,
  /stoppedReason\s*===\s*["']completed["']\s*&&[\s\S]*trace\.length\s*===\s*0\s*\|\|\s*trace\.some\(\(step\)\s*=>\s*step\.ok\)/,
  "an all-failed tool trace must not be reported as completed",
);
assert.equal(
  (route.match(/stoppedReason:\s*result\.stoppedReason/g) ?? []).length,
  2,
  "JSON and SSE responses must expose the loop's actual stopped reason",
);
assert.equal(
  (route.match(/completed:\s*result\.completed/g) ?? []).length,
  2,
  "JSON and SSE responses must distinguish a completed goal from a stopped run",
);
assert.equal(
  (route.match(/ok:\s*result\.completed/g) ?? []).length,
  2,
  "JSON and SSE must not report timeout/planner_error/max_steps as ok",
);
assert.match(route, /successfulToolCalls\s*=\s*trace\.filter\(\(step\)\s*=>\s*step\.ok\)\.length/);
assert.match(route, /committedSideEffects\s*=\s*trace\.filter\(\(step\)\s*=>\s*step\.sideEffectCommitted\)\.length/);
assert.match(route, /completedDirectAnswer\s*=\s*completed\s*&&\s*trace\.length\s*===\s*0\s*&&\s*modelCalls\s*>\s*0/);
assert.match(route, /chargeable\s*=\s*completedDirectAnswer[\s\S]*completed\s*&&\s*successfulToolCalls\s*>\s*0/);
assert.doesNotMatch(route, /\|\|\s*committedSideEffects\s*>\s*0/);
assert.doesNotMatch(route, /incomplete_with_committed_side_effect/);
assert.match(route, /completed_with_direct_answer/);
assert.equal(
  (route.match(/result\.usage\.modelCalls/g) ?? []).length,
  2,
  "JSON and SSE settlement must use the exact provider-attempt total",
);
assert.equal((route.match(/result\.usage\.orchestratorModelCalls/g) ?? []).length, 2);
assert.equal((route.match(/result\.usage\.skillModelCalls/g) ?? []).length, 2);
assert.match(route, /outcome:\s*chargeable\s*\?\s*["']charged["']\s*:\s*["']refunded["']/);
assert.match(route, /billingReason:\s*AgentBilling\["reason"\][\s\S]*?["']run_not_completed["']/);
assert.equal(
  (route.match(/billing:\s*settlement\.billing/g) ?? []).length,
  2,
  "JSON and SSE must expose the billing outcome",
);
assert.doesNotMatch(route, /stoppedReason:\s*["']finished["']/);
const ownerAuthAt = route.indexOf("await requirePetOwner(req, pid)");
const boundedBodyAt = route.indexOf("await readBoundedJsonBody(req, 4 * 1024)");
assert.ok(ownerAuthAt > 0 && boundedBodyAt > ownerAuthAt, "agent body parsing must be owner-authenticated first");
assert.doesNotMatch(route, /req\.json\(\)/);
assert.match(route, /typeof rawGoal !== ["']string["']/);
assert.match(route, /typeof rawMaxSteps !== ["']number["']/);
assert.ok(route.includes("const rawConfirmCostCredits = body.confirmCostCredits;"));
assert.ok(route.includes("if (rawConfirmCostCredits !== COST_CREDITS)"));
const confirmationAt = route.indexOf("rawConfirmCostCredits !== COST_CREDITS");
const reservationAt = route.indexOf("await reservePetAgentRun({");
assert.ok(
  confirmationAt > boundedBodyAt && reservationAt > confirmationAt,
  "exact paid-run confirmation must be validated after bounded parse and before reservation/provider work",
);
assert.match(route, /reservationResult\.kind === ["']unavailable["'][\s\S]*code:\s*["']pet_unavailable["'][\s\S]*status:\s*404/);

const receiptAuthAt = statusRoute.indexOf("await getUser(req)");
const receiptLimitAt = statusRoute.indexOf("rateLimit(req");
assert.ok(receiptAuthAt > 0 && receiptLimitAt > receiptAuthAt, "receipt rate limit must run after authentication");
assert.match(statusRoute, /key:\s*`agent-run-receipt:\$\{user\.id\}`/);

assert.match(agent, /getExecutableSkillsForPet\(petId\)/);
assert.match(agent, /isSkillPolicyError\(e\)/);
assert.match(agent, /sideEffectCommitted:\s*result\.sideEffectCommitted\s*===\s*true/);
assert.match(agent, /async function executeSkillOnce/);
assert.doesNotMatch(agent, /SKILL_RETRIES|executeWithRetry/);
assert.doesNotMatch(
  agent,
  /withTimeout\(executeSkill\(/,
  "a non-cancelling local timeout must not hide or duplicate a late skill side effect",
);
assert.doesNotMatch(agent, /function withDeadline|Promise\.race/);
assert.match(agent, /createAgentDeadlineScope\(WALLCLOCK_MS, opts\?\.signal\)/);
assert.match(agent, /executeSkill\(petId, skillId, input, \{[\s\S]*signal,/);
assert.match(agent, /executeSkill\(petId, skillId, input, \{[\s\S]*readOnly:\s*true,[\s\S]*noRetention:\s*true,/);
assert.match(agent, /callLLMWithTools\(\{[\s\S]*onProviderAttempt: recordOrchestratorAttempt,[\s\S]*signal,/);

// Final synthesis does not resend a valid direct answer, and stored/derived
// provider context is fail-closed for secret-shaped text and unsafe pet names.
assert.match(agent, /trace\.length === 0[\s\S]*generatedEnglishOrNull\(terminalContent\)[\s\S]*modelCalled: false/);
assert.match(agent, /isProviderSafeRetainedText\(`pet_name \$\{pet\.name\}`\)/);
assert.match(agent, /isProviderSafeRetainedText\(`agent_goal \$\{goal\}`\)/);
assert.match(agent, /sensitive observation omitted before synthesis/);
assert.match(agent, /if \(synthesis\.modelCalled\) addUsage\(synthesis\.usage\)/);
assert.match(agent, /onProviderAttempt:\s*recordOrchestratorAttempt/);
assert.match(agent, /countProviderAttempts:\s*true/);
assert.match(agent, /usage\.skillModelCalls\s*\+=\s*skillModelCalls/);
assert.match(agent, /usage\.modelCalls\s*\+=\s*skillModelCalls/);
assert.match(agent, /orchestratorModelCalls:\s*number/);
assert.match(agent, /skillModelCalls:\s*number/);

// Exact accounting crosses every nested LLM-skill fan-out. Provider fallbacks
// invoke the observer immediately before each real vendor network attempt; a
// metered skill awaits conditional consolidation before returning its count.
assert.match(router, /onProviderAttempt\?\.\(\{ provider: target\.provider\.id, model: target\.model, source: target\.source \}\);[\s\S]*callTextTarget/);
assert.match(router, /onProviderAttempt\?\.\(\{ provider: target\.provider\.id, model: target\.model, source: target\.source \}\);[\s\S]*callToolTarget/);
assert.match(pethub, /countProviderAttempts:\s*true|countProviderAttempts\?:\s*boolean/);
assert.match(pethub, /!executionPolicy\.readOnly[\s\S]*&&\s*!executionPolicy\.noRetention[\s\S]*retainFromConversation/);
assert.match(pethub, /retainFromConversation\([\s\S]*onProviderAttempt/);
assert.match(pethub, /observeConversation\([\s\S]*onProviderAttempt/);
assert.match(persistentMemory, /consolidateMemory\(this\.petId, false, startEpoch, onProviderAttempt, signal\)/);
assert.match(persistentMemory, /response_format:\s*\{ type: ["']json_object["'] \},\s*onProviderAttempt/);
assert.match(persistentMemory, /onProviderAttempt,\s*signal,/);
assert.match(selfLearning, /temperature:\s*0,\s*onProviderAttempt/);
assert.match(selfLearning, /onProviderAttempt,\s*signal,/);
assert.match(consolidate, /response_format:\s*\{ type: ["']json_object["'] \},\s*onProviderAttempt/);
assert.match(consolidate, /onProviderAttempt,\s*signal,/);
assert.ok(router.includes("callerSignal?: AbortSignal"));
assert.ok(router.includes("fetch(url, { ...init, signal: controller.signal })"));
assert.ok(router.includes("(target) => consumeLLMBudget(target, signal)"));
assert.ok(platformResilience.includes("throwIfLLMAborted(signal);"));
assert.ok(platformResilience.includes("await beforeAttempt?.(targets[i]);"));
assert.ok(deadline.includes("const value = await work(signal);"));
assert.doesNotMatch(deadline, /return Promise\.race/);

assert.doesNotMatch(agent, /Hermes|Claude-Code grade|oh-my-opencode/);
assert.doesNotMatch(workbench, /Trinity-style|Resumed your last run|Recover \(/);
assert.match(workbench, /Loaded your last saved result/);
assert.match(workbench, /Retry as a new run/);
assert.doesNotMatch(workbench, /keyless <b>look-up tools<\/b>|In-loop skill calls use bounded retries/);
assert.match(workbench, /Outbound web,[\s\S]*connectors are intentionally excluded/);
assert.match(workbench, /rememberPendingAgentRun/);
assert.match(workbench, /createAgentRunId/);
assert.match(workbench, /receivedSettlementReceipt = true/);
assert.match(workbench, /if \(!receivedSettlementReceipt\)/);
assert.match(workbench, /!running && !receiptMissing/);
assert.match(workbench, /billing\?: AgentBilling/);
assert.match(workbench, /Check saved run receipt/);
assert.match(workbench, /confirmCostCredits:\s*COST/);
assert.match(workbench, /Authorize \$\{COST\} credits & run/);
assert.match(office, /confirmCostCredits:\s*COST/);
assert.match(office, /rememberPendingAgentRun/);
assert.match(office, /createAgentRunId/);
assert.match(office, /if \(!receivedSettlementReceipt\)/);
assert.match(office, /Check saved run receipt/);
assert.match(consoleView, /\/goal --confirm-5 <task>/);
assert.match(consoleView, /api\.pets\.runAgent\(petId as number, runId, g, AGENT_COST\)/);
assert.match(consoleView, /settlement receipt missing/);
assert.match(apiClient, /runAgent:\s*\(petId: number, runId: string, goal: string, confirmCostCredits: 5/);
assert.match(apiClient, /body:\s*\{ runId, goal, confirmCostCredits/);

// Deletion cannot manufacture a refund or erase billing evidence. It blocks
// on active work, then scrubs private terminal payloads while preserving the
// minimal owner receipt surfaced in Account.
assert.match(deleteRoute, /e instanceof PetAgentRunActiveError/);
for (const field of ["code: e.code", "runId: e.runId", "state: e.state", "statusUrl", "guidance:"]) {
  assert.ok(deleteRoute.includes(field), `delete conflict must expose ${field}`);
}
assert.match(deleteRoute, /status:\s*409/);
assert.match(deleteRoute, /Minimal terminal paid-run receipts were retained after private run content was scrubbed/);
assert.match(accountRoute, /pet_name === ["']Deleted Pet["'] && run\.goal === ["']\[deleted\]["']/);
assert.match(accountRoute, /pet_deleted:\s*petDeleted/);
assert.match(accountRoute, /pet_name:\s*petDeleted \? null/);
assert.match(accountRoute, /goal:\s*petDeleted \? null/);
assert.match(accountView, /minimal billing receipt/);
assert.match(accountView, /private run content removed/);

// One 404 can be a read race. Browser, CLI and MCP perform exactly one delayed
// recheck before clearing a local marker; none claim deletion refunded it.
assert.match(browserRunClient, /recheckAgentRunReceiptOnNotFound/);
assert.equal((browserRunClient.match(/return await lookup\(\)|return lookup\(\)/g) ?? []).length, 2);
for (const surface of [workbench, office, consoleView]) {
  assert.match(surface, /recheckAgentRunReceiptOnNotFound/);
  assert.match(surface, /after two checks/);
}
assert.match(cli, /agentRunStatusWithNotFoundRecheck/);
assert.match(cli, /AGENT_RECEIPT_404_RECHECK_MS/);
assert.match(cli, /No durable receipt was found/);
assert.match(mcp, /fetchAgentRunStatusWithNotFoundRecheck/);
assert.match(mcp, /reconciliationNotices/);
assert.match(mcp, /server's per-pet guard prevents an overlapping paid charge/);
for (const source of [workbench, office, consoleView, cli, mcp]) {
  assert.doesNotMatch(source, /deletion refund(?:ed|s) active reservations?|erases? (?:the |its )?private run ledger/i);
}

console.log("agent_loop_truth_security_contract=PASS");
