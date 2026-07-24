# @myaipet/petclaw-sdk

**The open protocol for AI companions you actually own.**

PetClaw is an open protocol for companion AI pets that puts data ownership in users' hands.
Built on one principle: **your pet, your data, your rules.**

`18 skill manifests · 7 MCP tools · 19 registered connectors · MIT`

> **Published release:** SDK `2.0.0` includes typed paid tasks, the repaired
> seven-tool MCP, normalized session-lineage, fail-closed secret handling, and
> cross-process/cross-origin paid-run replay protection.
> Verify the installed version with `petclaw-sdk version`.

## Migrating from 1.x

SDK 2.0 is a major release because `agent.run` now requires `taskKind`; SDK
1.6.2 allowed calls without it. Add `recall`, `summarize`, `review`, or `draft`
to every SDK/CLI/MCP paid task. Task input now has kind-specific minimums and a
2,000-character maximum. `maxSteps` is deprecated and ignored: compatibility
inputs are normalized to `1` because a typed task executes one server-bound
tool.

## How a PetClaw pet thinks

PetClaw is a portable companion control plane. Its paid typed-task runner and
persistent chat are separate, explicit surfaces:

| | Role | What it is |
|---|---|---|
| 🧭 | **Select → Execute** | The owner chooses Recall, Summarize, Review, or Draft; the server maps it to one approved read-only tool and canonical input. |
| 🧠 | **Recall** | Retained memory uses TF-IDF/recency/importance ranking plus conditional semantic vectors and reciprocal-rank fusion where embeddings exist. |
| 🔁 | **Reflect** | Best-effort retention, consolidation and learned patterns can shape later replies; owners can inspect, edit and delete them. |
| 🌐 | **Portable** | The same owner-controlled SOUL and memory APIs are available to web, CLI, SDK and MCP clients. |

## Quickstart (CLI)

```bash
# 1. Install
npm i -g @myaipet/petclaw-sdk    # or run ad-hoc with: npx @myaipet/petclaw-sdk <cmd>

# 2. Authenticate FIRST — install/execute on your own pet, export, and
#    models-connect all need an owner CLI token. Generate one in the web app
#    under /?section=sovereignty → "Connect PetClaw clients"; it starts with pck_.
#    Only status, skill discovery, and the stateless `demo` work without it.
#    The token prompt is hidden; do not put a token in shell history.
petclaw-sdk auth

# 3. Select an id returned by your owner-scoped account, then verify setup
petclaw-sdk pets
petclaw-sdk use <petId>
petclaw-sdk doctor

# `petclaw-sdk init` is an interactive alternative that combines server,
# hidden authentication, owned-pet selection, and model choice.

# 4. Core chat is already executable; install an optional skill onto your pet
petclaw-sdk execute companion-chat "hello"

# Typed skill input (recommended over JSON in argv)
petclaw-sdk install persona-mirror
printf '%s' '{"context":"Write a short update","surface":"cli","sessionId":"updates"}' \
  | petclaw-sdk execute persona-mirror --json-stdin

# 5. Bring your own model (BYOK — keys encrypted at rest; needs auth)
petclaw-sdk models connect openai   # key is requested in a hidden prompt

# 6. Run one explicit read-only task, or expose the pet to an MCP client
petclaw-sdk agent "Week notes: shipped typed tasks, safer retries, and clearer billing receipts." --task summarize --confirm-cost 5
petclaw-sdk mcp
```

The CLI stores a non-secret random `clientId` in `~/.petclaw.json`, so one-shot
chat keeps a stable session without sharing raw session history with another
CLI installation that controls the same pet.

The MCP server never guesses among multiple owned pets. Select one with
`petclaw-sdk use <petId>` before starting MCP. `petclaw-sdk soul init` likewise
uses only the configured pet matched through the owner-scoped pet list; it
never copies identity from public manifest statistics.

MCP advertises `petclaw_agent_run` as a paid 5-credit tool and requires
both `taskKind: "recall" | "summarize" | "review" | "draft"` and
`confirmCostCredits: 5` on every call. A missing/invalid task kind or a missing
or different acknowledgement is rejected locally before the server receives a
request.

The CLI has the same fail-closed boundary: every `agent` invocation requires
exactly one `--task <kind>` plus the exact `--confirm-cost 5` flag. The HTTP
body carries both values and the completed response includes the authoritative
billing receipt.

The paid runner uses only the one server-bound read-only tool for the selected
task. That tool cannot commit a side effect and does not write pet memory or
self-learning data. The service does store owner-private run input, result,
trace, and billing history for reconciliation and audit. Every new run must
select one typed deliverable:

| Task | Input means | Minimum |
|---|---|---:|
| `recall` | A question about the selected pet's owner-private retained memory | 8 characters |
| `summarize` | Text supplied by the caller to condense | 40 characters |
| `review` | Text supplied by the caller to critique | 12 characters |
| `draft` | A brief supplied by the caller to turn into a draft | 20 characters |

SDK, CLI, and MCP reject bracket placeholders and concrete secret signatures
before journal or network access: API keys/tokens, JWTs, authorization values,
private-key blocks, password/secret assignments, database URLs/session cookies,
recovery codes, and OTP/MFA codes. Ordinary discussion about credential safety
is allowed. A rejected input is never written to
`~/.petclaw.json`; remove the secret rather than trying to encode or disguise
it.

Typed v2 executes that required tool exactly once. Five credits are charged
only when it succeeds without a side effect and returns a deliverable. Empty
recall, mismatched, degraded, failed, and incomplete runs refund the
reservation.

If a receipt is absent after an unknown outcome, keep the local pending marker
locked. Replay only the exact saved `runId`, `goal`, `taskKind`, normalized
`maxSteps: 1`, and `confirmCostCredits` against the server origin to which that
authorization was bound. Never mint a new run ID or clear the marker merely
because a receipt is absent.

For automation, use `--task <kind> --confirm-cost 5 --json` or call the same
endpoint directly with a valid `taskKind` and `confirmCostCredits: 5`:
>
> ```bash
> # Set both values from a server-side secret and an id shown by `petclaw-sdk pets`.
> # Never expose a pck_ token in browser JavaScript or a public client bundle.
> PETCLAW_PET_ID="<owned pet id>"
> curl -X POST "https://app.myaipet.ai/api/pets/${PETCLAW_PET_ID}/agent" \
>   -H "Authorization: Bearer ${PETCLAW_TOKEN}" \
>   -H "Content-Type: application/json" \
>   -d '{"runId":"11111111-1111-4111-8111-111111111111","goal":"Release notes: typed tasks now have safer retries and clearer billing receipts.","taskKind":"summarize","maxSteps":1,"confirmCostCredits":5}'
> ```

## Install (library)

```bash
npm install @myaipet/petclaw-sdk
```

## Quick Start (library)

```typescript
import {
  PetClawClient,
  createPetClawAgentRunId,
} from "@myaipet/petclaw-sdk";

const authToken = process.env.PETCLAW_TOKEN;
if (!authToken) throw new Error("PETCLAW_TOKEN is required");
const client = new PetClawClient({
  baseUrl: "https://your-petclaw-server.com",
  // Required for persistent chat, agent, memory, install/execute, and export.
  authToken,
});

// Authenticated SDK usage is server-side Node.js only. Never ship a pck_
// token in browser JavaScript, NEXT_PUBLIC_ variables, or a client bundle.
const selectedPetId = Number(process.env.PETCLAW_PET_ID);
const { pets } = await client.pets.list();
if (!pets.some((pet) => pet.id === selectedPetId)) {
  throw new Error("PETCLAW_PET_ID must identify a pet owned by this token");
}
const petId = selectedPetId;

// Get server manifest
const { manifest } = await client.manifest();
console.log(manifest.protocol); // "petclaw-v1"
console.log(manifest.skills);   // available skills

// List all skills
const { skills } = await client.skills.list();

// companion-chat is a core runtime skill; it needs no install record.
// Optional skills, such as persona-mirror, must be installed first.
await client.skills.install(petId, "persona-mirror");

// Persistent chat through the canonical chat route
const result = await client.chat.send(petId, "Hello! How are you?");
console.log(result.reply);

// One typed read-only task with a real stop reason and trace
// Persist this ID before sending. Reuse it to reconcile an unknown outcome;
// never generate a new ID for a transport retry.
const runId = createPetClawAgentRunId();
const run = await client.agent.run(petId, {
  runId,
  goal: "What did I tell you about my current launch priorities?",
  taskKind: "recall",
  confirmCostCredits: 5,
});
console.log(run.stoppedReason, run.steps, run.answer);

// Export your pet's SOUL data (portable)
const soulData = await client.sovereignty.export(petId);
// → Portable pet state, memories, personality, skills, and safe history

// Import a pet from another platform
const imported = await client.sovereignty.import(soulData);
console.log(imported.sourceIntegrityHash, imported.report);

// Discover other pets on the network
const { nodes } = await client.network.discover({ element: "fire" });

// Cross-pet invocation is launch-disabled; discovery is read-only.
```

## Protocol Overview

### PetClaw v1

PetClaw defines a standard for companion AI pets with:

| Feature | Description |
|---------|-------------|
| **Skills** | Installable capabilities (SKILL.md format) |
| **Data Sovereignty** | Export/import with SHA-256 checksums; owner inspection/editing; deletion after active paid runs settle, with minimal billing receipts retained |
| **Pet Network** | Read-only public discovery preview; invocation is launch-disabled |
| **Identity** | Off-chain pet identity in the launch configuration; blockchain integration disabled |
| **Consent** | Granular data usage control |

### Discovery

Any PetClaw server exposes:
- `GET /.well-known/pet-card.json` — Server capabilities
- `GET /api/petclaw` — Full manifest with skills
- `GET /api/petclaw/network/discover` — Find other pets

### Skills

Skills follow the SKILL.md format (inspired by ClawHub):

```bash
# List available skills
curl https://server.com/api/petclaw/skills

# Choose an id returned by the owner-scoped list before mutating a pet.
export PETCLAW_PET_ID="<owned pet id>"

# Get SKILL.md for a skill
curl "https://server.com/api/petclaw/skills?id=companion-chat&format=md"

# Install a skill
curl -X POST https://server.com/api/petclaw/skills \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PETCLAW_TOKEN" \
  -d "{\"action\":\"install\",\"petId\":${PETCLAW_PET_ID},\"skillId\":\"persona-mirror\"}"

# Execute a skill
curl -X POST https://server.com/api/petclaw/skills \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PETCLAW_TOKEN" \
  -d "{\"action\":\"execute\",\"petId\":${PETCLAW_PET_ID},\"skillId\":\"companion-chat\",\"input\":{\"message\":\"hi\"}}"
```

`companion-chat` and `summarize-page` are core runtime skills and work without
an install record. Installing either stores optional preferences/version data;
uninstalling it removes only that saved data and does not disable the core
capability. `petclaw-sdk skills` labels these entries `core`.

### Data Sovereignty

Users have 4 fundamental rights:

1. **Export** — Download portable pet state and owner-owned history as JSON
2. **Import** — Safely reconstruct restorable data and report every restored/skipped category
3. **Delete** — Remove pet-scoped data after active paid runs settle. Terminal run names, goals, answers and steps are scrubbed; minimal owner-only billing receipts remain. Backups expire under the published retention schedule
4. **Consent** — Control who can access your pet's data

```bash
# Export SOUL data
curl "https://server.com/api/petclaw/export?petId=${PETCLAW_PET_ID}" \
  -H "Authorization: Bearer $PETCLAW_TOKEN"

# Import to new platform
curl -X POST https://server.com/api/petclaw/import \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PETCLAW_TOKEN" \
  -d @pet_SOUL.json

# Delete with proof
curl -X DELETE "https://server.com/api/petclaw/delete?petId=${PETCLAW_PET_ID}" \
  -H "Authorization: Bearer $PETCLAW_TOKEN"
# → an active-system deletion receipt; its hash is a checksum, not a signature
```

Deletion returns `409 agent_run_in_progress` while a run for that pet is
`reserved` or `running`. Follow the returned `statusUrl` until the receipt is
terminal, then retry deletion. A successful delete returns
`agentReceipts.scrubbedReceipts`; these owner-only records retain run ID,
billing/outcome, credit result and timestamps, but no pet name, goal, answer or
step trace.

SOUL exports and imports accept at most **16 MiB** of UTF-8 JSON. The server
fails an oversized export explicitly instead of returning a bundle supported
clients cannot re-import. Import is a safe
reconstruction, not a byte-for-byte clone: provider credentials, token hashes,
webhook secrets, payment/on-chain ownership claims, and source-private media are
never recreated. The import response returns the verified source integrity hash
and a restored/skipped report.

### Pet Network (launch scope)

Public discovery is read-only. Cross-pet invocation returns `503` until owner
consent, caller funding and abuse controls are released:

```bash
# Discover pets
curl https://server.com/api/petclaw/network/discover?element=fire

# POST /api/petclaw/network/invoke is intentionally launch-disabled
```

## Built-in Skills

| Skill | Category | Description | Price |
|-------|----------|-------------|-------|
| `companion-chat` | emotional | Personality-driven conversation | Free |
| `persona-mirror` | social | Mirror owner's speech patterns | Free |
| `memory-recall` | knowledge | Retrieve past conversations | Free |
| `vibe-check` | emotional | Read a message/post → emotional vibe + one-line take | Free |
| `soul-export` | utility | Export pet identity | Free |
| `daily-mood` | emotional | Daily mood / energy journal | Free |
| `daydream` | emotional | Caring observations connecting two memories | Free |
| `image-gen` | creative | AI pet image | 5 credits |
| `video-gen` | creative | AI pet video (async) | from 15 credits |
| `summarize-page` | knowledge | Summarize page text in the pet's voice (Chrome ext) | Free |
| `soul-import` | utility | Import a portable SOUL bundle | Free |
| `consent-manage` | utility | Read/set data-consent toggles | Free |
| `evolve` | utility | Evolution stage + next-stage unlocks | Free |
| `memory-anchor` | utility | Compute/record a memory checksum; optional future chain anchoring is disabled | Free |
| `memory-consolidate` | knowledge | Reflection cycle: merge duplicates, drop contradictions, condense | Free |
| `pet-thought` | emotional | The pet's in-character inner thought right now | Free |
| `pet-diary` | emotional | First-person diary entry about the past week | Free |
| `pet-date` | social | AI conversation between two pets + friendship delta | 20 credits |

_18 skill manifests · 7 MCP tools · 19 registered connectors (availability varies)._

## VIGIL — the agentic harness

**VIGIL** names PetClaw's memory and learning capabilities. They do not all run
on every surface or every turn: retention/reflection are conditional post-turn
work, feedback needs a later owner turn, and CHORUS is explicitly opt-in.

| Stage | What it does |
|-------|--------------|
| **Memory Ledger** | Extracts selected useful facts into a capped portable ledger |
| **Bond Loop** (self-reflect) | Periodically writes a relationship note about how to respond better |
| **Implicit Feedback** | Estimates how the last reply landed from reply latency, length, and lexicon — no thumbs needed |
| **Self-Learning** | Recurring topics can become learned patterns; these are not executable code or community skills |
| **Chorus** (best-of-N) | Generates N candidate replies and picks the most in-character (opt-in via `PETCLAW_BEST_OF_N`) |

The `memory-consolidate` skill is the manual handle on VIGIL's reflection
cycle — it also runs automatically every ~20 turns to keep the ledger compact.

**CHORUS** is PetClaw's *generate-many-then-select* stage at the sampling level:
N temperature-varied candidates, then a separate judge call with a deterministic
heuristic fallback. It is not a panel of independent model identities.

## Pet discovery

`discover` lists public pets. PACK invocation/delegation is not part of the
launch contract and is not advertised as executable.

```bash
curl https://server.com/api/petclaw/network/discover?element=fire
```

## Writing Custom Skills

Create a `SKILL.md`:

```yaml
---
id: my-custom-skill
name: My Custom Skill
version: 1.0.0
author: your-wallet-address
protocol: petclaw-v1
category: utility
tags: [custom, example]
price: 0
currency: credits
requires:
  env: [MY_API_KEY]
  minLevel: 5
---

# My Custom Skill

Description of what your skill does.

## Input
{ "type": "object", "properties": { "query": { "type": "string" } } }

## Output
{ "type": "object", "properties": { "result": { "type": "string" } } }
```

## API Reference

See [docs/API.md](docs/API.md) for the complete API reference.

## License

MIT
