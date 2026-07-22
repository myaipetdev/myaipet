const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.join(__dirname, "..");
const { computeIntegrityHash } = require(path.join(ROOT, "dist", "protocol.js"));

function jsonFenceAfter(file, heading) {
  const markdown = fs.readFileSync(path.join(ROOT, file), "utf8");
  const start = markdown.indexOf(heading);
  assert.notEqual(start, -1, `${file} must contain ${heading}`);
  const match = markdown.slice(start + heading.length).match(/```json\s*\n([\s\S]*?)\n```/);
  assert.ok(match, `${file} must contain a JSON fence after ${heading}`);
  return JSON.parse(match[1]);
}

function runNode(file, args = [], env = {}, cwd = ROOT, stdin = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file, ...args], {
      cwd,
      env: { ...process.env, NO_COLOR: "1", ...env },
      stdio: [stdin === null ? "ignore" : "pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    if (stdin !== null) child.stdin.end(stdin);
  });
}

test("CLI exposes the real agent/demo flow and no longer advertises live PACK", async () => {
  const result = await runNode("bin/petclaw.js", ["help"]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /agent "goal" --confirm-cost 5/);
  assert.match(result.stdout, /demo "message"/);
  assert.match(result.stdout, /Cross-pet invocation is disabled|Unavailable in this launch/);
  assert.doesNotMatch(result.stdout, /Soul NFTs:/);
});

test("developer docs select an owned pet, require caller run IDs, and disclose paid read-only runs", () => {
  const repoRoot = path.join(ROOT, "..", "..");
  const files = [
    path.join(repoRoot, "README.md"),
    path.join(ROOT, "README.md"),
    path.join(ROOT, "docs", "QUICKSTART.md"),
    path.join(repoRoot, "web", "public", "api-docs", "QUICKSTART.md"),
  ];
  for (const file of files) {
    const markdown = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(markdown, /petId\s*[=:]\s*1\b|\/pets\/1\b/, file);
    for (const line of markdown.split("\n").filter((value) => /^petclaw-sdk agent /.test(value))) {
      assert.match(line, /--confirm-cost 5/, `${file}: ${line}`);
    }
    assert.match(markdown, /server-side Node\.js|Server-side Node\.js/, file);
  }

  for (const file of [
    path.join(ROOT, "docs", "QUICKSTART.md"),
    path.join(repoRoot, "web", "public", "api-docs", "QUICKSTART.md"),
  ]) {
    const markdown = fs.readFileSync(file, "utf8");
    const commands = ["petclaw-sdk auth", "petclaw-sdk pets", "petclaw-sdk use <petId>", "petclaw-sdk doctor"];
    const indexes = commands.map((command) => markdown.indexOf(command));
    assert.ok(indexes.every((index) => index >= 0), `${file} is missing the owner setup flow`);
    assert.deepEqual([...indexes].sort((a, b) => a - b), indexes, `${file} setup flow is out of order`);
  }

  for (const file of [
    path.join(repoRoot, "README.md"),
    path.join(ROOT, "README.md"),
    path.join(ROOT, "docs", "API.md"),
    path.join(ROOT, "docs", "QUICKSTART.md"),
    path.join(repoRoot, "web", "public", "api-docs", "API.md"),
    path.join(repoRoot, "web", "public", "api-docs", "QUICKSTART.md"),
  ]) {
    const markdown = fs.readFileSync(file, "utf8");
    assert.match(markdown, /createPetClawAgentRunId\(\)/, `${file} must show caller-owned runId generation`);
    assert.match(markdown, /read-only (?:skills? and connectors|skill or connector|result)/i, `${file} must disclose the paid loop's read-only boundary`);
    assert.match(markdown, /no\s+retention|retention\s+and self-learning (?:are )?disabled/i, `${file} must disclose no retention`);
    assert.doesNotMatch(markdown, /completed run with a successful tool result|explicitly confirmed durable side effect/, `${file} contains a stale charge path`);
  }

  const hostedApi = fs.readFileSync(
    path.join(repoRoot, "web", "public", "api-docs", "API.md"),
    "utf8",
  );
  assert.match(hostedApi, /Authorization: Bearer pck_/);
  assert.match(hostedApi, /Never expose a `pck_` token in browser JavaScript/);
  assert.doesNotMatch(hostedApi, /"action"\s*:\s*"install"\s*\|/);
  for (const match of hostedApi.matchAll(/```json\s*\n([\s\S]*?)\n```/g)) {
    assert.doesNotThrow(() => JSON.parse(match[1]), "hosted API docs must contain valid JSON fences");
  }
});

test("bundled SKILL.md input and output examples match the server manifest contracts", () => {
  const companionInput = jsonFenceAfter("skills/companion-chat/SKILL.md", "## Input");
  assert.equal(companionInput.additionalProperties, false);
  assert.deepEqual(companionInput.required, ["message"]);
  assert.equal(companionInput.properties.message.maxLength, 2000);
  assert.equal(companionInput.properties.sessionId.maxLength, 120);
  assert.deepEqual(companionInput.properties.surface.enum, [
    "web", "cli", "sdk", "mcp", "chrome-ext", "telegram", "discord",
  ]);

  const companionOutput = jsonFenceAfter("skills/companion-chat/SKILL.md", "## Output");
  assert.equal(companionOutput.additionalProperties, false);
  assert.deepEqual(companionOutput.required, ["reply", "model", "degraded", "inference"]);
  assert.equal(companionOutput.properties.tokensUsed.type, "integer");
  assert.ok(companionOutput.properties.lineage.properties.memoryFenced);

  const personaInput = jsonFenceAfter("skills/persona-mirror/SKILL.md", "## Input");
  assert.deepEqual(personaInput.required, ["context"]);
  assert.ok(personaInput.properties.surface);
  assert.equal(personaInput.properties.platform, undefined);
  const personaOutput = jsonFenceAfter("skills/persona-mirror/SKILL.md", "## Output");
  assert.ok(personaOutput.properties.reply);
  assert.equal(personaOutput.properties.response, undefined);
  assert.equal(personaOutput.properties.confidence, undefined);

  const memoryInput = jsonFenceAfter("skills/memory-recall/SKILL.md", "## Input");
  assert.equal(memoryInput.additionalProperties, false);
  assert.deepEqual(Object.keys(memoryInput.properties).sort(), ["memory_type", "page", "page_size"]);
  assert.equal(memoryInput.properties.page_size.maximum, 100);
});

test("CLI refuses provider keys in argv", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-cli-key-"));
  try {
    fs.writeFileSync(path.join(temp, ".petclaw.json"), JSON.stringify({
      serverUrl: "https://invalid.example",
      petId: 1,
      token: "pck_test_owner_token",
      tokenOrigin: "https://invalid.example",
    }));
    const result = await runNode("bin/petclaw.js", ["models", "connect", "openai", "sk-secret-in-argv"], { HOME: temp });
    assert.equal(result.code, 1);
    assert.match(result.stdout, /Refusing an API key passed in argv/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("CLI and MCP refuse owner tokens in argv", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-cli-token-"));
  try {
    const cli = await runNode("bin/petclaw.js", ["auth", "pck_secret_in_argv"], { HOME: temp });
    assert.equal(cli.code, 1);
    assert.match(cli.stdout, /Refusing a CLI token passed in argv/);
    assert.equal(fs.existsSync(path.join(temp, ".petclaw.json")), false);

    const mcp = await runNode("mcp/server.js", ["--token", "pck_secret_in_argv"], { HOME: temp });
    assert.equal(mcp.code, 2);
    assert.match(mcp.stderr, /Refusing --token/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("HTTP failures cannot be written as successful SOUL exports and config is repaired to 0600", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-cli-export-"));
  const config = path.join(temp, ".petclaw.json");
  try {
    fs.writeFileSync(config, JSON.stringify({
      serverUrl: `http://127.0.0.1:${address.port}`,
      petId: 1,
      token: "pck_test_owner_token",
      tokenOrigin: `http://127.0.0.1:${address.port}`,
    }), { mode: 0o644 });
    const result = await runNode(path.join(ROOT, "bin/petclaw.js"), ["export"], { HOME: temp }, temp);
    assert.equal(result.code, 1);
    assert.match(result.stdout, /Unauthorized/);
    assert.deepEqual(fs.readdirSync(temp).filter((name) => /_SOUL_.*\.json$/.test(name)), []);
    if (process.platform !== "win32") assert.equal(fs.statSync(config).mode & 0o777, 0o600);
  } finally {
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("SOUL export verifies its checksum, confines its filename, and writes owner-only", async () => {
  const soul = {
    protocol: "petclaw-v1",
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    pet: {
      name: "../../private pet",
      species: 1,
      personalityType: "friendly",
      element: "normal",
      level: 1,
      experience: 0,
      happiness: 50,
      bondLevel: 1,
      evolutionStage: 1,
    },
    // A valid export can be larger than the ordinary 2 MiB API response cap.
    memories: [{
      key: "large-owner-note",
      content: "x".repeat(2 * 1024 * 1024 + 1024),
      category: "fact",
      importance: 1,
      source: "owner",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }],
    skills: [],
    checkpoints: [],
    consent: {
      allowPublicProfile: false,
      allowDataSharing: false,
      allowAITraining: false,
      allowInteraction: false,
    },
  };
  const response = { ...soul, integrityHash: computeIntegrityHash(soul) };
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(response));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-cli-safe-export-"));
  try {
    fs.writeFileSync(path.join(temp, ".petclaw.json"), JSON.stringify({
      serverUrl: origin,
      tokenOrigin: origin,
      petId: 1,
      token: "pck_test_owner_token",
    }), { mode: 0o600 });
    const result = await runNode(path.join(ROOT, "bin/petclaw.js"), ["export"], { HOME: temp }, temp);
    assert.equal(result.code, 0);
    const files = fs.readdirSync(temp).filter((name) => /_SOUL_.*\.json$/.test(name));
    assert.equal(files.length, 1);
    assert.doesNotMatch(files[0], /\.\.|\//);
    if (process.platform !== "win32") {
      assert.equal(fs.statSync(path.join(temp, files[0])).mode & 0o777, 0o600);
    }
  } finally {
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("MCP never sends a saved token to an overridden origin", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-mcp-origin-"));
  try {
    fs.writeFileSync(path.join(temp, ".petclaw.json"), JSON.stringify({
      serverUrl: "https://app.myaipet.ai",
      tokenOrigin: "https://app.myaipet.ai",
      petId: 1,
      token: "pck_test_owner_token",
    }), { mode: 0o600 });
    const result = await runNode("mcp/server.js", ["--url", "https://attacker.example"], { HOME: temp });
    assert.equal(result.code, 2);
    assert.match(result.stderr, /Refusing to send the saved token/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("MCP refuses to guess an active identity when an unconfigured account owns multiple pets", async () => {
  const paths = [];
  const server = http.createServer((req, res) => {
    paths.push(req.url);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ pets: [
      { id: 7, name: "Seven" },
      { id: 8, name: "Eight" },
    ] }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-mcp-multipet-"));
  try {
    fs.writeFileSync(path.join(temp, ".petclaw.json"), JSON.stringify({
      serverUrl: origin,
      tokenOrigin: origin,
      token: "pck_test_owner_token",
    }), { mode: 0o600 });
    const child = spawn(process.execPath, ["mcp/server.js"], {
      cwd: ROOT,
      env: { ...process.env, HOME: temp, NO_COLOR: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stdin.write(JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "petclaw_chat", arguments: { message: "hello" } },
    }) + "\n");
    const deadline = Date.now() + 3000;
    while (!stdout.includes('"id":1') && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    child.stdin.end();
    await new Promise((resolve) => child.on("close", resolve));
    const response = stdout.split("\n").filter(Boolean).map(JSON.parse).find((line) => line.id === 1);
    assert.equal(response.result.isError, true);
    assert.match(response.result.content[0].text, /will not guess which identity/);
    assert.match(response.result.content[0].text, /petclaw-sdk use <petId>/);
    assert.deepEqual(paths, ["/api/pets"]);
  } finally {
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("SOUL.md identity comes only from the configured owner pet and never public manifest stats", async () => {
  const paths = [];
  const server = http.createServer((req, res) => {
    paths.push(req.url);
    res.writeHead(200, { "content-type": "application/json" });
    if (req.url === "/api/pets") {
      res.end(JSON.stringify({ pets: [{
        id: 7,
        name: "Owner Seven",
        personality_type: "gentle",
        species: 1,
      }] }));
    } else {
      res.end(JSON.stringify({ stats: { pets: [{ id: 999, name: "Global Stranger" }] } }));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-cli-soul-owner-"));
  const wrong = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-cli-soul-wrong-"));
  try {
    const baseConfig = {
      serverUrl: origin,
      tokenOrigin: origin,
      token: "pck_test_owner_token",
    };
    fs.writeFileSync(path.join(temp, ".petclaw.json"), JSON.stringify({ ...baseConfig, petId: 7 }), { mode: 0o600 });
    const created = await runNode(path.join(ROOT, "bin/petclaw.js"), ["soul", "init"], { HOME: temp }, temp);
    assert.equal(created.code, 0);
    const soul = fs.readFileSync(path.join(temp, "SOUL.md"), "utf8");
    assert.match(soul, /# SOUL — Owner Seven/);
    assert.match(soul, /\*\*Species\*\*: Dog/);
    assert.match(soul, /\*\*Personality\*\*: gentle/);
    assert.doesNotMatch(soul, /Global Stranger/);
    assert.deepEqual(paths, ["/api/pets"]);

    fs.writeFileSync(path.join(wrong, ".petclaw.json"), JSON.stringify({ ...baseConfig, petId: 8 }), { mode: 0o600 });
    const rejected = await runNode(path.join(ROOT, "bin/petclaw.js"), ["soul", "init"], { HOME: wrong }, wrong);
    assert.equal(rejected.code, 1);
    assert.match(rejected.stdout, /Pet #8 is not owned by this token/);
    assert.equal(fs.existsSync(path.join(wrong, "SOUL.md")), false);
    assert.deepEqual(paths, ["/api/pets", "/api/pets"]);
  } finally {
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
    fs.rmSync(wrong, { recursive: true, force: true });
  }
});

test("MCP initialize and tools/list expose seven canonical bounded schemas", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-mcp-"));
  try {
    const child = spawn(process.execPath, ["mcp/server.js"], {
      cwd: ROOT,
      env: { ...process.env, HOME: temp, NO_COLOR: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const lines = [];
    let buffer = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      const parts = buffer.split("\n");
      buffer = parts.pop() || "";
      for (const line of parts) if (line.trim()) lines.push(JSON.parse(line));
    });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }) + "\n");
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) + "\n");

    const deadline = Date.now() + 3000;
    while (lines.length < 2 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    child.stdin.end();
    await new Promise((resolve) => child.on("close", resolve));

    const toolResponse = lines.find((line) => line.id === 2);
    assert.ok(toolResponse);
    assert.equal(toolResponse.result.tools.length, 7);
    const names = toolResponse.result.tools.map((tool) => tool.name);
    assert.ok(names.includes("petclaw_agent_run"));
    assert.ok(names.includes("petclaw_memory_recall"));
    assert.ok(names.includes("petclaw_chat"));
    const chat = toolResponse.result.tools.find((tool) => tool.name === "petclaw_chat");
    assert.deepEqual(chat.inputSchema.required, ["message"]);
    assert.equal(chat.inputSchema.additionalProperties, false);
    assert.equal(chat.inputSchema.properties.message.minLength, 1);
    assert.equal(chat.inputSchema.properties.message.maxLength, 500);
    const agent = toolResponse.result.tools.find((tool) => tool.name === "petclaw_agent_run");
    assert.deepEqual(agent.inputSchema.required, ["goal", "confirmCostCredits"]);
    assert.equal(agent.inputSchema.properties.goal.minLength, 3);
    assert.equal(agent.inputSchema.properties.goal.maxLength, 600);
    assert.deepEqual(agent.inputSchema.properties.maxSteps, {
      type: "integer",
      minimum: 1,
      maximum: 6,
      description: "Maximum tool steps (1-6)",
      default: 4,
    });
    assert.deepEqual(agent.inputSchema.properties.confirmCostCredits, {
      type: "integer",
      const: 5,
      description: "Required explicit acknowledgement that this new run may charge exactly 5 credits",
    });
    assert.match(agent.description, /PAID: reserves 5 credits/);
    const persona = toolResponse.result.tools.find((tool) => tool.name === "petclaw_persona_mirror");
    assert.deepEqual(persona.inputSchema.required, ["context"]);
    assert.equal(persona.inputSchema.additionalProperties, false);
    assert.equal(persona.inputSchema.properties.context.maxLength, 2000);
    assert.deepEqual(persona.inputSchema.properties.surface.enum, [
      "web", "cli", "sdk", "mcp", "chrome-ext", "telegram", "discord",
    ]);
    assert.equal(persona.inputSchema.properties.sessionId.maxLength, 120);
    const recall = toolResponse.result.tools.find((tool) => tool.name === "petclaw_memory_recall");
    assert.equal(recall.inputSchema.properties.query.minLength, 2);
    assert.equal(recall.inputSchema.properties.query.maxLength, 300);
    assert.deepEqual(recall.inputSchema.properties.limit, {
      type: "integer",
      minimum: 1,
      maximum: 50,
      description: "Max results",
      default: 10,
    });
    const summarize = toolResponse.result.tools.find((tool) => tool.name === "petclaw_summarize_page");
    assert.deepEqual(summarize.inputSchema.required, ["message"]);
    assert.equal(summarize.inputSchema.properties.message.maxLength, 2000);
    const soulExport = toolResponse.result.tools.find((tool) => tool.name === "petclaw_soul_export");
    assert.deepEqual(soulExport.inputSchema.properties, {});
    assert.equal(soulExport.inputSchema.additionalProperties, false);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("MCP returns the JSON-RPC parse error for malformed input", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-mcp-parse-"));
  try {
    const child = spawn(process.execPath, ["mcp/server.js"], {
      cwd: ROOT,
      env: { ...process.env, HOME: temp, NO_COLOR: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stdin.end("{not-json}\n");
    await new Promise((resolve) => child.on("close", resolve));
    const response = stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .find((message) => message?.error?.code === -32700);
    assert.ok(response);
    assert.equal(response.id, null);
    assert.equal(response.error.message, "Parse error");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("CLI chat uses a stable per-installation session and exits 2 when provider output is degraded", async () => {
  const requestBodies = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      requestBodies.push(JSON.parse(body));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        reply: "I could not reach the model.",
        degraded: true,
        errorCode: "llm_unavailable",
        memoryRetained: true,
      }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-cli-chat-"));
  const otherTemp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-cli-chat-other-"));
  try {
    fs.writeFileSync(path.join(temp, ".petclaw.json"), JSON.stringify({
      serverUrl: origin,
      tokenOrigin: origin,
      petId: 7,
      token: "pck_test_owner_token",
    }), { mode: 0o600 });
    const result = await runNode("bin/petclaw.js", ["chat", "hello"], { HOME: temp });
    assert.equal(result.code, 2);
    const again = await runNode("bin/petclaw.js", ["chat", "again"], { HOME: temp });
    assert.equal(again.code, 2);
    assert.equal(requestBodies[0].message, "hello");
    assert.equal(requestBodies[0].surface, "cli");
    assert.match(requestBodies[0].sessionId, /^cli-[0-9a-f-]{36}-7$/);
    assert.equal(requestBodies[1].sessionId, requestBodies[0].sessionId);
    fs.writeFileSync(path.join(otherTemp, ".petclaw.json"), JSON.stringify({
      serverUrl: origin,
      tokenOrigin: origin,
      petId: 7,
      token: "pck_test_owner_token",
    }), { mode: 0o600 });
    const other = await runNode("bin/petclaw.js", ["chat", "other client"], { HOME: otherTemp });
    assert.equal(other.code, 2);
    assert.notEqual(requestBodies[2].sessionId, requestBodies[0].sessionId);
    assert.match(result.stdout, /degraded response \(llm_unavailable\)/);
    assert.match(result.stdout, /memory retained: yes/);
  } finally {
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
    fs.rmSync(otherTemp, { recursive: true, force: true });
  }
});

test("CLI agent JSON marks non-completed terminal runs incomplete and exits 2", async () => {
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      const body = JSON.parse(raw);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        runId: body.runId, state: "terminal", ok: false, completed: false,
        goal: "check status", answer: "Partial result", steps: [], stoppedReason: "timeout",
        billing: { outcome: "refunded", creditsCharged: 0, reason: "run_not_completed", modelCalls: 0 },
        creditsRemaining: 95,
      }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-cli-agent-"));
  try {
    fs.writeFileSync(path.join(temp, ".petclaw.json"), JSON.stringify({
      serverUrl: origin,
      tokenOrigin: origin,
      petId: 7,
      token: "pck_test_owner_token",
    }), { mode: 0o600 });
    const result = await runNode(
      "bin/petclaw.js",
      ["agent", "check", "status", "--confirm-cost", "5", "--json"],
      { HOME: temp },
    );
    assert.equal(result.code, 2);
    const output = JSON.parse(result.stdout);
    assert.equal(output.completed, false);
    assert.equal(output.stoppedReason, "timeout");
  } finally {
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("MCP chat sends lineage and exposes degraded provider output as an error", async () => {
  let requestBody;
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      requestBody = JSON.parse(body);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        runId: requestBody.runId,
        state: "terminal",
        reply: "Fallback text",
        degraded: true,
        errorCode: "llm_unavailable",
        memoryRetained: false,
        session: { surface: "mcp", sessionId: requestBody.sessionId },
      }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-mcp-chat-"));
  try {
    fs.writeFileSync(path.join(temp, ".petclaw.json"), JSON.stringify({
      serverUrl: origin,
      tokenOrigin: origin,
      petId: 7,
      token: "pck_test_owner_token",
    }), { mode: 0o600 });
    const child = spawn(process.execPath, ["mcp/server.js"], {
      cwd: ROOT,
      env: { ...process.env, HOME: temp, NO_COLOR: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const lines = [];
    let buffer = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      const parts = buffer.split("\n");
      buffer = parts.pop() || "";
      for (const line of parts) if (line.trim()) lines.push(JSON.parse(line));
    });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }) + "\n");
    child.stdin.write(JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "petclaw_chat", arguments: { message: "hello" } },
    }) + "\n");

    const deadline = Date.now() + 3000;
    while (!lines.some((line) => line.id === 2) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    child.stdin.end();
    await new Promise((resolve) => child.on("close", resolve));

    assert.equal(requestBody.message, "hello");
    assert.equal(requestBody.surface, "mcp");
    assert.match(requestBody.sessionId, /^mcp-[0-9a-f-]+$/);
    const response = lines.find((line) => line.id === 2);
    assert.equal(response.result.isError, true);
    assert.match(response.result.content[0].text, /llm_unavailable/);
    assert.match(response.result.content[0].text, /Fallback text/);
  } finally {
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("MCP SOUL export accepts a valid response above the ordinary 2 MiB cap", async () => {
  const payload = { protocol: "petclaw-v1", data: "x".repeat(2 * 1024 * 1024 + 1024) };
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(payload));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-mcp-large-soul-"));
  try {
    fs.writeFileSync(path.join(temp, ".petclaw.json"), JSON.stringify({
      serverUrl: origin,
      tokenOrigin: origin,
      petId: 7,
      token: "pck_test_owner_token",
    }), { mode: 0o600 });
    const child = spawn(process.execPath, ["mcp/server.js"], {
      cwd: ROOT,
      env: { ...process.env, HOME: temp, NO_COLOR: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const lines = [];
    let buffer = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      const parts = buffer.split("\n");
      buffer = parts.pop() || "";
      for (const line of parts) if (line.trim()) lines.push(JSON.parse(line));
    });
    child.stdin.write(JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "petclaw_soul_export", arguments: {} },
    }) + "\n");

    const deadline = Date.now() + 5000;
    while (!lines.some((line) => line.id === 1) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    child.stdin.end();
    await new Promise((resolve) => child.on("close", resolve));

    const response = lines.find((line) => line.id === 1);
    assert.ok(response);
    assert.equal(response.result.isError, undefined);
    assert.ok(response.result.content[0].text.length > 2 * 1024 * 1024);
  } finally {
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("CLI auth validates a token before persisting it", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "revoked token" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-cli-auth-"));
  try {
    fs.writeFileSync(path.join(temp, ".petclaw.json"), JSON.stringify({
      serverUrl: `http://127.0.0.1:${port}`,
    }), { mode: 0o600 });
    const result = await runNode(
      "bin/petclaw.js",
      ["auth"],
      { HOME: temp, PETCLAW_TOKEN: `pck_${"x".repeat(40)}` },
    );
    assert.equal(result.code, 1);
    assert.match(result.stdout, /Token was not accepted.*revoked token/);
    const saved = JSON.parse(fs.readFileSync(path.join(temp, ".petclaw.json"), "utf8"));
    assert.equal(saved.token, undefined);
  } finally {
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("CLI use changes only to a pet proven to be owned", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ pets: [{ id: 7, name: "Seven" }, { id: 8, name: "Eight" }] }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-cli-use-"));
  const configPath = path.join(temp, ".petclaw.json");
  try {
    fs.writeFileSync(configPath, JSON.stringify({
      serverUrl: origin,
      tokenOrigin: origin,
      petId: 7,
      token: "pck_test_owner_token",
    }), { mode: 0o600 });
    const rejected = await runNode("bin/petclaw.js", ["use", "99"], { HOME: temp });
    assert.equal(rejected.code, 1);
    assert.match(rejected.stdout, /not in the owned-pet list/);
    assert.equal(JSON.parse(fs.readFileSync(configPath, "utf8")).petId, 7);

    const accepted = await runNode("bin/petclaw.js", ["use", "8"], { HOME: temp });
    assert.equal(accepted.code, 0);
    assert.match(accepted.stdout, /Active pet set to #8/);
    assert.equal(JSON.parse(fs.readFileSync(configPath, "utf8")).petId, 8);
  } finally {
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("CLI status reports token verification failures without masking them with ReferenceError", async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(req.url === "/api/pets" ? 401 : 200, { "content-type": "application/json" });
    if (req.url === "/api/petclaw") {
      res.end(JSON.stringify({ manifest: { protocol: "petclaw-v1", skills: [], capabilities: {} }, stats: { totalPets: 0 } }));
    } else if (req.url === "/.well-known/pet-card.json") {
      res.end(JSON.stringify({ name: "PetClaw", sovereignty: { dataOwnership: "user" } }));
    } else {
      res.end(JSON.stringify({ error: "expired token" }));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-cli-status-"));
  try {
    fs.writeFileSync(path.join(temp, ".petclaw.json"), JSON.stringify({
      serverUrl: origin,
      tokenOrigin: origin,
      petId: 7,
      token: "pck_test_owner_token",
    }), { mode: 0o600 });
    const result = await runNode("bin/petclaw.js", ["status"], { HOME: temp });
    assert.equal(result.code, 1);
    assert.match(result.stdout, /Could not verify that token.*expired token/);
    assert.doesNotMatch(result.stdout + result.stderr, /ReferenceError|rl is not defined/);
  } finally {
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("CLI provider help includes native Nous Hermes support", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-cli-nous-"));
  try {
    fs.writeFileSync(path.join(temp, ".petclaw.json"), JSON.stringify({
      serverUrl: "https://app.myaipet.ai",
      tokenOrigin: "https://app.myaipet.ai",
      petId: 7,
      token: "pck_test_owner_token",
    }), { mode: 0o600 });
    const result = await runNode("bin/petclaw.js", ["models", "connect"], { HOME: temp });
    assert.equal(result.code, 1);
    assert.match(result.stdout, /providers:.*nous/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("CLI structured skill input preserves the exact JSON object from argv or stdin", async () => {
  const received = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      if (req.method === "POST" && req.url === "/api/petclaw/skills") {
        received.push(JSON.parse(body));
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ success: true, output: { reply: "ok" } }));
        return;
      }
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: `unexpected request: ${req.method} ${req.url}` }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-cli-structured-"));
  try {
    fs.writeFileSync(path.join(temp, ".petclaw.json"), JSON.stringify({
      serverUrl: origin,
      tokenOrigin: origin,
      petId: 7,
      token: "pck_test_owner_token",
    }), { mode: 0o600 });

    const argvInput = { context: "Draft an update", surface: "cli", sessionId: "release.argv" };
    const fromArgv = await runNode(
      "bin/petclaw.js",
      ["execute", "persona-mirror", "--json-input", JSON.stringify(argvInput)],
      { HOME: temp },
    );
    assert.equal(fromArgv.code, 0);

    const stdinInput = {
      consent: {
        allowPublicProfile: false,
        allowDataSharing: false,
        allowAITraining: false,
        allowInteraction: true,
      },
    };
    const fromStdin = await runNode(
      "bin/petclaw.js",
      ["execute", "consent-manage", "--json-stdin"],
      { HOME: temp },
      ROOT,
      JSON.stringify(stdinInput),
    );
    assert.equal(fromStdin.code, 0);

    assert.deepEqual(received, [
      { action: "execute", petId: 7, skillId: "persona-mirror", input: argvInput },
      { action: "execute", petId: 7, skillId: "consent-manage", input: stdinInput },
    ]);
  } finally {
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("CLI message shorthand is rejected when the canonical skill schema requires another field", async () => {
  let postCount = 0;
  const server = http.createServer((req, res) => {
    if (req.method === "POST") postCount += 1;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      skill: {
        id: "persona-mirror",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            context: { type: "string", minLength: 1, maxLength: 2000 },
            surface: { type: "string" },
            sessionId: { type: "string" },
          },
          required: ["context"],
        },
      },
    }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-cli-shorthand-"));
  try {
    fs.writeFileSync(path.join(temp, ".petclaw.json"), JSON.stringify({
      serverUrl: origin,
      tokenOrigin: origin,
      petId: 7,
      token: "pck_test_owner_token",
    }), { mode: 0o600 });
    const result = await runNode(
      "bin/petclaw.js",
      ["execute", "persona-mirror", "write", "an", "update"],
      { HOME: temp },
    );
    assert.equal(result.code, 1);
    assert.match(result.stdout, /does not accept message shorthand.*--json-stdin/);
    assert.equal(postCount, 0);
  } finally {
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("CLI distinguishes core runtime status and core uninstall removes preferences only", async () => {
  let uninstallBody;
  const manifests = [
    { id: "companion-chat", description: "Chat", category: "emotional", price: 0 },
    { id: "persona-mirror", description: "Mirror", category: "social", price: 0 },
    { id: "summarize-page", description: "Summarize", category: "knowledge", price: 0 },
  ];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      if (req.method === "GET" && req.url === "/api/petclaw/skills") {
        res.end(JSON.stringify({ total: manifests.length, skills: manifests }));
      } else if (req.method === "GET" && req.url === "/api/petclaw/skills?petId=7") {
        res.end(JSON.stringify({ runtime: [
          { skillId: "companion-chat", runtimeStatus: "core" },
          { skillId: "persona-mirror", runtimeStatus: "available" },
          { skillId: "summarize-page", runtimeStatus: "core" },
        ] }));
      } else if (req.method === "POST" && req.url === "/api/petclaw/skills") {
        uninstallBody = JSON.parse(body);
        res.end(JSON.stringify({
          success: true,
          runtimeStatus: "core",
          message: "Saved install preferences removed",
        }));
      } else {
        res.end(JSON.stringify({ error: "unexpected request" }));
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-cli-core-"));
  try {
    fs.writeFileSync(path.join(temp, ".petclaw.json"), JSON.stringify({
      serverUrl: origin,
      tokenOrigin: origin,
      petId: 7,
      token: "pck_test_owner_token",
    }), { mode: 0o600 });

    const status = await runNode("bin/petclaw.js", ["skills"], { HOME: temp });
    assert.equal(status.code, 0);
    assert.match(status.stdout, /2 core on pet #7/);
    assert.match(status.stdout, /companion-chat\s+core/);
    assert.match(status.stdout, /persona-mirror\s+available/);

    const uninstall = await runNode("bin/petclaw.js", ["uninstall", "companion-chat"], { HOME: temp });
    assert.equal(uninstall.code, 0);
    assert.match(uninstall.stdout, /Removed saved preferences for companion-chat; the core runtime remains active/);
    assert.deepEqual(uninstallBody, {
      action: "uninstall",
      petId: 7,
      skillId: "companion-chat",
    });
  } finally {
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("all command help flags are local and cannot trigger network, spend, mutation, or file writes", async () => {
  let requestCount = 0;
  const server = http.createServer((_req, res) => {
    requestCount += 1;
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "help must not make HTTP requests" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-cli-help-"));
  try {
    fs.writeFileSync(path.join(temp, ".petclaw.json"), JSON.stringify({
      serverUrl: origin,
      tokenOrigin: origin,
      petId: 7,
      token: "pck_test_owner_token",
    }), { mode: 0o644 });
    const cases = [
      ["init", "--help"],
      ["auth", "--help"],
      ["doctor", "--help"],
      ["chat", "--help"],
      ["agent", "--help"],
      ["install", "--help"],
      ["uninstall", "--help"],
      ["execute", "companion-chat", "--help"],
      ["models", "connect", "--help"],
      ["soul", "init", "--help"],
      ["export", "--help"],
      ["mcp", "--help"],
    ];
    for (const args of cases) {
      const result = await runNode(path.join(ROOT, "bin/petclaw.js"), args, { HOME: temp }, temp);
      assert.equal(result.code, 0, `${args.join(" ")} should be local help`);
      assert.match(result.stdout, /petclaw-sdk/);
    }
    assert.equal(requestCount, 0);
    assert.equal(fs.existsSync(path.join(temp, "SOUL.md")), false);
    if (process.platform !== "win32") {
      assert.equal(fs.statSync(path.join(temp, ".petclaw.json")).mode & 0o777, 0o644);
    }
  } finally {
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("CLI rejects lossy chat and agent arguments before any paid request", async () => {
  let requestCount = 0;
  const server = http.createServer((_req, res) => {
    requestCount += 1;
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "invalid local input must not make HTTP requests" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-cli-bounds-"));
  try {
    fs.writeFileSync(path.join(temp, ".petclaw.json"), JSON.stringify({
      serverUrl: origin,
      tokenOrigin: origin,
      petId: 7,
      token: "pck_test_owner_token",
    }), { mode: 0o600 });
    const cases = [
      { args: ["chat", "x".repeat(501)], expected: /500-character/ },
      { args: ["agent", "valid", "goal"], expected: /exact acknowledgement: --confirm-cost 5/ },
      { args: ["agent", "valid", "goal", "--confirm-cost", "4"], expected: /exact acknowledgement: --confirm-cost 5/ },
      { args: ["agent", "valid", "goal", "--confirm-cost", "5", "--confirm-cost", "5"], expected: /exact acknowledgement: --confirm-cost 5/ },
      { args: ["agent", "valid", "goal", "--confirm-cost", "5", "--max-steps"], expected: /integer from 1 to 6/ },
      { args: ["agent", "valid", "goal", "--confirm-cost", "5", "--max-steps", "2.5"], expected: /integer from 1 to 6/ },
      { args: ["agent", "valid", "goal", "--confirm-cost", "5", "--max-steps", "7"], expected: /integer from 1 to 6/ },
      { args: ["agent", "x".repeat(601), "--confirm-cost", "5"], expected: /at most 600 characters/ },
    ];
    for (const item of cases) {
      const result = await runNode("bin/petclaw.js", item.args, { HOME: temp });
      assert.equal(result.code, 1);
      assert.match(result.stdout, item.expected);
    }
    assert.equal(requestCount, 0);
  } finally {
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("CLI human agent output includes the server billing receipt", async () => {
  let requestBody;
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      requestBody = JSON.parse(body);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        runId: requestBody.runId,
        state: "terminal",
        ok: true,
        completed: true,
        answer: "Ship the reviewed change.",
        steps: [],
        stoppedReason: "completed",
        billing: {
          outcome: "charged",
          creditsCharged: 5,
          reason: "completed_with_direct_answer",
          successfulToolCalls: 0,
          failedToolCalls: 0,
          committedSideEffects: 0,
          modelCalls: 2,
        },
        creditsRemaining: 95,
      }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-cli-billing-"));
  try {
    fs.writeFileSync(path.join(temp, ".petclaw.json"), JSON.stringify({
      serverUrl: origin,
      tokenOrigin: origin,
      petId: 7,
      token: "pck_test_owner_token",
    }), { mode: 0o600 });
    const result = await runNode(
      "bin/petclaw.js",
      ["agent", "suggest", "next", "step", "--confirm-cost", "5"],
      { HOME: temp },
    );
    assert.equal(result.code, 0);
    assert.match(requestBody.runId, /^[0-9a-f-]{36}$/);
    assert.deepEqual({ ...requestBody, runId: undefined }, {
      runId: undefined, goal: "suggest next step", maxSteps: 4, confirmCostCredits: 5,
    });
    assert.match(result.stdout, /billing: charged · 5 credits · completed_with_direct_answer/);
    assert.match(result.stdout, /95 credits remaining/);
  } finally {
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("CLI skill output distinguishes endpoint resolution from execution and prints billing truth", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      skillId: "video-gen",
      success: true,
      executionStatus: "resolved",
      sideEffectCommitted: false,
      output: {
        status: "invoke_via_endpoint",
        execution: "not_run",
        endpoint: "/api/pets/7/generate",
      },
      declaredCost: 15,
      creditsCharged: 0,
      latencyMs: 2,
      cost: 0,
    }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-cli-skill-receipt-"));
  try {
    fs.writeFileSync(path.join(temp, ".petclaw.json"), JSON.stringify({
      serverUrl: origin,
      tokenOrigin: origin,
      petId: 7,
      token: "pck_test_owner_token",
    }), { mode: 0o600 });
    const result = await runNode("bin/petclaw.js", [
      "execute", "video-gen", "--json-input", JSON.stringify({ type: "video", style: 1, duration: 5 }),
    ], { HOME: temp });
    assert.equal(result.code, 0);
    assert.match(result.stdout, /resolved to its REST endpoint.*it was not executed/);
    assert.match(result.stdout, /Receipt: resolved · side effect committed: no/);
    assert.match(result.stdout, /Billing: declared 15 · charged 0 credits/);
  } finally {
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("MCP rejects values outside its published tool schemas before HTTP", async () => {
  let requestCount = 0;
  const server = http.createServer((_req, res) => {
    requestCount += 1;
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "invalid MCP input must not make HTTP requests" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-mcp-schema-validation-"));
  try {
    fs.writeFileSync(path.join(temp, ".petclaw.json"), JSON.stringify({
      serverUrl: origin,
      tokenOrigin: origin,
      petId: 7,
      token: "pck_test_owner_token",
    }), { mode: 0o600 });
    const child = spawn(process.execPath, ["mcp/server.js"], {
      cwd: ROOT,
      env: { ...process.env, HOME: temp, NO_COLOR: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    const requests = [
      { id: 1, name: "petclaw_chat", arguments: { message: "hello", unexpected: true } },
      { id: 2, name: "petclaw_agent_run", arguments: { goal: "valid goal", maxSteps: 4 } },
      { id: 3, name: "petclaw_agent_run", arguments: { goal: "valid goal", maxSteps: 2.5, confirmCostCredits: 5 } },
      { id: 4, name: "petclaw_memory_recall", arguments: { query: "release", limit: 0 } },
      { id: 5, name: "petclaw_soul_export", arguments: { petId: 99 } },
      { id: 6, name: "petclaw_agent_run", arguments: { goal: "valid goal", maxSteps: 4, confirmCostCredits: 4 } },
    ];
    for (const request of requests) {
      child.stdin.write(JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        method: "tools/call",
        params: { name: request.name, arguments: request.arguments },
      }) + "\n");
    }
    const deadline = Date.now() + 3000;
    while (stdout.split("\n").filter(Boolean).length < requests.length && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    child.stdin.end();
    await new Promise((resolve) => child.on("close", resolve));
    const responses = stdout.split("\n").filter(Boolean).map(JSON.parse);
    for (const request of requests) {
      const response = responses.find((line) => line.id === request.id);
      assert.equal(response.result.isError, true);
      assert.match(response.result.content[0].text, /^Invalid arguments for petclaw_/);
    }
    assert.equal(requestCount, 0, "missing or wrong cost acknowledgement must fail before HTTP");
  } finally {
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("MCP paid agent acknowledgement permits exactly one request and is forwarded", async () => {
  let requestCount = 0;
  let requestPath = "";
  let requestBody;
  const server = http.createServer((req, res) => {
    requestCount += 1;
    requestPath = req.url;
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      requestBody = JSON.parse(body);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        runId: requestBody.runId,
        state: "terminal",
        ok: true,
        completed: true,
        answer: "Done.",
        steps: [],
        stoppedReason: "completed",
        billing: {
          outcome: "charged",
          creditsCharged: 5,
          reason: "completed_with_direct_answer",
          successfulToolCalls: 0,
          failedToolCalls: 0,
          committedSideEffects: 0,
          modelCalls: 2,
          orchestratorModelCalls: 2,
          skillModelCalls: 0,
        },
        creditsRemaining: 95,
      }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-mcp-paid-ack-"));
  try {
    fs.writeFileSync(path.join(temp, ".petclaw.json"), JSON.stringify({
      serverUrl: origin,
      tokenOrigin: origin,
      petId: 7,
      token: "pck_test_owner_token",
    }), { mode: 0o600 });
    const child = spawn(process.execPath, ["mcp/server.js"], {
      cwd: ROOT,
      env: { ...process.env, HOME: temp, NO_COLOR: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stdin.write(JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "petclaw_agent_run",
        arguments: { goal: "suggest next step", maxSteps: 4, confirmCostCredits: 5 },
      },
    }) + "\n");
    const deadline = Date.now() + 3000;
    while (!stdout.split("\n").some((line) => line.includes('"id":1')) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    child.stdin.end();
    await new Promise((resolve) => child.on("close", resolve));
    const response = stdout.split("\n").filter(Boolean).map(JSON.parse).find((line) => line.id === 1);
    assert.equal(response.result.isError, undefined);
    assert.equal(requestCount, 1);
    assert.equal(requestPath, "/api/pets/7/agent");
    assert.match(requestBody.runId, /^[0-9a-f-]{36}$/);
    assert.deepEqual({ ...requestBody, runId: undefined }, {
      runId: undefined, goal: "suggest next step", maxSteps: 4, confirmCostCredits: 5,
    });
    assert.equal(JSON.parse(response.result.content[0].text).billing.creditsCharged, 5);
  } finally {
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("MCP successful chat returns a structured retention and inference receipt", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      reply: "Ready to code.",
      degraded: false,
      memoryRetained: true,
      session: { surface: "mcp", sessionId: "mcp-test" },
      inference: { provider: "nous", model: "Hermes-4-405B", source: "byok" },
    }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-mcp-receipt-"));
  try {
    fs.writeFileSync(path.join(temp, ".petclaw.json"), JSON.stringify({
      serverUrl: origin,
      tokenOrigin: origin,
      petId: 7,
      token: "pck_test_owner_token",
    }), { mode: 0o600 });
    const child = spawn(process.execPath, ["mcp/server.js"], {
      cwd: ROOT,
      env: { ...process.env, HOME: temp, NO_COLOR: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stdin.write(JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "petclaw_chat", arguments: { message: "start" } },
    }) + "\n");
    const deadline = Date.now() + 3000;
    while (!stdout.split("\n").some((line) => line.includes('"id":1')) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    child.stdin.end();
    await new Promise((resolve) => child.on("close", resolve));
    const response = stdout.split("\n").filter(Boolean).map(JSON.parse).find((line) => line.id === 1);
    assert.equal(response.result.isError, undefined);
    assert.equal(response.result.structuredContent.reply, "Ready to code.");
    assert.equal(response.result.structuredContent.memoryRetained, true);
    assert.equal(response.result.structuredContent.inference.provider, "nous");
    assert.deepEqual(JSON.parse(response.result.content[0].text), response.result.structuredContent);
  } finally {
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("MCP rejects blank and secret-shaped recall queries before any HTTP request", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-mcp-recall-query-"));
  try {
    fs.writeFileSync(path.join(temp, ".petclaw.json"), JSON.stringify({
      serverUrl: "https://app.myaipet.ai",
      tokenOrigin: "https://app.myaipet.ai",
      petId: 7,
      token: "pck_test_owner_token",
    }), { mode: 0o600 });
    const child = spawn(process.execPath, ["mcp/server.js"], {
      cwd: ROOT,
      env: { ...process.env, HOME: temp, NO_COLOR: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stdin.write(JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "petclaw_memory_recall", arguments: { query: " " } },
    }) + "\n");
    child.stdin.end(JSON.stringify({
      jsonrpc: "2.0", id: 2, method: "tools/call",
      params: { name: "petclaw_memory_recall", arguments: { query: "api_key: sk-supersecret123" } },
    }) + "\n");
    await new Promise((resolve) => child.on("close", resolve));
    const responses = stdout.split("\n").filter(Boolean).map(JSON.parse);
    const blank = responses.find((line) => line.id === 1);
    assert.equal(blank.result.isError, true);
    assert.match(blank.result.content[0].text, /must contain at least 2 characters/);
    const secret = responses.find((line) => line.id === 2);
    assert.equal(secret.result.isError, true);
    assert.match(secret.result.content[0].text, /non-secret memory query/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
