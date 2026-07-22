#!/usr/bin/env node

/**
 * PetClaw MCP Server
 * Model Context Protocol server for PetClaw skills
 *
 * Usage:
 *   petclaw-sdk init          # once — writes server URL, pck_ token, pet id to ~/.petclaw.json
 *   petclaw-mcp               # reads that config (or: petclaw-sdk mcp)
 *   overrides: PETCLAW_URL / PETCLAW_PET_ID / PETCLAW_TOKEN env vars,
 *              or --url <url> --pet-id <id> CLI args
 *
 * This server exposes PetClaw skills as MCP tools that any
 * MCP-compatible client (Claude, OpenClaw, etc.) can invoke.
 */

const http = require("http");
const https = require("https");
const { randomUUID } = require("crypto");
const fs = require("fs");
const path = require("path");

// SCRUM-108: version comes from the package's own package.json (single source
// of truth) so the MCP banner can't drift from the published npm version.
const SDK_VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")).version || "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

// ── Config ──
// DD-audit fix: this server used to default to petId=1 and unauthenticated
// requests, ignoring the config `petclaw-sdk init` writes. Now it reads
// ~/.petclaw.json (the SAME file the CLI writes: serverUrl + pck_ token +
// the pet that init matched to your account), so `petclaw-mcp` in an MCP
// client config Just Works after `petclaw-sdk init`. Precedence:
// ~/.petclaw.json < PETCLAW_* env vars < --url/--pet-id CLI args.
const CONFIG_FILE = path.join(process.env.HOME || process.env.USERPROFILE || ".", ".petclaw.json");
let fileConfig = {};
try {
  if (fs.existsSync(CONFIG_FILE)) {
    fileConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    if (process.platform !== "win32" && (fs.statSync(CONFIG_FILE).mode & 0o077) !== 0) {
      fs.chmodSync(CONFIG_FILE, 0o600);
      process.stderr.write(`[petclaw-mcp] Repaired permissive config permissions on ${CONFIG_FILE}.\n`);
    }
  }
} catch (e) {
  process.stderr.write(`[petclaw-mcp] Could not read ${CONFIG_FILE}: ${e.message}\n`);
}

const args = process.argv.slice(2);
const configuredBaseUrl = fileConfig.serverUrl || "https://app.myaipet.ai";
let baseUrl = process.env.PETCLAW_URL || configuredBaseUrl;
// NO petId=1 default — an unconfigured server must say so, not silently act on
// the public demo pet. 0 = "not configured"; resolvePetId() below handles it.
let petId = parseInt(process.env.PETCLAW_PET_ID || "", 10) || parseInt(fileConfig.petId, 10) || 0;
// SCRUM-84/91: the CLI's `mcp` command exports PETCLAW_TOKEN from ~/.petclaw.json
// so the MCP server can act on the owner's PRIVATE pet. Reading the config file
// directly (above) also covers the `petclaw-mcp` bin entry, which doesn't go
// through the CLI.
const explicitToken = process.env.PETCLAW_TOKEN || "";
let token = explicitToken || fileConfig.token || "";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--url" && args[i + 1]) baseUrl = args[++i];
  if (args[i] === "--pet-id" && args[i + 1]) petId = parseInt(args[++i], 10) || 0;
  if (args[i] === "--token") {
    process.stderr.write("[petclaw-mcp] Refusing --token because process listings can expose it; use `petclaw-sdk auth` or PETCLAW_TOKEN.\n");
    process.exit(2);
  }
}
baseUrl = String(baseUrl).replace(/\/$/, "");

function serverOrigin(raw) {
  const parsed = new URL(String(raw));
  const loopback = parsed.hostname === "localhost"
    || parsed.hostname === "127.0.0.1"
    || parsed.hostname === "::1"
    || parsed.hostname === "[::1]";
  if (parsed.username || parsed.password) throw new Error("credentials are not allowed in the server URL");
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) {
    throw new Error("HTTPS is required (HTTP is allowed only for loopback development)");
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("the server URL must be an origin without a path, query, or fragment");
  }
  return parsed.origin;
}

// A token saved for app.myaipet.ai must never follow an independently
// overridden URL. A malicious project-level MCP config could otherwise point
// --url at its own server and receive the home-directory token in Authorization.
if (!explicitToken && fileConfig.token) {
  try {
    const configuredOrigin = serverOrigin(configuredBaseUrl);
    const requestedOrigin = serverOrigin(baseUrl);
    if (fileConfig.tokenOrigin !== configuredOrigin) {
      process.stderr.write(
        "[petclaw-mcp] Refusing an unbound legacy token; run `petclaw-sdk auth` to bind a new token to this server.\n",
      );
      process.exit(2);
    }
    if (configuredOrigin !== requestedOrigin) {
      process.stderr.write(
        `[petclaw-mcp] Refusing to send the saved token to ${requestedOrigin}; it is bound to ${configuredOrigin}. ` +
        "Use a separate PETCLAW_TOKEN explicitly if this server is trusted.\n",
      );
      process.exit(2);
    }
  } catch {
    process.stderr.write("[petclaw-mcp] Invalid configured or requested server URL.\n");
    process.exit(2);
  }
}
try {
  baseUrl = serverOrigin(baseUrl);
} catch (error) {
  process.stderr.write(`[petclaw-mcp] Invalid server URL: ${error.message}.\n`);
  process.exit(2);
}

const SETUP_HINT =
  "PetClaw MCP is not configured. Run `petclaw-sdk init` to connect this machine " +
  "to your pet (it saves the server URL, your pck_ CLI token, and your pet id to " +
  "~/.petclaw.json), then restart the MCP server.";

/**
 * Resolve the pet this server acts on. Uses the configured petId if present;
 * otherwise, with a token, resolves the caller's ONLY pet from /api/pets
 * (owner-scoped). It refuses to choose when the account has multiple pets and
 * never guesses petId=1. Throws an actionable Error when selection is needed.
 */
let resolvedPetId = 0;
async function resolvePetId() {
  if (petId > 0) return petId;
  if (resolvedPetId > 0) return resolvedPetId;
  if (!token) throw new Error(SETUP_HINT);
  const d = await fetchJSON(`${baseUrl}/api/pets`);
  const pets = Array.isArray(d.pets) ? d.pets : [];
  if (!pets.length) {
    throw new Error(
      d.error
        ? `Could not resolve your pet: ${d.error}. Check the pck_ token in ~/.petclaw.json (re-run \`petclaw-sdk auth\` and use the hidden prompt).`
        : "Your account has no pets yet — adopt one in the web app, then run `petclaw-sdk init`."
    );
  }
  if (pets.length > 1) {
    throw new Error(
      `Your account has ${pets.length} pets, so PetClaw MCP will not guess which identity to use. ` +
      "Run `petclaw-sdk pets`, then `petclaw-sdk use <petId>` (or rerun `petclaw-sdk init`), and restart the MCP server."
    );
  }
  resolvedPetId = pets[0].id;
  process.stderr.write(`[petclaw-mcp] Resolved active pet from your account: ${pets[0].name || "pet"} (#${resolvedPetId})\n`);
  return resolvedPetId;
}

// ── HTTP helper ──
const HTTP_TIMEOUT_MS = Math.max(1000, Number(process.env.PETCLAW_TIMEOUT_MS) || 75000);
const HTTP_MAX_BYTES = 2 * 1024 * 1024;
const SOUL_MAX_BYTES = 16 * 1024 * 1024;
const MCP_CHAT_SESSION_ID = `mcp-${randomUUID()}`;

function mutatePendingAgentRuns(mutator) {
  let latest = {};
  try { if (fs.existsSync(CONFIG_FILE)) latest = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); } catch {}
  const pending = latest.pendingAgentRuns && typeof latest.pendingAgentRuns === "object"
    ? { ...latest.pendingAgentRuns } : {};
  mutator(pending);
  latest.pendingAgentRuns = pending;
  const temp = `${CONFIG_FILE}.${process.pid}.mcp.tmp`;
  fs.writeFileSync(temp, JSON.stringify(latest, null, 2), { mode: 0o600 });
  if (process.platform !== "win32") fs.chmodSync(temp, 0o600);
  fs.renameSync(temp, CONFIG_FILE);
  if (process.platform !== "win32") fs.chmodSync(CONFIG_FILE, 0o600);
}

function rememberPendingAgentRun(run) {
  mutatePendingAgentRuns((pending) => { pending[run.runId] = run; });
}

function forgetPendingAgentRun(runId) {
  mutatePendingAgentRuns((pending) => { delete pending[runId]; });
}

function pendingAgentRunsForPet(pid) {
  try {
    const latest = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    return Object.values(latest.pendingAgentRuns || {}).filter((run) => run && run.petId === pid);
  } catch { return []; }
}

class ApiError extends Error {
  constructor(message, status, body, retryAfter) {
    super(message);
    this.name = "PetClawApiError";
    this.status = status || 0;
    this.body = body;
    this.retryAfter = retryAfter || null;
  }
}

function fetchJSON(url, options = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const body = options.body ? JSON.stringify(options.body) : null;

    let settled = false;
    const maxBytes = options.maxBytes ?? HTTP_MAX_BYTES;
    const req = mod.request(url, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        // Owner-auth so PRIVATE pets / owner-scoped skills work through MCP.
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
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
        try {
          const parsed = JSON.parse(data);
          // Expose the HTTP status (non-enumerable, same pattern as the CLI)
          // so callers can tell 401/404/5xx apart instead of "Unknown error".
          if (parsed && typeof parsed === "object") {
            Object.defineProperty(parsed, "__status", { value: res.statusCode, enumerable: false });
          }
          if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
            const message = parsed?.error || parsed?.detail || parsed?.message || `HTTP ${res.statusCode}`;
            reject(new ApiError(String(message), res.statusCode, parsed, res.headers["retry-after"]));
            return;
          }
          resolve(parsed);
        }
        catch (e) {
          if (e instanceof ApiError) reject(e);
          else reject(new ApiError(`Invalid JSON from ${url} (HTTP ${res.statusCode})`, res.statusCode));
        }
      });
    });

    req.setTimeout(HTTP_TIMEOUT_MS, () => req.destroy(new ApiError(`Request timed out after ${HTTP_TIMEOUT_MS}ms`, 0)));
    req.on("error", (e) => reject(e instanceof ApiError ? e : new ApiError(`Connection failed: ${e.message}`, 0)));
    if (body) req.write(body);
    req.end();
  });
}

const AGENT_RECEIPT_404_RECHECK_MS = 150;

async function fetchAgentRunStatusWithNotFoundRecheck(pid, runId) {
  const url = `${baseUrl}/api/pets/${pid}/agent/runs/${runId}`;
  try {
    return await fetchJSON(url);
  } catch (error) {
    if (error?.status !== 404) throw error;
  }
  await new Promise((resolve) => setTimeout(resolve, AGENT_RECEIPT_404_RECHECK_MS));
  return fetchJSON(url);
}

// ── MCP Protocol (JSON-RPC 2.0 over stdio) ──
// NOTE: do NOT create a readline interface here — it would steal stdin events
// from the data handler below (line-mode buffering swallows incoming JSON-RPC
// frames and the server hangs at "Starting..."). We read raw stdin and split
// on \n manually further down.

function sendResponse(id, result) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id, result });
  process.stdout.write(msg + "\n");
}

function sendError(id, code, message) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });
  process.stdout.write(msg + "\n");
}

/**
 * Turn a failed API response into an actionable message. The server returns
 * either a top-level { error } (auth / validation / rate-limit, with an HTTP
 * status) or { success:false, output:{ error } } (skill-level failure). The old
 * code only read output.error, so every 401 surfaced as "Unknown error".
 */
function describeApiError(result) {
  const status = result.__status;
  const raw = String(result.output?.error || result.error || "").trim();
  const msg = raw || (status ? `Request failed (HTTP ${status})` : "Request failed");
  let hint = "";
  if (status === 401 || status === 403 || /unauthor/i.test(raw)) {
    hint = token
      ? "The pck_ token was rejected (expired or revoked?) — generate a new one in the web app under Connect your CLI, then run `petclaw-sdk auth` and use the hidden prompt before restarting the MCP server."
      : "This action needs authentication — run `petclaw-sdk init` (or `petclaw-sdk auth` with its hidden prompt) and restart the MCP server.";
  } else if (status === 429 || /credit|quota|budget|capacity|limit reached/i.test(raw)) {
    hint = "Out of credits or rate-limited — top up credits or connect your own model (`petclaw-sdk models connect`).";
  } else if (status === 404 || /not installed|not found/i.test(raw)) {
    hint = "Check the skill id and pet id (`petclaw-sdk skills`, `petclaw-sdk pets`).";
  } else if (status >= 500) {
    hint = "Server error — try again shortly.";
  }
  return hint ? `Error: ${msg}\n${hint}` : `Error: ${msg}`;
}

function describeThrownError(error) {
  if (error instanceof ApiError) {
    const body = error.body && typeof error.body === "object" ? error.body : { error: error.message };
    if (!Object.prototype.hasOwnProperty.call(body, "__status")) {
      Object.defineProperty(body, "__status", { value: error.status, enumerable: false });
    }
    return describeApiError(body);
  }
  return `Error: ${error?.message || "Request failed"}`;
}

// ── Tool Definitions ──
const TOOLS = [
  {
    name: "petclaw_chat",
    description: "Chat with your selected AI pet. The result reports whether this turn was retained, plus session and inference lineage.",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", minLength: 1, maxLength: 500, description: "Message to send to the pet" },
      },
      required: ["message"],
      additionalProperties: false,
    },
  },
  {
    name: "petclaw_agent_run",
    description: "PAID: reserves 5 credits. Run a bounded PetClaw goal loop only after the owner explicitly acknowledges the cost with confirmCostCredits=5; returns answer, trace, stop reason, billing, and remaining credits.",
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string", minLength: 3, maxLength: 600, description: "Goal for the pet agent (3-600 characters)" },
        maxSteps: { type: "integer", minimum: 1, maximum: 6, description: "Maximum tool steps (1-6)", default: 4 },
        confirmCostCredits: {
          type: "integer",
          const: 5,
          description: "Required explicit acknowledgement that this new run may charge exactly 5 credits",
        },
      },
      required: ["goal", "confirmCostCredits"],
      additionalProperties: false,
    },
  },
  {
    name: "petclaw_persona_mirror",
    description: "Generate a response that mirrors the pet owner's speech patterns and tone.",
    inputSchema: {
      type: "object",
      properties: {
        context: { type: "string", minLength: 1, maxLength: 2000, description: "Context for the response" },
        surface: { type: "string", enum: ["web", "cli", "sdk", "mcp", "chrome-ext", "telegram", "discord"], default: "mcp" },
        sessionId: { type: "string", minLength: 1, maxLength: 120, pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$" },
      },
      required: ["context"],
      additionalProperties: false,
    },
  },
  {
    name: "petclaw_memory_recall",
    description: "Search the selected pet's retained memory for a specific non-empty query.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 2, maxLength: 300, description: "Specific text to search for in memories" },
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Max results", default: 10 },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "petclaw_summarize_page",
    description: "Summarize page text in 2 sentences in the pet's voice (pairs with the Chrome extension).",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", minLength: 1, maxLength: 2000, description: "Page text to summarize" },
      },
      required: ["message"],
      additionalProperties: false,
    },
  },
  {
    name: "petclaw_soul_export",
    description: "Export portable pet identity, memories, personality, and safe history as SOUL JSON.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "petclaw_discover_pets",
    description: "Discover other AI pets on the PetClaw network.",
    inputSchema: {
      type: "object",
      properties: {
        element: { type: "string", enum: ["fire", "water", "grass", "electric", "normal"] },
        personality: { type: "string" },
        minLevel: { type: "integer", minimum: 1 },
      },
      additionalProperties: false,
    },
  },
];

/**
 * MCP clients normally validate tool inputs from tools/list, but callers can
 * write JSON-RPC frames directly. Enforce the same published schema at the
 * server boundary so invalid values are never silently coerced into another
 * operation (for example maxSteps="oops" becoming the default paid run).
 * The seven public tools use the bounded JSON-Schema subset below.
 */
function validateSchemaValue(value, schema, location = "arguments") {
  if (!schema || typeof schema !== "object") return null;
  if (Object.prototype.hasOwnProperty.call(schema, "const") && value !== schema.const) {
    return `${location} must equal ${JSON.stringify(schema.const)}`;
  }

  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return `${location} must be an object`;
    }
    const properties = schema.properties && typeof schema.properties === "object"
      ? schema.properties
      : {};
    for (const field of Array.isArray(schema.required) ? schema.required : []) {
      if (!Object.prototype.hasOwnProperty.call(value, field)) {
        return `${location}.${field} is required`;
      }
    }
    if (schema.additionalProperties === false) {
      const unknown = Object.keys(value).find((field) => !Object.prototype.hasOwnProperty.call(properties, field));
      if (unknown) return `${location}.${unknown} is not allowed`;
    }
    for (const [field, fieldValue] of Object.entries(value)) {
      if (!Object.prototype.hasOwnProperty.call(properties, field)) continue;
      const issue = validateSchemaValue(fieldValue, properties[field], `${location}.${field}`);
      if (issue) return issue;
    }
    return null;
  }

  if (schema.type === "string") {
    if (typeof value !== "string") return `${location} must be a string`;
    if (Number.isInteger(schema.minLength) && value.length < schema.minLength) {
      return `${location} must contain at least ${schema.minLength} characters`;
    }
    if (Number.isInteger(schema.maxLength) && value.length > schema.maxLength) {
      return `${location} must contain at most ${schema.maxLength} characters`;
    }
    if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
      return `${location} must be one of: ${schema.enum.join(", ")}`;
    }
    if (schema.pattern && !(new RegExp(schema.pattern)).test(value)) {
      return `${location} has an invalid format`;
    }
    return null;
  }

  if (schema.type === "integer" || schema.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) return `${location} must be a finite number`;
    if (schema.type === "integer" && !Number.isInteger(value)) return `${location} must be an integer`;
    if (typeof schema.minimum === "number" && value < schema.minimum) return `${location} must be at least ${schema.minimum}`;
    if (typeof schema.maximum === "number" && value > schema.maximum) return `${location} must be at most ${schema.maximum}`;
    return null;
  }

  if (schema.type === "boolean" && typeof value !== "boolean") return `${location} must be a boolean`;
  return null;
}

// Map tool name → skill ID. Chat, memory, agent, export and discovery use their
// dedicated APIs below so they preserve the real contract instead of returning
// an `invoke_via_endpoint` descriptor.
const TOOL_SKILL_MAP = {
  petclaw_persona_mirror: "persona-mirror",
  petclaw_summarize_page: "summarize-page",
};

const RETAINED_SECRET_PATTERN = /(?:\b(?:api[\s_-]*key|access[\s_-]*token|auth(?:entication)?[\s_-]*token|bearer[\s_-]*token|client[\s_-]*secret|password|passcode|private[\s_-]*key|recovery[\s_-]*phrase|refresh[\s_-]*token|seed[\s_-]*phrase|session[\s_-]*token|credential|mnemonic|secret|token|jwt)\b\s*(?:is|=|:)?\s*\S+|\b(?:sk|xai|ghp|gho|github_pat|glpat|hf|pk_live|rk_live|pck|xox[baprs]|AKIA|ASIA|AIza|ya29)[-_A-Za-z0-9.]{6,}\b|\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{6,}|-----BEGIN\s+(?:RSA\s+|EC\s+|OPENSSH\s+)?PRIVATE\s+KEY-----|\b[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b)/i;
const RETAINED_HANGUL_PATTERN = /[\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\uac00-\ud7af\ud7b0-\ud7ff]/u;

function isProviderSafeRecallText(value) {
  const text = String(value || "");
  const separatedLabels = text.replace(/[_-]+/g, " ");
  return !RETAINED_HANGUL_PATTERN.test(text)
    && !RETAINED_SECRET_PATTERN.test(text)
    && !RETAINED_SECRET_PATTERN.test(separatedLabels);
}

function recallMatches(memoryPayload, query, limit) {
  const normalizedQuery = String(query || "").trim().slice(0, 300);
  const terms = normalizedQuery.toLowerCase().match(/[a-z0-9_'-]+/g) || [];
  if (normalizedQuery.length < 2 || terms.length === 0 || !isProviderSafeRecallText(normalizedQuery)) {
    return { query: normalizedQuery, matches: [], totalInspected: 0, error: "A specific memory query is required." };
  }
  const rows = [
    ...(memoryPayload.memories || []).map((entry) => ({ type: "memory", key: entry.key, content: entry.content, importance: entry.importance || 1 })),
    ...(memoryPayload.userProfile || []).map((entry) => ({ type: "profile", key: entry.key, content: entry.content, importance: 2 })),
    ...(memoryPayload.sessions || []).map((entry) => ({ type: "session", key: String(entry.id), content: entry.content, importance: 1, platform: entry.platform, createdAt: entry.createdAt })),
  ].filter((row) => isProviderSafeRecallText(`${row.key || ""} ${row.content || ""}`));
  const scored = rows.map((row) => {
    const content = String(row.content || "").toLowerCase();
    const lexical = terms.reduce((score, term) => score + (content.includes(term) ? 2 : 0), 0);
    return { row, score: lexical + Number(row.importance || 0) * 0.2 };
  });
  const selected = scored
    .filter((item) => item.score > Number(item.row.importance || 0) * 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(50, Number(limit) || 10)))
    .map((item) => ({ ...item.row, score: Number(item.score.toFixed(2)) }));
  return { query: normalizedQuery, matches: selected, totalInspected: rows.length };
}

// ── Handle MCP messages ──
async function handleMessage(msg) {
  const { id, method, params } = msg;

  switch (method) {
    case "initialize":
      return sendResponse(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: {
          name: "petclaw-mcp",
          // Single source of truth — package.json, never hardcoded.
          version: SDK_VERSION,
          description: "PetClaw — Companion AI with Data Sovereignty",
        },
      });

    case "tools/list":
      return sendResponse(id, { tools: TOOLS });

    case "tools/call": {
      const { name, arguments: toolArgs = {} } = params || {};

      const tool = TOOLS.find((candidate) => candidate.name === name);
      if (!tool) return sendError(id, -32601, `Unknown tool: ${name}`);
      const inputIssue = validateSchemaValue(toolArgs, tool.inputSchema);
      if (inputIssue) {
        return sendResponse(id, {
          content: [{ type: "text", text: `Invalid arguments for ${name}: ${inputIssue}` }],
          isError: true,
        });
      }

      // Persistent owner chat uses the dedicated chat route. The generic skill
      // executor has a narrower memory path and is not the canonical chat API.
      if (name === "petclaw_chat") {
        try {
          const pid = await resolvePetId();
          const result = await fetchJSON(`${baseUrl}/api/pets/${pid}/chat`, {
            method: "POST",
            body: {
              message: String(toolArgs.message || ""),
              surface: "mcp",
              sessionId: MCP_CHAT_SESSION_ID,
            },
          });
          const payload = {
            reply: String(result.reply || ""),
            degraded: result.degraded === true,
            memoryRetained: result.memoryRetained === true,
            session: result.session || null,
            inference: result.inference || null,
            ...(result.errorCode ? { errorCode: result.errorCode } : {}),
          };
          if (result.degraded) {
            return sendResponse(id, {
              content: [{
                type: "text",
                text: JSON.stringify({ error: result.errorCode || "llm_unavailable", ...payload }, null, 2),
              }],
              structuredContent: payload,
              isError: true,
            });
          }
          return sendResponse(id, {
            content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
            structuredContent: payload,
          });
        } catch (e) {
          return sendResponse(id, { content: [{ type: "text", text: describeThrownError(e) }], isError: true });
        }
      }

      if (name === "petclaw_agent_run") {
        let runId;
        const reconciliationNotices = [];
        try {
          const pid = await resolvePetId();
          for (const pending of pendingAgentRunsForPet(pid)) {
            let status;
            try {
              status = await fetchAgentRunStatusWithNotFoundRecheck(pid, pending.runId);
            } catch (error) {
              if (error?.status === 404) {
                forgetPendingAgentRun(pending.runId);
                reconciliationNotices.push(
                  `No durable receipt was found for ${pending.runId} after two checks; its local marker was cleared. The server's per-pet guard prevents an overlapping paid charge.`,
                );
                continue;
              }
              throw error;
            }
            if (status.state === "terminal") forgetPendingAgentRun(pending.runId);
            else throw new Error(`Paid run ${pending.runId} is still ${status.state}; do not start another paid run`);
          }
          runId = randomUUID();
          rememberPendingAgentRun({ runId, petId: pid, goal: String(toolArgs.goal || ""), surface: "mcp", createdAt: new Date().toISOString() });
          const result = await fetchJSON(`${baseUrl}/api/pets/${pid}/agent`, {
            method: "POST",
            body: {
              runId,
              goal: String(toolArgs.goal || ""),
              maxSteps: Math.max(1, Math.min(6, Number(toolArgs.maxSteps) || 4)),
              // The tool schema has already required the exact literal 5.
              // Forward the acknowledgement so the HTTP boundary independently
              // refuses any client that did not opt into this paid run.
              confirmCostCredits: toolArgs.confirmCostCredits,
            },
          });
          if (result.state !== "terminal" || result.runId !== runId || !result.billing) {
            throw new Error(`Paid run ${runId} is pending reconciliation; check Account or its owner receipt endpoint before retrying`);
          }
          forgetPendingAgentRun(runId);
          const responsePayload = reconciliationNotices.length
            ? { ...result, reconciliationNotices }
            : result;
          return sendResponse(id, {
            content: [{ type: "text", text: JSON.stringify(responsePayload, null, 2) }],
            // The HTTP endpoint intentionally returns the trace for bounded
            // terminal stops. MCP clients still need a machine-visible failure
            // signal so max_steps/timeout/planner_error are not treated as a
            // successfully completed automation.
            ...(result.completed === false || result.ok === false ? { isError: true } : {}),
          });
        } catch (e) {
          if (runId && e?.status > 0 && e.status < 500) forgetPendingAgentRun(runId);
          const pending = runId && (!e?.status || e.status >= 500)
            ? { runId, state: "pending_reconciliation", retryable: false }
            : null;
          return sendResponse(id, {
            content: [{ type: "text", text: pending
              ? JSON.stringify({ error: describeThrownError(e), ...pending }, null, 2)
              : describeThrownError(e) }],
            ...(pending ? { structuredContent: pending } : {}),
            isError: true,
          });
        }
      }

      if (name === "petclaw_memory_recall") {
        try {
          const query = String(toolArgs.query || "").trim();
          if (query.length < 2 || !isProviderSafeRecallText(query)) {
            return sendResponse(id, {
              content: [{ type: "text", text: "A specific, non-secret memory query of at least 2 characters is required." }],
              isError: true,
            });
          }
          const pid = await resolvePetId();
          const result = await fetchJSON(`${baseUrl}/api/petclaw/memory?petId=${pid}`);
          const recalled = recallMatches(result, query, toolArgs.limit);
          return sendResponse(id, { content: [{ type: "text", text: JSON.stringify(recalled, null, 2) }] });
        } catch (e) {
          return sendResponse(id, { content: [{ type: "text", text: describeThrownError(e) }], isError: true });
        }
      }

      // Special case: discover
      if (name === "petclaw_discover_pets") {
        try {
          const qs = new URLSearchParams(
            Object.fromEntries(Object.entries(toolArgs || {}).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))
          );
          const result = await fetchJSON(`${baseUrl}/api/petclaw/network/discover?${qs}`);
          if (result.error) {
            return sendResponse(id, {
              content: [{ type: "text", text: describeApiError(result) }],
              isError: true,
            });
          }
          return sendResponse(id, {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          });
        } catch (e) {
          return sendResponse(id, {
            content: [{ type: "text", text: describeThrownError(e) }],
            isError: true,
          });
        }
      }

      // Special case: soul export
      if (name === "petclaw_soul_export") {
        try {
          const pid = await resolvePetId();
          const result = await fetchJSON(`${baseUrl}/api/petclaw/export?petId=${pid}`, {
            maxBytes: SOUL_MAX_BYTES,
          });
          if (result.error) {
            return sendResponse(id, {
              content: [{ type: "text", text: describeApiError(result) }],
              isError: true,
            });
          }
          return sendResponse(id, {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          });
        } catch (e) {
          return sendResponse(id, {
            content: [{ type: "text", text: describeThrownError(e) }],
            isError: true,
          });
        }
      }

      // Skill execution
      const skillId = TOOL_SKILL_MAP[name];

      try {
        const pid = await resolvePetId();
        const skillInput = name === "petclaw_persona_mirror"
          ? {
              ...toolArgs,
              surface: toolArgs.surface || "mcp",
              sessionId: toolArgs.sessionId || MCP_CHAT_SESSION_ID,
            }
          : (toolArgs || {});
        const result = await fetchJSON(`${baseUrl}/api/petclaw/skills`, {
          method: "POST",
          body: { action: "execute", petId: pid, skillId, input: skillInput },
        });

        if (result.success) {
          // Chat-style tools return the pet's reply as plain text (what the
          // calling agent actually wants), not a JSON blob.
          const text = typeof result.output?.reply === "string"
            ? result.output.reply
            : (typeof result.output === "object" ? JSON.stringify(result.output, null, 2) : String(result.output));
          return sendResponse(id, {
            content: [{ type: "text", text }],
          });
        }

        return sendResponse(id, {
          content: [{ type: "text", text: describeApiError(result) }],
          isError: true,
        });
      } catch (e) {
        return sendResponse(id, {
          content: [{ type: "text", text: describeThrownError(e) }],
          isError: true,
        });
      }
    }

    case "notifications/initialized":
      // Client acknowledged initialization
      return;

    default:
      return sendError(id, -32601, `Method not found: ${method}`);
  }
}

// ── Stdio listener ──
let buffer = "";

process.stdin.setEncoding("utf8");
process.stdin.resume(); // ensure stream is in flowing mode

process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      Promise.resolve(handleMessage(msg)).catch((error) => {
        process.stderr.write(`[petclaw-mcp] Request failed: ${error?.message || "unknown error"}\n`);
        sendError(msg?.id ?? null, -32603, "Internal error");
      });
    } catch (e) {
      process.stderr.write(`[petclaw-mcp] Parse error: ${e.message}\n`);
      sendError(null, -32700, "Parse error");
    }
  }
});

// MCP clients close stdin to signal shutdown
process.stdin.on("end", () => {
  process.stderr.write(`[petclaw-mcp] stdin closed, exiting\n`);
  process.exit(0);
});

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));

// Compact start banner — STDERR only (stdout is the JSON-RPC channel; never
// write decoration there). Colors only on a TTY / when NO_COLOR is unset.
(() => {
  const tty = process.stderr.isTTY && !process.env.NO_COLOR;
  const A = (s) => (tty ? `\x1b[38;5;214m${s}\x1b[0m` : s);
  const D = (s) => (tty ? `\x1b[38;5;244m${s}\x1b[0m` : s);
  const e = (s) => process.stderr.write(s + "\n");
  e("");
  e("  " + A("◆ PETCLAW") + D("  owner-controlled companion identity, memory & consent layer · MCP server"));
  // 19 connectors = the platform's AVAILABLE_CONNECTORS registry (messaging 8 ·
  // productivity 3 · media 2 · knowledge 4 · crypto 2).
  e("  " + D(`protocol v1 · SDK ${SDK_VERSION} · 7 tools · 18 skill manifests · retained memory · 19 registered connectors`));
  e("  " + D(`server: ${baseUrl} · pet: ${petId > 0 ? `#${petId}` : "not configured — run petclaw-sdk init"} · auth: ${token ? "pck_ token" : "none"}`));
  e("  " + A("ready") + D(" — exposing chat, agent_run, persona_mirror, memory_recall, summarize_page, soul_export, discover_pets"));
  e("");
})();
