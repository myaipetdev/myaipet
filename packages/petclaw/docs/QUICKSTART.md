# PetClaw Quickstart

PetClaw is the portable companion layer for web apps, CLI tools and MCP clients.
Persistent pet actions are owner-scoped; the public demo is synthetic and saves
nothing.

## 1. Install

```bash
npm install -g @myaipet/petclaw-sdk
petclaw-sdk version
```

Verify npm and the installed CLI report `1.6.3` or later:

```bash
npm view @myaipet/petclaw-sdk version
```

SDK `1.6.3` publishes the repaired MCP, agent, session-lineage,
secret-handling and paid-run replay-protection flow documented in this guide.

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

## 3. Chat and run a goal

```bash
petclaw-sdk chat "Remember that I prefer short release notes"
petclaw-sdk talk
petclaw-sdk agent "Recall my work context and suggest one next step" --confirm-cost 5 --max-steps 4
petclaw-sdk agent "Summarize what you know" --confirm-cost 5 --json
```

One-shot CLI chat stores a non-secret random `clientId` in `~/.petclaw.json`.
That keeps its session stable across invocations while isolating raw session
history from another CLI installation controlling the same pet.

Agent runs require the exact `--confirm-cost 5` acknowledgement, are bounded to
1–6 steps, and return `completed`, `max_steps`, `timeout`, or `planner_error`.
The loop exposes only eligible read-only skills and connectors, with retention
and self-learning disabled, so it cannot commit a durable side effect. Five
credits are reserved, then charged for a completed direct model answer or a
completed run with a successful read-only result; other terminal runs refund
the reservation. The response includes the billing decision. A CLI retry is a
new run, not checkpoint resume.

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
chat, bounded agent run, persona mirror, real memory inspection/recall, approved
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
comes from the selected pet. Add `petclaw_agent_run` only when a paid bounded
run is intended. Each call must include `confirmCostCredits: 5`; a missing or
different acknowledgement is rejected before any HTTP request.
Direct SDK callers must generate and persist a UUID with
`createPetClawAgentRunId()` before calling `agent.run`. CLI and MCP each
generate one ID and retain it for reconciliation. Look up unknown transport
outcomes from Account or `client.agent.status(petId, runId)` before retrying.
If no receipt is visible, keep the local pending marker locked. Replay only the
exact saved `runId`, `goal`, `maxSteps`, and `confirmCostCredits` against the
server origin to which that authorization was bound. Never mint a new run ID or
clear the marker merely because a receipt is absent.
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
    goal: "Suggest one next step",
    maxSteps: 4,
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

## Next steps

- [API Reference](./API.md)
- [Skill authoring](./SKILL-AUTHORING.md)
- [Ecosystem](./ECOSYSTEM.md)
- [Live docs](https://app.myaipet.ai/api-docs)
