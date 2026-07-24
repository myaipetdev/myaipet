"use client";

/**
 * AgentOffice — the flagship "Agent Office" dashboard: a productized port of the
 * Hermes / Mission-Control native surface, rendered over REAL PetClaw state.
 *
 * Reads GET /api/petclaw/mission-control?petId=N every ~7s (paused when the tab is
 * hidden) and lays out:
 *   - a 5-Pillar strip (Soul / Memory / User / Skills / Crons) with capped fill bars,
 *   - a 3-state Kanban (QUEUED / WORKING / DONE),
 *   - the Office roster (skills + VIGIL crew as "staff"),
 *   - the cron Schedules,
 *   - a Dispatch bar that POSTs a goal to /api/pets/[petId]/agent?stream=1 (the real
 *     native tool-agent SSE) and shows the run appear live in the Working column.
 *
 * Everything is real or an honest empty state — no fabrication. Studio-purple is the
 * sanctioned agent-surface accent. Editorial idioms mirror AgentWorkbench.tsx.
 */

import {
  useState,
  useEffect,
  useCallback,
  useId,
  useRef,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { api, getPaidRunAuthContext } from "@/lib/api";
import { usePaidAgentRunGuard } from "@/hooks/usePaidAgentRunGuard";
import GrandPawOffice from "./GrandPawOffice";
import {
  isDefinitivePaidAgentRejectionStatus,
  isTerminalPaidAgentRunReceipt,
  latestPendingAgentRun,
  recheckAgentRunReceiptOnNotFound,
} from "@/lib/petclaw/agent-run-client";
import {
  AGENT_OFFICE_TASK_MAX_INPUT,
  AGENT_OFFICE_TYPED_MAX_STEPS,
  agentOfficeTaskDisplayTitle,
  agentOfficeTaskKindFromExecutionContract,
  containsStrongAgentOfficeSecret,
  getAgentOfficeTaskInputError,
  type AgentOfficeTaskKind,
} from "@/lib/petclaw/agent/office-task-contract";

// ── tokens (Collectible Editorial) ──
const INK = "#211A12";
const MUTED = "#7A6E5A";
const PURPLE = "#6B4FA0";
const TERRA = "#9A4E1E";
const SAGE = "#5C8A4E";
const PAPER = "#FBF6EC";
const FIELD = "#ECE4D4";
const DISP = "var(--ed-disp, sans-serif)";
const SANS = "var(--ed-body, sans-serif)";
const MONO = "var(--ed-m, ui-monospace, monospace)";
const HAIR = "rgba(33,26,18,0.13)";
const SHADOW_CARD = "var(--ed-shadow-card, 0 20px 40px -26px rgba(80,55,20,.5))";

const POLL_MS = 7000;
const COST = 5;
const TASK_OPTIONS: ReadonlyArray<{
  kind: AgentOfficeTaskKind;
  label: string;
  description: string;
  placeholder: string;
}> = [
  {
    kind: "recall",
    label: "Recall",
    description: "Retrieve matching owner-private facts, then produce one grounded answer with an auditable receipt.",
    placeholder: "What did I tell you about my launch priorities?",
  },
  {
    kind: "summarize",
    label: "Summarize",
    description: "Turn an excerpt of up to 2,000 characters into a decision brief with key facts, one risk or unknown, and a next step.",
    placeholder: "Paste an excerpt of up to 2,000 characters.",
  },
  {
    kind: "review",
    label: "Review",
    description: "Review an excerpt of up to 2,000 characters for its primary issue, why it matters, and a concrete revision.",
    placeholder: "Paste a message or copy excerpt of up to 2,000 characters.",
  },
  {
    kind: "draft",
    label: "Draft",
    description: "Create a short reviewable draft from your brief. Nothing is sent or published.",
    placeholder: "Describe the short draft you want.",
  },
];
// ── types (mirror the route's response) — exported for GrandPawOffice ──
export interface Pillars {
  soul: {
    set: boolean;
    persona: string;
    personaVersion: number | null;
    configuredAt: string | null;
    updatedAt: string | null;
  };
  memory: { count: number; cap: number; lastFact: string | null; updatedAt: string | null };
  user: { count: number; cap: number };
  skills: { installed: number; learned: number; total: number };
  crons: { catalogCount: number; observedCount: number; nextLabel: string };
}
export interface KItem {
  id: number | string;
  title: string;
  kind?: string;
  skill?: string;
  detail?: string;
  answer?: string;
  reason?: string;
  at?: string;
  startedAt?: string;
  credits?: number;
  runId?: string;
  state?: "reserved" | "running" | "terminal";
  goal?: string;
  executionContract?: string;
  taskKind?: AgentOfficeTaskKind;
  maxSteps?: number;
  completed?: boolean;
  stoppedReason?: string;
  billing?: AgentBilling;
  creditsRemaining?: number;
  steps?: LiveRunStep[];
  createdAt?: string;
  terminalAt?: string;
}
export interface Kanban { pending: KItem[]; working: KItem[]; blocked: KItem[]; done: KItem[]; }
export interface Staff {
  id: string;
  name: string;
  kind: "skill" | "vigil";
  role: string;
  installed: boolean;
  status: "active" | "idle";
  runs: number;
  successRate?: number;
  lastAt?: string | null;
  mode?: "core-in-process" | "installed-in-process" | "install-required" | "locked" | "endpoint-only" | "read-only" | "disabled";
  core?: boolean;
  eligible?: boolean;
  availableInOffice?: boolean;
  blockedReason?: string | null;
  endpoint?: string | null;
  metricLabel?: string;
}
export interface Schedule {
  id: string;
  name: string;
  cadence: string;
  lastRun: string | null;
  nextRun: string | null;
  desc: string;
  source?: "observed" | "catalog";
  mode?: "observed-read-only" | "catalog-read-only";
  readOnly?: boolean;
  blockedReason?: string | null;
}
export interface MC {
  pet: { id: number; name: string; level: number };
  pillars: Pillars;
  kanban: Kanban;
  roster: Staff[];
  schedules: Schedule[];
  latestAgentRun?: KItem | null;
  generatedAt: string;
}
export interface RecallEvidenceRow {
  key: string;
  category: string;
  source: string;
  timestamp: string | null;
  excerpt: string | null;
}
export interface RecallEvidence {
  count: number;
  matches: RecallEvidenceRow[];
}
export interface LiveRunStep {
  skill: string;
  ok: boolean;
  complete: boolean;
  evidence?: RecallEvidence;
}
type OfficeStatus = "IDLE" | "WORKING" | "QUEUED" | "DONE" | "LIVE";
type ClassicColumnStatus = Extract<OfficeStatus, "QUEUED" | "WORKING" | "DONE">;
export interface AgentBilling {
  outcome: "charged" | "refunded";
  creditsCharged: number;
  usageKnown: boolean;
  modelCalls: number | null;
  orchestratorModelCalls?: number | null;
  skillModelCalls?: number | null;
}
export interface LiveRun {
  runId: string;
  title: string;
  taskKind?: AgentOfficeTaskKind;
  steps: LiveRunStep[];
  done: boolean;
  state?: "reserved" | "running" | "terminal";
  answer?: string;
  completed?: boolean;
  stoppedReason?: string;
  billing?: AgentBilling;
  creditsRemaining?: number;
}

function boundedEvidenceText(value: unknown, cap: number): string {
  if (typeof value !== "string") return "";
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > cap ? `${clean.slice(0, cap).trimEnd()}…` : clean;
}

function recallEvidenceFromOutput(value: unknown): RecallEvidence | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const output = value as Record<string, unknown>;
  const rawCount = typeof output.count === "number" && Number.isFinite(output.count)
    ? Math.max(0, Math.floor(output.count))
    : 0;
  const rows = [
    ...(Array.isArray(output.relevant) ? output.relevant : []),
    ...(Array.isArray(output.profile) ? output.profile : []),
  ];
  const matches = rows.slice(0, 8).flatMap((row): RecallEvidenceRow[] => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const record = row as Record<string, unknown>;
    const content = boundedEvidenceText(record.content, 240);
    const rawKey = boundedEvidenceText(record.key, 80) || "retained record";
    const key = containsStrongAgentOfficeSecret(rawKey) ? "retained record" : rawKey;
    const rawCategory = boundedEvidenceText(record.category, 40);
    const category = rawCategory && !containsStrongAgentOfficeSecret(rawCategory)
      ? rawCategory
      : "retained context";
    const rawSource = boundedEvidenceText(record.source, 40);
    const source = rawSource && !containsStrongAgentOfficeSecret(rawSource)
      ? rawSource
      : "private memory";
    const rawTimestamp = boundedEvidenceText(record.createdAt ?? record.updatedAt, 40);
    const timestamp = rawTimestamp && !containsStrongAgentOfficeSecret(rawTimestamp)
      ? rawTimestamp
      : null;
    return [{
      key,
      category,
      source,
      timestamp,
      excerpt: content && !containsStrongAgentOfficeSecret(content) ? content : null,
    }];
  });
  return { count: Math.max(rawCount, matches.length), matches };
}

function liveRunSteps(value: unknown, terminal: boolean): LiveRunStep[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (step): step is { skill: string; ok?: boolean; complete?: boolean; output?: unknown } =>
        !!step
        && typeof step === "object"
        && typeof (step as { skill?: unknown }).skill === "string"
        && (step as { skill: string }).skill.length > 0,
    )
    .map((step) => ({
      skill: step.skill,
      ok: step.ok === true,
      complete: terminal || step.complete === true,
      evidence: step.skill === "recall_memory" && step.ok === true
        ? recallEvidenceFromOutput(step.output)
        : undefined,
    }));
}

function terminalHistoryDetail(run: LiveRun): string {
  const reason = run.stoppedReason?.replaceAll("_", " ") || "unknown reason";
  if (run.completed === false) {
    return `Stopped · ${reason} · ${run.billing?.outcome === "refunded" ? "credits refunded" : "settlement unavailable"}.`;
  }
  if (run.billing?.outcome === "refunded") {
    return "Completed without a chargeable deliverable · credits refunded.";
  }
  if (run.billing?.outcome === "charged") {
    return `Completed · ${run.billing.creditsCharged} credits charged.`;
  }
  return "Completed · settlement unavailable.";
}

function relTime(ts?: string | null): string {
  if (!ts) return "never";
  const s = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/**
 * Only persisted executable waiting work may enter QUEUED. The current route
 * has no such queue and returns pending empty; keep this adapter narrow so
 * suggestions can never masquerade as work that will actually run.
 */
function queuedForDisplay(kanban: Kanban): KItem[] {
  return [...kanban.pending];
}

/** Legacy no-op/refunded rows are terminal history, never resumable QUEUED work. */
function doneForDisplay(kanban: Kanban): KItem[] {
  return [
    ...kanban.done,
    ...kanban.blocked.map((item) => ({
      ...item,
      skill: item.skill || "no skill",
      detail: item.reason || item.detail,
      credits: 0,
    })),
  ];
}

/** A completed item must never remain visible under WORKING. */
function workingForDisplay(kanban: Kanban, liveRun: LiveRun | null): KItem[] {
  const terminal = doneForDisplay(kanban);
  const doneIds = new Set(terminal.map((item) => String(item.id)));
  const doneTitles = new Set(terminal.map((item) => item.title));
  if (liveRun?.done) doneTitles.add(liveRun.title);
  return kanban.working.filter(
    (item) =>
      !doneIds.has(String(item.id))
      && !doneTitles.has(item.title)
      && (
        !liveRun
        || liveRun.done
        || (item.runId !== liveRun.runId && item.title !== liveRun.title)
      ),
  );
}

/**
 * Rehydrate the inline result after a refresh from the owner-scoped run ledger.
 * The local SSE state remains first choice while this tab is streaming.
 */
function persistedLiveRun(mc: MC | null): LiveRun | null {
  if (!mc) return null;
  const active = [...mc.kanban.working, ...mc.kanban.pending]
    .find((item) => typeof item.runId === "string");
  const item = active || mc.latestAgentRun;
  if (!item?.runId) return null;
  const terminal = item.state === "terminal" || (!active && item.completed !== undefined);
  return {
    runId: item.runId,
    title: item.goal || item.title,
    taskKind: item.taskKind
      || agentOfficeTaskKindFromExecutionContract(item.executionContract || "")
      || undefined,
    steps: liveRunSteps(item.steps, terminal),
    done: terminal,
    state: terminal ? "terminal" : item.state === "reserved" ? "reserved" : "running",
    answer: item.answer || (terminal ? item.detail : undefined),
    completed: item.completed,
    stoppedReason: item.stoppedReason,
    billing: item.billing,
    creditsRemaining: typeof item.creditsRemaining === "number" ? item.creditsRemaining : undefined,
  };
}

export default function AgentOffice({
  onCreditsChange,
}: {
  onCreditsChange?: (credits: number) => void;
}) {
  const dispatchGoalId = useId();
  const [pets, setPets] = useState<any[]>([]);
  const [petId, setPetId] = useState<number | null>(null);
  const [loadingPets, setLoadingPets] = useState(true);
  const [petsError, setPetsError] = useState<string | null>(null);
  const [petsReloadKey, setPetsReloadKey] = useState(0);
  const [mc, setMc] = useState<MC | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [goal, setGoal] = useState("");
  const [taskKind, setTaskKind] = useState<AgentOfficeTaskKind>("recall");
  const [reconciling, setReconciling] = useState(false);
  const [liveRun, setLiveRun] = useState<LiveRun | null>(null);
  const [liveRunPetId, setLiveRunPetId] = useState<number | null>(null);
  const [view, setView] = useState<"hotel" | "classic">("hotel");
  const reconcileAttemptRef = useRef<{ runId: string } | null>(null);
  const selectedPetIdRef = useRef<number | null>(null);
  const taskModeRefs = useRef<Record<AgentOfficeTaskKind, HTMLButtonElement | null>>({
    recall: null,
    summarize: null,
    review: null,
    draft: null,
  });
  const {
    running,
    receiptMissing,
    start: startPaidRun,
    markAmbiguous: markPaidRunAmbiguous,
    settle: settlePaidRun,
    reject: rejectPaidRun,
    reconcile: reconcilePaidRun,
    canReconcile: canReconcilePaidRun,
  } = usePaidAgentRunGuard();

  // ── load pets ──
  useEffect(() => {
    let alive = true;
    setLoadingPets(true);
    setPetsError(null);
    (async () => {
      try {
        const data = await api.pets.list();
        const list = data.pets || data || [];
        if (!alive) return;
        setPets(list);
        if (list.length) {
          let initialPetId = Number(list[0].id);
          try {
            const pending = latestPendingAgentRun();
            if (pending && list.some((candidate: any) => Number(candidate.id) === pending.petId)) {
              initialPetId = pending.petId;
            }
          } catch {
            /* the paid-run guard surfaces an unavailable/corrupt journal */
          }
          selectedPetIdRef.current = initialPetId;
          setPetId(initialPetId);
        }
      } catch (error: unknown) {
        if (!alive) return;
        setPets([]);
        setPetsError(
          error instanceof Error && error.message
            ? error.message
            : "Pet data could not be loaded.",
        );
      } finally {
        if (alive) setLoadingPets(false);
      }
    })();
    return () => { alive = false; };
  }, [petsReloadKey]);

  useEffect(() => {
    try {
      const pending = latestPendingAgentRun();
      if (!pending || typeof pending.goal !== "string") return;
      setGoal(pending.goal);
      if (pending.taskKind) setTaskKind(pending.taskKind);
      setLiveRunPetId(pending.petId);
      setLiveRun({
        runId: pending.runId,
        title: pending.goal,
        taskKind: pending.taskKind,
        steps: [],
        done: true,
        state: "terminal",
        stoppedReason: "receipt_missing",
      });
      setErr("The previous paid run ended without a settlement receipt. Check Account credits and usage before dispatching again.");
    } catch { /* ignore corrupt local state */ }
  }, []);

  // ── poll mission-control (pause when hidden) ──
  const fetchMc = useCallback(async (pid: number) => {
    try {
      // routed through api.request so the dev-mock layer serves the office
      // locally (the shared auth-header/error handling comes with it)
      const data = (await api.missionControl(pid)) as MC;
      if (selectedPetIdRef.current !== pid) return;
      setMc(data);
      setErr(null);
    } catch (e: any) {
      if (selectedPetIdRef.current !== pid) return;
      setErr(e?.message || "Couldn't load the office.");
    }
  }, []);

  useEffect(() => {
    if (petId == null) return;
    setMc(null);
    fetchMc(petId);
    let timer: any = null;
    const tick = () => { if (!document.hidden) fetchMc(petId); };
    timer = setInterval(tick, POLL_MS);
    const onVis = () => { if (!document.hidden) fetchMc(petId); };
    document.addEventListener("visibilitychange", onVis);
    return () => { if (timer) clearInterval(timer); document.removeEventListener("visibilitychange", onVis); };
  }, [petId, fetchMc]);

  const petName = pets.find((p) => Number(p.id) === petId)?.name || mc?.pet?.name || "your pet";
  const taskInputError = getAgentOfficeTaskInputError(taskKind, goal);
  const taskReady = taskInputError === null;
  const showTaskInputError = goal.length > 0 && taskInputError !== null;
  const taskValidationId = `${dispatchGoalId}-validation`;
  const localSelectedRun = liveRunPetId === petId ? liveRun : null;
  const persistedRun = persistedLiveRun(mc);
  const displayedRun = localSelectedRun && !localSelectedRun.done
    ? localSelectedRun
    : persistedRun && !persistedRun.done
      ? persistedRun
      : localSelectedRun || persistedRun;
  const persistedActive = !!persistedRun && !persistedRun.done;
  const composerLocked =
    running
    || receiptMissing
    || reconciling
    || persistedActive;

  const selectPet = useCallback((nextPetId: number) => {
    if (composerLocked) return;
    selectedPetIdRef.current = nextPetId;
    setPetId(nextPetId);
    setMc(null);
    setLiveRun(null);
    setLiveRunPetId(null);
  }, [composerLocked]);

  const moveTaskMode = useCallback((
    event: KeyboardEvent<HTMLButtonElement>,
    current: AgentOfficeTaskKind,
  ) => {
    if (composerLocked) return;
    const keys = TASK_OPTIONS.map((option) => option.kind);
    const index = keys.indexOf(current);
    let nextIndex = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % keys.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + keys.length) % keys.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = keys.length - 1;
    else return;
    event.preventDefault();
    const next = keys[nextIndex];
    setTaskKind(next);
    taskModeRefs.current[next]?.focus();
  }, [composerLocked]);

  // ── dispatch a goal to the real tool-agent SSE ──
  const dispatch = useCallback(async (
    goalOverride?: string,
    taskKindOverride?: AgentOfficeTaskKind,
  ) => {
    if (composerLocked) return;
    const cleanGoal = (goalOverride ?? goal).trim();
    if (petId == null || cleanGoal.length < 3) return;
    const selectedTaskKind = taskKindOverride ?? taskKind;
    const inputError = getAgentOfficeTaskInputError(selectedTaskKind, cleanGoal);
    if (inputError) {
      setErr(inputError);
      return;
    }
    const start = await startPaidRun({
      petId,
      petName,
      goal: cleanGoal,
      taskKind: selectedTaskKind,
      maxSteps: AGENT_OFFICE_TYPED_MAX_STEPS,
      confirmCostCredits: COST,
      surface: "office",
    });
    if (start.kind !== "started") {
      setErr(
        start.kind === "blocked"
          ? `Paid-run safety lock: ${start.pending.runId.slice(0, 8)}… still needs a settlement receipt.`
          : start.message,
      );
      return;
    }
    const { runId } = start.run;
    const { authToken } = start;
    setErr(null);
    setLiveRunPetId(petId);
    const steps: LiveRunStep[] = [];
    const byId: Record<string, number> = {};
    setLiveRun({
      runId,
      title: cleanGoal,
      taskKind: selectedTaskKind,
      steps: [],
      done: false,
      state: "running",
    });
    let receivedSettlementReceipt = false;
    let clearInputAfterSettlement = false;
    try {
      const res = await fetch(`/api/pets/${petId}/agent?stream=1`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          runId,
          goal: cleanGoal,
          taskKind: selectedTaskKind,
          maxSteps: AGENT_OFFICE_TYPED_MAX_STEPS,
          confirmCostCredits: COST,
        }),
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({} as any));
        const outcomeUnknown = !isDefinitivePaidAgentRejectionStatus(res.status);
        if (outcomeUnknown) {
          if (
            d?.runId === runId
            && d?.state === "reserved"
            && d?.creditsReserved === COST
            && Number.isSafeInteger(d?.creditsRemaining)
            && d.creditsRemaining >= 0
          ) {
            onCreditsChange?.(d.creditsRemaining);
            setLiveRun((current) => current
              ? { ...current, state: "reserved", creditsRemaining: d.creditsRemaining }
              : current);
          }
          markPaidRunAmbiguous();
          setErr("The server returned no validated settlement receipt. Dispatch remains locked; reconcile this saved run before trying again.");
          setLiveRun((current) => current
            ? { ...current, done: true, stoppedReason: "receipt_missing" }
            : current);
        } else {
          const unlocked = await rejectPaidRun(runId);
          setErr(
            d?.error === "Not enough credits"
              ? `Not enough credits — a run costs ${COST}.`
              : !unlocked
                ? "This run was rejected, but another saved paid run still needs a receipt check."
                : d?.suggestedSurface
                  ? `${d?.error || "This task is not available in Agent Office"} ${d.suggestedSurface}`
                  : d?.error || "The run was rejected before it started.",
          );
          setLiveRun(null);
          setLiveRunPetId(null);
        }
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      const flush = () => setLiveRun((r) => (r ? { ...r, steps: [...steps] } : r));
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split("\n\n");
        buf = chunks.pop() || "";
        for (const chunk of chunks) {
          const line = chunk.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          let evt: any;
          try { evt = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (
            evt.type === "reserved"
            && evt.runId === runId
            && evt.state === "running"
            && evt.taskKind === selectedTaskKind
            && evt.creditsReserved === COST
            && Number.isSafeInteger(evt.creditsRemaining)
            && evt.creditsRemaining >= 0
          ) {
            onCreditsChange?.(evt.creditsRemaining);
            setLiveRun((current) => current
              ? { ...current, state: "running", creditsRemaining: evt.creditsRemaining }
              : current);
          } else if (evt.type === "tool_call") {
            byId[evt.id] = steps.length;
            steps.push({ skill: evt.skill, ok: true, complete: false });
            flush();
          } else if (evt.type === "tool_result") {
            const idx = byId[evt.id];
            if (idx != null) {
              steps[idx] = {
                ...steps[idx],
                ok: !!evt.ok,
                complete: true,
                evidence: evt.skill === "recall_memory" && evt.ok === true
                  ? recallEvidenceFromOutput(evt.output)
                  : undefined,
              };
              flush();
            }
          } else if (evt.type === "done") {
            if (!isTerminalPaidAgentRunReceipt(evt, runId, { taskKind: selectedTaskKind })) continue;
            const billing = evt.billing as AgentBilling;
            const settledSteps = liveRunSteps(evt.steps, true);
            receivedSettlementReceipt = true;
            clearInputAfterSettlement =
              evt.completed === true
              && billing.outcome === "charged";
            if (typeof evt.creditsRemaining === "number" && Number.isFinite(evt.creditsRemaining)) {
              onCreditsChange?.(evt.creditsRemaining);
            }
            setLiveRun((r) => (r ? {
              ...r,
              done: true,
              state: "terminal",
              steps: settledSteps.length > 0
                ? settledSteps
                : r.steps.map((step) => ({ ...step, complete: true })),
              answer: evt.answer || "",
              completed: evt.completed === true,
              stoppedReason: evt.stoppedReason || "completed",
              billing,
              creditsRemaining: evt.creditsRemaining,
            } : r));
          } else if (evt.type === "error") {
            setErr(evt.message || evt.error || "The required tool failed.");
          }
        }
      }
      if (!receivedSettlementReceipt) {
        markPaidRunAmbiguous();
        setErr("The stream ended before the settlement receipt arrived. Do not retry yet; check Account credits and usage first.");
        setLiveRun((r) => (r ? { ...r, done: true, stoppedReason: "receipt_missing" } : r));
      } else {
        if (clearInputAfterSettlement) setGoal("");
        // Refresh so the completion-only history lands in DONE from the DB.
        if (petId != null) fetchMc(petId);
      }
    } catch {
      if (!receivedSettlementReceipt) {
        markPaidRunAmbiguous();
        setErr("The connection ended without a settlement receipt. The run may have reached the server; check Account before retrying.");
        setLiveRun((r) => (r ? { ...r, done: true, stoppedReason: "receipt_missing" } : r));
      }
    } finally {
      if (receivedSettlementReceipt) {
        const unlocked = await settlePaidRun(runId);
        if (!unlocked) {
          setErr("This dispatch settled, but another saved paid run still needs a receipt check.");
        }
      }
    }
  }, [
    fetchMc,
    goal,
    markPaidRunAmbiguous,
    onCreditsChange,
    petId,
    petName,
    rejectPaidRun,
    settlePaidRun,
    startPaidRun,
    taskKind,
    composerLocked,
  ]);

  const reconcilePendingRun = async () => {
    if (!canReconcilePaidRun() || reconcileAttemptRef.current) return;
    let pending: ReturnType<typeof latestPendingAgentRun>;
    try {
      pending = latestPendingAgentRun();
    } catch (storageError: unknown) {
      setErr(
        storageError instanceof Error
          ? storageError.message
          : "The paid-run safety journal is unavailable.",
      );
      return;
    }
    if (!pending) {
      markPaidRunAmbiguous();
      setErr(
        "The saved paid-run marker is unavailable, so dispatch stays locked. "
        + "Check Account credits and usage or contact support; do not create a new run ID.",
      );
      return;
    }
    const attempt = { runId: pending.runId };
    reconcileAttemptRef.current = attempt;
    setReconciling(true);
    try {
      let receipt;
      const { token: authToken } = getPaidRunAuthContext();
      try {
        receipt = await recheckAgentRunReceiptOnNotFound(
          () => api.pets.agentRunStatus(pending.petId, pending.runId, authToken),
        );
      } catch (lookupError: any) {
        if (lookupError?.status !== 404) throw lookupError;
        if (pending.maxSteps == null || pending.confirmCostCredits !== COST) {
          setErr(
            `No receipt is visible for legacy run ${pending.runId.slice(0, 8)}…. `
            + "Its marker stays locked because exact replay parameters are unavailable.",
          );
          return;
        }
        setErr(`Resuming saved run ${pending.runId.slice(0, 8)}… with the same charge ID…`);
        try {
          receipt = await api.pets.runAgent(
            pending.petId,
            pending.runId,
            pending.goal,
            pending.confirmCostCredits,
            pending.maxSteps,
            authToken,
            pending.taskKind,
          );
        } catch (replayError: any) {
          if (
            pending.taskKind == null
            && pending.legacyUnbound !== true
            && replayError?.status === 400
          ) {
            const unlocked = await rejectPaidRun(pending.runId);
            setErr(
              unlocked
                ? "The legacy marker had no typed task contract and the server confirmed no run exists. It was safely cleared; choose a task type before starting again."
                : "The legacy marker was rejected, but another saved paid run still needs a receipt check.",
            );
            return;
          }
          throw replayError;
        }
      }
      if (reconcileAttemptRef.current !== attempt) return;
      if (latestPendingAgentRun()?.runId !== pending.runId) return;
      if (!isTerminalPaidAgentRunReceipt(receipt, pending.runId, pending)) {
        setErr(
          `Run ${pending.runId.slice(0, 8)}… has no validated terminal receipt `
          + `(${receipt?.state || "unknown"}). Dispatch remains locked.`,
        );
        return;
      }
      setLiveRun({
        runId: pending.runId,
        title: receipt.goal || pending.goal,
        taskKind: pending.taskKind
          || agentOfficeTaskKindFromExecutionContract(receipt.executionContract || "")
          || undefined,
        steps: liveRunSteps(receipt.steps, true),
        done: true,
        state: "terminal",
        answer: receipt.answer || "",
        completed: receipt.completed === true,
        stoppedReason: receipt.stoppedReason,
        billing: receipt.billing as AgentBilling,
        creditsRemaining: receipt.creditsRemaining,
      });
      setLiveRunPetId(pending.petId);
      if (
        typeof receipt.creditsRemaining === "number"
        && Number.isFinite(receipt.creditsRemaining)
      ) {
        onCreditsChange?.(receipt.creditsRemaining);
      }
      if (receipt.completed === true && receipt.billing?.outcome === "charged") {
        setGoal("");
      }
      const unlocked = await reconcilePaidRun(pending.runId);
      setErr(
        unlocked
          ? null
          : "This run reconciled, but another saved paid run still needs a receipt check.",
      );
    } catch (e: any) {
      if (reconcileAttemptRef.current !== attempt) return;
      setErr(
        `Receipt lookup/replay failed: ${e?.message || "try again shortly"}. `
        + `Run ${pending.runId.slice(0, 8)}… remains locked; no new run ID was created.`,
      );
    } finally {
      if (reconcileAttemptRef.current === attempt) {
        reconcileAttemptRef.current = null;
        setReconciling(false);
      }
    }
  };

  const classicQueued = mc ? queuedForDisplay(mc.kanban) : [];
  const classicWorking = mc ? workingForDisplay(mc.kanban, displayedRun) : [];
  const classicDone = mc ? doneForDisplay(mc.kanban) : [];
  const displayedRunIsWorking = !!(
    displayedRun
    && !displayedRun.done
    && displayedRun.state !== "reserved"
  );
  const displayedRunIsQueued = !!(
    displayedRun
    && !displayedRun.done
    && displayedRun.state === "reserved"
  );
  const isWorking = classicWorking.length > 0 || running || displayedRunIsWorking;
  const isQueued = classicQueued.length > 0 || displayedRunIsQueued;
  const liveDoneNotPersisted = !!(
    mc
    && displayedRun?.done
    && !classicDone.some((item) => item.title === displayedRun.title)
  );

  // ── pet loading failure / real empty account ──
  if (!loadingPets && petsError) {
    return (
      <div style={wrap}>
        <Header petName="your pet" pets={[]} petId={null} setPetId={() => {}} isWorking={false} isQueued={false} petSwitchLocked={false} />
        <div role="alert" style={{ ...card, textAlign: "center", color: MUTED, fontFamily: SANS }}>
          <div style={{ color: INK, fontWeight: 800, marginBottom: 7 }}>The Office could not load your pets.</div>
          <div style={{ lineHeight: 1.5 }}>This is a loading error, not an empty account. {petsError}</div>
          <button
            type="button"
            onClick={() => setPetsReloadKey((value) => value + 1)}
            style={{ marginTop: 14, border: `1px solid ${HAIR}`, borderRadius: 10, background: PAPER, color: INK, padding: "9px 14px", fontFamily: SANS, fontSize: 14, fontWeight: 800, cursor: "pointer" }}
          >
            Retry loading pets
          </button>
        </div>
      </div>
    );
  }

  if (!loadingPets && pets.length === 0) {
    return (
      <div style={wrap}>
        <Header petName="your pet" pets={[]} petId={null} setPetId={() => {}} isWorking={false} isQueued={false} petSwitchLocked={false} />
        <div style={{ ...card, textAlign: "center", color: MUTED, fontFamily: SANS }}>
          <div style={{ color: INK, fontWeight: 800, marginBottom: 7 }}>No adopted pet yet.</div>
          <div>Adopt a pet first — then its Agent Office opens here.</div>
          <Link href="/?section=my%20pet" style={{ display: "inline-block", marginTop: 14, borderRadius: 10, background: INK, color: PAPER, padding: "9px 14px", fontWeight: 800, textDecoration: "none" }}>
            Adopt a pet
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <style>{`
        @keyframes officePulse{0%,100%{box-shadow:0 0 0 0 rgba(107,79,160,0.0),${SHADOW_CARD}}50%{box-shadow:0 0 0 3px rgba(107,79,160,0.18),${SHADOW_CARD}}}
        @media (prefers-reduced-motion: reduce) {
          .office-live-pulse { animation: none !important; }
        }
      `}</style>

      <Header
        petName={petName}
        pets={pets}
        petId={petId}
        setPetId={selectPet}
        isWorking={isWorking}
        isQueued={isQueued}
        petSwitchLocked={composerLocked}
        view={view}
        setView={setView}
      />

      {err && (
        <div role="alert" style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 10, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.22)", color: "#b91c1c", fontFamily: SANS, fontSize: 13.5 }}>
          {err}
        </div>
      )}

      {receiptMissing && (
        <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 10, background: "rgba(190,79,40,0.09)", border: "1px solid rgba(190,79,40,0.28)", color: TERRA, fontFamily: SANS, fontSize: 13.5, lineHeight: 1.5 }}>
          <b>Paid-run safety lock:</b> <a href="/account" style={{ color: TERRA, fontWeight: 800 }}>Open Account</a> and verify credits/usage before unlocking another dispatch.
          <div>
            <button
              type="button"
              onClick={reconcilePendingRun}
              disabled={reconciling}
              aria-busy={reconciling}
              style={{ marginTop: 8, border: `1px solid ${HAIR}`, borderRadius: 8, padding: "7px 10px", background: PAPER, color: INK, fontFamily: SANS, fontWeight: 700 }}
            >
              {reconciling ? "Checking saved run…" : "Check saved run receipt"}
            </button>
          </div>
        </div>
      )}

      {persistedActive && !running && !receiptMissing && (
        <div role="status" style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 10, background: "rgba(107,79,160,0.08)", border: "1px solid rgba(107,79,160,0.24)", color: PURPLE, fontFamily: SANS, fontSize: 13.5, lineHeight: 1.5 }}>
          <b>Active paid task:</b> this pet already has a queued or running task, possibly from another tab. New dispatch and pet switching stay locked until its owner-scoped receipt reaches a terminal state.
        </div>
      )}

      {/* ══ HOTEL VIEW — "The Grand Paw" lobby diorama over the same real data ══ */}
      {view === "hotel" && (
        mc ? (
          <GrandPawOffice mc={mc} liveRun={displayedRun} running={running} receiptMissing={receiptMissing} composerLocked={composerLocked} petName={petName}
            pets={pets} goal={goal} setGoal={setGoal} taskKind={taskKind} setTaskKind={setTaskKind}
            onDispatch={dispatch} cost={COST} />
        ) : (
          <div role="status" aria-live="polite" style={{ ...card, textAlign: "center", color: MUTED, fontFamily: SANS }}>Opening the hotel…</div>
        )
      )}

      {/* ══ CLASSIC VIEW — the plain admin board (fallback) ══ */}
      {view === "classic" && (
      <>
      {/* ── 5-Pillar strip ── */}
      {mc && (
        <div style={pillarGrid}>
          <Pillar label="Soul" mono="SOUL" accent={PURPLE}
            value={mc.pillars.soul.set ? mc.pillars.soul.persona : "not set"}
            sub={mc.pillars.soul.set
              ? `persona v${mc.pillars.soul.personaVersion ?? "unknown"} · updated ${relTime(mc.pillars.soul.updatedAt)}`
              : "persona not configured · onboarding open"} />
          <Pillar label="Memory" mono="MEMORY" accent={TERRA}
            value={`${mc.pillars.memory.count} / ${mc.pillars.memory.cap}`}
            sub={mc.pillars.memory.updatedAt ? `updated ${relTime(mc.pillars.memory.updatedAt)}` : "empty ledger"}
            fill={mc.pillars.memory.count / mc.pillars.memory.cap} />
          <Pillar label="User" mono="USER" accent={TERRA}
            value={`${mc.pillars.user.count} / ${mc.pillars.user.cap}`}
            sub="owner profile facts"
            fill={mc.pillars.user.count / mc.pillars.user.cap} />
          <Pillar label="Skill manifests" mono="MANIFESTS" accent={SAGE}
            value={`${mc.pillars.skills.total} built-in`}
            sub={`4 Office task tools · ${mc.pillars.skills.installed} user-installed`} />
          <Pillar label="Routine catalog" mono="CATALOG" accent={PURPLE}
            value={`${mc.pillars.crons.catalogCount} listed`}
            sub={mc.pillars.crons.nextLabel} />
        </div>
      )}

      {/* ── Kanban ── */}
      {mc ? (
        <div style={kanbanGrid}>
          <Column mono="QUEUED" count={classicQueued.length} empty="The queue is clear.">
            {classicQueued.map((it, index) => (
              <KanbanCard key={`queued-${index}-${String(it.id)}`} accent={MUTED} title={it.title} detail={it.detail} tag="QUEUED" />
            ))}
          </Column>
          <Column mono="WORKING" count={classicWorking.length + (displayedRunIsWorking ? 1 : 0)} empty="Start a supported read-only task below.">
            {displayedRunIsWorking && displayedRun && (
              <KanbanCard pulse accent={PURPLE} title={agentOfficeTaskDisplayTitle(displayedRun.taskKind, displayedRun.title)}
                detail={`${displayedRun.steps.length} required tool${displayedRun.steps.length === 1 ? "" : "s"} · ${displayedRun.steps.map((s) => s.skill).join(" → ") || "waiting for tool start…"}`}
                tag="LIVE" />
            )}
            {classicWorking.map((it) => (
              <KanbanCard key={String(it.id)} pulse accent={PURPLE} title={it.title}
                detail={[it.skill, it.detail].filter(Boolean).join(" · ")} tag="WORKING" />
            ))}
          </Column>
          <Column mono="DONE" count={classicDone.length + (liveDoneNotPersisted ? 1 : 0)} empty="Nothing has finished yet.">
            {liveDoneNotPersisted && displayedRun && (
              <KanbanCard accent={displayedRun.billing?.outcome === "refunded" ? TERRA : SAGE} title={agentOfficeTaskDisplayTitle(displayedRun.taskKind, displayedRun.title)} detail={terminalHistoryDetail(displayedRun)} tag="DONE" />
            )}
            {classicDone.map((it, index) => (
              <KanbanCard key={`done-${index}-${String(it.id)}`} accent={SAGE} title={it.title}
                detail={it.detail || `${it.skill}${it.credits ? ` · ${it.credits} cr` : ""}`} sub={relTime(it.at)} tag="DONE" historyItem={it} historyPetId={petId ?? undefined} />
            ))}
          </Column>
        </div>
      ) : (
        <div role="status" aria-live="polite" style={{ ...card, textAlign: "center", color: MUTED, fontFamily: SANS }}>Loading the office…</div>
      )}
      </>
      )}

      {/* ── Dispatch bar (classic only — the hotel has its own front desk) ── */}
      {view === "classic" && (
      <div style={{ ...card, marginTop: 20, padding: "16px 18px" }}>
        <label htmlFor={dispatchGoalId} style={{ display: "block", fontFamily: MONO, fontSize: 13, letterSpacing: "0.14em", color: PURPLE, fontWeight: 700, marginBottom: 10 }}>
          READ-ONLY TASK · BETA
        </label>
        <div id={`${dispatchGoalId}-scope`} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 10, marginBottom: 12 }}>
          <div style={{ borderRadius: 10, border: `1px solid ${HAIR}`, background: "rgba(92,138,78,0.06)", padding: "10px 12px", fontFamily: SANS, fontSize: 13, color: INK, lineHeight: 1.5 }}>
            <b>Supported now:</b> four explicit text deliverables — memory recall, pasted-text summary, copy review, and a short draft.
          </div>
          <div style={{ borderRadius: 10, border: `1px solid ${HAIR}`, background: "rgba(190,79,40,0.05)", padding: "10px 12px", fontFamily: SANS, fontSize: 13, color: MUTED, lineHeight: 1.5 }}>
            <b style={{ color: INK }}>Not supported here:</b> browsing URLs or the live web; opening files, inboxes, or apps; sending messages; editing data or settings; purchases; media generation; running routines.
          </div>
        </div>
        <div role="radiogroup" aria-label="Task type" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8, marginBottom: 10 }}>
          {TASK_OPTIONS.map((option) => (
            <button
              type="button"
              role="radio"
              aria-checked={taskKind === option.kind}
              tabIndex={taskKind === option.kind ? 0 : -1}
              ref={(node) => { taskModeRefs.current[option.kind] = node; }}
              key={option.kind}
              onClick={() => setTaskKind(option.kind)}
              onKeyDown={(event) => moveTaskMode(event, option.kind)}
              disabled={composerLocked}
              style={{
                border: `1px solid ${taskKind === option.kind ? PURPLE : HAIR}`,
                borderRadius: 10,
                background: taskKind === option.kind ? "rgba(107,79,160,0.09)" : PAPER,
                color: taskKind === option.kind ? PURPLE : INK,
                padding: "9px 11px",
                fontFamily: SANS,
                fontSize: 13,
                fontWeight: 800,
                cursor: composerLocked ? "not-allowed" : "pointer",
                opacity: composerLocked ? 0.62 : 1,
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div id={`${dispatchGoalId}-mode`} style={{ fontFamily: SANS, fontSize: 13, color: MUTED, lineHeight: 1.5, marginBottom: 10 }}>
          {TASK_OPTIONS.find((option) => option.kind === taskKind)?.description}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <textarea
            id={dispatchGoalId}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            disabled={composerLocked}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                dispatch();
              }
            }}
            aria-describedby={`${dispatchGoalId}-scope ${dispatchGoalId}-mode ${taskValidationId} ${taskValidationId}-count ${dispatchGoalId}-billing`}
            aria-invalid={showTaskInputError}
            aria-errormessage={showTaskInputError ? taskValidationId : undefined}
            placeholder={TASK_OPTIONS.find((option) => option.kind === taskKind)?.placeholder}
            rows={3}
            style={{ flex: 1, minWidth: 0, width: "100%", boxSizing: "border-box", fontFamily: SANS, fontSize: 15, lineHeight: 1.5, color: INK, padding: "12px 14px", borderRadius: 12, border: `1px solid ${showTaskInputError ? "#B91C1C" : HAIR}`, background: PAPER, resize: "vertical" }}
          />
          <button
            type="button"
            onClick={() => dispatch()}
            disabled={!taskReady || composerLocked || petId == null}
            aria-busy={running}
            style={{
              padding: "12px 22px", borderRadius: 12, border: "none",
              fontFamily: SANS, fontSize: 15, fontWeight: 800,
              cursor: taskReady && !composerLocked ? "pointer" : "not-allowed",
              color: "#FFF8EE",
              background: taskReady && !composerLocked ? "linear-gradient(180deg,#7C5FB8,#5B4090)" : "rgba(33,26,18,0.18)",
            }}
          >
            {running
              ? "WORKING"
              : reconciling
                ? "Checking saved receipt…"
                : receiptMissing
                ? "Check Account first"
                : persistedActive
                  ? "Waiting for active task"
                : `Run ${TASK_OPTIONS.find((option) => option.kind === taskKind)?.label || "task"} · reserve ${COST} credits`}
          </button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", fontFamily: SANS, fontSize: 13, color: showTaskInputError ? "#991B1B" : MUTED, marginTop: 8, lineHeight: 1.4 }}>
          <span id={taskValidationId} role={showTaskInputError ? "alert" : undefined} aria-live={showTaskInputError ? "assertive" : undefined}>
            {showTaskInputError ? taskInputError : `${TASK_OPTIONS.find((option) => option.kind === taskKind)?.label} input is ready when its requirement is met.`}
          </span>
          <span id={`${taskValidationId}-count`}>{goal.length} / {AGENT_OFFICE_TASK_MAX_INPUT}</span>
        </div>
        <div id={`${dispatchGoalId}-billing`} style={{ fontFamily: SANS, fontSize: 13, color: MUTED, marginTop: 8, lineHeight: 1.5 }}>
          Reserves {COST} credits for a task-specific, auditable deliverable. Charged only when the selected internal read-only tool succeeds and produces it; otherwise refunded. Do not paste secrets: input and output are sent to the configured AI provider when needed and stored in your private run history under the <a href="/privacy" style={{ color: PURPLE, fontWeight: 800 }}>Privacy policy</a>. No pet-memory or self-learning write occurs. Use the button or Command/Ctrl + Enter.
        </div>
      </div>
      )}

      {view === "classic" && displayedRun && (
        <ClassicResultPanel
          run={displayedRun}
          cost={COST}
        />
      )}

      {/* ── Office roster + schedules (classic only; the village shows its own) ── */}
      {view === "classic" && mc && <Roster roster={mc.roster} liveRun={displayedRun} />}

      {view === "classic" && mc && (
        <div style={{ marginTop: 26 }}>
          <SectionTitle mono="READ-ONLY CATALOG" title="Routine schedule" />
          <div style={{ fontFamily: SANS, fontSize: 13, color: MUTED, lineHeight: 1.5, margin: "-4px 0 10px" }}>
            Schedule metadata only. This Office cannot create, edit, pause, or manually run routines.
          </div>
          <div style={{ ...card, padding: 0, overflow: "hidden" }}>
            {mc.schedules.map((s, i) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderTop: i ? `1px solid ${HAIR}` : "none", flexWrap: "wrap" }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: s.lastRun ? SAGE : "rgba(33,26,18,0.2)", flexShrink: 0 }} />
                <span style={{ fontFamily: SANS, fontSize: 14.5, fontWeight: 700, color: INK, minWidth: 130 }}>{s.name}</span>
                <span style={{ fontFamily: MONO, fontSize: 13, color: PURPLE, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "rgba(107,79,160,0.08)" }}>{s.cadence}</span>
                <span style={{ fontFamily: SANS, fontSize: 13, color: MUTED, flex: 1, minWidth: 160 }}>{s.desc}</span>
                <span style={{ fontFamily: MONO, fontSize: 13, color: MUTED }}>last: {relTime(s.lastRun)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {mc && (
        <div style={{ fontFamily: MONO, fontSize: 13, color: "rgba(33,26,18,0.35)", marginTop: 16, textAlign: "center" }}>
          Synced from PetClaw · refreshed {relTime(mc.generatedAt)} · every 7s
        </div>
      )}
    </div>
  );
}

function ClassicResultPanel({ run, cost }: {
  run: LiveRun;
  cost: number;
}) {
  const [copyResultReceipt, setCopyResultReceipt] = useState<{ runId: string; state: "copied" | "failed" } | null>(null);
  const [copyRunReceipt, setCopyRunReceipt] = useState<{ runId: string; state: "copied" | "failed" } | null>(null);
  const copyState = copyResultReceipt?.runId === run.runId ? copyResultReceipt.state : "idle";
  const copyRunState = copyRunReceipt?.runId === run.runId ? copyRunReceipt.state : "idle";

  const copyResult = async () => {
    if (!run.answer) return;
    try {
      await navigator.clipboard.writeText(run.answer);
      setCopyResultReceipt({ runId: run.runId, state: "copied" });
    } catch {
      setCopyResultReceipt({ runId: run.runId, state: "failed" });
    }
  };
  const copyRunId = async () => {
    try {
      await navigator.clipboard.writeText(run.runId);
      setCopyRunReceipt({ runId: run.runId, state: "copied" });
    } catch {
      setCopyRunReceipt({ runId: run.runId, state: "failed" });
    }
  };

  const billingText = run.billing
    ? run.billing.outcome === "charged"
      ? `${run.billing.creditsCharged} credits charged`
      : "Credits refunded"
    : run.state === "reserved"
      ? `${cost}-credit reservation recorded; charge waits for completion`
    : run.done
      ? "Charge/refund not confirmed"
      : `${cost}-credit charge reserved until completion`;
  const statusText = run.state === "reserved"
    ? "QUEUED"
    : !run.done
      ? "LIVE"
      : "DONE";
  const outcomeText = run.done && run.completed === false
    ? `Task did not complete${run.stoppedReason ? ` · ${run.stoppedReason.replaceAll("_", " ")}` : ""}${run.billing?.outcome === "refunded" ? " · credits refunded" : " · settlement not confirmed"}`
    : run.done && run.billing?.outcome === "refunded"
      ? "Task completed without a chargeable deliverable · credits refunded"
      : null;

  return (
    <section aria-label="Task result" style={{ ...card, marginTop: 12, padding: "16px 18px", borderLeft: `4px solid ${run.done ? (run.billing?.outcome === "refunded" ? TERRA : SAGE) : PURPLE}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: "0.12em", color: PURPLE, fontWeight: 800 }}>TASK RESULT</div>
        <span role="status" aria-live="polite" aria-atomic="true" style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: INK, border: `1px solid ${HAIR}`, background: FIELD, borderRadius: 999, padding: "4px 9px" }}>{statusText}</span>
      </div>
      <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 800, color: INK, lineHeight: 1.45, marginTop: 9, overflowWrap: "anywhere" }}>
        {agentOfficeTaskDisplayTitle(run.taskKind, run.title)}
      </div>
      <details style={{ marginTop: 7 }}>
        <summary style={{ fontFamily: SANS, fontSize: 13, color: PURPLE, fontWeight: 800, cursor: "pointer" }}>View original input</summary>
        <pre style={{ margin: "7px 0 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: SANS, fontSize: 13, color: MUTED, lineHeight: 1.5 }}>{run.title}</pre>
      </details>
      {outcomeText && (
        <div role="status" style={{ fontFamily: SANS, fontSize: 13, color: MUTED, lineHeight: 1.5, marginTop: 7 }}>
          {outcomeText}
        </div>
      )}
      <div style={{ marginTop: 11, padding: "12px 13px", borderRadius: 10, background: FIELD, border: `1px solid ${HAIR}` }}>
        <div style={{ fontFamily: MONO, fontSize: 13, color: MUTED, fontWeight: 700, marginBottom: 5 }}>ANSWER</div>
        <div style={{ fontFamily: SANS, fontSize: 14, color: INK, lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {run.done ? (run.answer || "No answer was returned.") : run.state === "reserved" ? "Waiting for the required tool to start…" : "The required read-only tool is running…"}
        </div>
      </div>
      <div style={{ marginTop: 11 }}>
        <div style={{ fontFamily: MONO, fontSize: 13, color: MUTED, fontWeight: 700, marginBottom: 6 }}>STEPS / TOOLS</div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {run.steps.length > 0 ? run.steps.map((step, index) => (
            <div key={`${step.skill}-${index}`} style={{ minWidth: 0 }}>
              <span style={{ display: "inline-flex", fontFamily: MONO, fontSize: 13, color: step.complete && !step.ok ? TERRA : INK, border: `1px solid ${HAIR}`, background: PAPER, borderRadius: 8, padding: "5px 8px" }}>
                {index + 1}. {step.skill.replaceAll("-", " ")} · {step.complete ? (step.ok ? "DONE" : "FAILED") : "WORKING"}
              </span>
              {step.evidence && (
                <details style={{ marginTop: 6, maxWidth: 620 }}>
                  <summary style={{ fontFamily: SANS, fontSize: 13, color: PURPLE, fontWeight: 800, cursor: "pointer" }}>
                    Recall evidence · {step.evidence.count} matched
                  </summary>
                  <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                    {step.evidence.matches.length > 0 ? step.evidence.matches.map((match, matchIndex) => (
                      <div key={`${match.key}-${matchIndex}`} style={{ border: `1px solid ${HAIR}`, borderRadius: 8, background: FIELD, padding: "8px 9px", fontFamily: SANS, fontSize: 13, color: MUTED, lineHeight: 1.45, overflowWrap: "anywhere" }}>
                        <b style={{ color: INK }}>{match.category}</b> · {match.source}{match.timestamp ? ` · ${relTime(match.timestamp)}` : ""}
                        <div style={{ marginTop: 2 }}><code style={{ fontFamily: MONO }}>Record: {match.key}</code></div>
                        {match.excerpt ? <div style={{ marginTop: 3, color: INK }}>{match.excerpt}</div> : <div style={{ marginTop: 3 }}>Sensitive excerpt hidden.</div>}
                      </div>
                    )) : <span style={{ fontFamily: SANS, fontSize: 13, color: MUTED }}>No retained rows were returned.</span>}
                  </div>
                </details>
              )}
            </div>
          )) : (
            <span style={{ fontFamily: SANS, fontSize: 13, color: MUTED }}>
              {run.done ? "No required tool receipt was recorded; this run is not chargeable." : "Waiting for the required tool receipt…"}
            </span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 12, paddingTop: 11, borderTop: `1px solid ${HAIR}` }}>
        <span style={{ fontFamily: MONO, fontSize: 13, color: INK, fontWeight: 700 }}>{billingText}</span>
        <span style={{ fontFamily: MONO, fontSize: 13, color: MUTED }}>
          Credits left: {typeof run.creditsRemaining === "number" ? run.creditsRemaining : "not reported"}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <code style={{ maxWidth: "100%", overflowWrap: "anywhere", fontFamily: MONO, fontSize: 13, color: MUTED }}>{run.runId}</code>
          <button type="button" onClick={copyRunId}
            style={{ border: `1px solid ${HAIR}`, borderRadius: 9, background: PAPER, color: INK, padding: "7px 11px", fontFamily: SANS, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
            {copyRunState === "copied" ? "Run ID copied" : copyRunState === "failed" ? "Copy failed" : "Copy run ID"}
          </button>
          <button type="button" onClick={copyResult} disabled={!run.answer}
            style={{ border: `1px solid ${HAIR}`, borderRadius: 9, background: PAPER, color: INK, padding: "7px 11px", fontFamily: SANS, fontSize: 13, fontWeight: 800, cursor: run.answer ? "pointer" : "not-allowed", opacity: run.answer ? 1 : 0.55 }}>
            {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy result"}
          </button>
        </div>
      </div>
    </section>
  );
}

// ── Header ──
function Header({
  petName,
  pets,
  petId,
  setPetId,
  isWorking,
  isQueued,
  petSwitchLocked,
  view,
  setView,
}: {
  petName: string;
  pets: any[];
  petId: number | null;
  setPetId: (n: number) => void;
  isWorking: boolean;
  isQueued: boolean;
  petSwitchLocked: boolean;
  view?: "hotel" | "classic";
  setView?: (v: "hotel" | "classic") => void;
}) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: "0.2em", color: PURPLE, fontWeight: 700, textTransform: "uppercase" }}>
          Agent Office · powered by PetClaw
        </div>
        {view && setView && (
          <div role="group" aria-label="Agent Office view" style={{ display: "inline-flex", background: FIELD, borderRadius: 99, padding: 3, border: `1px solid ${HAIR}` }}>
            {(["hotel", "classic"] as const).map((v) => (
              <button type="button" key={v} onClick={() => setView(v)} aria-pressed={view === v}
                style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", padding: "5px 13px", borderRadius: 99, border: "none", cursor: "pointer",
                  background: view === v ? PAPER : "transparent",
                  color: view === v ? PURPLE : MUTED,
                  boxShadow: view === v ? SHADOW_CARD : "none" }}>
                {v === "hotel" ? "🏨 Hotel" : "☰ Classic"}
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: DISP, fontSize: "clamp(26px,4vw,38px)", fontWeight: 800, color: INK, letterSpacing: "-0.025em", margin: 0, lineHeight: 1.1 }}>
          {petName}&rsquo;s Agent Office
        </h1>
        <span role="status" aria-live="polite" style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: MONO, fontSize: 13, fontWeight: 700, padding: "4px 11px", borderRadius: 99, color: isWorking ? PURPLE : isQueued ? TERRA : MUTED, background: isWorking ? "rgba(107,79,160,0.1)" : isQueued ? "rgba(190,79,40,0.08)" : "rgba(33,26,18,0.05)", border: `1px solid ${isWorking ? "rgba(107,79,160,0.28)" : isQueued ? "rgba(190,79,40,0.24)" : HAIR}` }}>
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 99, background: isWorking ? PURPLE : isQueued ? TERRA : "rgba(33,26,18,0.3)" }} />
          {isWorking ? "WORKING" : isQueued ? "QUEUED" : "IDLE"}
        </span>
      </div>
      <p style={{ fontFamily: SANS, fontSize: 15.5, color: "rgba(33,26,18,0.6)", maxWidth: 640, margin: "10px 0 0", lineHeight: 1.6 }}>
        A visual workspace around one real read-only task runner. The hotel scene shows status; work starts only from the task composer.
      </p>
      {pets.length > 1 && (
        <div role="group" aria-label="Choose a pet" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          {pets.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => setPetId(Number(p.id))}
              aria-pressed={petId === Number(p.id)}
              disabled={petSwitchLocked && petId !== Number(p.id)}
              style={{ fontFamily: SANS, fontSize: 13, fontWeight: petId === Number(p.id) ? 800 : 600, padding: "6px 12px", borderRadius: 9, cursor: petSwitchLocked && petId !== Number(p.id) ? "not-allowed" : "pointer",
                border: `1px solid ${petId === Number(p.id) ? "rgba(107,79,160,0.3)" : HAIR}`,
                background: petId === Number(p.id) ? "rgba(107,79,160,0.1)" : PAPER,
                color: petId === Number(p.id) ? PURPLE : MUTED,
                opacity: petSwitchLocked && petId !== Number(p.id) ? 0.5 : 1 }}>
              {p.name || `Pet #${p.id}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Pillar card ──
function Pillar({ label, mono, accent, value, sub, fill }: { label: string; mono: string; accent: string; value: string; sub: string; fill?: number }) {
  return (
    <div style={{ ...card, padding: "14px 15px" }}>
      <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: "0.12em", color: accent, fontWeight: 700 }}>{mono}</div>
      <div style={{ fontFamily: DISP, fontSize: 20, fontWeight: 800, color: INK, margin: "6px 0 3px", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
      <div style={{ fontFamily: SANS, fontSize: 13, color: MUTED, lineHeight: 1.4 }}>{sub}</div>
      {typeof fill === "number" && (
        <div role="progressbar" aria-label={`${label} capacity`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, Math.max(0, fill)) * 100)} style={{ marginTop: 9, height: 6, borderRadius: 99, background: "rgba(33,26,18,0.08)", overflow: "hidden" }}>
          <div style={{ width: `${Math.min(100, Math.max(0, fill * 100))}%`, height: "100%", borderRadius: 99, background: fill >= 0.8 ? "#BE4F28" : accent }} />
        </div>
      )}
    </div>
  );
}

// ── Kanban column ──
function Column({ mono, count, empty, children }: { mono: ClassicColumnStatus; count: number; empty: string; children: React.ReactNode }) {
  return (
    <section aria-label={mono} style={{ background: FIELD, borderRadius: 16, border: `1px solid ${HAIR}`, padding: 12, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, padding: "2px 4px" }}>
        <span style={{ fontFamily: MONO, fontSize: 13, letterSpacing: "0.08em", color: "rgba(33,26,18,0.6)", fontWeight: 700 }}>{mono}</span>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: INK, background: PAPER, borderRadius: 99, minWidth: 22, textAlign: "center", padding: "1px 7px", border: `1px solid ${HAIR}` }}>{count}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {count > 0 ? children : (
          <div style={{ fontFamily: SANS, fontSize: 13, color: MUTED, lineHeight: 1.5, padding: "14px 10px", textAlign: "center", border: `1px dashed ${HAIR}`, borderRadius: 12 }}>
            {empty}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Kanban card ──
function KanbanCard({ title, detail, sub, tag, accent, pulse, historyItem, historyPetId }: {
  title: string;
  detail?: string;
  sub?: string;
  tag: OfficeStatus;
  accent: string;
  pulse?: boolean;
  historyItem?: KItem;
  historyPetId?: number;
}) {
  return (
    <div className={pulse ? "office-live-pulse" : undefined} style={{ background: PAPER, borderRadius: 12, border: `1px solid ${HAIR}`, borderLeft: `3px solid ${accent}`, padding: "11px 12px", boxShadow: SHADOW_CARD, animation: pulse ? "officePulse 1.8s ease-in-out infinite" : undefined }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: INK, lineHeight: 1.35, minWidth: 0 }}>{title}</div>
        {tag && <span style={{ flexShrink: 0, fontFamily: MONO, fontSize: 13, fontWeight: 700, color: accent, background: "rgba(33,26,18,0.04)", borderRadius: 6, padding: "1px 7px" }}>{tag}</span>}
      </div>
      {detail && <div style={{ fontFamily: SANS, fontSize: 13, color: MUTED, marginTop: 5, lineHeight: 1.45, wordBreak: "break-word" }}>{detail}</div>}
      {sub && <div style={{ fontFamily: MONO, fontSize: 13, color: MUTED, marginTop: 5 }}>{sub}</div>}
      {historyItem?.runId && historyItem.state === "terminal" && historyPetId && (
        <RunHistoryDetails item={historyItem} petId={historyPetId} />
      )}
    </div>
  );
}

function RunHistoryDetails({ item, petId }: { item: KItem; petId: number }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [runIdCopyState, setRunIdCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [receipt, setReceipt] = useState<LiveRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const answer = receipt?.answer || "";

  const loadReceipt = async () => {
    if (receipt || loading || !item.runId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const result = await api.pets.agentRunStatus(petId, item.runId);
      if (!isTerminalPaidAgentRunReceipt(
        result,
        item.runId,
        { executionContract: item.executionContract },
      )) {
        throw new Error("The saved run has no matching typed-task terminal receipt.");
      }
      setReceipt({
        runId: result.runId,
        title: result.goal || item.title,
        taskKind: item.taskKind
          || agentOfficeTaskKindFromExecutionContract(result.executionContract || "")
          || undefined,
        steps: liveRunSteps(result.steps, true),
        done: true,
        state: "terminal",
        answer: result.answer || "",
        completed: result.completed === true,
        stoppedReason: result.stoppedReason,
        billing: result.billing as AgentBilling,
        creditsRemaining: result.creditsRemaining,
      });
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : "The saved receipt could not be loaded.");
    } finally {
      setLoading(false);
    }
  };
  const copy = async () => {
    if (!answer) return;
    try {
      await navigator.clipboard.writeText(answer);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };
  const copyRunId = async () => {
    if (!item.runId) return;
    try {
      await navigator.clipboard.writeText(item.runId);
      setRunIdCopyState("copied");
    } catch {
      setRunIdCopyState("failed");
    }
  };
  return (
    <details
      onToggle={(event) => { if (event.currentTarget.open) void loadReceipt(); }}
      style={{ marginTop: 9, borderTop: `1px solid ${HAIR}`, paddingTop: 8 }}
    >
      <summary style={{ fontFamily: SANS, fontSize: 13, fontWeight: 800, color: PURPLE, cursor: "pointer" }}>
        Open saved result
      </summary>
      <div role={loadError ? "alert" : "status"} aria-live={loadError ? "assertive" : "polite"} style={{ fontFamily: SANS, fontSize: 13, color: loadError ? "#991B1B" : MUTED, lineHeight: 1.55, marginTop: 8 }}>
        {loading
          ? "Loading the owner-scoped receipt…"
          : loadError
            ? loadError
            : receipt
              ? "Owner-scoped receipt loaded."
              : "Open this row to load its private receipt."}
      </div>
      {receipt && (
        <div style={{ fontFamily: SANS, fontSize: 13, color: INK, whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.55, marginTop: 7 }}>
          {answer || "No answer was returned for this terminal run."}
        </div>
      )}
      {receipt?.steps.some((step) => step.evidence) && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontFamily: SANS, fontSize: 13, color: PURPLE, fontWeight: 800, cursor: "pointer" }}>Recall evidence</summary>
          {receipt.steps.flatMap((step) => step.evidence?.matches || []).map((match, index) => (
            <div key={`${match.key}-${index}`} style={{ marginTop: 6, border: `1px solid ${HAIR}`, borderRadius: 8, background: FIELD, padding: "7px 8px", fontFamily: SANS, fontSize: 13, color: MUTED, overflowWrap: "anywhere" }}>
              <b style={{ color: INK }}>{match.category}</b> · {match.source}{match.timestamp ? ` · ${relTime(match.timestamp)}` : ""}
              <div><code style={{ fontFamily: MONO }}>Record: {match.key}</code></div>
              <div style={{ color: INK }}>{match.excerpt || "Sensitive excerpt hidden."}</div>
            </div>
          ))}
        </details>
      )}
      <code style={{ display: "block", marginTop: 8, fontFamily: MONO, fontSize: 13, color: MUTED, overflowWrap: "anywhere" }}>{item.runId}</code>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <button type="button" onClick={copy} disabled={!answer || loading}
          style={{ border: `1px solid ${HAIR}`, borderRadius: 8, background: PAPER, color: INK, padding: "6px 9px", fontFamily: SANS, fontSize: 13, fontWeight: 800, cursor: answer ? "pointer" : "not-allowed" }}>
          {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy result"}
        </button>
        <button type="button" onClick={copyRunId}
          style={{ border: `1px solid ${HAIR}`, borderRadius: 8, background: PAPER, color: INK, padding: "6px 9px", fontFamily: SANS, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
          {runIdCopyState === "copied" ? "Run ID copied" : runIdCopyState === "failed" ? "Copy failed" : "Copy run ID"}
        </button>
        <span style={{ fontFamily: MONO, fontSize: 13, color: MUTED }}>
          Saved receipt · reopening does not run or charge again
        </span>
      </div>
    </details>
  );
}

// ── Office roster ──
function currentLiveSkill(liveRun: LiveRun | null): string | null {
  if (!liveRun || liveRun.done) return null;
  return [...liveRun.steps].reverse().find((step) => !step.complete)?.skill || null;
}

function Roster({ roster, liveRun }: { roster: Staff[]; liveRun: LiveRun | null }) {
  const skills = roster.filter((r) => r.kind === "skill");
  const vigil = roster.filter((r) => r.kind === "vigil");
  const liveSkill = currentLiveSkill(liveRun);
  return (
    <div style={{ marginTop: 26 }}>
      <SectionTitle mono="EXACT TASK CAPABILITIES" title="What this Office can run" />
      <div style={{ fontFamily: SANS, fontSize: 13, color: MUTED, lineHeight: 1.5, margin: "-4px 0 10px" }}>
        Status-only inventory. These cards are not controls; start a supported read-only task from the composer above.
      </div>
      <div style={{ marginBottom: 8, fontFamily: MONO, fontSize: 13, letterSpacing: "0.1em", color: SAGE, fontWeight: 700 }}>TYPED TASK TOOLS</div>
      <div style={staffGrid}>
        {skills.map((s) => <StaffCard key={s.id} s={s} accent={SAGE} live={s.id === liveSkill} />)}
      </div>
      <div style={{ margin: "18px 0 8px", fontFamily: MONO, fontSize: 13, letterSpacing: "0.1em", color: PURPLE, fontWeight: 700 }}>VIGIL CREW · bounded memory capabilities</div>
      <div style={staffGrid}>
        {vigil.map((s) => <StaffCard key={s.id} s={s} accent={PURPLE} live={false} />)}
      </div>
    </div>
  );
}

function officeCapabilityState(skill: Staff, active: boolean): { label: string; note?: string; dim: boolean } {
  if (active) return { label: "RUNNING", dim: false };
  if (skill.mode === "endpoint-only") {
    const studio = (skill.endpoint || "").includes("generate");
    return {
      label: studio ? "USE IN STUDIO" : "NOT AVAILABLE",
      note: studio
        ? "Runs from Studio, not Agent Office."
        : `Runs only from ${skill.endpoint || "its dedicated surface"}.`,
      dim: true,
    };
  }
  if (skill.availableInOffice === false) {
    return { label: "NOT AVAILABLE", note: "Cannot run from Agent Office.", dim: true };
  }
  if (
    skill.availableInOffice === true
    || skill.mode === "core-in-process"
    || skill.mode === "installed-in-process"
    || (skill.mode == null && skill.installed)
  ) {
    return { label: "READY", dim: false };
  }
  return { label: "NOT AVAILABLE", note: "Cannot run from Agent Office.", dim: true };
}

function StaffCard({ s, accent, live }: { s: Staff; accent: string; live: boolean }) {
  const active = s.availableInOffice !== false && (live || s.status === "active");
  const state = officeCapabilityState(s, active);
  return (
    <div style={{ ...card, padding: "12px 13px", opacity: state.dim ? 0.7 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 99, background: active ? accent : "rgba(33,26,18,0.22)", flexShrink: 0 }} />
        <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 800, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
        <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 13, color: active ? accent : MUTED, fontWeight: 700 }}>{state.label}</span>
      </div>
      <div style={{ fontFamily: SANS, fontSize: 13, color: MUTED, lineHeight: 1.4, minHeight: 34 }}>{s.role}</div>
      {(s.blockedReason || state.note) && (
        <div style={{ fontFamily: SANS, fontSize: 13, color: MUTED, lineHeight: 1.4, marginTop: 5 }}>{s.blockedReason || state.note}</div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7, flexWrap: "wrap" }}>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: INK }}>
          {s.runs} {s.metricLabel || (s.kind === "skill" ? (s.runs === 1 ? "RUN" : "RUNS") : "RECORDS")}
        </span>
        {typeof s.successRate === "number" && <span style={{ fontFamily: MONO, fontSize: 13, color: SAGE, fontWeight: 700 }}>{s.successRate}%</span>}
        {s.lastAt && <span style={{ fontFamily: MONO, fontSize: 13, color: "rgba(33,26,18,0.4)" }}>{relTime(s.lastAt)}</span>}
      </div>
    </div>
  );
}

function SectionTitle({ mono, title }: { mono: string; title: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: "0.16em", color: PURPLE, fontWeight: 700 }}>{mono}</div>
      <h2 style={{ fontFamily: DISP, fontSize: 22, fontWeight: 800, color: INK, letterSpacing: "-0.02em", margin: "3px 0 0" }}>{title}</h2>
    </div>
  );
}

// ── shared styles ──
const wrap: React.CSSProperties = { maxWidth: 1180, margin: "0 auto", padding: "96px 20px 80px" };
const card: React.CSSProperties = { background: PAPER, borderRadius: 16, padding: 20, border: `1px solid ${HAIR}`, boxShadow: SHADOW_CARD };
const pillarGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 22 };
const kanbanGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 };
const staffGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 12 };
