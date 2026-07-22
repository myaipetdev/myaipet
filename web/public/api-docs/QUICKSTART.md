# PetClaw Quickstart

PetClaw is an owner-controlled companion layer for web, SDK, CLI and MCP.

## Release gate

```bash
npm view @myaipet/petclaw-sdk version
```

Do not rely on the repaired MCP/agent/secret-handling flow until npm reports
`1.6.2` or later. The older published `1.6.1` has a broken MCP path. Never
install the unrelated unscoped `petclaw-sdk` package.

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

## 2. Persistent chat and bounded agent

```bash
petclaw-sdk chat "Remember that I prefer concise release notes"
petclaw-sdk talk
petclaw-sdk agent "Recall my work context and suggest one next step" --confirm-cost 5 --max-steps 4
petclaw-sdk agent "Summarize what you know" --confirm-cost 5 --json
```

One-shot CLI chat stores a non-secret random `clientId` in `~/.petclaw.json`.
That keeps its session stable across invocations while isolating raw session
history from another CLI installation controlling the same pet.

The exact `--confirm-cost 5` acknowledgement is required before HTTP. The goal
runner is bounded to 1–6 steps and reports `completed`, `max_steps`, `timeout`,
or `planner_error`. It exposes only eligible read-only skills and connectors,
with retention and self-learning disabled, and cannot commit durable side
effects. Five credits are charged only for a completed direct model answer or
a completed run with a successful read-only result; other terminal runs are
refunded. Rerunning is a new paid run, not checkpoint resume.

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

SDK 1.6.2 defines seven owner-authenticated stdio tools: persistent chat,
bounded agent run, persona mirror, memory recall, approved page-text summary,
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
`petclaw_agent_run` only for an intended paid bounded run, and
include `confirmCostCredits: 5` on each call; a missing or different value is
rejected before HTTP. Add `petclaw_soul_export` only when the caller may receive
portable private data.
Direct SDK callers must generate and persist a UUID with
`createPetClawAgentRunId()` before calling `agent.run`. CLI and MCP each
generate one ID and retain it for reconciliation. Look up unknown transport
outcomes from Account or `client.agent.status(petId, runId)` before retrying.
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

The SDK 1.6.2 candidate sends owner credentials only to an HTTPS origin (HTTP is limited to
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

## Next steps

- [API Reference](https://app.myaipet.ai/api-docs?tab=api)
- [Ecosystem](https://app.myaipet.ai/api-docs?tab=ecosystem)
- [SDK on npm](https://www.npmjs.com/package/@myaipet/petclaw-sdk)
