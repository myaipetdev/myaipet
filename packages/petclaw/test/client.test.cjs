const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DEFAULT_PETCLAW_TIMEOUT_MS,
  PETCLAW_AGENT_GOAL_MAX_LENGTH,
  PETCLAW_AGENT_TASK_KINDS,
  PETCLAW_AGENT_TASK_MIN_LENGTHS,
  PetClawClient,
  PetClawError,
  buildManifest,
  containsStrongPetClawAgentSecret,
  createPetClawAgentRunId,
} = require("../dist");

function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
}

test("health uses the configured transport, auth, and merged headers", async () => {
  let captured;
  const client = new PetClawClient({
    baseUrl: "https://petclaw.example///",
    authToken: "owner-token",
    headers: { "X-SDK-Client": "test-suite", Authorization: "wrong-token" },
    fetch: async (url, init) => {
      captured = { url, init };
      return json({ status: "ok" });
    },
  });

  assert.equal(DEFAULT_PETCLAW_TIMEOUT_MS, 75_000);
  assert.equal(PETCLAW_AGENT_GOAL_MAX_LENGTH, 2_000);
  assert.deepEqual(PETCLAW_AGENT_TASK_KINDS, ["recall", "summarize", "review", "draft"]);
  assert.deepEqual(PETCLAW_AGENT_TASK_MIN_LENGTHS, {
    recall: 8,
    summarize: 40,
    review: 12,
    draft: 20,
  });
  assert.equal(Object.isFrozen(PETCLAW_AGENT_TASK_KINDS), true);
  assert.equal(buildManifest().capabilities.soulNFT, false);
  assert.deepEqual(buildManifest().skills, []);
  assert.equal(buildManifest("https://petclaw.example").endpoints.skills, "https://petclaw.example/api/petclaw/skills");
  assert.deepEqual(await client.health({ headers: { "X-Request-ID": "req-1" } }), { status: "ok" });
  assert.equal(captured.url, "https://petclaw.example/api/health");
  assert.equal(captured.init.headers.get("authorization"), "Bearer owner-token");
  assert.equal(captured.init.headers.get("x-sdk-client"), "test-suite");
  assert.equal(captured.init.headers.get("x-request-id"), "req-1");
  assert.equal(captured.init.headers.get("accept"), "application/json");
  assert.equal(captured.init.headers.has("content-type"), false);
});

test("authenticated clients require an HTTPS origin except loopback development", async () => {
  for (const baseUrl of [
    "http://petclaw.example",
    "https://owner:secret@petclaw.example",
    "https://petclaw.example/proxy",
    "https://petclaw.example?redirect=evil",
  ]) {
    assert.throws(() => new PetClawClient({ baseUrl }), TypeError);
  }
  const local = new PetClawClient({
    baseUrl: "http://127.0.0.1:3000",
    fetch: async () => json({ status: "ok" }),
  });
  assert.deepEqual(await local.health(), { status: "ok" });
});

test("deadline does not depend on an injected fetch honoring AbortSignal", async () => {
  const client = new PetClawClient({
    baseUrl: "https://petclaw.example",
    timeoutMs: 15,
    fetch: async () => new Promise(() => {}),
  });
  await assert.rejects(client.health(), (error) => {
    assert.ok(error instanceof PetClawError);
    assert.equal(error.code, "request_timeout");
    return true;
  });
});

test("ordinary SDK responses are bounded before parsing", async () => {
  const client = new PetClawClient({
    baseUrl: "https://petclaw.example",
    fetch: async () => new Response("small", {
      headers: { "content-length": String(3 * 1024 * 1024) },
    }),
  });
  await assert.rejects(client.health(), (error) => {
    assert.ok(error instanceof PetClawError);
    assert.equal(error.code, "response_too_large");
    return true;
  });
});

test("developer surfaces use their documented paths and JSON bodies", async () => {
  const calls = [];
  const client = new PetClawClient({
    baseUrl: "https://petclaw.example",
    fetch: async (url, init = {}) => {
      calls.push({
        url: String(url),
        method: init.method || "GET",
        body: init.body ? JSON.parse(init.body) : undefined,
      });
      return json({ ok: true, messages: [], steps: [], memories: [] });
    },
  });

  await client.chat.history(7);
  await client.chat.send(7, "Remember my launch date");
  await client.agent.run(7, {
    runId: "11111111-1111-4111-8111-111111111111",
    goal: "Research the launch plan",
    taskKind: "review",
    maxSteps: 3,
    confirmCostCredits: 5,
  });
  await client.skills.execute(7, "companion-chat", { message: "hello" });
  await client.memory.inspect(7);
  await client.memory.edit(7, "memory", { key: "launch", content: "Friday", importance: 5 });
  await client.memory.delete(7, { entryType: "session", id: 42 });
  await client.memory.delete(7, { entryType: "learned", all: true });
  await client.memory.delete(7, { entryType: "all", all: true });
  await client.consent.get(7);
  await client.consent.update(7, {
    allowPublicProfile: false,
    allowDataSharing: false,
    allowAITraining: false,
    allowInteraction: true,
  });
  await client.models.list();
  await client.models.connect({
    provider: "openai",
    apiKey: "sk-test-key",
    model: "gpt-4o-mini",
    taskScopes: ["chat"],
  });
  await client.models.disconnect(9);

  const sdkSessionId = calls[1].body.sessionId;
  assert.match(sdkSessionId, /^sdk-7-[A-Za-z0-9-]+$/);

  assert.deepEqual(calls, [
    {
      url: `https://petclaw.example/api/pets/7/chat?surface=sdk&sessionId=${sdkSessionId}`,
      method: "GET",
      body: undefined,
    },
    {
      url: "https://petclaw.example/api/pets/7/chat",
      method: "POST",
      body: { message: "Remember my launch date", surface: "sdk", sessionId: sdkSessionId },
    },
    {
      url: "https://petclaw.example/api/pets/7/agent",
      method: "POST",
      body: {
        runId: "11111111-1111-4111-8111-111111111111",
        goal: "Research the launch plan",
        taskKind: "review",
        maxSteps: 1,
        confirmCostCredits: 5,
      },
    },
    {
      url: "https://petclaw.example/api/petclaw/skills",
      method: "POST",
      body: {
        action: "execute",
        petId: 7,
        skillId: "companion-chat",
        input: { message: "hello" },
      },
    },
    { url: "https://petclaw.example/api/petclaw/memory?petId=7", method: "GET", body: undefined },
    {
      url: "https://petclaw.example/api/petclaw/memory?petId=7&entryType=memory",
      method: "PATCH",
      body: { key: "launch", content: "Friday", importance: 5 },
    },
    {
      url: "https://petclaw.example/api/petclaw/memory?petId=7&entryType=session&id=42",
      method: "DELETE",
      body: undefined,
    },
    {
      url: "https://petclaw.example/api/petclaw/memory?petId=7&entryType=learned&all=1",
      method: "DELETE",
      body: undefined,
    },
    {
      url: "https://petclaw.example/api/petclaw/memory?petId=7&entryType=all&all=1",
      method: "DELETE",
      body: undefined,
    },
    { url: "https://petclaw.example/api/petclaw/consent?petId=7", method: "GET", body: undefined },
    {
      url: "https://petclaw.example/api/petclaw/consent",
      method: "POST",
      body: {
        petId: 7,
        consent: {
          allowPublicProfile: false,
          allowDataSharing: false,
          allowAITraining: false,
          allowInteraction: true,
        },
      },
    },
    { url: "https://petclaw.example/api/petclaw/models", method: "GET", body: undefined },
    {
      url: "https://petclaw.example/api/petclaw/models",
      method: "POST",
      body: {
        provider: "openai",
        apiKey: "sk-test-key",
        model: "gpt-4o-mini",
        taskScopes: ["chat"],
      },
    },
    { url: "https://petclaw.example/api/petclaw/models?id=9", method: "DELETE", body: undefined },
  ]);
});

test("SDK rejects a missing or wrong paid-agent acknowledgement before fetch", async () => {
  let requestCount = 0;
  const client = new PetClawClient({
    baseUrl: "https://petclaw.example",
    fetch: async () => {
      requestCount += 1;
      return json({ ok: true });
    },
  });

  for (const input of [
    { goal: "Suggest one next step", taskKind: "draft" },
    { goal: "Suggest one next step", taskKind: "draft", confirmCostCredits: 4 },
  ]) {
    await assert.rejects(client.agent.run(7, input), (error) => {
      assert.ok(error instanceof PetClawError);
      assert.equal(error.code, "agent_cost_confirmation_required");
      return true;
    });
  }
  assert.equal(requestCount, 0);
});

test("SDK requires one supported paid-agent task kind before fetch", async () => {
  let requestCount = 0;
  const client = new PetClawClient({
    baseUrl: "https://petclaw.example",
    fetch: async () => {
      requestCount += 1;
      return json({ ok: true });
    },
  });

  for (const taskKind of [undefined, "browse", "", "RECALL"]) {
    await assert.rejects(client.agent.run(7, {
      runId: "11111111-1111-4111-8111-111111111111",
      goal: "Review this text",
      taskKind,
      confirmCostCredits: 5,
    }), (error) => {
      assert.ok(error instanceof PetClawError);
      assert.equal(error.code, "agent_task_kind_required");
      assert.deepEqual(error.details, {
        supportedTaskKinds: ["recall", "summarize", "review", "draft"],
      });
      return true;
    });
  }
  assert.equal(requestCount, 0);
});

test("SDK accepts 2,000-character task input, rejects larger input, and normalizes maxSteps", async () => {
  const requestBodies = [];
  const client = new PetClawClient({
    baseUrl: "https://petclaw.example",
    fetch: async (_url, init) => {
      requestBodies.push(JSON.parse(init.body));
      return json({ ok: true });
    },
  });
  const base = {
    runId: "11111111-1111-4111-8111-111111111111",
    taskKind: "review",
    confirmCostCredits: 5,
  };

  for (const goal of ["  ", "x".repeat(2_001)]) {
    await assert.rejects(client.agent.run(7, { ...base, goal }), (error) => {
      assert.ok(error instanceof PetClawError);
      assert.equal(error.code, "agent_task_input_invalid");
      assert.equal(error.details.taskKind, "review");
      assert.equal(error.details.minLength, 12);
      assert.equal(error.details.maxLength, 2_000);
      return true;
    });
  }
  await client.agent.run(7, {
    ...base,
    goal: "x".repeat(2_000),
    maxSteps: 6,
  });
  assert.equal(requestBodies.length, 1);
  assert.equal(requestBodies[0].goal.length, 2_000);
  assert.equal(requestBodies[0].maxSteps, 1);
});

test("SDK rejects concrete secrets before fetch without blocking ordinary safety discussion", async () => {
  let requestCount = 0;
  const client = new PetClawClient({
    baseUrl: "https://petclaw.example",
    fetch: async () => {
      requestCount += 1;
      return json({ ok: true });
    },
  });
  const secretInputs = [
    ["Review this key: sk", "abcdefghijklmnopqrstuvwxyz123456"].join("-"),
    ["Review extension token: pex", "abcdefghijklmnopqrstuvwxyz123456"].join("_"),
    ...["ghp", "gho", "ghu", "ghs", "ghr"].map(
      (prefix) => ["Review GitHub token: " + prefix, "abcdefghijklmnopqrstuvwxyz123456"].join("_"),
    ),
    "Review Bearer abcdefghijklmnopqrstuvwxyz123456",
    `Review ${[
      "eyJhbGciOiJIUzI1NiJ9",
      "eyJzdWIiOiIxMjM0NTY3ODkwIn0",
      "signature123456",
    ].join(".")}`,
    ["Review -----BEGIN", "PRIVATE KEY----- abcdefghijklmnopqrstuvwxyz"].join(" "),
    ["Review -----BEGIN", "ENCRYPTED PRIVATE KEY----- abcdefghijklmnopqrstuvwxyz"].join(" "),
    ["Review -----BEGIN", "DSA PRIVATE KEY----- abcdefghijklmnopqrstuvwxyz"].join(" "),
    ["Review -----BEGIN", "PGP PRIVATE KEY BLOCK----- abcdefghijklmnopqrstuvwxyz"].join(" "),
    "Review password = huntertwoprivatevalue123",
    ["Review database_url = postgres", "://owner:secret", "@database"].join(""),
    ["Review postgresql", "://owner:credential-pass", "@database/private"].join(""),
    [
      "Review https://objects.example/file?X-Amz-Signature=",
      "a".repeat(32),
    ].join(""),
    [
      "Review https://objects.example/file?download=1&sig=",
      "b".repeat(32),
    ].join(""),
    "Review Authorization: Bearer shorttok",
    "Review Authorization: Basic dTpw",
    "Review Cookie: session=private; csrf=private-too",
    "Review mnemonic: zephyr amber cobalt delta ember fjord galaxy harbor ivory juniper kestrel lantern",
    ["Review AWS_SESSION_TOKEN", "=", "N".repeat(40)].join(""),
    ["Review STRIPE_SECRET_KEY", "=", "sk_live_", "O".repeat(32)].join(""),
    "Review password=P@ssw0rd!still-secret$tail",
    "Review OTP 12345678",
    "Review \uC778\uC99D\uCF54\uB4DC 87654321",
    "Review recovery code 76543210",
    "Review backup code 65432109",
    "Review security code 54321098",
    "Review passcode 43210987",
    "Review 2FA code 32109876",
    "Review \uBCF5\uAD6C\uCF54\uB4DC 21098765",
    "Review \uBC31\uC5C5 \uCF54\uB4DC 10987654",
    "Review \uBCF4\uC548 \uCF54\uB4DC 90876543",
    "Review recovery code: ABCD-EFGH-IJKL",
    "Review OTP: 123456",
  ];

  for (const goal of secretInputs) {
    assert.equal(containsStrongPetClawAgentSecret(goal), true);
    await assert.rejects(client.agent.run(7, {
      runId: "11111111-1111-4111-8111-111111111111",
      goal,
      taskKind: "review",
      confirmCostCredits: 5,
    }), (error) => {
      assert.ok(error instanceof PetClawError);
      assert.equal(error.code, "agent_task_secret_rejected");
      assert.match(error.message, /Remove API keys, tokens, passwords/);
      assert.equal(JSON.stringify(error.details).includes(goal), false);
      assert.doesNotMatch(JSON.stringify(error.details), /sk-|huntertwo|eyJ/);
      return true;
    });
  }
  assert.equal(requestCount, 0);

  const discussion = "Review this guidance about storing API keys and tokens safely.";
  assert.equal(containsStrongPetClawAgentSecret(discussion), false);
  await client.agent.run(7, {
    runId: "11111111-1111-4111-8111-111111111111",
    goal: discussion,
    taskKind: "review",
    confirmCostCredits: 5,
  });
  const dottedIdentifier = "Review Microsoft.Extensions.Configuration naming.";
  assert.equal(containsStrongPetClawAgentSecret(dottedIdentifier), false);
  await client.agent.run(7, {
    runId: "22222222-2222-4222-8222-222222222222",
    goal: dottedIdentifier,
    taskKind: "review",
    confirmCostCredits: 5,
  });
  assert.equal(requestCount, 2);
});

test("SDK enforces task-specific minimums and rejects bracket placeholders before fetch", async () => {
  let requestCount = 0;
  const client = new PetClawClient({
    baseUrl: "https://petclaw.example",
    fetch: async () => {
      requestCount += 1;
      return json({ ok: true });
    },
  });
  const invalid = [
    { taskKind: "recall", goal: "1234567", message: /recall needs at least 8/ },
    { taskKind: "summarize", goal: "s".repeat(39), message: /summarize needs at least 40/ },
    { taskKind: "review", goal: "r".repeat(11), message: /review needs at least 12/ },
    { taskKind: "draft", goal: "d".repeat(19), message: /draft needs at least 20/ },
    { taskKind: "review", goal: "[paste source text here]", message: /Replace the example placeholder/ },
  ];
  for (const item of invalid) {
    await assert.rejects(client.agent.run(7, {
      runId: "11111111-1111-4111-8111-111111111111",
      goal: item.goal,
      taskKind: item.taskKind,
      confirmCostCredits: 5,
    }), (error) => {
      assert.ok(error instanceof PetClawError);
      assert.equal(error.code, "agent_task_input_invalid");
      assert.match(error.message, item.message);
      return true;
    });
  }
  assert.equal(requestCount, 0);
});

test("paid SDK runs require a caller-owned runId and never generate one implicitly", async () => {
  let requestCount = 0;
  const client = new PetClawClient({
    baseUrl: "https://petclaw.example",
    fetch: async () => {
      requestCount += 1;
      return json({ ok: true });
    },
  });

  await assert.rejects(client.agent.run(7, {
    goal: "Suggest one next step",
    taskKind: "draft",
    confirmCostCredits: 5,
  }), (error) => {
    assert.ok(error instanceof PetClawError);
    assert.equal(error.code, "invalid_agent_run_id");
    assert.deepEqual(error.details, { runId: undefined });
    return true;
  });

  const first = createPetClawAgentRunId();
  const second = createPetClawAgentRunId();
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.match(second, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.notEqual(first, second);
  assert.equal(requestCount, 0);
});

test("a paid SDK transport retry reuses only the caller's persisted runId", async () => {
  const requestBodies = [];
  const client = new PetClawClient({
    baseUrl: "https://petclaw.example",
    fetch: async (_url, init) => {
      requestBodies.push(JSON.parse(init.body));
      if (requestBodies.length === 1) throw new Error("connection reset");
      return json({ runId: requestBodies[1].runId, state: "terminal", billing: {} });
    },
  });
  const input = {
    runId: "22222222-2222-4222-8222-222222222222",
    goal: "Suggest one next step",
    taskKind: "draft",
    confirmCostCredits: 5,
  };

  await assert.rejects(client.agent.run(7, input), (error) => {
    assert.ok(error instanceof PetClawError);
    assert.equal(error.code, "agent_run_pending_reconciliation");
    assert.equal(error.retryable, false);
    assert.deepEqual(error.details, {
      runId: input.runId,
      petId: 7,
      statusUrl: `/api/pets/7/agent/runs/${input.runId}`,
      original: undefined,
    });
    return true;
  });
  await client.agent.run(7, input);

  assert.equal(requestBodies.length, 2);
  assert.equal(requestBodies[0].runId, input.runId);
  assert.equal(requestBodies[1].runId, input.runId);
  assert.equal(requestBodies[0].taskKind, "draft");
  assert.equal(requestBodies[1].taskKind, "draft");
  assert.equal(requestBodies[0].maxSteps, 1);
  assert.equal(requestBodies[1].maxSteps, 1);
});

test("SDK treats HTTP 409 as a definitive paid-run rejection", async () => {
  const client = new PetClawClient({
    baseUrl: "https://petclaw.example",
    fetch: async () => json(
      { error: "Another run is active", code: "agent_run_in_progress" },
      { status: 409 },
    ),
  });

  await assert.rejects(client.agent.run(7, {
    runId: "11111111-1111-4111-8111-111111111111",
    goal: "Review this note",
    taskKind: "review",
    confirmCostCredits: 5,
  }), (error) => {
    assert.ok(error instanceof PetClawError);
    assert.equal(error.status, 409);
    assert.equal(error.code, "agent_run_in_progress");
    assert.notEqual(error.code, "agent_run_pending_reconciliation");
    return true;
  });
});

test("SDK chat sessions are stable within one client and isolated across clients", async () => {
  const seen = [];
  const transport = async (_url, init = {}) => {
    if (init.body) seen.push(JSON.parse(init.body));
    return json({ reply: "ok", mood: "neutral", effects: {} });
  };
  const left = new PetClawClient({ baseUrl: "https://petclaw.example", fetch: transport });
  const right = new PetClawClient({ baseUrl: "https://petclaw.example", fetch: transport });

  await left.chat.send(7, "one");
  await left.chat.send(7, "two");
  await right.chat.send(7, "three");

  assert.equal(seen[0].sessionId, seen[1].sessionId);
  assert.notEqual(seen[0].sessionId, seen[2].sessionId);
  assert.ok(seen.every((body) => body.surface === "sdk"));
});

test("plain-text skill manifests remain supported through the injected transport", async () => {
  let captured;
  const client = new PetClawClient({
    baseUrl: "https://petclaw.example",
    fetch: async (url, init) => {
      captured = { url, init };
      return new Response("# Companion Chat\n", {
        headers: { "content-type": "text/markdown" },
      });
    },
  });

  assert.equal(await client.skills.getSkillMd("companion-chat"), "# Companion Chat\n");
  assert.equal(
    captured.url,
    "https://petclaw.example/api/petclaw/skills?id=companion-chat&format=md",
  );
  assert.match(captured.init.headers.get("accept"), /text\/plain/);
});

test("JSON HTTP errors expose status, server code, details, and retryability", async () => {
  const client = new PetClawClient({
    baseUrl: "https://petclaw.example",
    fetch: async () => json(
      { error: "Slow down", code: "rate_limited", retryAfter: 12 },
      { status: 429 },
    ),
  });

  await assert.rejects(client.health(), (error) => {
    assert.ok(error instanceof PetClawError);
    assert.equal(error.message, "Slow down");
    assert.equal(error.status, 429);
    assert.equal(error.code, "rate_limited");
    assert.equal(error.retryable, true);
    assert.deepEqual(error.details, { error: "Slow down", code: "rate_limited", retryAfter: 12 });
    return true;
  });
});

test("non-JSON HTTP errors preserve a useful bounded body", async () => {
  const client = new PetClawClient({
    baseUrl: "https://petclaw.example",
    fetch: async () => new Response("upstream unavailable", {
      status: 502,
      headers: { "content-type": "text/plain" },
    }),
  });

  await assert.rejects(client.health(), (error) => {
    assert.ok(error instanceof PetClawError);
    assert.equal(error.message, "upstream unavailable");
    assert.equal(error.status, 502);
    assert.equal(error.code, "http_502");
    assert.equal(error.retryable, true);
    assert.deepEqual(error.details, { body: "upstream unavailable" });
    return true;
  });
});

test("successful non-JSON API responses fail with invalid_response", async () => {
  const client = new PetClawClient({
    baseUrl: "https://petclaw.example",
    fetch: async () => new Response("<html>proxy page</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    }),
  });

  await assert.rejects(client.health(), (error) => {
    assert.ok(error instanceof PetClawError);
    assert.equal(error.status, 200);
    assert.equal(error.code, "invalid_response");
    assert.equal(error.retryable, false);
    assert.deepEqual(error.details, {
      contentType: "text/html",
      body: "<html>proxy page</html>",
    });
    return true;
  });
});

test("timeouts produce a retryable PetClawError", async () => {
  const client = new PetClawClient({
    baseUrl: "https://petclaw.example",
    timeoutMs: 5,
    fetch: (_url, init) => new Promise((_resolve, reject) => {
      const abort = () => reject(new Error("transport aborted"));
      if (init.signal.aborted) abort();
      else init.signal.addEventListener("abort", abort, { once: true });
    }),
  });

  await assert.rejects(client.health(), (error) => {
    assert.ok(error instanceof PetClawError);
    assert.equal(error.code, "request_timeout");
    assert.equal(error.retryable, true);
    assert.deepEqual(error.details, { timeoutMs: 5 });
    return true;
  });
});

test("caller cancellation is distinct from a timeout and is not retryable", async () => {
  const abortController = new AbortController();
  abortController.abort("test-cancel");
  const client = new PetClawClient({
    baseUrl: "https://petclaw.example",
    timeoutMs: 0,
    fetch: (_url, init) => new Promise((_resolve, reject) => {
      const abort = () => reject(new Error("transport aborted"));
      if (init.signal.aborted) abort();
      else init.signal.addEventListener("abort", abort, { once: true });
    }),
  });

  await assert.rejects(client.health({ signal: abortController.signal }), (error) => {
    assert.ok(error instanceof PetClawError);
    assert.equal(error.code, "request_aborted");
    assert.equal(error.retryable, false);
    assert.deepEqual(error.details, { reason: "test-cancel" });
    return true;
  });
});

test("transport failures and invalid timeout configuration use stable errors", async () => {
  assert.throws(
    () => new PetClawClient({ baseUrl: "https://petclaw.example", timeoutMs: -1 }),
    /timeoutMs/,
  );

  const client = new PetClawClient({
    baseUrl: "https://petclaw.example",
    fetch: async () => { throw new Error("DNS failure"); },
  });
  await assert.rejects(client.health(), (error) => {
    assert.ok(error instanceof PetClawError);
    assert.equal(error.code, "network_error");
    assert.equal(error.retryable, true);
    assert.match(String(error.cause), /DNS failure/);
    return true;
  });
});
