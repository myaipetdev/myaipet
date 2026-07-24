import assert from "node:assert/strict";
import {
  AGENT_RUN_PENDING_STORAGE_KEY,
  beginPendingAgentRun,
  getPendingAgentRunSnapshot,
  isDefinitivePaidAgentRejectionStatus,
  isTerminalPaidAgentRunReceipt,
  readCurrentOwnerPendingAgentRuns,
  removePendingAgentRun,
  subscribePendingAgentRuns,
  transitionPaidAgentRunPhase,
} from "../src/lib/petclaw/agent-run-client.ts";
import { setApiAuthToken } from "../src/lib/paid-run-auth.ts";

class MemoryStorage {
  rows = new Map();
  failGet = false;
  failSet = false;
  failJournalReadback = false;
  failReadbackAfterSet = false;

  getItem(key) {
    if (this.failGet) throw new Error("synthetic storage get failure");
    if (key === AGENT_RUN_PENDING_STORAGE_KEY && this.failJournalReadback) {
      this.failJournalReadback = false;
      throw new Error("synthetic journal read-back failure");
    }
    return this.rows.has(key) ? this.rows.get(key) : null;
  }

  setItem(key, value) {
    if (this.failSet) throw new Error("synthetic storage set failure");
    this.rows.set(key, String(value));
    if (key === AGENT_RUN_PENDING_STORAGE_KEY && this.failReadbackAfterSet) {
      this.failReadbackAfterSet = false;
      this.failJournalReadback = true;
    }
  }

  removeItem(key) {
    this.rows.delete(key);
  }
}

class SerialLockManager {
  tails = new Map();

  request(name, _options, callback) {
    const previous = this.tails.get(name) || Promise.resolve();
    const current = previous.catch(() => {}).then(callback);
    this.tails.set(name, current.then(() => {}, () => {}));
    return current;
  }
}

const storage = new MemoryStorage();
const browserWindow = new EventTarget();
browserWindow.localStorage = storage;
Object.defineProperty(globalThis, "window", {
  value: browserWindow,
  configurable: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: { locks: new SerialLockManager() },
  configurable: true,
});
const safetyWallet = "0xsafetyowner";
const jwtPart = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const safetyToken = [
  jwtPart({ alg: "HS256", typ: "JWT" }),
  jwtPart({ sub: "7", wallet: safetyWallet, exp: Math.floor(Date.now() / 1000) + 3600 }),
  "test-signature",
].join(".");
storage.setItem("petagen_jwt", safetyToken);
storage.setItem("petagen_user", JSON.stringify({ wallet_address: safetyWallet }));
setApiAuthToken(safetyToken);

const inputFor = (surface) => ({
  petId: surface === "office" ? 2 : surface === "console" ? 3 : 1,
  petName: `${surface} pet`,
  goal: `safe ${surface} goal`,
  maxSteps: 4,
  confirmCostCredits: 5,
  surface,
});

// Three surfaces/tabs racing through one origin Web Lock may authorize exactly
// one POST marker.
const simultaneous = await Promise.all([
  beginPendingAgentRun(inputFor("workbench")),
  beginPendingAgentRun(inputFor("office")),
  beginPendingAgentRun(inputFor("console")),
]);
assert.equal(simultaneous.filter((result) => result.kind === "started").length, 1);
assert.equal(simultaneous.filter((result) => result.kind === "blocked").length, 2);
assert.equal(readCurrentOwnerPendingAgentRuns().length, 1);
const first = simultaneous.find((result) => result.kind === "started");
assert.ok(first && first.kind === "started");

// Same-tab and cross-tab subscribers both observe journal changes.
let journalEvents = 0;
const unsubscribe = subscribePendingAgentRuns(() => { journalEvents += 1; });
await removePendingAgentRun(first.run.runId);
assert.equal(readCurrentOwnerPendingAgentRuns().length, 0);
assert.ok(journalEvents >= 1);
const storageEvent = new Event("storage");
Object.defineProperty(storageEvent, "key", { value: AGENT_RUN_PENDING_STORAGE_KEY });
browserWindow.dispatchEvent(storageEvent);
assert.ok(journalEvents >= 2);
unsubscribe();

// Storage and lock failures are all fail-closed: callers receive no `started`
// result and therefore must perform zero paid POSTs.
storage.failGet = true;
assert.equal((await beginPendingAgentRun(inputFor("workbench"))).kind, "unavailable");
storage.failGet = false;

storage.setItem(AGENT_RUN_PENDING_STORAGE_KEY, "{malformed");
assert.equal((await beginPendingAgentRun(inputFor("office"))).kind, "unavailable");
storage.setItem(AGENT_RUN_PENDING_STORAGE_KEY, "[]");

storage.failSet = true;
assert.equal((await beginPendingAgentRun(inputFor("console"))).kind, "unavailable");
storage.failSet = false;

storage.failReadbackAfterSet = true;
assert.equal((await beginPendingAgentRun(inputFor("workbench"))).kind, "unavailable");
storage.setItem(AGENT_RUN_PENDING_STORAGE_KEY, "[]");

Object.defineProperty(globalThis, "navigator", {
  value: { locks: undefined },
  configurable: true,
});
assert.equal((await beginPendingAgentRun(inputFor("workbench"))).kind, "unavailable");
Object.defineProperty(globalThis, "navigator", {
  value: { locks: new SerialLockManager() },
  configurable: true,
});

const otherToken = [
  jwtPart({ alg: "HS256", typ: "JWT" }),
  jwtPart({ sub: "8", wallet: "0xotherowner", exp: Math.floor(Date.now() / 1000) + 3600 }),
  "other-signature",
].join(".");
storage.setItem("petagen_jwt", otherToken);
storage.setItem("petagen_user", JSON.stringify({ wallet_address: "0xotherowner" }));
assert.equal((await beginPendingAgentRun(inputFor("workbench"))).kind, "unavailable");
storage.setItem("petagen_jwt", safetyToken);
storage.setItem("petagen_user", JSON.stringify({ wallet_address: safetyWallet }));

const legacyMarker = {
  runId: "33333333-3333-4333-8333-333333333333",
  petId: 99,
  petName: "PRIVATE PET NAME",
  goal: "PRIVATE LEGACY GOAL",
  surface: "workbench",
  at: 1,
};
storage.setItem(AGENT_RUN_PENDING_STORAGE_KEY, JSON.stringify([legacyMarker]));
const legacyVisible = readCurrentOwnerPendingAgentRuns()[0];
assert.equal(legacyVisible.legacyUnbound, true);
assert.equal(legacyVisible.goal, "Legacy paid run awaiting owner verification");
assert.equal(legacyVisible.petName, undefined);
storage.setItem(AGENT_RUN_PENDING_STORAGE_KEY, "[]");

// Removing one validated marker never discards another unresolved marker.
const markerA = {
  ownerKey: `session:7:${safetyWallet}`,
  runId: "11111111-1111-4111-8111-111111111111",
  petId: 1,
  goal: "first",
  maxSteps: 4,
  confirmCostCredits: 5,
  surface: "workbench",
  at: 1,
};
const markerB = {
  ...markerA,
  runId: "22222222-2222-4222-8222-222222222222",
  petId: 2,
  goal: "second",
  surface: "office",
  at: 2,
};
storage.setItem(AGENT_RUN_PENDING_STORAGE_KEY, JSON.stringify([markerA, markerB]));
const removal = await removePendingAgentRun(markerB.runId);
assert.equal(removal.remaining?.runId, markerA.runId);
assert.deepEqual(readCurrentOwnerPendingAgentRuns().map((run) => run.runId), [markerA.runId]);
storage.setItem(AGENT_RUN_PENDING_STORAGE_KEY, "[]");

// Terminal proof must bind the exact run ID, terminal state, and complete
// billing shape. Empty/malformed 200 bodies never qualify.
const terminal = {
  runId: markerA.runId,
  state: "terminal",
  billing: {
    outcome: "charged",
    creditsCharged: 5,
    usageKnown: true,
    modelCalls: 1,
  },
};
assert.equal(isTerminalPaidAgentRunReceipt(terminal, markerA.runId), true);
assert.equal(isTerminalPaidAgentRunReceipt(terminal, markerB.runId), false);
assert.equal(isTerminalPaidAgentRunReceipt({}, markerA.runId), false);
assert.equal(isTerminalPaidAgentRunReceipt({ ...terminal, state: "running" }, markerA.runId), false);
assert.equal(isTerminalPaidAgentRunReceipt({
  ...terminal,
  billing: { ...terminal.billing, creditsCharged: "5" },
}, markerA.runId), false);
assert.equal(isTerminalPaidAgentRunReceipt({
  ...terminal,
  billing: { ...terminal.billing, modelCalls: -1 },
}, markerA.runId), false);
assert.equal(isTerminalPaidAgentRunReceipt({
  ...terminal,
  billing: { ...terminal.billing, outcome: "refunded", creditsCharged: 5 },
}, markerA.runId), false);
assert.equal(isTerminalPaidAgentRunReceipt({
  ...terminal,
  billing: {
    outcome: "refunded",
    creditsCharged: 0,
    usageKnown: false,
    modelCalls: null,
  },
}, markerA.runId), true);
assert.equal(isTerminalPaidAgentRunReceipt({
  ...terminal,
  billing: {
    outcome: "charged",
    creditsCharged: 5,
    usageKnown: false,
    modelCalls: null,
  },
}, markerA.runId), false);
assert.equal(getPendingAgentRunSnapshot(), "[]");
for (const status of [400, 401, 402, 403, 404, 413, 429]) {
  assert.equal(isDefinitivePaidAgentRejectionStatus(status), true);
}
for (const status of [0, 200, 302, 408, 409, 425, 500, 503]) {
  assert.equal(isDefinitivePaidAgentRejectionStatus(status), false);
}

let phase = "idle";
let paidPosts = 0;
const attemptStart = () => {
  const transition = transitionPaidAgentRunPhase(phase, "start");
  phase = transition.phase;
  if (transition.startAccepted) paidPosts += 1;
  return transition.startAccepted;
};
assert.equal(attemptStart(), true);
assert.equal(attemptStart(), false);
assert.equal(paidPosts, 1);
phase = transitionPaidAgentRunPhase(phase, "ambiguous").phase;
assert.equal(phase, "receipt_missing");
assert.equal(transitionPaidAgentRunPhase(phase, "settled").phase, "receipt_missing");
assert.equal(transitionPaidAgentRunPhase(phase, "definitive_rejection").phase, "receipt_missing");
assert.equal(attemptStart(), false);
phase = transitionPaidAgentRunPhase(phase, "reconciled").phase;
assert.equal(phase, "idle");
assert.equal(attemptStart(), true);
assert.equal(transitionPaidAgentRunPhase(phase, "reconciled").phase, "running");

console.log("agent_run_safety_contract=PASS");
