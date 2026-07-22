#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  AgentDeadlineError,
  awaitAgentWork,
  createAgentDeadlineScope,
} from "../src/lib/petclaw/agent/deadline.ts";
import {
  LLMUpstreamError,
  runWithProviderFallback,
} from "../src/lib/llm/platform-resilience.ts";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function abortableDelay(ms, signal, counters) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    counters.pending += 1;
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      counters.pending -= 1;
      fn(value);
    };
    const onAbort = () => finish(reject, signal.reason);
    const timer = setTimeout(() => finish(resolve), ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

// A retryable primary failure may start exactly one fallback. If the shared
// deadline expires while that fallback is in flight, it is cancelled and no
// callback/counter can mutate after the awaited run rejects.
{
  const scope = createAgentDeadlineScope(25);
  const counters = { pending: 0, vendorAttempts: 0, lateEffects: 0 };
  const calls = [];
  const budgets = [];
  const fallbacks = [];
  try {
    await assert.rejects(
      runWithProviderFallback(
        ["primary", "fallback"],
        async (provider) => {
          calls.push(provider);
          counters.vendorAttempts += 1;
          if (provider === "primary") {
            throw new LLMUpstreamError("xai", "synthetic transient", true, 503, "server");
          }
          await abortableDelay(100, scope.signal, counters);
          counters.lateEffects += 1;
          return "late";
        },
        (from, to) => fallbacks.push(`${from}->${to}`),
        async (provider) => { budgets.push(provider); },
        scope.signal,
      ),
      (error) => error instanceof AgentDeadlineError,
    );
    const terminal = { ...counters, calls: [...calls], budgets: [...budgets], fallbacks: [...fallbacks] };
    await wait(120);
    assert.deepEqual(
      { ...counters, calls, budgets, fallbacks },
      terminal,
      "fallback work/counters must be terminal before settlement can begin",
    );
    assert.deepEqual(calls, ["primary", "fallback"]);
    assert.deepEqual(budgets, ["primary", "fallback"]);
    assert.deepEqual(fallbacks, ["primary->fallback"]);
    assert.equal(counters.pending, 0);
    assert.equal(counters.lateEffects, 0);
  } finally {
    scope.close();
  }
}

// Persistent budget reservation is local DB work and cannot be abandoned. The
// fallback helper awaits it, then notices cancellation before invoking a vendor.
// Thus any DB mutation is complete before the caller receives the rejection.
{
  const scope = createAgentDeadlineScope(10);
  let budgetWrites = 0;
  let vendorAttempts = 0;
  const startedAt = Date.now();
  try {
    await assert.rejects(
      runWithProviderFallback(
        ["primary", "fallback"],
        async () => {
          vendorAttempts += 1;
          return "unexpected";
        },
        undefined,
        async () => {
          await wait(35); // represents a non-abortable transaction already begun
          budgetWrites += 1;
        },
        scope.signal,
      ),
      (error) => error instanceof AgentDeadlineError,
    );
    assert.ok(Date.now() - startedAt >= 30, "the local transaction must be awaited, not raced");
    assert.equal(budgetWrites, 1);
    assert.equal(vendorAttempts, 0);
    await wait(50);
    assert.equal(budgetWrites, 1, "no budget mutation may occur after rejection/settlement");
  } finally {
    scope.close();
  }
}

// A cooperative slow skill is awaited to an aborted terminal state. Its timer
// is removed, the promise is not left dangling, and its delayed side effect can
// never run after the caller starts billing settlement.
{
  const scope = createAgentDeadlineScope(15);
  const counters = { pending: 0, sideEffects: 0 };
  try {
    await assert.rejects(
      awaitAgentWork(scope.signal, async (signal) => {
        await abortableDelay(90, signal, counters);
        counters.sideEffects += 1;
        return "late skill result";
      }),
      (error) => error instanceof AgentDeadlineError,
    );
    assert.equal(counters.pending, 0);
    const terminal = { ...counters };
    await wait(110);
    assert.deepEqual(counters, terminal);
    assert.equal(counters.sideEffects, 0);
  } finally {
    scope.close();
  }
}

console.log("agent_deadline_cancellation=PASS");
