# PetClaw Quickstart

PetClaw is an owner-controlled companion layer for web, SDK, CLI and MCP.

## SDK 2.0.0 release contract

```bash
npm view @myaipet/petclaw-sdk version
```

SDK `2.0.0` makes `taskKind` mandatory for paid SDK, CLI, and MCP tasks,
accepts task input up to 2,000 characters, and normalizes deprecated
`maxSteps` compatibility input to `1`. During rollout, verify npm reports
`2.0.0` or later before relying on this contract. Never install the unrelated
unscoped `petclaw-sdk` package.

## 1. Install and authenticate

```bash
npm install -g @myaipet/petclaw-sdk
petclaw-sdk version
petclaw-sdk auth
petclaw-sdk pets
petclaw-sdk use <petId>
petclaw-sdk doctor
```

Generate a `pck_` token in **Sovereignty → Connect PetClaw clients**. `auth`
reads it through a hidden prompt and stores `~/.petclaw.json` with owner-only
permissions. CI may use `PETCLAW_TOKEN`. Do not place tokens in argv.

The only anonymous chat surface is the synthetic, stateless preview:

```bash
petclaw-sdk demo "hello"
# Equivalent REST: POST /api/petclaw/demo-chat {"message":"hello"}
```

Persistent `chat`, `talk`, skills, models, memory, agent and SOUL operations
require owner authentication.

## 2. Persistent chat and typed paid tasks

```bash
petclaw-sdk chat "Remember that I prefer concise release notes"
petclaw-sdk talk
petclaw-sdk agent "Recall my work context and suggest one next step" --task recall --confirm-cost 5 --max-steps 1
petclaw-sdk agent "The release adds mandatory typed tasks and exact billing receipts; deployment follows npm publication." --task summarize --confirm-cost 5 --json
```

One-shot CLI chat stores a non-secret random `clientId` in `~/.petclaw.json`.
That keeps its session stable across invocations while isolating raw session
history from another CLI installation controlling the same pet.

An explicit `--task recall|summarize|review|draft` and the exact
`--confirm-cost 5` acknowledgement are required before HTTP. Task input is
capped at 2,000 characters. `maxSteps` is deprecated; compatibility input is
ignored and normalized to `1`. The typed task executes its single server-bound
required tool exactly once and normally reports `completed`, `timeout`, or
`task_error`. `planner_error` remains in the SDK union for legacy receipts.

| Task | Paid deliverable |
|---|---|
| `recall` | Retrieved owner-private facts plus an answer grounded in those facts |
| `summarize` | Structured decision brief: summary, key facts, risk/unknown, and next step |
| `review` | Primary issue, why it matters, and a revised version |
| `draft` | Reviewable text only; it is not sent, published, or executed |

The required tool does not write pet memory or self-learning data. The service
stores owner-private run input, result, trace, and billing history for
reconciliation and audit. A completed response carries the exact server
receipt, including the bound task, tool outcome, model-call counts, and credit
outcome. Five credits are charged only when the required tool succeeds without
a side effect and returns the contract-valid deliverable. Empty recall,
wrong-tool, degraded, failed, incomplete, refusal, direct-answer-only, and
non-contract outputs are refunded. Rerunning is a new paid run, not checkpoint
resume.

## 3. Bring your own model

```bash
# Key is read from a hidden prompt and encrypted server-side.
petclaw-sdk models connect openai --scopes=chat,reason
petclaw-sdk models list
```

Never pass model keys in command arguments or skill config. API clients use the
exact `taskScopes` field.

## 4. Skills

```bash
petclaw-sdk skills
# Core runtime: executable without an install record.
petclaw-sdk execute companion-chat "hello"
petclaw-sdk install persona-mirror
printf '%s' '{"context":"Draft a concise release note","surface":"cli","sessionId":"release-notes"}' \
  | petclaw-sdk execute persona-mirror --json-stdin
petclaw-sdk uninstall persona-mirror
```

Message shorthand works only for manifests with a compatible `message` schema.
Use `--json-stdin` for typed objects and keep credentials out of command-line
arguments.

`companion-chat` and `summarize-page` are always-present core runtime skills.
Installing one only stores optional preferences/version data; uninstalling it
removes that saved data while the core capability stays active. The `skills`
command reports this state as `core` rather than `installed`.

The registry contains 18 built-in manifests. LLM handlers execute through the
generic route. REST-backed skills return an honest `invoke_via_endpoint`
descriptor; call that typed endpoint separately. Cross-pet invocation is
launch-disabled.

## 5. MCP

```bash
petclaw-sdk mcp
```

SDK 2.0.0 defines seven owner-authenticated stdio tools: persistent chat,
typed paid task, persona mirror, memory recall, approved page-text summary,
SOUL export and read-only discovery. Restart the MCP client after changing auth.

For Claude-, Cursor- and other stdio-MCP-compatible clients:

```json
{
  "mcpServers": {
    "petclaw": {
      "command": "petclaw-mcp"
    }
  }
}
```

The process reads the owner-bound, mode-`0600` `~/.petclaw.json`. Never copy
the token into MCP args or config env. Smoke the local transport with:

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
reads MCP servers from `~/.hermes/config.yaml`:

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

Restart Hermes and ask it to call `petclaw_chat` as the integration smoke. Add
`petclaw_agent_run` only for an intended paid typed task, and
include a valid `taskKind` plus `confirmCostCredits: 5` on each call; a missing
or different value is rejected before HTTP. Add `petclaw_soul_export` only when
the caller may receive portable private data.
Direct SDK callers must generate and persist a UUID with
`createPetClawAgentRunId()` before calling `agent.run`. CLI and MCP each
generate one ID and retain it for reconciliation. Look up unknown transport
outcomes from Account or `client.agent.status(petId, runId)` before retrying.
If no receipt is visible, keep the local pending marker locked. Replay only the
exact saved `runId`, `goal`, `taskKind`, normalized `maxSteps: 1`, and
`confirmCostCredits` against the server origin to which that authorization was
bound. Never mint a new run ID or clear the marker merely because a receipt is
absent.
Use `petclaw-sdk auth`; never copy its token into Hermes YAML, args or env.
To expose `petclaw_persona_mirror`, first install `persona-mirror` for the
selected pet, then add that MCP tool to the allowlist.

## 6. TypeScript

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
    goal: "What are my current launch priorities?",
    taskKind: "recall",
    maxSteps: 1,
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

The SDK 2.0.0 contract sends owner credentials only to an HTTPS origin (HTTP is limited to
loopback development), enforces its deadline even with an injected fetch, and
caps response bodies: 2 MiB normally and 16 MiB for SOUL export, matching import.

## 7. SOUL and memory control

```bash
petclaw-sdk export
```

SOUL uses a SHA-256 integrity checksum, not a publisher signature. Import is
validated reconstruction with exclusions. Owners can inspect, correct and
delete retained data. Full pet deletion returns `409 agent_run_in_progress`
until that pet's paid run has a terminal receipt. It then scrubs the private pet
name, goal, answer and steps while retaining the minimal owner billing receipt.
Active-system deletion and backup retention are separate documented controls.

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

- [API Reference](https://app.myaipet.ai/api-docs?tab=api)
- [Ecosystem](https://app.myaipet.ai/api-docs?tab=ecosystem)
- [SDK on npm](https://www.npmjs.com/package/@myaipet/petclaw-sdk)
