const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.join(__dirname, "..");
const { computeIntegrityHash } = require(path.join(ROOT, "dist", "protocol.js"));
const { createPaidRunJournal } = require(path.join(ROOT, "lib", "paid-run-journal.cjs"));

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
  const agentHelp = await runNode("bin/petclaw.js", ["agent", "--help"]);
  assert.equal(result.code, 0);
  assert.equal(agentHelp.code, 0);
  assert.match(result.stdout, /agent "input" --task <kind> --confirm-cost 5/);
  assert.match(agentHelp.stdout, /--max-steps is deprecated.*normalized to 1/i);
  assert.match(result.stdout, /demo "message"/);
  assert.match(result.stdout, /Cross-pet invocation is disabled|Unavailable in this launch/);
  assert.doesNotMatch(result.stdout, /Soul NFTs:/);
});

test("developer docs select an owned pet, require caller run IDs, and disclose paid read-only runs", () => {
  const repoRoot = path.join(ROOT, "..", "..");
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const cliSource = fs.readFileSync(path.join(ROOT, "bin", "petclaw.js"), "utf8");
  assert.equal(packageJson.version, "2.0.0");
  assert.match(cliSource, /paid 5-credit typed task → one server-selected read-only tool with a receipt/);
  assert.doesNotMatch(cliSource, /bounded plan\/call\/observe loop/);
  assert.match(fs.readFileSync(path.join(ROOT, "README.md"), "utf8"), /1\.6\.2 allowed calls without it/);
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
    path.join(ROOT, "README.md"),
    path.join(ROOT, "docs", "QUICKSTART.md"),
    path.join(ROOT, "docs", "ECOSYSTEM.md"),
  ]) {
    const markdown = fs.readFileSync(file, "utf8");
    for (const line of markdown.split("\n").filter((value) => /^petclaw-sdk agent /.test(value))) {
      assert.match(line, /--task (?:recall|summarize|review|draft)/, `${file}: ${line}`);
    }
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
    path.join(ROOT, "README.md"),
    path.join(ROOT, "docs", "API.md"),
    path.join(ROOT, "docs", "QUICKSTART.md"),
  ]) {
    const markdown = fs.readFileSync(file, "utf8");
    assert.match(markdown, /createPetClawAgentRunId\(\)/, `${file} must show caller-owned runId generation`);
    assert.match(markdown, /read-only (?:tools?|skills? and connectors|skill or connector|result)/i, `${file} must disclose the paid loop's read-only boundary`);
    assert.doesNotMatch(markdown, /completed run with a successful tool result|explicitly confirmed durable side effect/, `${file} contains a stale charge path`);
    assert.doesNotMatch(markdown, /clear its local pending marker/i, `${file} must not authorize clearing an unresolved paid run`);
    assert.match(markdown, /Keep the local pending\s+marker\s+locked/i, `${file} must preserve unresolved paid-run authorization`);
    assert.match(markdown, /server origin to which that\s+authorization was\s+bound/i, `${file} must bind replay to the original server`);
    assert.match(markdown, /2,000-character maximum/i, `${file} must publish the task-input maximum`);
    for (const [taskKind, minimum] of Object.entries({
      recall: 8,
      summarize: 40,
      review: 12,
      draft: 20,
    })) {
      assert.match(
        markdown,
        new RegExp(`(?:${taskKind}[^\\n]{0,100}${minimum}|${minimum}[^\\n]{0,100}${taskKind})`, "i"),
        `${file} must publish the ${taskKind} minimum`,
      );
    }
    assert.match(
      markdown,
      /(?:reject\s+bracket placeholders|bracket placeholders are\s+rejected)/i,
      `${file} must disclose placeholder rejection`,
    );
    assert.match(
      markdown,
      /concrete (?:secret signatures|API keys\/tokens)[\s\S]{0,400}before\s+journal\s+or\s+network\s+access/i,
      `${file} must disclose local strong-secret rejection`,
    );
    assert.match(
      markdown,
      /never (?:written|persisted)\s+to\s+`~\/\.petclaw\.json`/i,
      `${file} must promise rejected task secrets are not persisted`,
    );
  }

  for (const file of [
    path.join(ROOT, "README.md"),
    path.join(ROOT, "docs", "API.md"),
    path.join(ROOT, "docs", "QUICKSTART.md"),
    path.join(ROOT, "docs", "ECOSYSTEM.md"),
  ]) {
    const markdown = fs.readFileSync(file, "utf8");
    assert.match(markdown, /does not write\s+(?:pet\s+)?memory[\s\S]{0,80}self-learning/i, `${file} must disclose the pet-memory write fence`);
    assert.match(markdown, /owner-private run[\s\S]{0,100}(?:stored|history)/i, `${file} must disclose owner-private run retention`);
    assert.doesNotMatch(markdown, /no\s+retention|retention\s+and self-learning (?:are )?disabled/i, `${file} must not claim the run has no retention`);
  }
  const packageApi = fs.readFileSync(path.join(ROOT, "docs", "API.md"), "utf8");
  assert.match(packageApi, /typed v2[\s\S]{0,100}`task_error`/i);
  assert.match(packageApi, /`planner_error`[\s\S]{0,100}historical receipt/i);

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
    assert.deepEqual(agent.inputSchema.required, ["goal", "taskKind", "confirmCostCredits"]);
    assert.equal(agent.inputSchema.properties.goal.minLength, 8);
    assert.equal(agent.inputSchema.properties.goal.maxLength, 2000);
    assert.equal(
      agent.inputSchema.properties.goal.description,
      "Task input: recall 8+, summarize 40+, review 12+, or draft 20+ characters; 2,000 maximum",
    );
    assert.deepEqual(agent.inputSchema.properties.taskKind, {
      type: "string",
      enum: ["recall", "summarize", "review", "draft"],
      description: "Required read-only deliverable: recall memory, summarize supplied text, review supplied text, or draft from a brief",
    });
    assert.deepEqual(agent.inputSchema.properties.maxSteps, {
      type: "integer",
      minimum: 1,
      maximum: 6,
      description: "Deprecated compatibility field; accepted values 1-6 are ignored and normalized to 1",
      default: 1,
      deprecated: true,
    });
    assert.deepEqual(agent.inputSchema.properties.confirmCostCredits, {
      type: "integer",
      const: 5,
      description: "Required explicit acknowledgement that this new run may charge exactly 5 credits",
    });
    assert.match(agent.description, /PAID: reserves 5 credits/);
    assert.match(agent.description, /owner-private run history is stored/);
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
        runId: body.runId, state: "terminal", taskKind: body.taskKind, ok: false, completed: false,
        goal: "check status", answer: "Partial result", steps: [], stoppedReason: "timeout",
        billing: { outcome: "refunded", creditsCharged: 0, reason: "run_not_completed", usageKnown: true, modelCalls: 0 },
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
      ["agent", "check", "status", "--task", "review", "--confirm-cost", "5", "--json"],
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
    const originalMode = process.platform !== "win32"
      ? fs.statSync(path.join(temp, ".petclaw.json")).mode & 0o777
      : null;
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
      assert.equal(
        fs.statSync(path.join(temp, ".petclaw.json")).mode & 0o777,
        originalMode,
        "local help must preserve the config mode it inherited",
      );
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
      { args: ["agent", "valid", "goal", "--confirm-cost", "5"], expected: /require exactly one --task/ },
      { args: ["agent", "valid", "goal", "--task", "browse", "--confirm-cost", "5"], expected: /require exactly one --task/ },
      { args: ["agent", "valid", "goal", "--task", "review", "--task", "review", "--confirm-cost", "5"], expected: /require exactly one --task/ },
      { args: ["agent", "valid", "goal", "--task", "review", "--confirm-cost", "5", "--max-steps"], expected: /integer from 1 to 6/ },
      { args: ["agent", "valid", "goal", "--task", "review", "--confirm-cost", "5", "--max-steps", "2.5"], expected: /integer from 1 to 6/ },
      { args: ["agent", "valid", "goal", "--task", "review", "--confirm-cost", "5", "--max-steps", "7"], expected: /integer from 1 to 6/ },
      { args: ["agent", "x".repeat(2001), "--task", "review", "--confirm-cost", "5"], expected: /2000 characters or fewer/ },
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

test("CLI rejects secret and task-invalid agent input before network or journal access", async () => {
  let requestCount = 0;
  const server = http.createServer((_req, res) => {
    requestCount += 1;
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "local validation must run first" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-cli-agent-input-safety-"));
  const configPath = path.join(temp, ".petclaw.json");
  const configText = JSON.stringify({
    serverUrl: origin,
    tokenOrigin: origin,
    petId: 7,
    token: "pck_test_owner_token",
    preservedSentinel: "unchanged",
  });
  try {
    fs.writeFileSync(configPath, configText, { mode: 0o600 });
    const cases = [
      {
        goal: ["Review api_key: sk", "abcdefghijklmnopqrstuvwxyz123456"].join("-"),
        taskKind: "review",
        expected: /Remove API keys, tokens, passwords/,
      },
      {
        goal: ["Review -----BEGIN", "ENCRYPTED PRIVATE KEY----- key-material"].join(" "),
        taskKind: "review",
        expected: /Remove API keys, tokens, passwords/,
      },
      {
        goal: [
          "Review https://objects.example/file?X-Amz-Signature=",
          "a".repeat(32),
        ].join(""),
        taskKind: "review",
        expected: /Remove API keys, tokens, passwords/,
      },
      { goal: "1234567", taskKind: "recall", expected: /recall needs at least 8/ },
      { goal: "s".repeat(39), taskKind: "summarize", expected: /summarize needs at least 40/ },
      { goal: "r".repeat(11), taskKind: "review", expected: /review needs at least 12/ },
      { goal: "d".repeat(19), taskKind: "draft", expected: /draft needs at least 20/ },
      { goal: "x".repeat(2_001), taskKind: "review", expected: /2000 characters or fewer/ },
      {
        goal: "[paste source text here]",
        taskKind: "review",
        expected: /Replace the example placeholder/,
      },
    ];
    for (const item of cases) {
      const result = await runNode("bin/petclaw.js", [
        "agent",
        item.goal,
        "--task",
        item.taskKind,
        "--confirm-cost",
        "5",
      ], { HOME: temp });
      assert.equal(result.code, 1);
      assert.match(result.stdout, item.expected);
      assert.match(result.stdout, /no paid-run safety marker was created/i);
    }
    assert.equal(requestCount, 0);
    assert.equal(fs.readFileSync(configPath, "utf8"), configText);
    assert.equal(fs.existsSync(`${configPath}.guard`), false);
    assert.equal(fs.existsSync(`${configPath}.guard.lock`), false);
  } finally {
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("CLI human agent output includes the server billing receipt", async () => {
  let requestBody;
  const longGoal = "x".repeat(2000);
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      requestBody = JSON.parse(body);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        runId: requestBody.runId,
        state: "terminal",
        taskKind: requestBody.taskKind,
        ok: true,
        completed: true,
        answer: "Ship the reviewed change.",
        steps: [{ skill: "summarize-page", ok: true }],
        stoppedReason: "completed",
        billing: {
          outcome: "charged",
          creditsCharged: 5,
          reason: "completed_with_successful_tool",
          successfulToolCalls: 1,
          failedToolCalls: 0,
          committedSideEffects: 0,
          usageKnown: true,
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
      ["agent", longGoal, "--task", "draft", "--confirm-cost", "5", "--max-steps", "6"],
      { HOME: temp },
    );
    assert.equal(result.code, 0);
    assert.match(requestBody.runId, /^[0-9a-f-]{36}$/);
    assert.deepEqual({ ...requestBody, runId: undefined }, {
      runId: undefined, goal: longGoal, taskKind: "draft", maxSteps: 1, confirmCostCredits: 5,
    });
    assert.match(result.stdout, /billing: charged · 5 credits · completed_with_successful_tool/);
    assert.match(result.stdout, /95 credits remaining/);
  } finally {
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("CLI keeps the paid-run marker when an HTTP 200 settlement body is malformed", async () => {
  let paidPostCount = 0;
  const server = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/api/pets/7/agent") paidPostCount += 1;
    req.resume();
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"runId":');
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-cli-malformed-receipt-"));
  const configPath = path.join(temp, ".petclaw.json");
  try {
    fs.writeFileSync(configPath, JSON.stringify({
      serverUrl: origin,
      tokenOrigin: origin,
      petId: 7,
      token: "pck_test_owner_token",
    }), { mode: 0o600 });
    const first = await runNode(
      "bin/petclaw.js",
      ["agent", "preserve", "the", "receipt", "--task", "review", "--confirm-cost", "5"],
      { HOME: temp },
    );
    assert.equal(first.code, 1);
    assert.match(first.stdout, /Outcome unknown/);
    const saved = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const pending = Object.values(saved.pendingAgentRuns || {});
    assert.equal(pending.length, 1);
    assert.match(pending[0].runId, /^[0-9a-f-]{36}$/);
    assert.equal(pending[0].serverOrigin, origin);
    assert.equal(pending[0].taskKind, "review");
    assert.equal(pending[0].journalVersion, 3);

    const second = await runNode(
      "bin/petclaw.js",
      ["agent", "must", "not", "start", "another", "paid", "run", "--task", "draft", "--confirm-cost", "5"],
      { HOME: temp },
    );
    assert.equal(second.code, 1);
    assert.match(second.stdout, /Could not reconcile paid run/);
    assert.equal(paidPostCount, 1, "the retained marker must block a new run ID");
  } finally {
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("CLI receipt reconciliation replays the exact saved typed task", async () => {
  const runId = randomUUID();
  let statusLookups = 0;
  let replayBody;
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      if (req.method === "GET" && req.url === `/api/pets/7/agent/runs/${runId}`) {
        statusLookups += 1;
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "not found" }));
        return;
      }
      replayBody = JSON.parse(raw);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        runId,
        state: "terminal",
        taskKind: "review",
        ok: true,
        completed: true,
        answer: "Reviewed.",
        steps: [{ skill: "summarize-page", ok: true }],
        stoppedReason: "completed",
        billing: {
          outcome: "charged",
          creditsCharged: 5,
          reason: "completed_with_successful_tool",
          usageKnown: true,
          modelCalls: 1,
        },
      }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-cli-typed-replay-"));
  const configPath = path.join(temp, ".petclaw.json");
  try {
    fs.writeFileSync(configPath, JSON.stringify({
      serverUrl: origin,
      tokenOrigin: origin,
      petId: 7,
      token: "pck_test_owner_token",
    }), { mode: 0o600 });
    const journal = createPaidRunJournal(configPath);
    journal.claim({
      runId,
      petId: 7,
      goal: "Review the exact saved copy",
      taskKind: "review",
      maxSteps: 3,
      confirmCostCredits: 5,
      serverOrigin: origin,
      surface: "cli",
      createdAt: new Date().toISOString(),
    });

    const result = await runNode("bin/petclaw.js", ["agent-status", runId], { HOME: temp });
    assert.equal(result.code, 0);
    assert.equal(statusLookups, 2);
    assert.deepEqual(replayBody, {
      runId,
      goal: "Review the exact saved copy",
      taskKind: "review",
      maxSteps: 1,
      confirmCostCredits: 5,
    });
    assert.deepEqual(JSON.parse(fs.readFileSync(configPath, "utf8")).pendingAgentRuns, {});
  } finally {
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("CLI keeps a v3 journal marker when a terminal receipt has another taskKind", async () => {
  const runId = randomUUID();
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      runId,
      state: "terminal",
      taskKind: "draft",
      ok: true,
      completed: true,
      answer: "Wrong task receipt.",
      steps: [{ skill: "draft", ok: true }],
      stoppedReason: "completed",
      billing: {
        outcome: "charged",
        creditsCharged: 5,
        reason: "completed_with_successful_tool",
        usageKnown: true,
        modelCalls: 1,
      },
    }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-cli-taskkind-mismatch-"));
  const configPath = path.join(temp, ".petclaw.json");
  try {
    fs.writeFileSync(configPath, JSON.stringify({
      serverUrl: origin,
      tokenOrigin: origin,
      petId: 7,
      token: "pck_test_owner_token",
    }), { mode: 0o600 });
    const journal = createPaidRunJournal(configPath);
    const claimed = journal.claim({
      runId,
      petId: 7,
      goal: "Review the saved input",
      taskKind: "review",
      maxSteps: 4,
      confirmCostCredits: 5,
      serverOrigin: origin,
      surface: "cli",
      createdAt: new Date().toISOString(),
    });

    const result = await runNode("bin/petclaw.js", ["agent-status", runId], { HOME: temp });
    assert.equal(result.code, 2);
    assert.match(result.stdout, /no validated terminal receipt/i);
    const pending = JSON.parse(fs.readFileSync(configPath, "utf8")).pendingAgentRuns;
    assert.deepEqual(pending[runId], claimed.marker);
    assert.equal(pending[runId].taskKind, "review");
    assert.equal(pending[runId].maxSteps, 1);
    assert.equal(pending[runId].journalVersion, 3);
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
      { id: 3, name: "petclaw_agent_run", arguments: { goal: "valid goal", taskKind: "review", maxSteps: 2.5, confirmCostCredits: 5 } },
      { id: 4, name: "petclaw_memory_recall", arguments: { query: "release", limit: 0 } },
      { id: 5, name: "petclaw_soul_export", arguments: { petId: 99 } },
      { id: 6, name: "petclaw_agent_run", arguments: { goal: "valid goal", taskKind: "review", maxSteps: 4, confirmCostCredits: 4 } },
      { id: 7, name: "petclaw_agent_run", arguments: { goal: "valid goal", taskKind: "browse", maxSteps: 4, confirmCostCredits: 5 } },
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

test("MCP rejects secret and task-invalid agent input before network or journal access", async () => {
  let requestCount = 0;
  const server = http.createServer((_req, res) => {
    requestCount += 1;
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "local validation must run first" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-mcp-agent-input-safety-"));
  const configPath = path.join(temp, ".petclaw.json");
  const configText = JSON.stringify({
    serverUrl: origin,
    tokenOrigin: origin,
    petId: 7,
    token: "pck_test_owner_token",
    preservedSentinel: "unchanged",
  });
  try {
    fs.writeFileSync(configPath, configText, { mode: 0o600 });
    const child = spawn(process.execPath, ["mcp/server.js"], {
      cwd: ROOT,
      env: { ...process.env, HOME: temp, NO_COLOR: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    const requests = [
      {
        id: 1,
        goal: ["Review api_key: sk", "abcdefghijklmnopqrstuvwxyz123456"].join("-"),
        taskKind: "review",
        expected: /Remove API keys, tokens, passwords/,
      },
      {
        id: 8,
        goal: ["Review -----BEGIN", "PGP PRIVATE KEY BLOCK----- key-material"].join(" "),
        taskKind: "review",
        expected: /Remove API keys, tokens, passwords/,
      },
      {
        id: 9,
        goal: ["Review mongodb+srv", "://owner:credential-pass", "@database/private"].join(""),
        taskKind: "review",
        expected: /Remove API keys, tokens, passwords/,
      },
      { id: 2, goal: "1234567", taskKind: "recall", expected: /at least 8 characters/ },
      { id: 3, goal: "s".repeat(39), taskKind: "summarize", expected: /summarize needs at least 40/ },
      { id: 4, goal: "r".repeat(11), taskKind: "review", expected: /review needs at least 12/ },
      { id: 5, goal: "d".repeat(19), taskKind: "draft", expected: /draft needs at least 20/ },
      { id: 6, goal: "x".repeat(2_001), taskKind: "review", expected: /at most 2000 characters/ },
      {
        id: 7,
        goal: "[paste source text here]",
        taskKind: "review",
        expected: /Replace the example placeholder/,
      },
    ];
    for (const request of requests) {
      child.stdin.write(JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        method: "tools/call",
        params: {
          name: "petclaw_agent_run",
          arguments: {
            goal: request.goal,
            taskKind: request.taskKind,
            confirmCostCredits: 5,
          },
        },
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
      assert.ok(response, `missing MCP response ${request.id}`);
      assert.equal(response.result.isError, true);
      assert.match(response.result.content[0].text, request.expected);
    }
    assert.equal(requestCount, 0);
    assert.equal(fs.readFileSync(configPath, "utf8"), configText);
    assert.equal(fs.existsSync(`${configPath}.guard`), false);
    assert.equal(fs.existsSync(`${configPath}.guard.lock`), false);
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
        taskKind: requestBody.taskKind,
        ok: true,
        completed: true,
        answer: "Done.",
        steps: [{ skill: "summarize-page", ok: true }],
        stoppedReason: "completed",
        billing: {
          outcome: "charged",
          creditsCharged: 5,
          reason: "completed_with_successful_tool",
          successfulToolCalls: 1,
          failedToolCalls: 0,
          committedSideEffects: 0,
          usageKnown: true,
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
        arguments: { goal: "suggest one next step", taskKind: "draft", maxSteps: 4, confirmCostCredits: 5 },
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
      runId: undefined, goal: "suggest one next step", taskKind: "draft", maxSteps: 1, confirmCostCredits: 5,
    });
    assert.equal(JSON.parse(response.result.content[0].text).billing.creditsCharged, 5);
  } finally {
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("CLI and MCP treat HTTP 409 as definitive pre-debit rejection", async () => {
  let requestCount = 0;
  const server = http.createServer((req, res) => {
    requestCount += 1;
    req.resume();
    req.on("end", () => {
      res.writeHead(409, { "content-type": "application/json" });
      res.end(JSON.stringify({
        error: "Another paid run is active",
        code: "agent_run_in_progress",
      }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-paid-409-"));
  const configPath = path.join(temp, ".petclaw.json");
  try {
    fs.writeFileSync(configPath, JSON.stringify({
      serverUrl: origin,
      tokenOrigin: origin,
      petId: 7,
      token: "pck_test_owner_token",
    }), { mode: 0o600 });

    const cli = await runNode(
      "bin/petclaw.js",
      ["agent", "review", "this", "note", "--task", "review", "--confirm-cost", "5"],
      { HOME: temp },
    );
    assert.equal(cli.code, 1);
    assert.match(cli.stdout, /Another paid run is active/);
    assert.doesNotMatch(cli.stdout, /Outcome unknown/);
    assert.deepEqual(JSON.parse(fs.readFileSync(configPath, "utf8")).pendingAgentRuns, {});

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
        arguments: {
          goal: "review this note",
          taskKind: "review",
          maxSteps: 4,
          confirmCostCredits: 5,
        },
      },
    }) + "\n");
    const deadline = Date.now() + 3000;
    while (!stdout.includes('"id":1') && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    child.stdin.end();
    await new Promise((resolve) => child.on("close", resolve));
    const response = stdout.split("\n").filter(Boolean).map(JSON.parse)
      .find((line) => line.id === 1);
    assert.equal(response.result.isError, true);
    assert.match(response.result.content[0].text, /Another paid run is active/);
    assert.equal(response.result.structuredContent, undefined);
    assert.deepEqual(JSON.parse(fs.readFileSync(configPath, "utf8")).pendingAgentRuns, {});
    assert.equal(requestCount, 2);
  } finally {
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("MCP reconciliation replays the saved typed task instead of incoming arguments", async () => {
  const runId = randomUUID();
  let statusLookups = 0;
  let replayBody;
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      if (req.method === "GET" && req.url === `/api/pets/7/agent/runs/${runId}`) {
        statusLookups += 1;
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "not found" }));
        return;
      }
      replayBody = JSON.parse(raw);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        runId,
        state: "terminal",
        taskKind: "recall",
        ok: true,
        completed: true,
        answer: "Recalled.",
        steps: [{ skill: "recall_memory", ok: true }],
        stoppedReason: "completed",
        billing: {
          outcome: "charged",
          creditsCharged: 5,
          reason: "completed_with_successful_tool",
          usageKnown: true,
          modelCalls: 1,
        },
      }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-mcp-typed-replay-"));
  const configPath = path.join(temp, ".petclaw.json");
  try {
    fs.writeFileSync(configPath, JSON.stringify({
      serverUrl: origin,
      tokenOrigin: origin,
      petId: 7,
      token: "pck_test_owner_token",
    }), { mode: 0o600 });
    const journal = createPaidRunJournal(configPath);
    journal.claim({
      runId,
      petId: 7,
      goal: "What did I say about launch?",
      taskKind: "recall",
      maxSteps: 2,
      confirmCostCredits: 5,
      serverOrigin: origin,
      surface: "mcp",
      createdAt: new Date().toISOString(),
    });
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
        arguments: {
          goal: "Do not use this new input",
          taskKind: "draft",
          maxSteps: 6,
          confirmCostCredits: 5,
        },
      },
    }) + "\n");
    const deadline = Date.now() + 3000;
    while (!stdout.includes('"id":1') && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    child.stdin.end();
    await new Promise((resolve) => child.on("close", resolve));

    const response = stdout.split("\n").filter(Boolean).map(JSON.parse)
      .find((line) => line.id === 1);
    assert.equal(response.result.isError, undefined);
    assert.equal(response.result.structuredContent.newRunStarted, false);
    assert.match(response.result.structuredContent.reconciliationNotice, /Resumed and reconciled/);
    assert.equal(statusLookups, 2);
    assert.deepEqual(replayBody, {
      runId,
      goal: "What did I say about launch?",
      taskKind: "recall",
      maxSteps: 1,
      confirmCostCredits: 5,
    });
    assert.deepEqual(JSON.parse(fs.readFileSync(configPath, "utf8")).pendingAgentRuns, {});
  } finally {
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("CLI and MCP share one atomic paid-run claim across processes", async () => {
  let paidPostCount = 0;
  let releasePaidPost;
  const paidPostGate = new Promise((resolve) => { releasePaidPost = resolve; });
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", async () => {
      if (req.method === "GET" && /\/agent\/runs\/[0-9a-f-]+$/.test(req.url)) {
        const runId = req.url.split("/").pop();
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ runId, state: "running" }));
        return;
      }
      if (req.method !== "POST" || req.url !== "/api/pets/7/agent") {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "unexpected request" }));
        return;
      }
      paidPostCount += 1;
      const body = JSON.parse(raw);
      await paidPostGate;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        runId: body.runId,
        state: "terminal",
        taskKind: body.taskKind,
        ok: true,
        completed: true,
        answer: "One run only.",
        steps: [{ skill: "summarize-page", ok: true }],
        stoppedReason: "completed",
        billing: {
          outcome: "charged",
          creditsCharged: 5,
          reason: "completed_with_successful_tool",
          usageKnown: true,
          modelCalls: 1,
        },
        creditsRemaining: 95,
      }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-cross-process-paid-"));
  const configPath = path.join(temp, ".petclaw.json");
  try {
    fs.writeFileSync(configPath, JSON.stringify({
      serverUrl: origin,
      tokenOrigin: origin,
      petId: 7,
      token: "pck_test_owner_token",
      preservedSentinel: "keep-me",
    }), { mode: 0o600 });

    const cli = spawn(process.execPath, [
      "bin/petclaw.js",
      "agent",
      "cli",
      "concurrent",
      "goal",
      "--confirm-cost",
      "5",
      "--task",
      "review",
    ], {
      cwd: ROOT,
      env: { ...process.env, HOME: temp, NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let cliStdout = "";
    cli.stdout.on("data", (chunk) => { cliStdout += chunk; });
    const cliClosed = new Promise((resolve) => cli.on("close", (code) => resolve(code)));

    const mcp = spawn(process.execPath, ["mcp/server.js"], {
      cwd: ROOT,
      env: { ...process.env, HOME: temp, NO_COLOR: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let mcpStdout = "";
    mcp.stdout.on("data", (chunk) => { mcpStdout += chunk; });
    const mcpClosed = new Promise((resolve) => mcp.on("close", (code) => resolve(code)));
    mcp.stdin.write(JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "petclaw_agent_run",
        arguments: { goal: "mcp concurrent goal", taskKind: "review", maxSteps: 4, confirmCostCredits: 5 },
      },
    }) + "\n");

    const postDeadline = Date.now() + 3000;
    while (paidPostCount === 0 && Date.now() < postDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(paidPostCount, 1, "one claimant must reach the paid endpoint");
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.equal(paidPostCount, 1, "the losing process must not create another run ID");
    releasePaidPost();

    const responseDeadline = Date.now() + 3000;
    while (!mcpStdout.includes('"id":1') && Date.now() < responseDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    mcp.stdin.end();
    const [cliCode] = await Promise.all([cliClosed, mcpClosed]);
    const mcpResponse = mcpStdout.split("\n").filter(Boolean).map(JSON.parse)
      .find((line) => line.id === 1);
    assert.ok(mcpResponse);
    const cliSucceeded = cliCode === 0;
    const mcpSucceeded = mcpResponse.result.isError !== true;
    assert.notEqual(cliSucceeded, mcpSucceeded, "exactly one caller may own the paid run");

    const saved = JSON.parse(fs.readFileSync(configPath, "utf8"));
    assert.equal(saved.preservedSentinel, "keep-me");
    assert.deepEqual(saved.pendingAgentRuns, {});
    assert.equal(paidPostCount, 1);
    assert.match(
      cliStdout + JSON.stringify(mcpResponse),
      /Pending paid run|no validated terminal receipt|One run only/,
    );
  } finally {
    releasePaidPost();
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("CLI never looks up or replays a paid marker on another server origin", async () => {
  let requestCount = 0;
  const server = http.createServer((_req, res) => {
    requestCount += 1;
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "cross-origin marker must fail before HTTP" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const currentOrigin = `http://127.0.0.1:${port}`;
  const originalOrigin = "http://127.0.0.1:1";
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-cli-origin-bound-run-"));
  const configPath = path.join(temp, ".petclaw.json");
  try {
    for (const legacy of [false, true]) {
      const runId = randomUUID();
      const marker = {
        runId,
        petId: 7,
        goal: legacy ? "legacy originless goal" : "goal authorized on another origin",
        maxSteps: 4,
        confirmCostCredits: 5,
        surface: "cli",
        createdAt: new Date().toISOString(),
        ...(legacy ? {} : {
          serverOrigin: originalOrigin,
          journalVersion: 2,
          journalNonce: randomUUID(),
        }),
      };
      fs.writeFileSync(configPath, JSON.stringify({
        serverUrl: currentOrigin,
        tokenOrigin: currentOrigin,
        petId: 7,
        token: "pck_test_owner_token",
        pendingAgentRuns: { [runId]: marker },
      }), { mode: 0o600 });

      const result = await runNode(
        "bin/petclaw.js",
        ["agent-status", runId],
        { HOME: temp },
      );
      assert.equal(result.code, 1);
      assert.match(
        result.stdout + result.stderr,
        legacy ? /no trusted server-origin binding/ : /bound to .*not the current server/,
      );
      assert.equal(requestCount, 0);
      const saved = JSON.parse(fs.readFileSync(configPath, "utf8"));
      assert.deepEqual(saved.pendingAgentRuns[runId], marker);
    }
  } finally {
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("MCP never looks up or replays a paid marker on another server origin", async () => {
  let requestCount = 0;
  const server = http.createServer((_req, res) => {
    requestCount += 1;
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "cross-origin marker must fail before HTTP" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const currentOrigin = `http://127.0.0.1:${port}`;
  const runId = randomUUID();
  const marker = {
    runId,
    petId: 7,
    goal: "goal authorized on another origin",
    maxSteps: 4,
    confirmCostCredits: 5,
    serverOrigin: "http://127.0.0.1:1",
    surface: "mcp",
    createdAt: new Date().toISOString(),
    journalVersion: 2,
    journalNonce: randomUUID(),
  };
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-mcp-origin-bound-run-"));
  const configPath = path.join(temp, ".petclaw.json");
  try {
    fs.writeFileSync(configPath, JSON.stringify({
      serverUrl: currentOrigin,
      tokenOrigin: currentOrigin,
      petId: 7,
      token: "pck_test_owner_token",
      pendingAgentRuns: { [runId]: marker },
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
        arguments: { goal: "must not replace the old goal", taskKind: "review", maxSteps: 4, confirmCostCredits: 5 },
      },
    }) + "\n");
    const deadline = Date.now() + 3000;
    while (!stdout.split("\n").some((line) => line.includes('"id":1')) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    child.stdin.end();
    await new Promise((resolve) => child.on("close", resolve));

    const response = stdout.split("\n").filter(Boolean).map(JSON.parse).find((line) => line.id === 1);
    assert.equal(response.result.isError, true);
    assert.match(response.result.content[0].text, /bound to .*not the current server/);
    assert.equal(requestCount, 0);
    const saved = JSON.parse(fs.readFileSync(configPath, "utf8"));
    assert.deepEqual(saved.pendingAgentRuns[runId], marker);
  } finally {
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("shared config writers cannot switch server origin while a paid marker is pending", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-config-origin-bound-run-"));
  const configPath = path.join(temp, ".petclaw.json");
  const originalOrigin = "https://app.myaipet.ai";
  const otherOrigin = "https://other.petclaw.example";
  try {
    fs.writeFileSync(configPath, JSON.stringify({
      serverUrl: originalOrigin,
      tokenOrigin: originalOrigin,
      petId: 7,
      token: "pck_test_owner_token",
    }), { mode: 0o600 });
    const journal = createPaidRunJournal(configPath);
    const claimed = journal.claim({
      runId: randomUUID(),
      petId: 7,
      goal: "keep this authorization on its original server",
      taskKind: "review",
      maxSteps: 4,
      confirmCostCredits: 5,
      serverOrigin: originalOrigin,
      surface: "cli",
      createdAt: new Date().toISOString(),
    });
    assert.equal(claimed.kind, "started");

    assert.throws(
      () => journal.replaceConfigPreservingJournal({
        serverUrl: otherOrigin,
        tokenOrigin: otherOrigin,
        petId: 7,
        token: "pck_other_owner_token",
      }),
      /Cannot change PetClaw server while paid run/,
    );
    const unchanged = JSON.parse(fs.readFileSync(configPath, "utf8"));
    assert.equal(unchanged.serverUrl, originalOrigin);
    assert.equal(unchanged.pendingAgentRuns[claimed.marker.runId].serverOrigin, originalOrigin);

    const sameOrigin = journal.replaceConfigPreservingJournal({
      ...unchanged,
      preferredProvider: "nous",
    });
    assert.equal(sameOrigin.preferredProvider, "nous");
    assert.equal(sameOrigin.pendingAgentRuns[claimed.marker.runId].serverOrigin, originalOrigin);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("shared journal refuses every new paid marker without one valid typed task", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-typed-journal-"));
  const configPath = path.join(temp, ".petclaw.json");
  const original = {
    serverUrl: "https://app.myaipet.ai",
    tokenOrigin: "https://app.myaipet.ai",
    petId: 7,
    token: "pck_test_owner_token",
  };
  try {
    fs.writeFileSync(configPath, JSON.stringify(original), { mode: 0o600 });
    const journal = createPaidRunJournal(configPath);
    for (const taskKind of [undefined, "", "browse", "RECALL"]) {
      assert.throws(() => journal.claim({
        runId: randomUUID(),
        petId: 7,
        goal: "review this input",
        taskKind,
        maxSteps: 4,
        confirmCostCredits: 5,
        serverOrigin: original.serverUrl,
        surface: "cli",
        createdAt: new Date().toISOString(),
      }), /invalid paid-run safety marker/);
    }
    for (const { goal, taskKind } of [
      { goal: "1234567", taskKind: "recall" },
      { goal: "s".repeat(39), taskKind: "summarize" },
      { goal: "r".repeat(11), taskKind: "review" },
      { goal: "d".repeat(19), taskKind: "draft" },
      { goal: "x".repeat(2_001), taskKind: "review" },
      { goal: "[paste source text here]", taskKind: "review" },
    ]) {
      assert.throws(() => journal.claim({
        runId: randomUUID(),
        petId: 7,
        goal,
        taskKind,
        maxSteps: 1,
        confirmCostCredits: 5,
        serverOrigin: original.serverUrl,
        surface: "cli",
        createdAt: new Date().toISOString(),
      }), /invalid paid-run safety marker/);
    }
    assert.deepEqual(JSON.parse(fs.readFileSync(configPath, "utf8")), original);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("shared journal never persists a secret-bearing typed task", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-secret-journal-"));
  const configPath = path.join(temp, ".petclaw.json");
  const configText = JSON.stringify({
    serverUrl: "https://app.myaipet.ai",
    tokenOrigin: "https://app.myaipet.ai",
    petId: 7,
    token: "pck_test_owner_token",
    preservedSentinel: "unchanged",
  });
  try {
    fs.writeFileSync(configPath, configText, { mode: 0o600 });
    const journal = createPaidRunJournal(configPath);
    assert.throws(() => journal.claim({
      runId: randomUUID(),
      petId: 7,
      goal: "Review password: this-is-a-real-password-value",
      taskKind: "review",
      maxSteps: 1,
      confirmCostCredits: 5,
      serverOrigin: "https://app.myaipet.ai",
      surface: "cli",
      createdAt: new Date().toISOString(),
    }), /invalid paid-run safety marker/);
    assert.equal(fs.readFileSync(configPath, "utf8"), configText);
    assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(configPath, "utf8")), "pendingAgentRuns"), false);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("shared journal removes only the exact unchanged paid marker", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-exact-marker-removal-"));
  const configPath = path.join(temp, ".petclaw.json");
  const origin = "https://app.myaipet.ai";
  try {
    fs.writeFileSync(configPath, JSON.stringify({
      serverUrl: origin,
      tokenOrigin: origin,
      petId: 7,
      token: "pck_test_owner_token",
    }), { mode: 0o600 });
    const journal = createPaidRunJournal(configPath);
    const claimed = journal.claim({
      runId: randomUUID(),
      petId: 7,
      goal: "the exact authorized goal",
      taskKind: "review",
      maxSteps: 4,
      confirmCostCredits: 5,
      serverOrigin: origin,
      surface: "cli",
      createdAt: new Date().toISOString(),
    });
    assert.equal(claimed.kind, "started");

    const altered = JSON.parse(fs.readFileSync(configPath, "utf8"));
    altered.pendingAgentRuns[claimed.marker.runId].goal = "a different goal";
    fs.writeFileSync(configPath, JSON.stringify(altered), { mode: 0o600 });
    assert.throws(
      () => journal.remove(claimed.marker),
      /changed; refusing stale removal/,
    );
    const retained = JSON.parse(fs.readFileSync(configPath, "utf8"));
    assert.equal(
      retained.pendingAgentRuns[claimed.marker.runId].goal,
      "a different goal",
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("shared journal safely recovers an abandoned stale process lock", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-stale-journal-lock-"));
  const configPath = path.join(temp, ".petclaw.json");
  const original = {
    serverUrl: "https://app.myaipet.ai",
    tokenOrigin: "https://app.myaipet.ai",
    petId: 7,
    token: "pck_test_owner_token",
    preservedSentinel: "unchanged",
  };
  try {
    fs.writeFileSync(configPath, JSON.stringify(original), { mode: 0o600 });
    const journal = createPaidRunJournal(configPath);
    assert.deepEqual(journal.listAll(), []);
    const abandonedLock = `${configPath}.guard.lock`;
    fs.mkdirSync(abandonedLock);
    const staleAt = new Date(Date.now() - 20_000);
    fs.utimesSync(abandonedLock, staleAt, staleAt);

    assert.deepEqual(journal.listAll(), []);
    assert.equal(fs.existsSync(abandonedLock), false);
    assert.deepEqual(JSON.parse(fs.readFileSync(configPath, "utf8")), original);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("MCP fails closed when the shared paid-run journal becomes unreadable", async () => {
  let requestCount = 0;
  const server = http.createServer((_req, res) => {
    requestCount += 1;
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "corrupt journal must block before HTTP" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-mcp-corrupt-journal-"));
  const configPath = path.join(temp, ".petclaw.json");
  try {
    fs.writeFileSync(configPath, JSON.stringify({
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
      method: "initialize",
      params: {},
    }) + "\n");
    const initDeadline = Date.now() + 3000;
    while (!stdout.includes('"id":1') && Date.now() < initDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    fs.writeFileSync(configPath, '{"pendingAgentRuns":', { mode: 0o600 });
    child.stdin.write(JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "petclaw_agent_run",
        arguments: { goal: "must not post", taskKind: "review", maxSteps: 4, confirmCostCredits: 5 },
      },
    }) + "\n");
    const responseDeadline = Date.now() + 3000;
    while (!stdout.includes('"id":2') && Date.now() < responseDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    child.stdin.end();
    await new Promise((resolve) => child.on("close", resolve));
    const response = stdout.split("\n").filter(Boolean).map(JSON.parse)
      .find((line) => line.id === 2);
    assert.equal(response.result.isError, true);
    assert.match(response.result.content[0].text, /Cannot safely read/);
    assert.equal(requestCount, 0);
    assert.equal(fs.readFileSync(configPath, "utf8"), '{"pendingAgentRuns":');
  } finally {
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("MCP keeps the paid-run marker when an HTTP 200 settlement body is malformed", async () => {
  let requestCount = 0;
  const server = http.createServer((req, res) => {
    requestCount += 1;
    req.resume();
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"runId":');
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-mcp-malformed-receipt-"));
  const configPath = path.join(temp, ".petclaw.json");
  try {
    fs.writeFileSync(configPath, JSON.stringify({
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
        arguments: { goal: "preserve the receipt", taskKind: "review", maxSteps: 4, confirmCostCredits: 5 },
      },
    }) + "\n");
    const deadline = Date.now() + 3000;
    while (!stdout.split("\n").some((line) => line.includes('"id":1')) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    child.stdin.end();
    await new Promise((resolve) => child.on("close", resolve));

    const response = stdout.split("\n").filter(Boolean).map(JSON.parse).find((line) => line.id === 1);
    assert.equal(response.result.isError, true);
    assert.equal(response.result.structuredContent.state, "pending_reconciliation");
    assert.equal(response.result.structuredContent.retryable, false);
    const saved = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const pending = Object.values(saved.pendingAgentRuns || {});
    assert.equal(pending.length, 1);
    assert.equal(pending[0].runId, response.result.structuredContent.runId);
    assert.equal(pending[0].serverOrigin, origin);
    assert.equal(requestCount, 1);
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

test("MCP recall keeps safe developer security vocabulary and filters concrete credentials", async () => {
  const requests = [];
  const unsafeRecallValues = [
    ["extension", ["pex_", "P".repeat(32)].join("")],
    ["github", ["ghu_", "G".repeat(32)].join("")],
    ["private-key", ["-----BEGIN", "PGP PRIVATE KEY BLOCK----- material"].join(" ")],
    ["database", ["postgresql", "://owner:credential-pass", "@database/private"].join("")],
    ["signed-url", ["https://objects.example/file?X-Amz-Signature=", "S".repeat(32)].join("")],
    ["cookie", "Cookie: session=private; csrf=private-too"],
    ["mnemonic", "mnemonic: zephyr amber cobalt delta ember fjord galaxy harbor ivory juniper kestrel lantern"],
    ["session-token", ["AWS_SESSION_TOKEN", "=", "N".repeat(40)].join("")],
    ["stripe", ["STRIPE_SECRET_KEY", "=", "sk_live_", "O".repeat(32)].join("")],
    ["password", "password=P@ssw0rd!still-secret$tail"],
    ["localized-code", "\uC778\uC99D\uCF54\uB4DC 87654321"],
  ];
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    req.resume();
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        memories: [
          { key: "pricing", content: "Compare API token pricing before the next release.", importance: 3 },
          { key: "rotation", content: "Document the API token rotation policy for developers.", importance: 2 },
          { key: "guide", content: "Review the secret management guide with the platform team.", importance: 2 },
          { key: "dotnet", content: "Review Microsoft.Extensions.Configuration naming with the SDK team.", importance: 2 },
          { key: "launch_priority", content: "Ship the billing ledger first.", importance: 3 },
          {
            key: "credential",
            content: ["api_key: sk", "supersecret123456789"].join("-"),
            importance: 5,
          },
          ...unsafeRecallValues.map(([key, content]) => ({ key, content, importance: 5 })),
        ],
        userProfile: [],
        sessions: [],
      }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "petclaw-mcp-recall-vocabulary-"));
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
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: {
        name: "petclaw_memory_recall",
        arguments: {
          query: "token pricing rotation policy secret management guide Microsoft.Extensions.Configuration priorities",
          limit: 10,
        },
      },
    }) + "\n");
    const deadline = Date.now() + 3000;
    while (!stdout.split("\n").some((line) => line.includes('"id":1')) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    child.stdin.end();
    await new Promise((resolve) => child.on("close", resolve));
    const responses = stdout.split("\n").filter(Boolean).map(JSON.parse);
    const pricing = responses.find((line) => line.id === 1);
    assert.equal(pricing.result.isError, undefined);
    assert.match(pricing.result.content[0].text, /token pricing/);
    assert.match(pricing.result.content[0].text, /token rotation policy/);
    assert.match(pricing.result.content[0].text, /secret management guide/);
    assert.match(pricing.result.content[0].text, /Microsoft\.Extensions\.Configuration/);
    assert.match(pricing.result.content[0].text, /Ship the billing ledger first/);
    assert.doesNotMatch(pricing.result.content[0].text, /supersecret/);
    for (const [_key, unsafe] of unsafeRecallValues) {
      assert.equal(
        pricing.result.content[0].text.includes(unsafe),
        false,
        `MCP recall leaked unsafe retained text: ${unsafe}`,
      );
    }
    assert.equal(requests.length, 1);
  } finally {
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
