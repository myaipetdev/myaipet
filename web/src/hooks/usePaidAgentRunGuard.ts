"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  beginPendingAgentRun,
  getPendingAgentRunSnapshot,
  latestPendingAgentRun,
  removePendingAgentRun,
  subscribePendingAgentRuns,
  transitionPaidAgentRunPhase,
  type BeginPendingAgentRunResult,
  type PaidAgentRunPhase,
  type PaidAgentRunPhaseEvent,
  type PendingAgentRunStart,
} from "@/lib/petclaw/agent-run-client";

type TerminalEvent = Extract<
  PaidAgentRunPhaseEvent,
  "settled" | "definitive_rejection" | "reconciled"
>;

export function usePaidAgentRunGuard() {
  const [phase, setPhase] = useState<PaidAgentRunPhase>("idle");
  const phaseRef = useRef<PaidAgentRunPhase>("idle");
  const journalSnapshot = useSyncExternalStore(
    subscribePendingAgentRuns,
    getPendingAgentRunSnapshot,
    () => "[]",
  );

  const apply = useCallback((event: PaidAgentRunPhaseEvent) => {
    const transition = transitionPaidAgentRunPhase(phaseRef.current, event);
    phaseRef.current = transition.phase;
    setPhase(transition.phase);
    return transition.startAccepted;
  }, []);

  useEffect(() => {
    if (phaseRef.current === "running") return;
    if (journalSnapshot === "unavailable" || journalSnapshot !== "[]") {
      apply("ambiguous");
    }
  }, [apply, journalSnapshot]);

  const start = useCallback(async (
    input: PendingAgentRunStart,
  ): Promise<BeginPendingAgentRunResult> => {
    if (!apply("start")) {
      let pending = null;
      try { pending = latestPendingAgentRun(); } catch { /* unavailable below */ }
      return pending
        ? { kind: "blocked", pending }
        : {
            kind: "unavailable",
            message: "Another paid run is already starting or awaiting a receipt.",
          };
    }
    const result = await beginPendingAgentRun(input);
    if (result.kind !== "started") apply("ambiguous");
    return result;
  }, [apply]);

  const finish = useCallback(async (
    runId: string,
    event: TerminalEvent,
  ): Promise<boolean> => {
    if (!runId) {
      apply("ambiguous");
      return false;
    }
    try {
      const { remaining } = await removePendingAgentRun(runId);
      apply(remaining ? "ambiguous" : event);
      return !remaining;
    } catch {
      apply("ambiguous");
      return false;
    }
  }, [apply]);

  const markAmbiguous = useCallback(() => apply("ambiguous"), [apply]);
  const settle = useCallback((runId: string) => finish(runId, "settled"), [finish]);
  const reject = useCallback(
    (runId: string) => finish(runId, "definitive_rejection"),
    [finish],
  );
  const reconcile = useCallback(
    (runId: string) => finish(runId, "reconciled"),
    [finish],
  );
  const canReconcile = useCallback(
    () => phaseRef.current === "receipt_missing",
    [],
  );

  return {
    phase,
    running: phase === "running",
    receiptMissing: phase === "receipt_missing",
    journalUnavailable: journalSnapshot === "unavailable",
    start,
    markAmbiguous,
    settle,
    reject,
    reconcile,
    canReconcile,
  };
}
