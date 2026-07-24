import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(resolve(root, path), "utf8");

const [agent, route, statusRoute, workbench, office, consoleView, apiClient, pethub, router, persistentMemory, selfLearning, consolidate, platformResilience, deadline, browserRunClient, paidRunGuard, deleteRoute, accountRoute, accountView, cli, mcp] = await Promise.all([
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
  read("src/hooks/usePaidAgentRunGuard.ts"),
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

for (const reason of ["completed", "max_steps", "timeout", "task_error", "planner_error", "unsupported_scope"]) {
  assert.match(agent, new RegExp(`\\|?\\s*["']${reason}["']`));
}
assert.match(agent, /answer: synthesis\.answer,\s*answerDelivered: synthesis\.answerDelivered,[\s\S]*trace,[\s\S]*completed,[\s\S]*stoppedReason,[\s\S]*usage,/);
assert.match(
  agent,
  /stoppedReason\s*===\s*["']completed["']\s*&&[\s\S]*synthesis\.answerDelivered\s*&&[\s\S]*trace\.length\s*===\s*0\s*\|\|\s*trace\.some\(\(step\)\s*=>\s*step\.ok\)/,
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
assert.match(route, /completedDirectAnswer\s*=\s*[\s\S]*answerDelivered && completed && trace\.length === 0 && modelCalls > 0/);
assert.match(route, /exactTypedToolContract\s*=[\s\S]*matchingSuccessfulToolCalls === 1[\s\S]*successfulToolCalls === 1[\s\S]*trace\.length === 1[\s\S]*committedSideEffects === 0/);
assert.match(route, /const chargeable\s*=[\s\S]*exactTypedToolContract[\s\S]*answerDelivered[\s\S]*completed/);
assert.doesNotMatch(route, /const chargeable = completedDirectAnswer/);
assert.match(route, /completed_direct_answer_beta_refund/);
assert.match(route, /typed_task_no_matching_tool/);
assert.match(route, /typed_task_no_result/);
assert.match(route, /no_deliverable_answer/);
assert.doesNotMatch(route, /\|\|\s*committedSideEffects\s*>\s*0/);
assert.doesNotMatch(route, /incomplete_with_committed_side_effect/);
assert.doesNotMatch(route, /completed_with_direct_answer/);
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
const boundedBodyAt = route.indexOf("await readBoundedJsonBody(req, 16 * 1024)");
assert.ok(ownerAuthAt > 0 && boundedBodyAt > ownerAuthAt, "agent body parsing must be owner-authenticated first");
assert.doesNotMatch(route, /req\.json\(\)/);
assert.match(route, /typeof rawGoal !== ["']string["']/);
assert.match(route, /rawGoal\.length > AGENT_OFFICE_TASK_MAX_INPUT/);
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
const priorRunAt = route.indexOf("const priorRun = await getPetAgentRun");
const typedTaskRequiredAt = route.indexOf("if (taskKind === null)");
const taskInputValidationAt = route.indexOf("getAgentOfficeTaskInputError(taskKind, cleanGoal)");
const secretInputValidationAt = route.indexOf("containsStrongAgentOfficeSecret(cleanGoal)");
const newRunLimitAt = route.indexOf('rateLimit(req, { key: "agent-loop"');
assert.ok(
  priorRunAt > confirmationAt
    && typedTaskRequiredAt > priorRunAt
    && secretInputValidationAt > typedTaskRequiredAt
    && taskInputValidationAt > secretInputValidationAt
    && newRunLimitAt > taskInputValidationAt
    && reservationAt > newRunLimitAt,
  "existing IDs must replay first, while untyped, invalid, or secret-bearing new tasks fail before rate limit, provider work, and credit reservation",
);
assert.match(route, /const goal = normalizeAgentOfficeTaskInput\(rawGoal\)/);
assert.doesNotMatch(route, /sanitizeText\(rawGoal/);
assert.match(route, /code: "agent_task_secret_rejected"/);
assert.match(route, /priorRun\.executionContract !== executionContract/);
assert.match(route, /executionContract,\s*amount: COST_CREDITS/);
assert.match(
  route,
  /type: "reserved",[\s\S]*creditsReserved: COST_CREDITS,[\s\S]*creditsRemaining: reservationResult\.reservation\.creditsRemaining/,
  "a newly debited streaming run must disclose its post-reservation wallet balance",
);
const liveReservationEventAt = route.indexOf('type: "reserved"', route.indexOf("async start(controller)"));
const liveProviderRunAt = route.indexOf("await runToolAgent", liveReservationEventAt);
assert.ok(
  liveReservationEventAt > 0 && liveProviderRunAt > liveReservationEventAt,
  "the reservation balance event must precede provider execution",
);
assert.match(
  office,
  /evt\.type === "reserved"[\s\S]*evt\.runId === runId[\s\S]*evt\.creditsReserved === COST[\s\S]*onCreditsChange\?\.\(evt\.creditsRemaining\)/,
);

const receiptAuthAt = statusRoute.indexOf("await getUser(req)");
const receiptLimitAt = statusRoute.indexOf("rateLimit(req");
assert.ok(receiptAuthAt > 0 && receiptLimitAt > receiptAuthAt, "receipt rate limit must run after authentication");
assert.match(statusRoute, /key:\s*`agent-run-receipt:\$\{user\.id\}`/);

assert.match(agent, /getExecutableSkillsForPet\(petId\)/);
assert.match(agent, /This runner can only return text from approved read-only skills/);
assert.match(agent, /Never imply that an unsupported external action happened/);
assert.match(agent, /UNSUPPORTED_ACTION_PREFIX = "PETCLAW_UNSUPPORTED_ACTION:"/);
assert.match(agent, /stoppedReason = "unsupported_scope"/);
assert.match(agent, /stoppedReason === "unsupported_scope"[\s\S]*modelCalled: false/);
assert.equal(
  (agent.match(/if \(terminalContent\) onEvent\(\{ type: "thought", text: terminalContent \}\)/g) ?? []).length,
  1,
  "a direct answer should emit one thought event",
);
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

// Typed Office tasks bypass the model planner. The route builds canonical
// arguments, and the runner executes exactly one server-selected read-only
// connector/skill before producing a terminal event.
assert.match(route, /buildAgentOfficeRequiredToolInput\(taskKind, cleanGoal\)/);
assert.equal(
  (route.match(/\{ requiredToolName, requiredToolInput \}/g) ?? []).length,
  2,
  "streaming and JSON runs must pass the same server-built required-tool contract",
);
const typedDirectAt = agent.indexOf("if (opts?.requiredToolName) {");
const plannerLoopAt = agent.indexOf("reasoningLoop:");
assert.ok(
  typedDirectAt > 0 && plannerLoopAt > typedDirectAt,
  "typed direct execution must return before the general planner loop",
);
const typedDirect = agent.slice(typedDirectAt, plannerLoopAt);
assert.match(typedDirect, /const toolInput = \{ \.\.\.\(opts\.requiredToolInput \?\? \{\}\) \}/);
assert.match(
  typedDirect,
  /exec = isConnector\s*\?\s*await executeConnector\(petId, toolName, toolInput, signal\)\s*:\s*isOfficeTextTool\s*\?\s*await executeOfficeTextTool\(petId, toolName, toolInput, signal\)\s*:\s*await executeSkillOnce\(petId, toolName, toolInput, signal\)/,
  "the selected connector-or-skill branch must make one execution attempt with canonical input",
);
assert.doesNotMatch(typedDirect, /callLLMWithTools\(/);
assert.match(typedDirect, /usage\.steps = 1/);
const directToolCallAt = typedDirect.indexOf('type: "tool_call"');
const directExecuteAt = typedDirect.indexOf("exec = isConnector");
const directTraceAt = typedDirect.indexOf("trace.push(step)");
const directToolResultAt = typedDirect.indexOf('type: "tool_result"');
const directSuccessFinalAt = typedDirect.lastIndexOf('type: "final"');
assert.ok(
  directToolCallAt >= 0
    && directExecuteAt > directToolCallAt
    && directTraceAt > directExecuteAt
    && directToolResultAt > directTraceAt
    && directSuccessFinalAt > directToolResultAt,
  "typed runs must emit tool_call, execute, persist one trace step, emit tool_result, then emit final",
);
assert.match(
  typedDirect,
  /if \(!exec\.ok \|\| step\.sideEffectCommitted\)[\s\S]*answerDelivered: false,[\s\S]*completed: false,[\s\S]*stoppedReason,/,
  "a failed tool or read-only side-effect violation must be a non-deliverable, non-chargeable result",
);
assert.match(
  typedDirect,
  /if \(count === 0\) \{[\s\S]*I couldn't find any retained memory that matches that request\.[\s\S]*answerDelivered = true;[\s\S]*\} else \{[\s\S]*synthesize\([\s\S]*recordOrchestratorAttempt,\s*true,\s*\)/,
  "zero-memory recall must complete deterministically, while positive recall requires a fresh generated answer",
);
assert.match(
  typedDirect,
  /else \{[\s\S]*LLM-backed typed skills already produce the contract-specific[\s\S]*const reply = generatedEnglishOrNull\(output\?\.reply\);[\s\S]*output\?\.deliverableValidated === true[\s\S]*isOfficeDeliverableText\(reply\)/,
  "LLM-backed summarize/review/draft replies must be returned directly without a second rephrasing model",
);
assert.match(
  typedDirect,
  /synthesis\.answerDelivered[\s\S]*&& isOfficeDeliverableText\(synthesis\.answer\)/,
  "positive recall must reject refusal-shaped or otherwise invalid synthesis before settlement",
);
assert.match(route, /const typedToolProducedResult =\s*taskKind !== "recall"[\s\S]*requiredOutput\.count > 0/);
assert.match(route, /const typedToolWasNotDegraded = requiredOutput\?\.degraded !== true/);
assert.match(route, /const typedDeliverableWasValidated =[\s\S]*requiredOutput\?\.deliverableValidated === true/);
assert.match(
  route,
  /completed[\s\S]*matchingSuccessfulToolCalls === 1[\s\S]*!typedToolProducedResult[\s\S]*!typedToolWasNotDegraded[\s\S]*!typedDeliverableWasValidated[\s\S]*\?\s*"typed_task_no_result"/,
  "zero-result or degraded typed output must settle as a refund",
);
assert.equal(
  (route.match(/"Cache-Control": "private, no-store, no-cache, no-transform"/g) ?? []).length,
  2,
  "both replay and live SSE responses must disable private-stream caching and proxy transforms",
);
assert.match(statusRoute, /"Cache-Control": "private, no-store"/);
assert.doesNotMatch(
  route,
  /(?:error|detail):\s*(?:e|error|settlementError)\?*\.message/,
  "raw internal exception text must never be serialized to an Agent Office client",
);

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
assert.doesNotMatch(workbench, /Loaded your last saved result|Retry as a new run/);
assert.match(workbench, /localStorage\.removeItem\(LEGACY_RESULT_STORAGE_KEY\)/);
assert.doesNotMatch(workbench, /localStorage\.(?:getItem|setItem)\(LEGACY_RESULT_STORAGE_KEY/);
assert.match(workbench, /maxLength=\{AGENT_OFFICE_TASK_MAX_INPUT\}/);
assert.match(workbench, /Do not paste secrets: input and output are sent to the configured AI provider when needed and stored in your private run history under the Privacy policy\./);
assert.doesNotMatch(workbench, /keyless <b>look-up tools<\/b>|In-loop skill calls use bounded retries/);
assert.match(workbench, /Live web, files, inboxes, messages,[\s\S]*are not available here/);
assert.match(workbench, /receivedSettlementReceipt = true/);
assert.match(workbench, /if \(!receivedSettlementReceipt\)/);
assert.match(workbench, /const composerLocked = running \|\| receiptMissing \|\| reconciling/);
assert.match(workbench, /start:\s*startPaidRun/);
assert.match(workbench, /const start = await startPaidRun\(/);
assert.match(workbench, /if \(start\.kind !== "started"\)/);
assert.match(workbench, /running[\s\S]*\|\| reconciling[\s\S]*\|\| !canReconcilePaidRun\(\)[\s\S]*\|\| reconcileAttemptRef\.current/);
assert.match(workbench, /if \(reconcileAttemptRef\.current !== attempt\) return/);
assert.match(workbench, /disabled=\{running \|\| reconciling\}/);
assert.match(workbench, /outcomeUnknown = !isDefinitivePaidAgentRejectionStatus\(res\.status\)/);
assert.match(workbench, /markPaidRunAmbiguous\(\)/);
assert.match(workbench, /pending\.runId,[\s\S]*pending\.goal,[\s\S]*pending\.confirmCostCredits,[\s\S]*pending\.maxSteps/);
assert.doesNotMatch(
  workbench.slice(workbench.indexOf("const run = useCallback"), workbench.indexOf("const reconcilePendingRun")),
  /rememberPendingAgentRun|forgetPendingAgentRun|createAgentRunId|setReceiptMissing/,
);
assert.match(browserRunClient, /export function transitionPaidAgentRunPhase/);
assert.match(browserRunClient, /phase === ["']idle["'][\s\S]*startAccepted:\s*true/);
assert.match(browserRunClient, /phase:\s*["']receipt_missing["']/);
assert.match(browserRunClient, /navigator\.locks/);
assert.match(browserRunClient, /AGENT_RUN_PENDING_LOCK_NAME/);
assert.match(browserRunClient, /const confirmed = readCurrentOwnerPendingAgentRuns\(\)/);
assert.match(browserRunClient, /confirmed\.length !== 1 \|\| confirmed\[0\]\?\.runId !== run\.runId/);
assert.match(browserRunClient, /window\.addEventListener\("storage"/);
assert.match(browserRunClient, /AGENT_RUN_PENDING_CHANGE_EVENT/);
assert.match(browserRunClient, /taskKind\?: AgentOfficeTaskKind/);
assert.match(browserRunClient, /executionContract\?: string/);
assert.match(browserRunClient, /isAgentOfficeTaskKind\(\(run as PendingAgentRun\)\.taskKind\)/);
assert.match(browserRunClient, /value\.taskKind === expectedTaskKind/);
assert.match(browserRunClient, /value\.executionContract === canonicalExecutionContract/);
assert.match(paidRunGuard, /useSyncExternalStore/);
assert.match(paidRunGuard, /beginPendingAgentRun/);
assert.match(paidRunGuard, /removePendingAgentRun/);
assert.doesNotMatch(paidRunGuard, /journalSnapshot === ["']\[\]["'][\s\S]{0,120}apply\(["']reconciled["']\)/);
assert.match(workbench, /billing\?: AgentBilling/);
assert.match(workbench, /Check saved run receipt/);
assert.match(workbench, /confirmCostCredits:\s*COST/);
assert.match(workbench, /taskKind,/);
assert.match(workbench, /isTerminalPaidAgentRunReceipt\(evt, runId, \{ taskKind \}\)/);
assert.match(workbench, /isTerminalPaidAgentRunReceipt\(receipt, pending\.runId, pending\)/);
assert.match(workbench, /Run \$\{TASK_KINDS\.find/);
assert.match(office, /confirmCostCredits:\s*COST/);
assert.match(office, /start:\s*startPaidRun/);
assert.match(office, /const start = await startPaidRun\(/);
assert.match(office, /outcomeUnknown = !isDefinitivePaidAgentRejectionStatus\(res\.status\)/);
assert.match(office, /if \(!receivedSettlementReceipt\)/);
assert.match(office, /isTerminalPaidAgentRunReceipt\(evt, runId, \{ taskKind: selectedTaskKind \}\)/);
assert.match(office, /isTerminalPaidAgentRunReceipt\(receipt, pending\.runId, pending\)/);
assert.match(office, /Check saved run receipt/);
assert.match(office, /Run \$\{TASK_OPTIONS\.find/);
assert.doesNotMatch(office, /Run again · \{cost\} credits/);
assert.match(office, /function liveRunSteps\(value: unknown, terminal: boolean\)/);
assert.match(office, /selectedPetIdRef\.current !== pid/);
assert.match(consoleView, /\/goal --confirm-5 --task/);
assert.match(consoleView, /taskKind,/);
assert.match(consoleView, /const start = await startPaidRun\(/);
assert.match(consoleView, /isTerminalPaidAgentRunReceipt\(r, runId, \{ taskKind \}\)/);
assert.match(consoleView, /isTerminalPaidAgentRunReceipt\(receipt, pending\.runId, pending\)/);
assert.match(consoleView, /settlement receipt missing/);
for (const surface of [workbench, office, consoleView]) {
  assert.match(surface, /usePaidAgentRunGuard/);
  assert.doesNotMatch(surface, /rememberPendingAgentRun|forgetPendingAgentRun|createAgentRunId/);
  assert.match(surface, /isTerminalPaidAgentRunReceipt/);
  assert.match(surface, /pending\.runId/);
  assert.doesNotMatch(surface, /local marker (?:was )?cleared|after two checks/);
}
assert.match(apiClient, /runAgent:\s*\(\s*petId: number,\s*runId: string,\s*goal: string,\s*confirmCostCredits: 5/);
assert.match(apiClient, /\.\.\.\(taskKind \? \{ taskKind \} : \{\}\)/);

// Deletion cannot manufacture a refund or erase billing evidence. It blocks
// on active work, then scrubs private terminal payloads while preserving the
// minimal owner receipt surfaced in Account.
assert.match(deleteRoute, /e instanceof PetAgentRunActiveError/);
for (const field of ["code: e.code", "runId: e.runId", "state: e.state", "statusUrl", "guidance:"]) {
  assert.ok(deleteRoute.includes(field), `delete conflict must expose ${field}`);
}
assert.match(deleteRoute, /status:\s*409/);
assert.match(deleteRoute, /Minimal terminal paid-run receipts were retained after private run content was scrubbed/);
assert.match(accountRoute, /const petDeleted = run\.private_content_scrubbed/);
assert.match(accountRoute, /pet_deleted:\s*petDeleted/);
assert.match(accountRoute, /pet_name:\s*petDeleted \? null/);
assert.match(accountRoute, /goal:\s*petDeleted \? null/);
assert.equal(
  (accountRoute.match(/headers: ACCOUNT_OVERVIEW_RESPONSE_HEADERS/g) ?? []).length,
  3,
  "every account overview response must be private and non-cacheable",
);
assert.match(accountRoute, /"Cache-Control": "private, no-store"/);
assert.match(accountView, /minimal billing receipt/);
assert.match(accountView, /private run content removed/);
assert.match(accountView, /readCurrentOwnerPendingAgentRuns/);
assert.match(accountView, /isTerminalPaidAgentRunReceipt\(receipt, pending\.runId, pending\)/);
assert.match(accountView, /cache: "no-store"/);

// Browser reconciliation may recheck a 404, but never clears on absence. It
// replays only the saved exact run ID/goal/step budget/cost.
assert.match(browserRunClient, /recheckAgentRunReceiptOnNotFound/);
assert.equal((browserRunClient.match(/return await lookup\(\)|return lookup\(\)/g) ?? []).length, 2);
for (const surface of [workbench, office, consoleView]) {
  assert.match(surface, /recheckAgentRunReceiptOnNotFound/);
  assert.match(surface, /pending\.confirmCostCredits/);
  assert.match(surface, /pending\.maxSteps/);
  assert.doesNotMatch(surface, /forgetPendingAgentRun/);
}
for (const nativeClient of [cli, mcp]) {
  assert.match(nativeClient, /function isTerminalAgentReceipt/);
  assert.match(nativeClient, /maxSteps/);
  assert.match(nativeClient, /confirmCostCredits/);
  assert.doesNotMatch(nativeClient, /local marker (?:was )?cleared|after two checks; its local marker was cleared/);
}
assert.match(cli, /resuming the same authorized run/);
assert.match(mcp, /Resumed and reconciled the previously authorized run/);
assert.match(cli, /agentRunStatusWithNotFoundRecheck/);
assert.match(cli, /AGENT_RECEIPT_404_RECHECK_MS/);
assert.match(cli, /No durable receipt was found/);
assert.match(mcp, /fetchAgentRunStatusWithNotFoundRecheck/);
assert.match(mcp, /newRunStarted:\s*false/);
assert.match(mcp, /createPaidRunJournal/);
assert.match(mcp, /marker remains locked/);
for (const source of [workbench, office, consoleView, cli, mcp]) {
  assert.doesNotMatch(source, /deletion refund(?:ed|s) active reservations?|erases? (?:the |its )?private run ledger/i);
}

console.log("agent_loop_truth_security_contract=PASS");
