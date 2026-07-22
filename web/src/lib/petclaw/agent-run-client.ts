/** Shared browser-side paid-run journal used by every PetClaw agent surface. */
export const AGENT_RUN_PENDING_STORAGE_KEY = "petclaw_paid_agent_runs_pending_v1";

export type PendingAgentRun = {
  runId: string;
  petId: number;
  petName?: string;
  goal: string;
  surface: "workbench" | "office" | "console";
  at: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createAgentRunId(): string {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error("This browser cannot create a secure paid-run id; update the browser before running an agent.");
  }
  return globalThis.crypto.randomUUID();
}

export function readPendingAgentRuns(): PendingAgentRun[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(AGENT_RUN_PENDING_STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((run): run is PendingAgentRun =>
      !!run
      && typeof run === "object"
      && typeof run.runId === "string"
      && UUID.test(run.runId)
      && Number.isSafeInteger(run.petId)
      && run.petId > 0
      && typeof run.goal === "string"
      && typeof run.at === "number"
      && ["workbench", "office", "console"].includes(run.surface));
  } catch {
    return [];
  }
}

function writePendingAgentRuns(runs: PendingAgentRun[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AGENT_RUN_PENDING_STORAGE_KEY, JSON.stringify(runs.slice(-25)));
}

export function rememberPendingAgentRun(run: PendingAgentRun): void {
  const existing = readPendingAgentRuns().filter((item) => item.runId !== run.runId);
  writePendingAgentRuns([...existing, run]);
}

export function forgetPendingAgentRun(runId: string): void {
  writePendingAgentRuns(readPendingAgentRuns().filter((item) => item.runId !== runId));
}

export function latestPendingAgentRun(surface?: PendingAgentRun["surface"]): PendingAgentRun | null {
  const rows = readPendingAgentRuns()
    .filter((run) => !surface || run.surface === surface)
    .sort((a, b) => b.at - a.at);
  return rows[0] ?? null;
}

export function hasPendingAgentRuns(): boolean {
  return readPendingAgentRuns().length > 0;
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
