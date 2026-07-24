/** Shared browser-side paid-run journal used by every PetClaw agent surface. */
import { getPaidRunAuthContext } from "../paid-run-auth.ts";

export const AGENT_RUN_PENDING_STORAGE_KEY = "petclaw_paid_agent_runs_pending_v1";
export const AGENT_RUN_PENDING_CHANGE_EVENT = "petclaw:paid-agent-runs-changed";
const AGENT_RUN_PENDING_LOCK_NAME = "petclaw-paid-agent-run-journal-v1";

export type PendingAgentRun = {
  ownerKey?: string;
  legacyUnbound?: true;
  runId: string;
  petId: number;
  petName?: string;
  goal: string;
  maxSteps?: number;
  confirmCostCredits?: 5;
  surface: "workbench" | "office" | "console";
  at: number;
};

export type PendingAgentRunStart = Omit<PendingAgentRun, "ownerKey" | "runId" | "at">;

export type BeginPendingAgentRunResult =
  | { kind: "started"; run: PendingAgentRun; authToken: string }
  | { kind: "blocked"; pending: PendingAgentRun }
  | { kind: "unavailable"; message: string };

export type PaidAgentRunPhase = "idle" | "running" | "receipt_missing";
export type PaidAgentRunPhaseEvent =
  | "start"
  | "settled"
  | "definitive_rejection"
  | "ambiguous"
  | "reconciled";

export type PaidAgentRunPhaseTransition = {
  phase: PaidAgentRunPhase;
  startAccepted: boolean;
};

export function isDefinitivePaidAgentRejectionStatus(status: number): boolean {
  return [400, 401, 402, 403, 404, 413, 429].includes(status);
}

/**
 * Fail-closed paid-run state machine shared by the UI and its executable
 * contract test. A new paid request may start only from idle. An ambiguous
 * network outcome stays locked until the original run receipt is reconciled.
 */
export function transitionPaidAgentRunPhase(
  phase: PaidAgentRunPhase,
  event: PaidAgentRunPhaseEvent,
): PaidAgentRunPhaseTransition {
  if (event === "start") {
    return phase === "idle"
      ? { phase: "running", startAccepted: true }
      : { phase, startAccepted: false };
  }
  if (event === "ambiguous") {
    return phase === "running" || phase === "idle"
      ? { phase: "receipt_missing", startAccepted: false }
      : { phase, startAccepted: false };
  }
  if (event === "reconciled") {
    return phase === "receipt_missing"
      ? { phase: "idle", startAccepted: false }
      : { phase, startAccepted: false };
  }
  if (event === "settled" || event === "definitive_rejection") {
    return phase === "running"
      ? { phase: "idle", startAccepted: false }
      : { phase, startAccepted: false };
  }
  return { phase, startAccepted: false };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createAgentRunId(): string {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error("This browser cannot create a secure paid-run id; update the browser before running an agent.");
  }
  return globalThis.crypto.randomUUID();
}

export function readPendingAgentRuns(): PendingAgentRun[] {
  if (typeof window === "undefined") return [];
  const parsed: unknown = JSON.parse(
    window.localStorage.getItem(AGENT_RUN_PENDING_STORAGE_KEY) || "[]",
  );
  if (!Array.isArray(parsed)) {
    throw new Error("The paid-run safety journal is malformed.");
  }
  const runs = parsed.filter((run): run is PendingAgentRun =>
    !!run
    && typeof run === "object"
    && typeof (run as PendingAgentRun).runId === "string"
    && UUID.test((run as PendingAgentRun).runId)
    && (
      (run as PendingAgentRun).ownerKey == null
      || (
        typeof (run as PendingAgentRun).ownerKey === "string"
        && (run as PendingAgentRun).ownerKey!.length >= 3
        && (run as PendingAgentRun).ownerKey!.length <= 128
      )
    )
    && Number.isSafeInteger((run as PendingAgentRun).petId)
    && (run as PendingAgentRun).petId > 0
    && typeof (run as PendingAgentRun).goal === "string"
    && (
      (run as PendingAgentRun).maxSteps == null
      || (
        Number.isSafeInteger((run as PendingAgentRun).maxSteps)
        && (run as PendingAgentRun).maxSteps! >= 1
        && (run as PendingAgentRun).maxSteps! <= 6
      )
    )
    && (
      (run as PendingAgentRun).confirmCostCredits == null
      || (run as PendingAgentRun).confirmCostCredits === 5
    )
    && typeof (run as PendingAgentRun).at === "number"
    && ["workbench", "office", "console"].includes((run as PendingAgentRun).surface));
  if (runs.length !== parsed.length) {
    throw new Error("The paid-run safety journal contains an invalid entry.");
  }
  return runs;
}

function writePendingAgentRuns(runs: PendingAgentRun[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AGENT_RUN_PENDING_STORAGE_KEY, JSON.stringify(runs));
  window.dispatchEvent(new Event(AGENT_RUN_PENDING_CHANGE_EVENT));
}

export function rememberPendingAgentRun(run: PendingAgentRun): void {
  const existing = readPendingAgentRuns().filter((item) => item.runId !== run.runId);
  writePendingAgentRuns([...existing, run]);
}

export function forgetPendingAgentRun(runId: string): void {
  writePendingAgentRuns(readPendingAgentRuns().filter((item) => item.runId !== runId));
}

export function currentPaidAgentRunOwnerKey(): string {
  return getPaidRunAuthContext().ownerKey;
}

export function readCurrentOwnerPendingAgentRuns(
  surface?: PendingAgentRun["surface"],
): PendingAgentRun[] {
  const ownerKey = currentPaidAgentRunOwnerKey();
  return readPendingAgentRuns()
    .filter((run) => (
      (!run.ownerKey || run.ownerKey === ownerKey)
      && (!surface || run.surface === surface)
    ))
    .map((run) => run.ownerKey
      ? run
      : {
          ...run,
          legacyUnbound: true as const,
          petName: undefined,
          goal: "Legacy paid run awaiting owner verification",
          maxSteps: undefined,
          confirmCostCredits: undefined,
        })
    .sort((a, b) => b.at - a.at);
}

export function latestPendingAgentRun(surface?: PendingAgentRun["surface"]): PendingAgentRun | null {
  const rows = readCurrentOwnerPendingAgentRuns(surface);
  return rows[0] ?? null;
}

export function hasPendingAgentRuns(): boolean {
  return latestPendingAgentRun() != null;
}

function unavailableMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "The browser paid-run safety journal is unavailable.";
}

function browserLockManager(): LockManager {
  if (
    typeof window === "undefined"
    || typeof navigator === "undefined"
    || !navigator.locks
    || typeof navigator.locks.request !== "function"
  ) {
    throw new Error("This browser cannot safely coordinate paid runs across tabs. Update Chrome before trying again.");
  }
  return navigator.locks;
}

/**
 * Atomically checks the shared journal and writes one new marker under the
 * browser's origin-wide Web Lock. No caller may POST a paid run unless this
 * returns `started`.
 */
export async function beginPendingAgentRun(
  input: PendingAgentRunStart,
): Promise<BeginPendingAgentRunResult> {
  try {
    const auth = getPaidRunAuthContext();
    return await browserLockManager().request(
      AGENT_RUN_PENDING_LOCK_NAME,
      { mode: "exclusive" },
      () => {
        const lockedAuth = getPaidRunAuthContext();
        if (lockedAuth.token !== auth.token || lockedAuth.ownerKey !== auth.ownerKey) {
          throw new Error("The signed-in session changed while the paid-run safety lock was opening.");
        }
        const pending = latestPendingAgentRun();
        if (pending) return { kind: "blocked" as const, pending };
        const run: PendingAgentRun = {
          ...input,
          ownerKey: auth.ownerKey,
          runId: createAgentRunId(),
          at: Date.now(),
        };
        rememberPendingAgentRun(run);
        const confirmed = readCurrentOwnerPendingAgentRuns();
        if (confirmed.length !== 1 || confirmed[0]?.runId !== run.runId) {
          throw new Error("The browser could not verify the paid-run safety marker.");
        }
        return { kind: "started" as const, run, authToken: auth.token };
      },
    );
  } catch (error: unknown) {
    return { kind: "unavailable", message: unavailableMessage(error) };
  }
}

/**
 * Remove only a caller-validated terminal or definitive pre-debit marker.
 * Every journal mutation shares the same Web Lock as beginPendingAgentRun.
 */
export async function removePendingAgentRun(
  runId: string,
): Promise<{ remaining: PendingAgentRun | null }> {
  return browserLockManager().request(
    AGENT_RUN_PENDING_LOCK_NAME,
    { mode: "exclusive" },
    () => {
      forgetPendingAgentRun(runId);
      return { remaining: latestPendingAgentRun() };
    },
  );
}

export function subscribePendingAgentRuns(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === AGENT_RUN_PENDING_STORAGE_KEY || event.key === "petagen_user") {
      listener();
    }
  };
  const onVisibility = () => {
    if (typeof document === "undefined" || !document.hidden) listener();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(AGENT_RUN_PENDING_CHANGE_EVENT, listener);
  window.addEventListener("pageshow", listener);
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibility);
  }
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(AGENT_RUN_PENDING_CHANGE_EVENT, listener);
    window.removeEventListener("pageshow", listener);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibility);
    }
  };
}

export function getPendingAgentRunSnapshot(): string {
  try {
    return JSON.stringify(readCurrentOwnerPendingAgentRuns().map((run) => run.runId));
  } catch {
    return "unavailable";
  }
}

export function isTerminalPaidAgentRunReceipt(
  receipt: unknown,
  runId: string,
): receipt is {
  runId: string;
  state: "terminal";
  billing: {
    outcome: "charged" | "refunded";
    creditsCharged: number;
    usageKnown: boolean;
    modelCalls: number | null;
    [key: string]: any;
  };
  [key: string]: any;
} {
  if (!receipt || typeof receipt !== "object") return false;
  const value = receipt as Record<string, unknown>;
  return value.runId === runId
    && value.state === "terminal"
    && isValidTerminalPaidAgentRunBilling(value.billing);
}

export function isValidTerminalPaidAgentRunBilling(billing: unknown): boolean {
  if (!billing || typeof billing !== "object") return false;
  const value = billing as Record<string, unknown>;
  const charged = value.outcome === "charged";
  const refunded = value.outcome === "refunded";
  if (!charged && !refunded) return false;
  if (
    !Number.isSafeInteger(value.creditsCharged)
    || (charged ? value.creditsCharged !== 5 : value.creditsCharged !== 0)
    || typeof value.usageKnown !== "boolean"
  ) return false;
  if (value.usageKnown === false) {
    return refunded && value.creditsCharged === 0 && value.modelCalls === null;
  }
  return Number.isSafeInteger(value.modelCalls)
    && (value.modelCalls as number) >= 0;
}

/**
 * A just-created receipt can briefly miss a read replica or race a route
 * transition. Treat one 404 as inconclusive and perform exactly one delayed
 * recheck before a caller clears its local safety marker.
 */
export async function recheckAgentRunReceiptOnNotFound<T>(
  lookup: () => Promise<T>,
  delayMs = 250,
): Promise<T> {
  try {
    return await lookup();
  } catch (error: any) {
    if (error?.status !== 404) throw error;
  }
  await new Promise<void>((resolve) => globalThis.setTimeout(resolve, delayMs));
  return lookup();
}
