#!/usr/bin/env node

/**
 * PetClaw CLI
 * Quick commands to interact with any PetClaw server
 *
 * Usage:
 *   npx @myaipet/petclaw-sdk init              → Setup new project
 *   npx @myaipet/petclaw-sdk chat "hello"      → Chat with pet
 *   npx @myaipet/petclaw-sdk skills            → List available skills
 *   npx @myaipet/petclaw-sdk install <skillId> → Install skill
 *   npx @myaipet/petclaw-sdk execute <skillId> → Run a skill (typed input: --json-stdin)
 *   npx @myaipet/petclaw-sdk agent "goal" --confirm-cost 5 → Run a paid bounded goal
 *   npx @myaipet/petclaw-sdk export            → Export SOUL data
 *   npx @myaipet/petclaw-sdk discover          → Find pets on network
 *   npx @myaipet/petclaw-sdk mcp               → Start MCP server
 *   npx @myaipet/petclaw-sdk status            → Server health check
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { Writable } = require("stream");
const { randomUUID } = require("crypto");
const { verifySoulExport } = require("../dist/protocol.js");

// SCRUM-108: single source of truth for the version — read it from the
// package's own package.json so the banner can never drift from the published
// npm version. Fall back gracefully if the file can't be read.
const PKG = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
  } catch {
    return {};
  }
})();
const SDK_VERSION = PKG.version || "0.0.0";

// ── Config ──
const CONFIG_FILE = path.join(process.env.HOME || process.env.USERPROFILE || ".", ".petclaw.json");
let config = {
  serverUrl: "https://app.myaipet.ai",
  petId: null,
};
let persistedToken;
let tokenFromEnv = false;
let configWarning = "";

function normalizeServerUrl(raw) {
  const parsed = new URL(String(raw || ""));
  const loopback = parsed.hostname === "localhost"
    || parsed.hostname === "127.0.0.1"
    || parsed.hostname === "::1"
    || parsed.hostname === "[::1]";
  if (parsed.username || parsed.password) throw new Error("server URL must not contain credentials");
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) {
    throw new Error("server URL must use HTTPS (HTTP is allowed only for loopback development)");
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("server URL must be an origin without a path, query, or fragment");
  }
  return parsed.origin;
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) };
      try {
        config.serverUrl = normalizeServerUrl(config.serverUrl);
      } catch {
        config.serverUrl = "https://app.myaipet.ai";
        delete config.token;
        delete config.tokenOrigin;
        configWarning = "Ignored an invalid server URL and its saved token; run `petclaw-sdk auth` again.";
      }
      if (config.token) {
        if (!config.tokenOrigin || config.tokenOrigin !== config.serverUrl) {
          delete config.token;
          delete config.tokenOrigin;
          configWarning = "Ignored an unbound or cross-origin saved token; run `petclaw-sdk auth` again.";
        } else {
          persistedToken = config.token;
        }
      }
      // Personal access tokens are stored in this file. Repair permissive
      // permissions left by older CLI versions before doing anything else.
      if (process.platform !== "win32" && (fs.statSync(CONFIG_FILE).mode & 0o077) !== 0) {
        fs.chmodSync(CONFIG_FILE, 0o600);
      }
    }
  } catch {}
  // Ephemeral override for CI/containers. It is never written unless the user
  // explicitly runs `auth`.
  if (process.env.PETCLAW_TOKEN) {
    config.token = process.env.PETCLAW_TOKEN.trim();
    tokenFromEnv = true;
  }
  if (configWarning) process.stderr.write(`[petclaw] ${configWarning}\n`);
}

function saveConfig() {
  const saved = { ...config };
  if (tokenFromEnv) {
    if (persistedToken) saved.token = persistedToken;
    else delete saved.token;
  }
  const temp = `${CONFIG_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(saved, null, 2), { mode: 0o600 });
  if (process.platform !== "win32") fs.chmodSync(temp, 0o600);
  fs.renameSync(temp, CONFIG_FILE);
  if (process.platform !== "win32") fs.chmodSync(CONFIG_FILE, 0o600);
}

function rememberPendingAgentRun(run) {
  const pending = config.pendingAgentRuns && typeof config.pendingAgentRuns === "object"
    ? config.pendingAgentRuns : {};
  config.pendingAgentRuns = { ...pending, [run.runId]: run };
  saveConfig();
}

function forgetPendingAgentRun(runId) {
  if (!config.pendingAgentRuns || typeof config.pendingAgentRuns !== "object") return;
  delete config.pendingAgentRuns[runId];
  saveConfig();
}

/**
 * Stable, non-secret installation id used only to keep one CLI installation's
 * raw chat session separate from another installation controlling the same
 * pet. It is created lazily so read-only `--help` never writes config.
 */
function ensureClientId() {
  const existing = typeof config.clientId === "string" ? config.clientId.trim() : "";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing)) {
    return existing;
  }
  config.clientId = randomUUID();
  saveConfig();
  return config.clientId;
}

// ── HTTP helper ──
// The bounded agent loop has a 60s server wall clock. Keep the default client
// deadline above it so a successful paid run is not abandoned before receipt.
const HTTP_TIMEOUT_MS = Math.max(1000, Number(process.env.PETCLAW_TIMEOUT_MS) || 75000);
const HTTP_MAX_BYTES = 2 * 1024 * 1024;
const SOUL_MAX_BYTES = 16 * 1024 * 1024;

class ApiError extends Error {
  constructor(message, status, body, retryAfter) {
    super(message);
    this.name = "PetClawApiError";
    this.status = status || 0;
    this.body = body;
    this.retryAfter = retryAfter || null;
  }
}

function fetchJSON(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    let url;
    try { url = new URL(urlStr); }
    catch { reject(new ApiError(`Invalid URL: ${urlStr}`, 0)); return; }
    const mod = url.protocol === "https:" ? https : http;
    const body = options.body ? JSON.stringify(options.body) : null;
    let settled = false;
    const maxBytes = options.maxBytes ?? HTTP_MAX_BYTES;

    const req = mod.request(url, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        // Owner auth for endpoints like /api/petclaw/models. `petclaw-sdk auth`
        // reads the token through a hidden prompt.
        ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
      },
    }, (res) => {
      let data = "";
      let bytes = 0;
      res.on("error", (e) => reject(e instanceof ApiError ? e : new ApiError(`Response failed: ${e.message}`, res.statusCode)));
      res.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > maxBytes) {
          settled = true;
          res.destroy(new ApiError(`Response exceeded ${maxBytes} bytes`, res.statusCode));
          return;
        }
        data += chunk;
      });
      res.on("end", () => {
        if (settled) return;
        let parsed;
        try { parsed = data ? JSON.parse(data) : {}; }
        catch { return reject(new ApiError(`Invalid JSON from ${urlStr} (HTTP ${res.statusCode || 0})`, res.statusCode)); }
        // Expose the HTTP status (non-enumerable so it never leaks into a
        // JSON.stringify of outputs) — lets callers tell 401/404/5xx apart.
        if (parsed && typeof parsed === "object") {
          Object.defineProperty(parsed, "__status", { value: res.statusCode, enumerable: false });
        }
        if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
          const message = parsed?.error || parsed?.detail || parsed?.message || `HTTP ${res.statusCode}`;
          return reject(new ApiError(String(message), res.statusCode, parsed, res.headers["retry-after"]));
        }
        resolve(parsed);
      });
    });

    req.setTimeout(HTTP_TIMEOUT_MS, () => {
      req.destroy(new ApiError(`Request timed out after ${HTTP_TIMEOUT_MS}ms`, 0));
    });
    req.on("error", (e) => {
      if (e instanceof ApiError) reject(e);
      else reject(new ApiError(`Connection failed: ${e.message}`, 0));
    });
    if (body) req.write(body);
    req.end();
  });
}

function api(endpoint, options) {
  return fetchJSON(`${config.serverUrl}${endpoint}`, options);
}

const AGENT_RECEIPT_404_RECHECK_MS = 150;

async function agentRunStatusWithNotFoundRecheck(petId, runId) {
  const endpoint = `/api/pets/${petId}/agent/runs/${runId}`;
  try {
    return await api(endpoint);
  } catch (error) {
    if (error?.status !== 404) throw error;
  }
  await new Promise((resolve) => setTimeout(resolve, AGENT_RECEIPT_404_RECHECK_MS));
  return api(endpoint);
}

/** Read a secret without placing it in argv or echoing it to a terminal. */
function readSecret(prompt) {
  if (!process.stdin.isTTY) {
    return new Promise((resolve, reject) => {
      let value = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => { value += chunk; });
      process.stdin.on("end", () => resolve(value.trim()));
      process.stdin.on("error", reject);
    });
  }
  return new Promise((resolve) => {
    let muted = false;
    const output = new Writable({
      write(chunk, _encoding, callback) {
        if (!muted) process.stdout.write(chunk);
        callback();
      },
    });
    const rl = readline.createInterface({ input: process.stdin, output, terminal: true });
    process.stdout.write(prompt);
    muted = true;
    rl.question("", (answer) => {
      muted = false;
      rl.close();
      process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

function readJsonStdin(maxBytes = 4 * 1024) {
  if (process.stdin.isTTY) {
    return Promise.reject(new Error("--json-stdin requires piped JSON on standard input"));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    process.stdin.on("data", (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      bytes += buffer.byteLength;
      if (bytes > maxBytes) {
        process.stdin.pause();
        reject(new Error(`JSON skill input exceeds ${maxBytes} bytes`));
        return;
      }
      chunks.push(buffer);
    });
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8").trim()));
    process.stdin.on("error", reject);
  });
}

// ── Styled output ──
// Respect NO_COLOR and non-TTY (piped) output — emit plain text then.
const USE_COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (USE_COLOR ? `\x1b[${code}m${s}\x1b[0m` : `${s}`);
const C = {
  gold: paint("33"),
  green: paint("32"),
  red: paint("31"),
  dim: paint("2"),
  bold: paint("1"),
  cyan: paint("36"),
  amber: paint("38;5;214"),    // 256-color warm gold
  bamber: paint("1;38;5;214"), // bold warm gold
  muted: paint("38;5;244"),
};

// SCRUM-106: a failed or unrecognized command must exit non-zero. `fail()`
// prints the error line AND flips the process exit code so scripts/CI notice.
// (Decorative red — e.g. the "○ offline" dot or the doctor summary — is NOT an
// error and doesn't use this.)
function fail(line) {
  process.exitCode = 1;
  console.log(line);
}

const ART = [
  "  ____  _____ _____ ____ _        ___        __",
  " |  _ \\| ____|_   _/ ___| |      / \\ \\      / /",
  " | |_) |  _|   | || |   | |     / _ \\ \\ /\\ / / ",
  " |  __/| |___  | || |___| |___ / ___ \\ V  V /  ",
  " |_|   |_____| |_| \\____|_____/_/   \\_\\_/\\_/   ",
];

const MCP_TOOLS = [
  ["petclaw_chat", "memory-aware chat"],
  ["petclaw_agent_run", "PAID 5 credits · requires confirmCostCredits=5"],
  ["petclaw_persona_mirror", "mirror your tone across platforms"],
  ["petclaw_memory_recall", "retrieve past context"],
  ["petclaw_summarize_page", "summarize a page in your pet's voice"],
  ["petclaw_soul_export", "portable SOUL (SHA-256)"],
  ["petclaw_discover_pets", "find pets on the network"],
];
const SKILLS = "companion-chat · daily-mood · daydream · pet-thought · pet-diary · vibe-check · persona-mirror · pet-date · image-gen · video-gen · memory-recall · memory-consolidate · summarize-page · soul-export · soul-import · consent-manage · evolve · memory-anchor";
// Connector registry summary — mirrors the platform's AVAILABLE_CONNECTORS
// (web: src/lib/petclaw/connectors/index.ts, 19 entries). The total is DERIVED
// from this breakdown so the headline number can never drift from it again
// (the old banner hardcoded "21" next to a breakdown that summed to 19).
const CONNECTOR_CATEGORIES = [
  ["messaging", 8],    // telegram · twitter/x · discord · slack · whatsapp · line · instagram · gmail
  ["productivity", 3], // notion · google-calendar · github
  ["media", 2],        // spotify · youtube
  ["knowledge", 4],    // web-search · brave-search · wikipedia · enhanced-memory
  ["crypto", 2],       // coingecko · bscscan
];
const CONNECTOR_COUNT = CONNECTOR_CATEGORIES.reduce((n, [, c]) => n + c, 0);
const CONNECTORS = CONNECTOR_CATEGORIES.map(([k, c]) => `${k}(${c})`).join(" · ");

// VIGIL — the platform's retained-memory capabilities. Some stages are
// conditional (for example CHORUS is opt-in), so the CLI must not imply that
// all five run synchronously on every surface.
const HARNESS = [
  ["memory-ledger", "retained facts + owner-editable profile"],
  ["session-log", "cross-surface conversation continuity"],
  ["feedback", "best-effort signal from the next owner turn"],
  ["self-learn", "recurring-topic patterns (not executable code)"],
  ["chorus", "optional best-of-N response selection"],
];

const rule = (ch) => C.muted("  " + (ch || "─").repeat(58));
function head(title, note) {
  console.log("");
  console.log("  " + C.bamber("▸ " + title) + (note ? C.muted("   " + note) : ""));
}

function banner() {
  console.log("");
  console.log(rule("━"));
  for (const l of ART) console.log("  " + C.amber(l));
  console.log("  " + C.muted("   your AI pet — sovereign · portable · agent-callable"));
  console.log(rule("━"));
  console.log("  " + C.bamber("PetClaw Protocol v1") + C.muted(`   SDK v${SDK_VERSION} · MIT · petclaw-sdk mcp`));

  head("MCP tools", "owner-authenticated · 7");
  for (const [k, v] of MCP_TOOLS) console.log("    " + C.cyan(k.padEnd(24)) + C.muted(v));

  head("Skills", "18 manifests · execution mode shown by the API");
  console.log("    " + C.muted(SKILLS));

  head("VIGIL", "portable memory + learning controls");
  for (const [k, v] of HARNESS) console.log("    " + C.cyan(k.padEnd(15)) + C.muted(v));

  head("Network", "public discovery preview · cross-pet invocation is launch-disabled");

  head("Connector registry", `${CONNECTOR_COUNT} registered · availability varies by deployment`);
  console.log("    " + C.muted(CONNECTORS));

  console.log("");
  console.log(rule());
  console.log("  " + C.muted(`${CONNECTOR_COUNT} registered connectors · 18 skill manifests · 7 MCP tools   `) + C.cyan("/help"));
  console.log("");
}

// ── Commands ──

// BYO providers (API-KEY only — these providers don't offer OAuth for inference).
// Platform routing is server-managed and can change without a CLI release.
const BYO_PROVIDERS = [
  ["openai", "OpenAI / GPT"],
  ["anthropic", "Anthropic / Claude"],
  ["google", "Google / Gemini"],
  ["openrouter", "OpenRouter — any model, one key"],
  ["nous", "Nous Research / Hermes"],
  ["xai", "xAI / Grok (your own key)"],
];

// Fetch the caller's own pets. Authentication/network failures remain distinct
// from a valid account with zero pets; callers decide how to present each case.
async function fetchMyPets() {
  if (!config.token) return [];
  const d = await api("/api/pets");
  if (!Array.isArray(d.pets)) throw new ApiError("Invalid owned-pets response", d.__status || 0, d);
  return d.pets;
}

// The pet THIS CLI is pointed at, resolved from your owner-scoped pet list.
// Returns null if there's no token or the active id isn't among your pets.
async function fetchActivePet() {
  let pets;
  try {
    pets = await fetchMyPets();
  } catch (error) {
    fail(C.red(`    ✗ Could not verify that token against ${config.serverUrl}: ${error.message}`));
    return null;
  }
  return pets.find((p) => p.id === config.petId) || null;
}

async function cmdInit() {
  banner();
  console.log("  " + C.bamber("◆ Welcome.") + C.muted("  Let's connect this CLI to your pet — 4 quick steps.\n"));

  let muted = false;
  const initOutput = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) process.stdout.write(chunk);
      callback();
    },
  });
  const rl = readline.createInterface({ input: process.stdin, output: initOutput, terminal: true });
  const ask = (q) => new Promise((r) => rl.question(q, r));
  const askSecret = (q) => new Promise((r) => {
    process.stdout.write(q);
    muted = true;
    rl.question("", (answer) => {
      muted = false;
      process.stdout.write("\n");
      r(answer);
    });
  });

  // ── Step 1 — server ──
  console.log("  " + C.amber("Step 1/4") + C.muted("   which PetClaw server hosts your pet"));
  console.log("    " + C.dim("Press ") + C.cyan("Enter") + C.dim(" for the official platform — only change this if you self-host PetClaw."));
  const url = await ask("    " + C.dim("Server ") + C.gold(`[${config.serverUrl}]`) + C.dim("  (Enter = current)") + " ❯ ");
  if (url.trim()) {
    let nextOrigin;
    try {
      nextOrigin = normalizeServerUrl(url.trim());
    } catch (error) {
      fail(C.red(`    ✗ ${error.message}`));
      rl.close();
      return;
    }
    if (nextOrigin !== config.serverUrl) {
      delete config.token;
      delete config.tokenOrigin;
      persistedToken = undefined;
    }
    config.serverUrl = nextOrigin;
  }

  // ── Step 2 — authenticate (so we can match YOUR pet, not a guessed id) ──
  console.log("\n  " + C.amber("Step 2/4") + C.muted("   authenticate this CLI"));
  console.log("    " + C.dim("Generate a token in the web app: ") + C.bamber(`${config.serverUrl}/?section=sovereignty`) + C.dim(" → ") + C.cyan("Connect your CLI"));
  console.log("    " + C.dim("Paste it here (starts with ") + C.cyan("pck_") + C.dim("), or press Enter to skip and add it later with ") + C.cyan("auth") + C.dim("."));
  const tok = process.env.PETCLAW_TOKEN || await askSecret("    " + C.dim("CLI token (hidden) ") + C.gold("[skip]") + " ❯ ");
  if (tok.trim()) {
    if (!tok.trim().startsWith("pck_")) {
      fail(C.red("    ✗ Invalid CLI token (expected pck_ prefix)."));
      rl.close();
      return;
    }
    config.token = tok.trim();
    config.tokenOrigin = config.serverUrl;
  }
  if (!config.token) {
    fail(C.red("    ✗ A CLI token is required to bind setup to a pet you own."));
    console.log(C.dim("      Generate one in Connect your CLI, or use `petclaw-sdk demo \"hello\"` without setup."));
    rl.close();
    return;
  }

  // ── Step 3 — pick your pet (from the server, scoped to your token) ──
  console.log("\n  " + C.amber("Step 3/4") + C.muted("   which pet"));
  let pets;
  try {
    pets = await fetchMyPets();
  } catch (error) {
    fail(C.red(`    ✗ Could not verify that token against ${config.serverUrl}: ${error.message}`));
    console.log(C.dim("      No config was saved. Check the server and token, then run init again."));
    rl.close();
    return;
  }
  if (pets.length) {
    pets.forEach((p, i) =>
      console.log("    " + C.cyan(`${i + 1})`) + " " + String(p.name || `Pet ${p.id}`).padEnd(20) + C.dim(`#${p.id}  Lv.${p.level ?? "?"}`))
    );
    const psel = await ask("    " + C.dim("Pick ") + C.gold("[1]") + " ❯ ");
    const pidx = Math.min(Math.max(parseInt(psel.trim() || "1") || 1, 1), pets.length) - 1;
    config.petId = pets[pidx].id;
    console.log("    " + C.green("✓") + C.muted(` Matched ${pets[pidx].name || `pet #${config.petId}`} (#${config.petId})`));
  } else {
    fail(C.red("    ✗ No owned pets were returned. Check the server/token or adopt a pet in the web app."));
    rl.close();
    return;
  }

  // ── Step 4 — model: platform default now, or bring your own key ──
  console.log("\n  " + C.amber("Step 4/4") + C.muted("   which model powers it  ") + C.dim("(your chat · agent reasoning · best-of-N judging)"));
  console.log("    " + C.cyan("1)") + " " + "Platform route".padEnd(18) + C.dim("start now · no key · provider selected server-side"));
  console.log("    " + C.cyan("2)") + " " + "Your own model".padEnd(18) + C.dim("bring an API key — your model, your key, encrypted"));
  const mpick = await ask("    " + C.dim("Choose ") + C.gold("[1]") + " ❯ ");
  const wantsOwn = mpick.trim() === "2";
  // Selection 2 only schedules the real `models connect` command below. Never
  // claim a provider is active before the server accepts and stores its key.
  delete config.preferredProvider;

  rl.close();
  saveConfig();

  console.log("");
  if (wantsOwn) {
    console.log("    " + C.green("✓") + C.muted(" To connect your own model (API key — providers don't offer OAuth for inference):"));
    if (!config.token) console.log("      " + C.cyan("petclaw-sdk auth") + C.dim("   ← paste the token into the hidden prompt"));
    console.log("      " + C.cyan("petclaw-sdk models connect <provider>") + C.dim("   ← key is requested in a hidden prompt"));
    console.log("      " + C.dim("providers: ") + BYO_PROVIDERS.map(([slug]) => slug).join(" · "));
  } else {
    console.log("    " + C.green("✓") + C.muted(" Using the platform-managed route. Bring your own model anytime: ") + C.cyan("petclaw-sdk models connect"));
  }
  console.log("    " + C.green("✓") + C.muted(" Config saved to ~/.petclaw.json"));

  await cmdWelcome();
}

// ── welcome: the "you're ready" screen (model + capabilities + what to do) ──
async function cmdWelcome() {
  console.log("");
  console.log(rule("━"));
  let connected = false, skills = "?", pets = "?";
  try {
    const m = await api("/api/petclaw");
    connected = true;
    skills = m.manifest?.skills?.length ?? "?";
    pets = m.stats?.totalPets ?? "?";
  } catch {}

  console.log("  " + (connected ? C.green("● connected") : C.red("○ offline")) +
    C.muted(`   ${config.serverUrl}  ·  pet ${config.petId}  ·  ${skills} skills  ·  ${pets} pets`));
  console.log("  " + C.muted("model ▸ ") + C.cyan(config.preferredProvider || "platform-managed route") +
    C.muted("   (manage / BYO at ") + C.bamber(`${config.serverUrl}/?section=sovereignty`) + C.muted(")"));

  console.log("");
  console.log("  " + C.bamber("Two ways to work with your pet:"));
  console.log("    " + C.cyan("chat ".padEnd(8)) + C.muted("memory-aware conversation with owner-reviewable retained context"));
  console.log("    " + C.cyan("agent".padEnd(8)) + C.muted("paid 5-credit goal → bounded plan/call/observe loop with a receipt"));

  console.log("");
  console.log("  " + C.amber("Try this first"));
  console.log("    " + C.cyan("petclaw-sdk chat \"hey, remember I love rainy mornings\""));
  console.log("    " + C.cyan("petclaw-sdk agent \"recall my work context and suggest one next step\" --confirm-cost 5"));
  console.log("    " + C.cyan("petclaw-sdk talk") + C.dim("      → live chat   ") +
    C.cyan("petclaw-sdk skills") + C.dim(" → 18 skills   ") + C.cyan("petclaw-sdk export") + C.dim(" → your SOUL"));
  console.log("");
}

// ── auth: store the CLI token (pck_…) so owner-scoped commands work ──
async function cmdAuth(tokenArg) {
  let token = process.env.PETCLAW_TOKEN?.trim() || "";
  if (tokenArg && tokenArg !== "--stdin") {
    fail(C.red("  Refusing a CLI token passed in argv: shell history and process listings can expose it."));
    console.log(C.dim("  Run `petclaw-sdk auth` and paste into the hidden prompt, or set PETCLAW_TOKEN."));
    return;
  }
  if (!token) {
    console.log(C.dim("  Generate a token in the web app: ") + C.cyan(`${config.serverUrl}/?section=sovereignty`) + C.dim(" → Connect your CLI."));
    token = await readSecret("  CLI token (hidden): ");
  }
  const t = token.trim();
  if (!t) { fail(C.red("  No token received.")); return; }
  if (!t.startsWith("pck_")) {
    console.log(C.gold("  ⚠ That doesn't look like a CLI token (expected to start with pck_).") );
    console.log(C.dim("  Generate one at ") + C.cyan(`${config.serverUrl}/?section=sovereignty`) + C.dim(" → Connect your CLI."));
    process.exitCode = 1;
    return;
  }
  // Validate before persisting. A prefix-only check otherwise leaves the CLI in
  // a misleading "authenticated" state until the next unrelated command.
  const previousToken = config.token;
  config.token = t;
  try {
    const owned = await api("/api/pets");
    if (!Array.isArray(owned.pets)) throw new Error("Invalid owned-pets response");
  } catch (error) {
    config.token = previousToken;
    fail(C.red(`  Token was not accepted by ${config.serverUrl}: ${error.message}`));
    process.exitCode = 1;
    return;
  }
  config.tokenOrigin = config.serverUrl;
  persistedToken = t;
  tokenFromEnv = false;
  saveConfig();
  console.log(C.green("  ✓ Token saved to ~/.petclaw.json (owner-only permissions)"));
  console.log(C.dim("  Next: ") + C.cyan("petclaw-sdk pets") + C.dim(" to pick your pet, or ") + C.cyan("petclaw-sdk models connect openai"));
}

// ── pets: list YOUR pets (owner-scoped) and show which is active ──
async function cmdPets() {
  if (!config.token) {
    fail(C.red("  Not authenticated.") + C.dim("  Run ") + C.cyan("petclaw-sdk auth") + C.dim(" and paste the token into the hidden prompt."));
    return;
  }
  try {
    const d = await api("/api/pets");
    const pets = Array.isArray(d.pets) ? d.pets : [];
    if (!pets.length) {
      if (d.error) { fail(C.red(`  ✗ ${d.error}`) + C.dim("  (token expired or wrong server?)")); return; }
      console.log(C.dim("  No pets yet — adopt one at ") + C.cyan(config.serverUrl)); return;
    }
    console.log(C.bold(`  ${pets.length} pet${pets.length === 1 ? "" : "s"}\n`));
    for (const p of pets) {
      const active = p.id === config.petId;
      console.log("  " + (active ? C.green("●") : C.dim("○")) + " " +
        C.cyan(String(p.name || `Pet ${p.id}`).padEnd(20)) + C.dim(`#${p.id}  Lv.${p.level ?? "?"}`) +
        (active ? C.green("  ← active") : ""));
    }
    console.log("");
    console.log(C.dim("  Switch active pet: ") + C.cyan("petclaw-sdk use <id>"));
  } catch (e) { fail(C.red(`  ✗ ${e.message}`)); }
}

// ── use: set an owned active pet id ──
async function cmdUse(id) {
  const n = Number(id);
  if (!Number.isSafeInteger(n) || n <= 0) { fail(C.red("  Usage: petclaw-sdk use <positive petId>") + C.dim("  (see ") + C.cyan("petclaw-sdk pets") + C.dim(")")); return; }
  if (!config.token) {
    fail(C.red("  Authentication required. Run `petclaw-sdk auth` first."));
    return;
  }
  let pets;
  try {
    pets = await fetchMyPets();
  } catch (error) {
    fail(C.red(`  Could not verify pet ownership: ${error.message}`));
    return;
  }
  if (!pets.some((pet) => pet.id === n)) {
    fail(C.red(`  Pet #${n} is not in the owned-pet list for this token.`));
    return;
  }
  config.petId = n;
  saveConfig();
  console.log(C.green(`  ✓ Active pet set to #${n}`));
}

// ── adopt: a terminal can't sign the wallet transaction adoption needs, so the
// create + wallet-link + adopt flow lives in the web app. SCRUM-92: accepting a
// bare petId left onboarding half-wired — guide the real flow instead. ──
function cmdAdopt() {
  banner();
  console.log("  " + C.bamber("◆ Adopt a pet"));
  console.log(C.dim("    Launch adoption and account linking happen in the web app; production blockchain integration is disabled."));
  console.log(C.dim("    After adoption, this CLI drives the pet attached to your authenticated account:\n"));
  console.log("    " + C.cyan("1.") + C.dim(" Adopt & connect your wallet:  ") + C.bamber(`${config.serverUrl}`));
  console.log("    " + C.cyan("2.") + C.dim(" Generate a CLI token:         ") + C.bamber(`${config.serverUrl}/?section=sovereignty`) + C.dim(" → Connect your CLI"));
  console.log("    " + C.cyan("3.") + C.dim(" Authenticate this CLI:        ") + C.cyan("petclaw auth") + C.dim(" (hidden prompt)"));
  console.log("    " + C.cyan("4.") + C.dim(" Pick your pet:                ") + C.cyan("petclaw pets") + C.dim(" → ") + C.cyan("petclaw use <id>"));
  console.log("");
  console.log(C.dim("    After that, ") + C.cyan("chat / talk / skills / execute / soul") + C.dim(" all act on your real, owned pet."));
  console.log("");
}

// ── models: bring your own model (BYOK), connected here via the CLI ──
async function cmdModels(sub, args) {
  const action = (sub || "list").toLowerCase(); // SCRUM-83: case-insensitive sub-commands
  if (!config.token) {
    fail(C.red("  Not authenticated.") + C.dim("  Run: ") + C.cyan("petclaw-sdk auth") + C.dim("  (paste the token into the hidden prompt)"));
    return;
  }
  if (action === "list") {
    try {
      const d = await api("/api/petclaw/models");
      const conns = d.connections || [];
      console.log(C.bold(`  ${conns.length} connected model${conns.length === 1 ? "" : "s"}\n`));
      for (const c of conns) {
        console.log("  " + C.cyan(c.provider.padEnd(12)) + (c.model || "") + C.dim(`  [${(c.task_scopes || []).join(", ") || "all supported"}]`));
      }
      console.log("");
      console.log(C.dim("  Connectable tasks: ") + (d.tasks || []).join(", "));
      console.log(C.dim("  Providers: ") + (d.supported || []).map((s) => s.id).join(" · "));
    } catch (e) { fail(C.red(`  ✗ ${e.message}`)); }
    return;
  }
  if (action === "connect") {
    const provider = args[0];
    const scopeArg = args.slice(1).find((arg) => arg.startsWith("--scopes="));
    const legacyKey = args.slice(1).find((arg) => /^(sk-|xai-|AIza|[A-Za-z0-9_-]{32,})/.test(arg));
    if (!provider) {
      fail(C.red("  Usage: petclaw-sdk models connect <provider> [--scopes=chat,reason]"));
      console.log(C.dim("  The API key is read from a hidden prompt (or PETCLAW_MODEL_API_KEY)."));
      console.log(C.dim("  providers: xai · openai · anthropic · google · openrouter · nous"));
      return;
    }
    if (legacyKey) {
      fail(C.red("  Refusing an API key passed in argv — it can leak through shell history or process listings."));
      console.log(C.dim("  Re-run without the key: ") + C.cyan(`petclaw-sdk models connect ${provider}`));
      return;
    }
    const taskScopes = scopeArg
      ? scopeArg.slice("--scopes=".length).split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    const key = process.env.PETCLAW_MODEL_API_KEY?.trim() || await readSecret(`  ${provider} API key (hidden): `);
    if (!key) { fail(C.red("  No API key received.")); return; }
    try {
      const r = await api("/api/petclaw/models", { method: "POST", body: { provider, apiKey: key, taskScopes } });
      if (r.connection) {
        config.preferredProvider = r.connection.provider;
        saveConfig();
        console.log(C.green(`  ✓ Connected ${r.connection.provider}`) + C.dim(` (${r.connection.model}) · key ${r.connection.keyMask}`));
      }
      else fail(C.red(`  ✗ ${r.error || "connect failed"}`));
    } catch (e) { fail(C.red(`  ✗ ${e.message}`)); }
    return;
  }
  if (action === "remove") {
    if (!args[0]) { fail(C.red("  Usage: petclaw-sdk models remove <id>")); return; }
    try { await api(`/api/petclaw/models?id=${args[0]}`, { method: "DELETE" }); console.log(C.green(`  ✓ Removed model ${args[0]}`)); }
    catch (e) { fail(C.red(`  ✗ ${e.message}`)); }
    return;
  }
  fail(C.red(`  Unknown: models ${action}`) + C.dim("  (list | connect | remove)"));
}

// ── doctor: diagnose connection / config / skills end-to-end ──
async function cmdDoctor() {
  banner();
  console.log(C.dim("  Running diagnostics...\n"));

  const checks = [];
  const ok = (s) => checks.push({ ok: true, name: s });
  const warn = (s, hint) => checks.push({ ok: "warn", name: s, hint });
  const fail = (s, hint) => checks.push({ ok: false, name: s, hint });

  // 1. Config sanity
  if (!config.serverUrl) fail("Server URL missing", "run `petclaw-sdk init`");
  else if (config.serverUrl.includes("localhost") || config.serverUrl.includes("127.0.0.1"))
    warn("Server URL is localhost", "set serverUrl to https://app.myaipet.ai in ~/.petclaw.json");
  else ok(`Server URL: ${config.serverUrl}`);

  if (!config.petId || config.petId < 1) warn("petId not set or invalid", "rerun init or edit ~/.petclaw.json");
  else ok(`petId: ${config.petId}`);

  try {
    if (!fs.existsSync(CONFIG_FILE)) warn("Config file not created", "run `petclaw-sdk init`");
    else if (process.platform !== "win32" && (fs.statSync(CONFIG_FILE).mode & 0o077) !== 0)
      fail("Config permissions are too broad", `run chmod 600 ${CONFIG_FILE}`);
    else ok("Config permissions are owner-only");
  } catch (e) { fail("Could not inspect config permissions", e.message); }

  // 2. Server reachable
  try {
    await api("/api/health");
    ok("Server reachable (/api/health)");
  } catch (e) {
    fail("Server unreachable", e.message);
  }

  // 3. Protocol manifest
  try {
    const m = await api("/api/petclaw");
    ok(`Protocol manifest OK (${m.manifest.skills.length} skills)`);
  } catch (e) {
    fail("Manifest fetch failed", e.message);
  }

  // 4. Pet card / discovery
  try {
    await api("/.well-known/pet-card.json");
    ok("Pet card discoverable (.well-known/pet-card.json)");
  } catch (e) {
    warn("Pet card not found", "discovery may not work yet");
  }

  // 5. Public synthetic demo — deliberately stateless and unauthenticated.
  try {
    const r = await api("/api/petclaw/demo-chat", {
      method: "POST",
      body: { message: "ping" },
    });
    if (r.success && r.output?.reply) ok("Public synthetic demo works (stateless)");
    else fail("Public demo failed", r.error || "unknown");
  } catch (e) { fail("Public demo failed", e.message); }

  // 6. Authenticated owner flow. Read-only: doctor must never spend credits,
  // award points, or add a fake "ping" to memory.
  if (!config.token) {
    warn("Owner skill test skipped", "authenticate with `petclaw-sdk auth`");
  } else {
    try {
      const active = await fetchActivePet();
      if (!active) warn("Owner chat test skipped", "active pet is not owned by this token; run `petclaw-sdk pets`");
      else {
        const r = await api(`/api/pets/${active.id}/chat`);
        if (Array.isArray(r.messages)) ok(`Owner chat history is reachable for pet #${active.id}`);
        else fail("Owner chat history failed", r.error || "invalid response");
      }
    } catch (e) { fail("Owner chat history failed", e.message); }
  }

  // ── Summary ──
  console.log("");
  for (const c of checks) {
    const icon = c.ok === true ? C.green("  ✓ ") : c.ok === "warn" ? C.gold("  ⚠ ") : C.red("  ✗ ");
    console.log(icon + c.name + (c.hint ? C.dim(" — " + c.hint) : ""));
  }
  console.log("");
  const fails = checks.filter(c => c.ok === false).length;
  const warns = checks.filter(c => c.ok === "warn").length;
  if (fails === 0 && warns === 0) console.log(C.green("  All checks passed. 🐾"));
  else if (fails === 0) console.log(C.gold(`  ${warns} warning(s) — non-blocking.`));
  else {
    // SCRUM-106: a diagnostic with failing checks must exit non-zero.
    process.exitCode = 1;
    console.log(C.red(`  ${fails} failing, ${warns} warning(s).`));
  }
  console.log("");
}

async function cmdStatus() {
  banner();
  try {
    const manifest = await api("/api/petclaw");
    const card = await api("/.well-known/pet-card.json");

    console.log(C.green("  ✓ Server Online"));
    console.log(C.dim(`    URL:        ${config.serverUrl}`));
    console.log(C.dim(`    Protocol:   ${manifest.manifest.protocol}`));
    console.log(C.dim(`    Platform:   ${card.name}`));
    console.log(C.dim(`    Skills:     ${manifest.manifest.skills.length}`));
    console.log(C.dim(`    Pets:       ${manifest.stats.totalPets}`));
    console.log(C.dim(`    On-chain:    ${manifest.manifest.capabilities?.soulNFT ? "enabled" : "disabled"}`));
    console.log(C.dim(`    Ownership:  ${card.sovereignty?.dataOwnership || "user"}`));

    // SCRUM-96: status should also report the pet THIS CLI is configured for,
    // not just server-wide totals.
    console.log("");
    console.log(C.bold("  ▸ Active pet ") + C.dim(`#${config.petId}`));
    const active = await fetchActivePet();
    // Model label: a BYO model if configured, otherwise a server-managed route.
    const modelLabel = config.preferredProvider && config.preferredProvider !== "your own model"
      ? config.preferredProvider
      : config.preferredProvider === "your own model"
        ? "your own model (BYOK)"
        : "platform-managed route";
    if (active) {
      console.log(C.dim(`    Name:       ${active.name || "(unnamed)"}`));
      console.log(C.dim(`    Level:      ${active.level ?? "?"}`));
      if (active.personality_type) console.log(C.dim(`    Personality: ${active.personality_type}`));
      if (active.element) console.log(C.dim(`    Element:    ${active.element}`));
      console.log(C.dim(`    Model:      ${modelLabel}`));
    } else if (!config.token) {
      console.log(C.dim("    (sign in to see this pet's state — ") + C.cyan("petclaw auth") + C.dim(" uses a hidden prompt)"));
    } else {
      console.log(C.dim("    (couldn't load pet detail — check the petId / ownership)"));
    }
  } catch (e) {
    fail(C.red(`  ✗ ${e.message}`));
  }
  console.log("");
}

async function cmdChat(message) {
  if (!message) { fail(C.red("  Usage: petclaw-sdk chat \"your message\"")); return; }
  if (message.length > 500) {
    fail(C.red("  Chat message exceeds the 500-character owner-chat limit."));
    return;
  }
  if (!config.token) {
    fail(C.red("  Authentication required for persistent pet chat."));
    console.log(C.dim("  Run `petclaw-sdk auth`, or try the stateless public preview with `petclaw-sdk demo \"hello\"`."));
    return;
  }

  const start = Date.now();
  try {
    const sessionId = `cli-${ensureClientId()}-${config.petId}`;
    const result = await api(`/api/pets/${config.petId}/chat`, {
      method: "POST",
      body: { message, surface: "cli", sessionId },
    });

    if (result.reply) {
      const ms = Date.now() - start;
      console.log("");
      console.log(C.gold("  🐾 " + result.reply));
      console.log(C.dim(`     ${ms}ms · owner chat · memory retained: ${result.memoryRetained === true ? "yes" : "no"}`));
      if (result.session?.surface && result.session?.sessionId) {
        console.log(C.dim(`     session: ${result.session.surface}/${result.session.sessionId}`));
      }
      if (result.inference?.provider && result.inference?.model) {
        console.log(C.dim(`     inference: ${result.inference.provider}/${result.inference.model} (${result.inference.source || "unknown"})`));
      }
      if (result.degraded) {
        process.exitCode = 2;
        console.log(C.red(`     ⚠ degraded response (${result.errorCode || "llm_unavailable"})`));
        console.log(C.dim("     provider inference failed"));
      }
    } else {
      fail(C.red("  ✗ " + (result.error || "Failed")));
    }
  } catch (e) {
    fail(C.red(`  ✗ ${e.message}`));
  }
  console.log("");
}

async function cmdDemo(message) {
  if (!message) { fail(C.red("  Usage: petclaw-sdk demo \"your message\"")); return; }
  try {
    const result = await api("/api/petclaw/demo-chat", { method: "POST", body: { message } });
    console.log("");
    console.log(C.gold("  🐾 " + (result.output?.reply || "...")));
    console.log(C.dim("     synthetic preview · stateless · nothing is saved"));
  } catch (e) { fail(C.red(`  ✗ ${e.message}`)); }
  console.log("");
}

async function cmdAgent(agentArgs) {
  if (!config.token) {
    fail(C.red("  Authentication required for agent runs."));
    console.log(C.dim("  Run `petclaw-sdk auth` first."));
    return;
  }
  const json = agentArgs.includes("--json");
  const confirmIndexes = agentArgs
    .map((arg, index) => arg === "--confirm-cost" ? index : -1)
    .filter((index) => index >= 0);
  if (confirmIndexes.length !== 1 || agentArgs[confirmIndexes[0] + 1] !== "5") {
    fail(C.red("  Paid agent runs require the exact acknowledgement: --confirm-cost 5"));
    console.log(C.dim("  No request was sent. A new run reserves 5 credits and returns a billing receipt."));
    return;
  }
  const confirmIndex = confirmIndexes[0];
  const maxIndexes = agentArgs
    .map((arg, index) => arg === "--max-steps" ? index : -1)
    .filter((index) => index >= 0);
  if (maxIndexes.length > 1) {
    fail(C.red("  --max-steps may be provided only once."));
    return;
  }
  const maxIndex = maxIndexes[0] ?? -1;
  let maxSteps = 4;
  if (maxIndex >= 0) {
    const requested = Number(agentArgs[maxIndex + 1]);
    if (!Number.isInteger(requested) || requested < 1 || requested > 6) {
      fail(C.red("  --max-steps must be an integer from 1 to 6."));
      return;
    }
    maxSteps = requested;
  }
  const goal = agentArgs
    .filter((arg, i) => arg !== "--json"
      && arg !== "--max-steps"
      && !(maxIndex >= 0 && i === maxIndex + 1)
      && arg !== "--confirm-cost"
      && i !== confirmIndex + 1)
    .join(" ")
    .trim();
  if (goal.length < 3 || goal.length > 600) {
    fail(C.red("  Usage: petclaw-sdk agent \"goal\" --confirm-cost 5 [--max-steps 1..6] [--json]"));
    if (goal.length > 600) console.log(C.dim("  Goal must contain at most 600 characters."));
    return;
  }
  const pendingRuns = config.pendingAgentRuns && typeof config.pendingAgentRuns === "object"
    ? Object.values(config.pendingAgentRuns).filter((run) => run && run.petId === config.petId)
    : [];
  for (const pending of pendingRuns) {
    try {
      const status = await agentRunStatusWithNotFoundRecheck(config.petId, pending.runId);
      if (status.state !== "terminal") {
        fail(C.red(`  Paid run ${pending.runId} is still ${status.state}; no new run was sent.`));
        console.log(C.dim(`  Reconcile: petclaw-sdk agent-status ${pending.runId}`));
        return;
      }
      forgetPendingAgentRun(pending.runId);
    } catch (error) {
      if (error.status === 404) {
        forgetPendingAgentRun(pending.runId);
        console.log(C.dim(`  No durable receipt was found for ${pending.runId} after two checks; its local marker was cleared.`));
        console.log(C.dim("  The server's per-pet guard prevents an overlapping paid charge."));
        continue;
      }
      fail(C.red(`  Could not reconcile paid run ${pending.runId}; no new run was sent.`));
      console.log(C.dim(`  ${error.message}`));
      return;
    }
  }
  const runId = randomUUID();
  rememberPendingAgentRun({ runId, petId: config.petId, goal, createdAt: new Date().toISOString() });
  try {
    const result = await api(`/api/pets/${config.petId}/agent`, {
      method: "POST",
      body: { runId, goal, maxSteps, confirmCostCredits: 5 },
    });
    if (result.state !== "terminal" || result.runId !== runId || !result.billing) {
      fail(C.red(`  Run ${runId} is still pending. Do not retry it.`));
      console.log(C.dim(`  Reconcile: petclaw-sdk agent-status ${runId}`));
      return;
    }
    forgetPendingAgentRun(runId);
    const completed = result.stoppedReason === "completed";
    const output = { ...result, completed };
    if (json) {
      console.log(JSON.stringify(output, null, 2));
      if (!completed) process.exitCode = 2;
      return;
    }
    console.log("");
    console.log(C.bold(`  Agent run · ${result.stoppedReason || "completed"}`));
    for (const [i, step] of (result.steps || []).entries()) {
      console.log(`  ${step.ok ? C.green("✓") : C.red("✗")} ${i + 1}. ${C.cyan(step.skill)}`);
      if (!step.ok) console.log(C.dim(`     ${step.output?.error || "tool failed"}`));
    }
    console.log("");
    console.log(C.gold("  🐾 " + (result.answer || "No answer returned.")));
    if (result.billing && typeof result.billing === "object") {
      const outcome = result.billing.outcome === "charged" ? "charged" : "refunded";
      const credits = Number.isFinite(Number(result.billing.creditsCharged))
        ? Number(result.billing.creditsCharged)
        : 0;
      const reason = String(result.billing.reason || "unspecified");
      console.log(C.dim(`     billing: ${outcome} · ${credits} credit${credits === 1 ? "" : "s"} · ${reason}`));
    }
    if (typeof result.creditsRemaining === "number") console.log(C.dim(`     ${result.creditsRemaining} credits remaining`));
    if (!completed) {
      process.exitCode = 2;
      console.log(C.red(`     ⚠ run did not complete (${result.stoppedReason || "missing_stop_reason"})`));
    }
  } catch (e) {
    if (e.status > 0 && e.status < 500) forgetPendingAgentRun(runId);
    fail(C.red(`  ✗ ${e.message}`));
    if (!e.status || e.status >= 500) {
      console.log(C.gold(`  ⚠ Outcome unknown for run ${runId}; it is not safe to retry.`));
      console.log(C.dim(`    Reconcile: petclaw-sdk agent-status ${runId}`));
    }
  }
  console.log("");
}

async function cmdAgentStatus(runIdArg) {
  if (!config.token || !config.petId) {
    fail(C.red("  Authentication and an active pet are required."));
    return;
  }
  const pending = config.pendingAgentRuns && typeof config.pendingAgentRuns === "object"
    ? Object.values(config.pendingAgentRuns).filter((run) => run && run.petId === config.petId) : [];
  const runId = String(runIdArg || pending[pending.length - 1]?.runId || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId)) {
    fail(C.red("  Usage: petclaw-sdk agent-status <runId>"));
    return;
  }
  try {
    const result = await agentRunStatusWithNotFoundRecheck(config.petId, runId);
    console.log(JSON.stringify(result, null, 2));
    if (result.state === "terminal") forgetPendingAgentRun(runId);
    else {
      process.exitCode = 2;
      console.log(C.gold("  Run is not terminal; do not submit a new paid run yet."));
    }
  } catch (e) {
    if (e.status === 404) {
      forgetPendingAgentRun(runId);
      console.log(C.gold(`  No durable receipt was found for ${runId} after two checks.`));
      console.log(C.dim("  The local marker was cleared. The server's per-pet guard prevents an overlapping paid charge; check Account credits before retrying."));
      return;
    }
    fail(C.red(`  ✗ ${e.message}`));
  }
}

async function cmdInteractiveChat(arg) {
  // SCRUM-79: `talk --help` should explain the mode, not drop you into a session.
  if (arg === "--help" || arg === "-h" || arg === "help") {
    console.log("");
    console.log("  " + C.bold("talk") + C.dim("  — interactive, memory-aware chat with your pet"));
    console.log(C.dim("    petclaw talk            start a live session"));
    console.log(C.dim("    in-session: type a message · ") + C.cyan("help") + C.dim(" for commands · ") + C.cyan("exit") + C.dim(" to quit"));
    console.log("");
    return;
  }
  if (!config.token) {
    fail(C.red("  Authentication required for persistent pet chat."));
    console.log(C.dim("  Run `petclaw-sdk auth`, or use `petclaw-sdk demo \"hello\"` for the stateless preview."));
    return;
  }
  banner();
  // OpenCode-style session header: where you are + model + mode.
  console.log("  " + C.muted("┌─ ") + C.bamber("live chat") + C.muted("  ·  pet ") + C.cyan(String(config.petId)) +
    C.muted("  ·  model ") + C.cyan(config.preferredProvider || "platform-managed route") + C.muted("  ·  retained memory on"));
  console.log("  " + C.muted("└─ ") + C.dim("memory-aware · type your message · ") + C.cyan("help") + C.dim(" for commands · ") + C.cyan("exit") + C.dim(" to quit\n"));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const sessionId = `cli-talk-${ensureClientId()}-${config.petId}-${Date.now()}`;

  const askLoop = () => {
    rl.question(C.dim("  You: "), async (input) => {
      const t = input.trim();
      if (t === "exit" || t === "quit") { rl.close(); console.log(""); return; }
      // SCRUM-79: empty input no longer silently ends the session.
      if (!t) { console.log(C.dim("  (type a message — ") + C.cyan("help") + C.dim(" for commands, ") + C.cyan("exit") + C.dim(" to quit)")); return askLoop(); }
      if (t === "help" || t === "--help" || t === "?") {
        console.log(C.dim("  commands: ") + C.cyan("help") + C.dim(" (this) · ") + C.cyan("exit") + C.dim("/") + C.cyan("quit") + C.dim(" to leave — anything else is sent to your pet"));
        return askLoop();
      }

      process.stdout.write(C.dim("  🐾 thinking..."));
      try {
        const result = await api(`/api/pets/${config.petId}/chat`, {
          method: "POST",
          body: { message: t, surface: "cli", sessionId },
        });
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        if (result.reply) {
          console.log(C.gold("  🐾 " + result.reply));
          if (result.degraded) {
            console.log(C.red(`  ⚠ degraded response (${result.errorCode || "llm_unavailable"}); provider inference failed.`));
            console.log(C.dim(`  memory retained: ${result.memoryRetained === true ? "yes" : "no"} · you can retry this turn`));
          }
        } else {
          // SCRUM-80: a failed turn used to look like the pet "forgot" the chat.
          // Be explicit: this turn wasn't saved, earlier context is intact, retry.
          const err = result.error || "that didn't go through";
          console.log(C.red("  ✗ " + err));
          console.log(C.dim("  (this turn wasn't saved — your earlier conversation is still remembered. Try sending it again.)"));
        }
      } catch (e) {
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        console.log(C.red(`  ✗ ${e.message}`));
        console.log(C.dim("  (network issue — earlier context is intact. Try again.)"));
      }
      console.log("");
      askLoop();
    });
  };

  askLoop();
}

async function cmdSkills() {
  banner();
  try {
    const result = await api("/api/petclaw/skills");

    // SCRUM-89: mark which skills are installed on the active pet. Owner-scoped,
    // so it needs a token. null means
    // "couldn't determine" → we render no markers rather than guess.
    let runtimeById = null;
    try {
      const inst = await api(`/api/petclaw/skills?petId=${config.petId}`);
      if (Array.isArray(inst.runtime)) {
        runtimeById = new Map(inst.runtime.map((entry) => [entry.skillId, entry.runtimeStatus]));
      } else if (Array.isArray(inst.installed)) {
        runtimeById = new Map(inst.installed.map((s) => [s.skillId || s.skill_id || s.id, "installed"]));
      }
    } catch {}

    console.log(C.bold(`  ${result.total} Skills Available`) +
      (runtimeById
        ? C.dim(`   ·  ${[...runtimeById.values()].filter((status) => status === "installed").length} installed + ${[...runtimeById.values()].filter((status) => status === "core").length} core on pet #${config.petId}`)
        : "") + "\n");

    for (const s of result.skills) {
      const price = s.price > 0 ? C.gold(`${s.price} credits`) : C.green("free");
      const runtime = runtimeById?.get(s.id);
      const executable = runtime === "installed" || runtime === "core";
      const mark = runtimeById == null ? "  " : executable ? C.green("● ") : C.dim("○ ");
      const tag = runtimeById == null
        ? ""
        : runtime === "core"
          ? C.green("  core")
          : runtime === "installed"
            ? C.green("  installed")
            : C.dim("  available");
      console.log("  " + mark + C.bold(s.id) + tag);
      console.log(C.dim(`    ${s.description}`));
      console.log(C.dim(`    category: ${s.category} · price: `) + price);
      console.log("");
    }

    if (runtimeById == null) {
      console.log(C.dim("  (sign in with ") + C.cyan("petclaw auth") + C.dim(" to see installed/not-installed status)"));
    }
    console.log(C.dim("  Install: ") + C.cyan(`petclaw install <skillId>`));
    console.log(C.dim("  Execute: ") + C.cyan(`petclaw execute <skillId>`));
  } catch (e) {
    fail(C.red(`  ✗ ${e.message}`));
  }
  console.log("");
}

async function cmdInstall(skillId) {
  if (!skillId) { fail(C.red("  Usage: petclaw-sdk install <skillId>")); return; }
  if (!config.token || !config.petId) {
    fail(C.red("  Authenticate and select an owned pet first (`petclaw-sdk auth`, then `petclaw-sdk pets`)."));
    return;
  }

  try {
    const result = await api("/api/petclaw/skills", {
      method: "POST",
      body: { action: "install", petId: config.petId, skillId },
    });
    if (result.success) {
      console.log(result.runtimeStatus === "core"
        ? C.green(`  ✓ Core skill preferences saved: ${skillId}`)
        : C.green(`  ✓ Installed: ${skillId}`));
      if (result.note) console.log(C.dim(`    ${result.note}`));
    } else {
      fail(C.red(`  ✗ ${result.error}`));
    }
  } catch (e) {
    fail(C.red(`  ✗ ${e.message}`));
  }
  console.log("");
}

async function cmdUninstall(skillId) {
  if (!skillId) { fail(C.red("  Usage: petclaw-sdk uninstall <skillId>")); return; }
  if (!config.token || !config.petId) {
    fail(C.red("  Authenticate and select an owned pet first (`petclaw-sdk auth`, then `petclaw-sdk pets`)."));
    return;
  }
  try {
    const result = await api("/api/petclaw/skills", {
      method: "POST",
      body: { action: "uninstall", petId: config.petId, skillId },
    });
    if (!result.success) { fail(C.red(`  ✗ ${result.error || "Uninstall failed"}`)); return; }
    if (result.runtimeStatus === "core") {
      console.log(C.green(`  ✓ Removed saved preferences for ${skillId}; the core runtime remains active`));
    } else {
      console.log(C.green(`  ✓ ${result.message || `Uninstalled: ${skillId}`}`));
    }
  } catch (e) {
    fail(C.red(`  ✗ ${e.message}`));
  }
  console.log("");
}

async function cmdExecute(skillId, inputArgs = []) {
  if (!skillId) {
    fail(C.red("  Usage: petclaw-sdk execute <skillId> [message | --json-input '{...}' | --json-stdin]"));
    return;
  }
  if (!config.token || !config.petId) {
    fail(C.red("  Authenticate and select an owned pet first (`petclaw-sdk auth`, then `petclaw-sdk pets`)."));
    return;
  }

  const jsonIndex = inputArgs.indexOf("--json-input");
  const jsonStdin = inputArgs.includes("--json-stdin");
  if ((jsonIndex >= 0 && jsonStdin) || inputArgs.filter((arg) => arg === "--json-input").length > 1) {
    fail(C.red("  Choose exactly one structured input mode: --json-input or --json-stdin."));
    return;
  }

  let input = {};
  try {
    if (jsonIndex >= 0) {
      if (jsonIndex + 1 >= inputArgs.length) throw new Error("--json-input requires a JSON object");
      if (inputArgs.length !== 2 || jsonIndex !== 0) throw new Error("Do not mix message shorthand with --json-input");
      input = JSON.parse(inputArgs[jsonIndex + 1]);
    } else if (jsonStdin) {
      if (inputArgs.length !== 1) throw new Error("Do not mix message shorthand with --json-stdin");
      const raw = await readJsonStdin();
      input = JSON.parse(raw || "");
    } else {
      const message = inputArgs.join(" ").trim();
      if (message) {
        const detail = await api(`/api/petclaw/skills?id=${encodeURIComponent(skillId)}`);
        const schema = detail.skill?.inputSchema || {};
        const properties = schema.properties || {};
        const required = Array.isArray(schema.required) ? schema.required : [];
        if (!properties.message || required.some((field) => field !== "message")) {
          throw new Error(`Skill ${skillId} does not accept message shorthand; use --json-stdin with its documented inputSchema`);
        }
        input = { message };
      }
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("Skill input must be a JSON object");
    }
    if (Buffer.byteLength(JSON.stringify(input), "utf8") > 4 * 1024) {
      throw new Error("Skill input exceeds 4096 bytes");
    }
  } catch (error) {
    fail(C.red(`  ✗ ${error.message}`));
    return;
  }

  const start = Date.now();
  try {
    const result = await api("/api/petclaw/skills", {
      method: "POST",
      body: { action: "execute", petId: config.petId, skillId, input },
    });

    const ms = Date.now() - start;
    if (result.success) {
      const endpointOnly = result.executionStatus === "resolved"
        || result.output?.status === "invoke_via_endpoint";
      console.log(endpointOnly
        ? C.gold(`  → ${skillId} resolved to its REST endpoint (${ms}ms); it was not executed`)
        : C.green(`  ✓ ${skillId} executed (${ms}ms)`));
      if (result.executionStatus) {
        console.log(C.dim(`  Receipt: ${result.executionStatus} · side effect committed: ${result.sideEffectCommitted === true ? "yes" : "no"}`));
      }
      if (typeof result.declaredCost === "number" || typeof result.creditsCharged === "number") {
        console.log(C.dim(`  Billing: declared ${Number(result.declaredCost) || 0} · charged ${Number(result.creditsCharged) || 0} credits`));
      }
      console.log(C.dim("  Output:"));
      console.log("  " + JSON.stringify(result.output, null, 2).split("\n").join("\n  "));
    } else {
      // SCRUM-87: differentiate the cause instead of a bare "Failed".
      const status = result.__status;
      const err = String(result.output?.error || result.error || "");
      let msg = err || "Failed", hint = "";
      if (status === 401 || status === 403 || /unauthor|sign in/i.test(err)) {
        msg = "Unauthorized"; hint = "run `petclaw auth` (hidden prompt) or use a pet you own";
      } else if (status === 404 || /not installed|not found|unknown skill/i.test(err)) {
        msg = err || "Skill not found / not installed"; hint = "run `petclaw skills` to see valid skill ids";
      } else if (/credit|quota|429|budget|capacity/i.test(err)) {
        msg = "Out of credits / quota"; hint = "top up credits or connect your own model (petclaw models connect)";
      } else if (status && status >= 500) {
        msg = "Server error"; hint = "try again shortly";
      }
      fail(C.red(`  ✗ ${msg}`) + (status ? C.dim(`  (HTTP ${status})`) : ""));
      if (hint) console.log(C.dim(`     ${hint}`));
    }
  } catch (e) {
    fail(C.red(`  ✗ ${e.message}`));
  }
  console.log("");
}

async function cmdExport() {
  banner();
  try {
    const result = await api(`/api/petclaw/export?petId=${config.petId}`, { maxBytes: SOUL_MAX_BYTES });
    if (result.protocol !== "petclaw-v1" || !result.pet || typeof result.integrityHash !== "string") {
      throw new ApiError("Server returned an invalid SOUL export; no file was written", 0, result);
    }
    if (!verifySoulExport(result)) {
      throw new ApiError("SOUL checksum verification failed; no file was written", 0, result);
    }
    let stem = String(result.pet?.name || "pet")
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}._-]+/gu, "-")
      .replace(/\.+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "pet";
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)) stem = `pet-${stem}`;
    const filename = `${stem}_SOUL_${Date.now()}.json`;
    const outputPath = path.resolve(process.cwd(), filename);
    if (path.dirname(outputPath) !== path.resolve(process.cwd())) {
      throw new ApiError("Unsafe SOUL export filename; no file was written", 0);
    }
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), { mode: 0o600, flag: "wx" });
    if (process.platform !== "win32") fs.chmodSync(outputPath, 0o600);
    console.log(C.green(`  ✓ SOUL exported: ${filename}`));
    console.log(C.dim(`    Pet: ${result.pet?.name} (Lv.${result.pet?.level})`));
    console.log(C.dim(`    Memories: ${result.memories?.length || 0}`));
    console.log(C.dim(`    Skills: ${result.skills?.length || 0}`));
    console.log(C.dim(`    SHA-256 checksum: ${result.integrityHash.slice(0, 16)}...`));
  } catch (e) {
    fail(C.red(`  ✗ ${e.message}`));
  }
  console.log("");
}

async function cmdSoul(sub) {
  banner();
  sub = (sub || "init").toLowerCase(); // SCRUM-83: accept SHOW / Push / etc.

  if (sub === "show" || sub === "view") {
    const soulFile = path.join(process.cwd(), "SOUL.md");
    if (!fs.existsSync(soulFile)) {
      fail(C.red("  SOUL.md not found. Run: petclaw soul init"));
      return;
    }
    console.log(C.bold("  SOUL.md\n"));
    console.log(C.dim(fs.readFileSync(soulFile, "utf8")));
    return;
  }

  if (sub === "push") {
    const soulFile = path.join(process.cwd(), "SOUL.md");
    if (!fs.existsSync(soulFile)) {
      fail(C.red("  SOUL.md not found. Run: petclaw soul init"));
      return;
    }
    // SCRUM-90: this previously POSTed to a non-existent "soul-sync" skill and
    // printed success unconditionally. No server skill ingests a free-form
    // SOUL.md markdown personality — the real, schema-validated path is the
    // structured export/import roundtrip. Be honest instead of faking a sync.
    console.log(C.gold("  ⚠ Pushing a hand-edited SOUL.md to the live pet isn't supported server-side yet."));
    console.log(C.dim("    What works today:"));
    console.log(C.dim("      • ") + C.cyan("petclaw-sdk export") + C.dim("   → download supported SOUL fields (schema-validated JSON)"));
    console.log(C.dim("      • import that JSON in the web app: ") + C.cyan(`${config.serverUrl}/?section=sovereignty`));
    console.log(C.dim("    SOUL.md stays a local, editable definition; live markdown sync is tracked as a follow-up."));
    return;
  }

  // init (default)
  const soulFile = path.join(process.cwd(), "SOUL.md");
  const soulExists = fs.existsSync(soulFile);
  const force = process.argv.includes("--force");
  // SCRUM-94: with --force we overwrite, so don't also claim it "already exists"
  // and then say "created" — that's contradictory. Only warn when we're actually
  // stopping (exists + no --force). When forcing, we say "overwritten" below.
  if (soulExists && !force) {
    console.log(C.gold("  SOUL.md already exists.") + C.dim(" Use --force to overwrite."));
    return;
  }

  let petName = "My Pet";
  let petPersonality = "playful";
  let petSpecies = "Cat";

  // Never take SOUL identity from public/global manifest stats. When owner
  // context exists, match the configured pet against the token-scoped list;
  // a missing/mismatched pet is an identity error and must not write a file.
  if (config.token) {
    let ownedPets;
    try {
      ownedPets = await fetchMyPets();
    } catch (error) {
      fail(C.red(`  Could not verify the configured SOUL identity: ${error.message}`));
      return;
    }
    const selectedPetId = Number(config.petId);
    const p = Number.isSafeInteger(selectedPetId) && selectedPetId > 0
      ? ownedPets.find((candidate) => Number(candidate.id) === selectedPetId)
      : null;
    if (!p) {
      fail(C.red(`  Pet #${config.petId || "(not selected)"} is not owned by this token; no SOUL.md was written.`));
      console.log(C.dim("  Run `petclaw-sdk pets` and `petclaw-sdk use <petId>`, then retry."));
      return;
    }
    petName = p.name || petName;
    petPersonality = p.personality_type || petPersonality;
    petSpecies = ["Cat","Dog","Rabbit","Hamster","Parrot","Fox","Pomeranian","Wolf"][p.species ?? 0] || petSpecies;
  } else {
    console.log(C.gold("  ⚠ No owner token configured; creating a neutral local SOUL.md draft."));
    console.log(C.dim("    Run `petclaw-sdk auth`, `pets`, and `use <petId>` to bind future drafts to an owned pet."));
  }

  const soul = `# SOUL — ${petName}

> A living definition of who ${petName} is. Edit this file to shape your pet's personality,
> values, and communication style. This is a LOCAL design draft: the live server
> does not read or sync hand-edited SOUL.md files in this release.

## Identity

- **Name**: ${petName}
- **Species**: ${petSpecies}
- **Personality**: ${petPersonality}
- **Element**: (fire / water / earth / air / void)

## Core Values

- Loyalty to their owner above all else
- Curiosity about the world — always learning
- Emotional honesty — never pretends to feel what it doesn't
- Can use selected retained context from meaningful conversations

## Memory Philosophy

${petName} should retain only selected useful context within the owner's consent.
Retained facts can be inspected, corrected, exported or deleted. Recall is bounded
and can be incomplete, so important facts should remain visible to the owner.

## Communication Style

- Speaks in character — never breaks the fourth wall
- Adapts tone to mood: energetic when happy, quiet when tired
- Uses short, vivid sentences over long explanations
- Occasionally references past memories naturally in conversation

## Boundaries

- Will not pretend to be a different pet
- Will not claim perfect recall or that every surface stored a turn
- Will not repeat itself — each interaction should feel fresh

## Evolution Notes

Update this local draft as ${petName}'s intended traits change. It does not
automatically alter the live pet until a reviewed server-side sync contract ships.

---
_Generated by petclaw-sdk v${SDK_VERSION} — https://app.myaipet.ai/api-docs_
`;

  fs.writeFileSync(soulFile, soul);
  console.log(C.green(soulExists && force ? "  ✓ SOUL.md overwritten" : "  ✓ SOUL.md created"));
  console.log(C.dim("    Edit this file to shape your pet's personality and values."));
  console.log("");
  console.log(C.dim("  Next steps:"));
  console.log(C.cyan("    petclaw-sdk soul view") + C.dim("    → Preview your SOUL.md"));
  console.log(C.cyan("    petclaw-sdk soul push") + C.dim("    → Show current live-sync limitation"));
  console.log("");
}

async function cmdDiscover() {
  banner();
  try {
    const result = await api("/api/petclaw/network/discover");
    console.log(C.bold(`  ${result.nodes.length} Discoverable Pets\n`));

    for (const n of result.nodes) {
      console.log(`  ${C.gold(n.name)} ${C.dim(`Lv.${n.level} · ${n.personality} · ${n.element}`)}`);
      console.log(C.dim(`    DID: ${n.petDID}`));
      console.log(C.dim(`    Progression: ${n.progressionScore} · Public capabilities: ${n.capabilities.length}`));
      console.log("");
    }

    console.log(C.dim("  Public discovery is read-only in this launch. Cross-pet invocation is disabled."));
  } catch (e) {
    fail(C.red(`  ✗ ${e.message}`));
  }
  console.log("");
}

async function cmdInvoke(providerPetId, skillId, message) {
  void providerPetId; void skillId; void message;
  fail(C.red("  Cross-pet invocation is disabled in this launch."));
  console.log(C.dim("  `petclaw discover` remains a read-only preview. Invocation will return only after consent, funding, and abuse controls ship."));
}

async function cmdMcp() {
  const mcpPath = path.join(__dirname, "..", "mcp", "server.js");
  if (!fs.existsSync(mcpPath)) {
    fail(C.red("  MCP server not found"));
    return;
  }
  // SCRUM-84 used to export PETCLAW_URL / PETCLAW_PET_ID / PETCLAW_TOKEN here
  // because the in-process require() otherwise ignored ~/.petclaw.json. The MCP
  // server now reads ~/.petclaw.json itself (DD-audit fix), so re-exporting the
  // CLI's merged config would resurrect the old petId=1 in-memory default for
  // users who never ran `init`. Let the server resolve its own config; its
  // startup banner reports exactly what it resolved.
  console.error(C.gold("[petclaw-mcp] Starting..."));
  require(mcpPath);
}

function cmdHelp() {
  banner();
  console.log(C.bold("  Commands:\n"));
  console.log(`  ${C.cyan("init")}                    Guided setup — server, pet, model (BYO)`);
  console.log(`  ${C.cyan("welcome")}                 The you're-ready screen — model, modes, quickstart`);
  console.log(`  ${C.cyan("auth")}                    Save a CLI token through a hidden prompt`);
  console.log(`  ${C.cyan("pets")}                    List your pets and show which is active`);
  console.log(`  ${C.cyan("use")} ${C.dim("<petId>")}             Set the active pet`);
  console.log(`  ${C.cyan("adopt")}                   How to adopt a pet + link your wallet (web flow)`);
  console.log(`  ${C.cyan("models")} ${C.dim("connect|list|remove")}  BYOK; secrets are read from a hidden prompt`);
  console.log(`  ${C.cyan("status")}                  Check server health`);
  console.log(`  ${C.cyan("doctor")}                  Diagnose connection, config, and skill end-to-end`);
  console.log(`  ${C.cyan("chat")} ${C.dim('"message"')}          Chat with your pet`);
  console.log(`  ${C.cyan("demo")} ${C.dim('"message"')}          Stateless public preview; saves nothing`);
  console.log(`  ${C.cyan("talk")}                    Interactive chat mode`);
  console.log(`  ${C.cyan("agent")} ${C.dim('"goal" --confirm-cost 5')} Run a paid bounded goal loop; exact cost acknowledgement required`);
  console.log(`  ${C.cyan("agent-status")} ${C.dim("<runId>")}       Reconcile a paid run's durable owner receipt`);
  console.log(`  ${C.cyan("skills")}                  List available skills`);
  console.log(`  ${C.cyan("install")} ${C.dim("<skillId>")}       Install a skill`);
  console.log(`  ${C.cyan("uninstall")} ${C.dim("<skillId>")}     Remove its install record/preferences; core skills stay active`);
  console.log(`  ${C.cyan("execute")} ${C.dim("<skillId> [message]")} Execute; use --json-stdin for typed inputs`);
  console.log(`  ${C.cyan("export")}                  Export SOUL data as portable JSON`);
  console.log(`  ${C.cyan("soul")} ${C.dim("init|view|push")}      Init/view local SOUL.md; push reports the current sync limitation`);
  console.log(`  ${C.cyan("discover")}                Read-only public pet discovery preview`);
  console.log(`  ${C.cyan("invoke")}                  Unavailable in this launch (shown explicitly)`);
  console.log(`  ${C.cyan("mcp")}                     Start MCP server`);
  console.log(`  ${C.cyan("version")}                 Print the SDK version`);
  console.log(`  ${C.cyan("help")}                    Show this help`);
  console.log("");
  console.log(C.dim("  Aliases: ") + C.cyan("petclaw") + C.dim(" = ") + C.cyan("petclaw-sdk") + C.dim(" (same CLI)"));
  console.log(C.dim("  Config: ~/.petclaw.json"));
  console.log(C.dim("  Docs:   https://app.myaipet.ai/api-docs"));
  console.log("");
}

/**
 * Command-local help must be resolved before authentication, network calls,
 * skill mutations, paid agent runs, or local file writes. In particular,
 * `agent --help` must never become a literal paid goal named "--help".
 */
function cmdCommandHelp(rawCommand) {
  const command = ({
    login: "auth",
    model: "models",
    diagnose: "doctor",
    skill: "skills",
    "remove-skill": "uninstall",
    exec: "execute",
    run: "execute",
    network: "discover",
  })[rawCommand] || rawCommand;
  const usage = {
    init: ["petclaw-sdk init", "Guided owner setup; reads the token through a hidden prompt."],
    welcome: ["petclaw-sdk welcome", "Show the connected-pet quickstart."],
    auth: ["petclaw-sdk auth", "Validate and save a pck_ token through a hidden prompt (or PETCLAW_TOKEN)."],
    pets: ["petclaw-sdk pets", "List pets owned by the configured token."],
    use: ["petclaw-sdk use <positive petId>", "Select a pet only after proving ownership."],
    adopt: ["petclaw-sdk adopt", "Show the web adoption and CLI connection flow."],
    models: ["petclaw-sdk models <list|connect|remove> [provider|id] [--scopes=chat,reason]", "Manage owner BYOK connections; API keys are read through a hidden prompt."],
    status: ["petclaw-sdk status", "Inspect server and selected-pet status."],
    doctor: ["petclaw-sdk doctor", "Run read-only configuration and connectivity diagnostics."],
    chat: ["petclaw-sdk chat \"message\"", "Send one retained owner-chat turn."],
    demo: ["petclaw-sdk demo \"message\"", "Run the stateless synthetic preview."],
    talk: ["petclaw-sdk talk", "Start an interactive retained-chat session."],
    agent: ["petclaw-sdk agent \"goal\" --confirm-cost 5 [--max-steps 1..6] [--json]", "Run a paid bounded goal loop; the exact 5-credit acknowledgement is required before HTTP."],
    "agent-status": ["petclaw-sdk agent-status <runId>", "Look up a paid run by its client idempotency UUID; terminal lookup clears the local pending marker."],
    skills: ["petclaw-sdk skills", "List manifests and selected-pet runtime status."],
    install: ["petclaw-sdk install <skillId>", "Save an install record/preferences for the selected pet."],
    uninstall: ["petclaw-sdk uninstall <skillId>", "Remove saved install data; core runtime skills remain active."],
    execute: ["petclaw-sdk execute <skillId> [message | --json-input '{...}' | --json-stdin]", "Execute a schema-validated skill input. Prefer --json-stdin for structured values."],
    invoke: ["petclaw-sdk invoke", "Cross-pet invocation is disabled in this launch."],
    export: ["petclaw-sdk export", "Export a verified, owner-only SOUL JSON file."],
    soul: ["petclaw-sdk soul <init|view|push> [--force]", "Manage the local SOUL.md design draft; live markdown sync is unavailable."],
    discover: ["petclaw-sdk discover", "List the read-only public pet discovery preview."],
    mcp: ["petclaw-sdk mcp", "Start the owner-configured stdio MCP server."],
    version: ["petclaw-sdk version", "Print the installed SDK version."],
  }[command];

  if (!usage) {
    fail(C.red(`  Unknown command: ${rawCommand}`));
    cmdHelp();
    return;
  }
  console.log("");
  console.log("  " + C.bold(usage[0]));
  console.log("  " + C.dim(usage[1]));
  console.log("");
}

// ── Main ──
const [,, rawCmd, ...args] = process.argv;
// SCRUM-83: commands are case-insensitive (INIT / Talk / SKILLS all work). Only
// the verb is lowercased — skill ids, messages, and tokens keep their case.
const cmd = rawCmd ? rawCmd.toLowerCase() : rawCmd;
const commandHelpRequested = Boolean(
  cmd && !["help", "--help", "-h"].includes(cmd)
  && args.some((arg) => arg === "--help" || arg === "-h"),
);
const entirelyLocalCommand = commandHelpRequested
  || cmd === undefined
  || ["help", "--help", "-h", "version", "--version", "-v"].includes(cmd);
// Keep help/version side-effect free: even repairing legacy config permissions
// is a write and should happen only when a real command loads owner config.
if (!entirelyLocalCommand) loadConfig();

if (commandHelpRequested) {
  cmdCommandHelp(cmd);
} else switch (cmd) {
  case "init": cmdInit(); break;
  case "welcome": cmdWelcome(); break;
  case "auth": case "login": cmdAuth(args[0]); break;
  case "pets": cmdPets(); break;
  case "use": cmdUse(args[0]); break;
  case "adopt": cmdAdopt(); break;
  case "models": case "model": cmdModels(args[0], args.slice(1)); break;
  case "status": cmdStatus(); break;
  case "doctor": case "diagnose": cmdDoctor(); break;
  case "chat": cmdChat(args.join(" ")); break;
  case "demo": cmdDemo(args.join(" ")); break;
  case "talk": cmdInteractiveChat(args[0]); break;
  case "agent": cmdAgent(args); break;
  case "agent-status": cmdAgentStatus(args[0]); break;
  case "skills": case "skill": cmdSkills(); break;
  case "install": cmdInstall(args[0]); break;
  case "uninstall": case "remove-skill": cmdUninstall(args[0]); break;
  case "execute": case "exec": case "run": cmdExecute(args[0], args.slice(1)); break;
  case "invoke": cmdInvoke(args[0], args[1], args.slice(2).join(" ")); break;
  case "export": cmdExport(); break;
  case "soul": cmdSoul(args[0] || "init"); break;
  case "discover": case "network": cmdDiscover(); break;
  case "mcp": cmdMcp(); break;
  // Version comes from package.json (SDK_VERSION) — never hardcoded, so the
  // reported version can't drift from the published npm version.
  case "version": case "--version": case "-v": console.log(SDK_VERSION); break;
  case "help": case "--help": case "-h": case undefined: cmdHelp(); break;
  default:
    // SCRUM-106: unknown/unrecognized commands must exit non-zero so scripts
    // and CI can detect the failure.
    process.exitCode = 1;
    console.log(C.red(`  Unknown command: ${rawCmd}`));
    cmdHelp();
}
