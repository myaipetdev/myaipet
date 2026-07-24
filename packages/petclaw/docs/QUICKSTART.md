# PetClaw Quickstart

PetClaw is the portable companion layer for web apps, CLI tools and MCP clients.
Persistent pet actions are owner-scoped; the public demo is synthetic and saves
nothing.

## 1. Install

```bash
npm install -g @myaipet/petclaw-sdk
petclaw-sdk version
```

Verify npm and the installed CLI report `2.0.0` or later:

```bash
npm view @myaipet/petclaw-sdk version
```

SDK `2.0.0` makes `taskKind` mandatory for paid tasks, raises task input to
a 2,000-character maximum with kind-specific minimums, and normalizes the
deprecated `maxSteps` compatibility field to `1`. SDK 1.6.2 allowed
`agent.run` calls without `taskKind`, so upgrading callers must add one of the
four supported kinds.

The source package is `@myaipet/petclaw-sdk`. Do not install the unrelated,
older unscoped `petclaw-sdk` package.

## 2. Connect an owner account

Generate a `pck_` token in the web app under
`/?section=sovereignty` → **Connect your CLI**, then run:

```bash
petclaw-sdk auth
petclaw-sdk pets
petclaw-sdk use <petId>
petclaw-sdk doctor
```

`auth` reads the token from a hidden prompt and writes `~/.petclaw.json` with
owner-only permissions. For CI, set `PETCLAW_TOKEN`; do not put tokens in argv.
`init` combines server, hidden authentication, pet selection and model choice.

Without authentication, only server status, skill discovery and the stateless
preview are available:

```bash
petclaw-sdk demo "hello"
```

## 3. Chat and run a typed task

```bash
petclaw-sdk chat "Remember that I prefer short release notes"
petclaw-sdk talk
petclaw-sdk agent "What did I say about my launch priorities?" --task recall --confirm-cost 5
petclaw-sdk agent "Release notes: typed tasks now have safer retries and clearer billing receipts." --task summarize --confirm-cost 5 --json
```

One-shot CLI chat stores a non-secret random `clientId` in `~/.petclaw.json`.
That keeps its session stable across invocations while isolating raw session
history from another CLI installation controlling the same pet.

Agent runs require exactly one
`--task <recall|summarize|review|draft>` and the exact `--confirm-cost 5`
acknowledgement. Input has a 2,000-character maximum; minimums are 8 for recall,
40 for summarize, 12 for review, and 20 for draft. Bracket placeholders are
rejected. Concrete API keys/tokens, JWTs, authorization values, private-key
blocks, password/secret assignments, database URLs/session cookies, recovery
codes, and OTP/MFA codes are rejected before journal or network access and are
never written to `~/.petclaw.json`; ordinary credential-safety discussion is
allowed. `maxSteps` is deprecated; CLI/MCP still accept legacy values 1–6,
ignore them, and send `1`.
Typed v2 executes its single server-bound required read-only tool exactly once
and normally returns `completed`, `timeout`, or `task_error`. `planner_error`
remains in the SDK union for legacy receipts. Use `recall`
for an owner-memory question, `summarize` or `review` for text supplied in the
input, and `draft` for a supplied brief. The required tool does not write pet
memory or self-learning data. Owner-private run input, result, trace, and
billing history are stored for reconciliation and audit. Five credits are
reserved, then charged only when the tool succeeds without a side effect and
returns a deliverable; empty recall, mismatched, degraded, failed, and
incomplete runs refund the reservation. A CLI retry is a new run, not
checkpoint resume.

## 4. Skills and models

```bash
petclaw-sdk skills
# Core runtime: executable without an install record.
petclaw-sdk execute companion-chat "hello"
petclaw-sdk install persona-mirror
printf '%s' '{"context":"Draft a concise release note","surface":"cli","sessionId":"release-notes"}' \
  | petclaw-sdk execute persona-mirror --json-stdin
petclaw-sdk uninstall persona-mirror

# The key is requested through a hidden prompt.
petclaw-sdk models connect openai --scopes=chat,reason
petclaw-sdk models list
```

Message shorthand is accepted only by skills whose manifest declares a
`message` input and no other required field. Use `--json-stdin` for typed skill
objects; `--json-input '{...}'` is available for non-secret interactive values.

`companion-chat` and `summarize-page` are always-present core runtime skills.
Installing one only stores optional preferences/version data; uninstalling it
removes that saved data while the core capability stays active. The `skills`
command reports this state as `core` rather than `installed`.

The registry contains 18 skill manifests. `llm-prompt` skills execute through
the generic skill endpoint; REST-backed skills return an honest
`invoke_via_endpoint` descriptor and must be called at that typed endpoint.
Cross-pet invocation is launch-disabled.

## 5. MCP

```bash
petclaw-sdk mcp
```

The stdio server reads the same owner config and exposes seven tools: persistent
chat, typed paid task, persona mirror, real memory inspection/recall, approved
page-text summarization, SOUL export and read-only pet discovery. Restart the MCP
client after changing authentication.

For Claude-, Cursor- and other stdio-MCP-compatible clients, add this server
entry after the global npm install and `petclaw-sdk auth`:

```json
{
  "mcpServers": {
    "petclaw": {
      "command": "petclaw-mcp"
    }
  }
}
```

The MCP process reads the owner-bound, mode-`0600` `~/.petclaw.json`. Do not
copy the token into MCP `args` or config `env`. A local protocol smoke is:

If no pet is selected, MCP falls back only when the account owns exactly one
pet. For a multi-pet account it refuses to guess: run `petclaw-sdk pets`, then
`petclaw-sdk use <petId>`, and restart the MCP client.

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | petclaw-mcp
```

### Hermes Agent

[Hermes v0.18.2 (`v2026.7.7.2`)](https://github.com/NousResearch/hermes-agent/blob/v2026.7.7.2/website/docs/user-guide/features/mcp.md)
reads MCP servers from `~/.hermes/config.yaml`. Start with a read/chat
allowlist:

```yaml
mcp_servers:
  petclaw:
    command: "petclaw-mcp"
    timeout: 90
    tools:
      include:
        - petclaw_chat
        - petclaw_memory_recall
```

Restart Hermes, then ask it to call `petclaw_chat` and confirm that the reply
comes from the selected pet. Add `petclaw_agent_run` only when a paid typed task
is intended. Each call must include a valid `taskKind` (`recall`,
`summarize`, `review`, or `draft`) and `confirmCostCredits: 5`; a missing or
invalid task kind or a missing/different acknowledgement is rejected before any
HTTP request.
Direct SDK callers must generate and persist a UUID with
`createPetClawAgentRunId()` before calling `agent.run`. CLI and MCP each
generate one ID and retain it for reconciliation. Look up unknown transport
outcomes from Account or `client.agent.status(petId, runId)` before retrying.
If no receipt is visible, keep the local pending marker locked. Replay only the
exact saved `runId`, `goal`, `taskKind`, normalized `maxSteps: 1`, and
`confirmCostCredits` against the server origin to which that authorization was
bound. Never mint a new run ID or clear the marker merely because a receipt is
absent.
Add `petclaw_soul_export` only when the caller is allowed to
receive the pet's portable private data. `petclaw-sdk auth` remains the only
token setup step; never copy its token into Hermes YAML, command args or env.
To expose `petclaw_persona_mirror`, first run
`petclaw-sdk install persona-mirror`, then add that MCP tool to the allowlist.

## 6. Use the TypeScript client

```typescript
import {
  PetClawClient,
  PetClawError,
  createPetClawAgentRunId,
} from "@myaipet/petclaw-sdk";

// Authenticated SDK calls belong in server-side Node.js only. Never expose a
// pck_ token in browser code, NEXT_PUBLIC_ variables, or a client bundle.
const authToken = process.env.PETCLAW_TOKEN;
if (!authToken) throw new Error("PETCLAW_TOKEN is required");
const client = new PetClawClient({
  baseUrl: "https://app.myaipet.ai",
  authToken,
  // Agent runs have a 60s server budget; keep the client deadline above it.
  timeoutMs: 75_000,
});

try {
  const selectedPetId = Number(process.env.PETCLAW_PET_ID);
  const { pets } = await client.pets.list();
  if (!pets.some((pet) => pet.id === selectedPetId)) {
    throw new Error("PETCLAW_PET_ID must identify a pet owned by this token");
  }
  const chat = await client.chat.send(selectedPetId, "Hello");
  // Persist before sending and reuse for receipt lookup after an unknown
  // transport outcome. A new ID represents a new paid run.
  const runId = createPetClawAgentRunId();
  const run = await client.agent.run(selectedPetId, {
    runId,
    goal: "Review this release note for unclear claims: …",
    taskKind: "review",
    confirmCostCredits: 5,
  });
  const memory = await client.memory.inspect(selectedPetId);
  if (chat.degraded) throw new Error(chat.errorCode || "llm_unavailable");
  if (!run.completed) throw new Error(`agent stopped: ${run.stoppedReason}`);
  console.log(chat.reply, memory.stats);
} catch (error) {
  if (error instanceof PetClawError) {
    console.error(error.status, error.code, error.retryable);
  }
}
```

The SDK sends owner credentials only to an HTTPS origin (plain HTTP is accepted
for `localhost`/loopback development), enforces the request deadline even for an
injected fetch implementation, and caps response bodies. SOUL export has the
same 16 MiB portability ceiling as import; ordinary responses are capped at 2 MiB.

## 7. Export and control memory

```bash
petclaw-sdk export
```

SOUL export/import uses a SHA-256 integrity checksum, not a server signature.
Restore is documented reconstruction rather than a byte-for-byte clone. Owners
can inspect, edit and delete retained memory through the SDK/API. Full pet
deletion returns `409 agent_run_in_progress` until that pet's paid run has a
terminal receipt. It then scrubs the private pet name, goal, answer and steps
while retaining the minimal owner billing receipt. Active-system deletion and
backup-retention limits are documented in the privacy policy.

Competitive state, media, external connections, credentials, and consent are excluded.

Paid Agent Office history is deliberately separate from the portable SOUL
bundle. The web app exposes **Start Account Run History Export**, or an owner can
call the bounded HTTP route directly:

```bash
curl -fsS \
  -H "Authorization: Bearer $PETCLAW_TOKEN" \
  "https://app.myaipet.ai/api/account/agent-runs/export?limit=100" \
  -o MYAIPET_ACCOUNT_AGENT_RUNS_page_1.json
```

The npm SDK 2.0.0 does not wrap this endpoint. Each response is at most 100
newest-first records, 65,536 serialized bytes per record and 1,048,576 bytes
per page. It includes the caller-generated `reconciliationId`, an opaque
`nextCursor`, redaction/truncation metadata and a SHA-256 page checksum.
URL-encode and follow each cursor until `hasMore:false`; if it becomes invalid
after an account or server-secret change, restart from page one. To independently
verify the checksum, remove `integrity`, recursively sort object keys
lexicographically (preserving array order), JSON-serialize as UTF-8, and hash
those bytes. The checksum detects file changes; it is not a signature.

## Next steps

- [API Reference](./API.md)
- [Skill authoring](./SKILL-AUTHORING.md)
- [Ecosystem](./ECOSYSTEM.md)
- [Live docs](https://app.myaipet.ai/api-docs)
