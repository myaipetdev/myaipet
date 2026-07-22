/**
 * Cooperative hard-deadline primitives for an agent run.
 *
 * There is deliberately no Promise.race here. A raced promise would let the
 * losing provider/skill continue charging or mutating state after the route had
 * already settled its credit reservation. Every async boundary receives the
 * same AbortSignal and the caller awaits that work to its terminal state.
 */

export class AgentDeadlineError extends Error {
  constructor(message = "agent wall-clock limit reached") {
    super(message);
    this.name = "AgentDeadlineError";
  }
}

export function throwIfAgentAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new AgentDeadlineError();
}

export function isAgentAbort(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true
    || error instanceof AgentDeadlineError
    || (error instanceof Error && error.name === "AbortError");
}

export interface AgentDeadlineScope {
  signal: AbortSignal;
  deadline: number;
  close: () => void;
}

/** Create one signal shared by planner, skills, memory fan-out and synthesis. */
export function createAgentDeadlineScope(
  timeoutMs: number,
  parentSignal?: AbortSignal,
): AgentDeadlineScope {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Agent deadline must be a positive finite duration");
  }
  const controller = new AbortController();
  const deadline = Date.now() + Math.floor(timeoutMs);
  const abortFromParent = () => {
    if (!controller.signal.aborted) {
      controller.abort(
        parentSignal?.reason instanceof Error
          ? parentSignal.reason
          : new AgentDeadlineError("agent run cancelled"),
      );
    }
  };
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });

  const timer = setTimeout(() => {
    if (!controller.signal.aborted) controller.abort(new AgentDeadlineError());
  }, Math.floor(timeoutMs));

  return {
    signal: controller.signal,
    deadline,
    close: () => {
      clearTimeout(timer);
      parentSignal?.removeEventListener("abort", abortFromParent);
    },
  };
}

/**
 * Await cooperative work to completion. Work MUST consume the supplied signal;
 * this helper checks both sides of the await and never abandons a loser.
 */
export async function awaitAgentWork<T>(
  signal: AbortSignal,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  throwIfAgentAborted(signal);
  const value = await work(signal);
  throwIfAgentAborted(signal);
  return value;
}
