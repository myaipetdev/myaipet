# PetClaw API Reference

Base URL: `https://app.myaipet.ai`

## Authentication and pet selection

Owner-scoped routes require `Authorization: Bearer pck_…`. Generate the
token in **Sovereignty → Connect PetClaw clients**, then store it in a
server-side secret manager. Never expose a `pck_` token in browser JavaScript,
`NEXT_PUBLIC_` variables, mobile bundles, URLs, or public logs. Extension
`pex_…` tokens have a smaller allowlist and cannot export or import SOUL data.

Call authenticated `GET /api/pets` first and select an id returned for that
owner. Every `{petId}` below means that selected owned id; PetClaw clients must
never guess `1` or another default. The TypeScript SDK's authenticated surfaces
are therefore server-side Node.js integrations, not direct browser calls.

Failure/retry guide: `400`/`413` means invalid or oversized input; `401`/`403`
means authentication or scope failure; `402` means insufficient credits; `409`
means a state conflict; `429` means rate limiting (honor `Retry-After` when it
is present); and `5xx` is transient. Never blindly retry a paid or
non-idempotent run: a rerun is new work and may create a new charge or side
effect.

## Discovery

### GET `/.well-known/pet-card.json`
Server capabilities and endpoints.

**Response:**
```json
{
  "protocol": "petclaw-v1",
  "version": "1.0.0",
  "name": "MY AI PET",
  "capabilities": {
    "companionAI": true,
    "dataSovereignty": true,
    "soulNFT": false
  },
  "endpoints": {
    "manifest": "https://app.myaipet.ai/api/petclaw",
    "skills": "https://app.myaipet.ai/api/petclaw/skills"
  },
  "sovereignty": {
    "dataOwnership": "user",
    "exportFormat": "petclaw-soul-v1",
    "deletionProof": false,
    "deletionReceipt": "sha256-metadata",
    "portability": true,
    "inheritance": false
  }
}
```

`soulNFT` is `false` while production on-chain mint integration is disabled. Exported SOUL data
can still preserve legacy off-chain or previously recorded NFT state.

`deletionProof` is `false`: deletion returns a SHA-256 receipt of the deletion-request
metadata (`deletionReceipt: "sha256-metadata"`) — it is not a signed proof and not a hash of
the deleted content. `inheritance` is `false`: successor designation exists in the API, but
automated transfer is not scheduled in this release.

> Note: `version` here is the **protocol** version (`petclaw-v1`, semver `1.0.0`),
> not the npm SDK version. Run `npm view @myaipet/petclaw-sdk version`; the
> typed paid-task and MCP contract requires `2.0.0` or later. It makes
> `taskKind` mandatory and normalizes deprecated `maxSteps` compatibility input
> to `1`. Verify that npm reports `2.0.0` or later before relying on it.

### GET `/api/petclaw`
Full manifest with skills and stats.

**Response shape (numeric values below are illustrative, not launch metrics):**
```json
{
  "success": true,
  "manifest": {
    "protocol": "petclaw-v1",
    "skills": [],
    "endpoints": {
      "skills": "https://app.myaipet.ai/api/petclaw/skills"
    }
  },
  "stats": {
    "totalPets": 0,
    "activePets": 0,
    "totalSoulNfts": 0
  }
}
```

---

## Skills

### GET `/api/petclaw/skills`
List all available skills.

**Query params:**
- `q` — Search query
- `category` — Filter: `social`, `creative`, `utility`, `knowledge`, `emotional`
- `id` — Get single skill by ID
- `petId` — List installed skills for a pet
- `format=md` — Return SKILL.md format (with `id` param)

### POST `/api/petclaw/skills`
Install, uninstall, or execute a skill. `install` accepts the **18 built-in skill IDs only** — custom skill IDs are rejected with `Skill not found` (custom skill authoring is on the roadmap and not installable yet).

`companion-chat` and `summarize-page` are core runtime skills. They execute
without an install record. Installing one stores optional preferences/version
data; uninstalling it removes only that saved data and returns
`runtimeStatus:"core"` because the capability remains active. The owner-scoped
`GET /api/petclaw/skills?petId=N` response distinguishes `core`, `installed`
and `available` runtime states.

**Execute body (valid JSON):**
```json
{
  "action": "execute",
  "petId": 42,
  "skillId": "companion-chat",
  "input": { "message": "hello" }
}
```

Here `42` is illustrative and must be replaced with an id returned by
authenticated `GET /api/pets`. Installation and removal use separate valid
JSON bodies:

```json
{ "action": "install", "petId": 42, "skillId": "persona-mirror", "config": {} }
```

```json
{ "action": "uninstall", "petId": 42, "skillId": "persona-mirror" }
```

Listing is a read operation: use `GET /api/petclaw/skills` for the public
catalog or authenticated `GET /api/petclaw/skills?petId=42` for one owned pet's
runtime states. There is no POST `list` action. Do not send a pseudo-JSON union
value. `config` is optional on install and accepts non-secret preferences only.

`config` is optional and holds **non-secret preferences only**. It is stored as
plaintext alongside the pet, so the API rejects (`400`) any config field whose
name or value looks like a credential — names matching
`key / secret / token / password / credential`, values with known key prefixes
(`sk-`, `xai-`, `ghp_`, `pk_`, …), or long high-entropy strings. To use your own
model key, connect it via the encrypted BYOK vault instead:
`POST /api/petclaw/models` (see **Models** below). Never put API keys in skill
config.

**Execute response:**
```json
{
  "skillId": "companion-chat",
  "success": true,
  "executionStatus": "executed",
  "output": { "reply": "Hi there!", "model": "provider-model-id" },
  "sideEffectCommitted": true,
  "latencyMs": 2500,
  "cost": 0,
  "declaredCost": 0,
  "creditsCharged": 0
}
```

`executionStatus:"resolved"` means the response is an endpoint descriptor and
the endpoint did not run. `declaredCost` is a catalog price; only
`creditsCharged` is a billing receipt. `cost` is a deprecated compatibility
alias.

---

## Data Sovereignty

### GET `/api/petclaw/export?petId={petId}`
Export supported portable pet state and owner-owned history as JSON (SOUL format).

**Response:** A `SoulExport` object including supported pet identity, persona,
retained memories, skill metadata, source provenance/checkpoints, consent, and a
SHA-256 integrity checksum. The checksum is not a server signature. Export and
import share a 16 MiB serialized UTF-8 limit; an oversized export fails with
`soul_export_too_large` before any export reward is awarded.

### GET `/api/account/agent-runs/export?limit=100&cursor={opaqueCursor}`
Download a bounded owner-private access copy of paid Agent Office run history.
Omit `petId` for all account runs, including scrubbed receipts for deleted pets,
or pass an owned active `petId` to narrow the scope. A first-party web session
or owner `pck_…` token may call this route; the Chrome extension's `pex_…` token
cannot. This HTTP endpoint is not wrapped by the npm SDK 2.0.0.

The maximum is 100 records, 65,536 serialized bytes per record and 1,048,576
serialized bytes per page. If the byte budget fills before the row limit, the
opaque `nextCursor` is bound to the last record actually returned, so following
it does not skip an unseen record. Treat the cursor as opaque, URL-encode it,
and continue until `hasMore` is false. If the API returns
`code:"invalid_cursor"` after an account or server-secret change, discard that
cursor and restart from page one. Version 3 adds an encrypted-cursor-only
private tie-breaker so identical timestamps and caller-reused run IDs still
paginate without a missing record.

```json
{
  "schema": "myaipet-owner-agent-run-history/v3",
  "exportedAt": "2026-07-24T12:00:00.000Z",
  "scope": { "kind": "account" },
  "page": {
    "limit": 100,
    "count": 2,
    "hasMore": true,
    "nextCursor": "arc2.…",
    "order": "createdAt:desc,reconciliationId:desc,privateTieBreaker:desc",
    "byteBudget": 1048576,
    "truncatedRecords": 0,
    "redactedPrivateFields": 2,
    "redactedCredentialValues": 1
  },
  "records": [{
    "reconciliationId": "11111111-1111-4111-8111-111111111111",
    "receiptReference": "sha256-derived-reference",
    "contentRemoved": false,
    "task": {
      "kind": "summarize",
      "executionContract": "office:summarize:v1:office-summarize",
      "goal": "Summarize this decision.",
      "maxSteps": 1
    },
    "outcome": {
      "state": "terminal",
      "completed": true,
      "answer": "Decision summary",
      "steps": [],
      "stoppedReason": "completed"
    },
    "billing": { "outcome": "charged", "creditsCharged": 5 },
    "creditsRemainingAfterRun": 95,
    "timestamps": {
      "createdAt": "2026-07-24T11:59:00.000Z",
      "startedAt": "2026-07-24T11:59:01.000Z",
      "terminalAt": "2026-07-24T11:59:02.000Z",
      "updatedAt": "2026-07-24T11:59:02.000Z"
    },
    "exportTreatment": {
      "redactedPrivateFields": 0,
      "redactedCredentialValues": 0,
      "truncated": false,
      "truncationReasons": []
    }
  }],
  "integrity": {
    "algorithm": "SHA-256",
    "canonicalization": "lexicographic-json-v2",
    "covers": "schema,exportedAt,scope,page,records",
    "sha256": "…"
  }
}
```

`reconciliationId` is the caller-generated run ID shown in `/account`; it is
not a database primary key or authorization token. Database, user, pet and
credit-reservation IDs are omitted. Known private keys, credential-like values
and signed-URL query values are redacted; breadth, string, record and page
limits are disclosed by `exportTreatment` and page counters.

To verify `integrity.sha256`, remove the top-level `integrity` object,
recursively sort every object's keys lexicographically while preserving array
order, serialize with JSON UTF-8, and hash those exact bytes with SHA-256. This
detects later file changes but is not a server signature. Run-history pages are
access copies only and SOUL import never recreates their runs, reservations,
credits or charges.

### POST `/api/petclaw/import`
Import a pet from SOUL export data.

**Body:** `SoulExport` JSON object

**Response:**
```json
{ "success": true, "petId": 42, "message": "Pet imported successfully" }
```

### DELETE `/api/petclaw/delete?petId={petId}`
Remove pet-scoped data and owned media from active systems. Returns a SHA-256
receipt (`deletionHash`) computed over the deletion-request metadata (pet id,
name, owner, timestamp, protocol) — it is not a signed proof and not a hash of
the deleted content. Deletion is blocked while a paid run for that pet is
`reserved` or `running`; follow the returned receipt URL until it is terminal.
Once terminal, the private pet name, goal, answer and step trace are scrubbed,
while the minimal owner-only financial receipt remains. Backup copies expire
under the published retention schedule (no later than 90 days); public on-chain
records cannot be erased.

**409 conflict:**
```json
{
  "error": "A paid agent run must reach a terminal receipt before pet data can be deleted",
  "code": "agent_run_in_progress",
  "runId": "11111111-1111-4111-8111-111111111111",
  "state": "running",
  "statusUrl": "/api/pets/42/agent/runs/11111111-1111-4111-8111-111111111111",
  "guidance": "Reconcile this run until it has a terminal receipt, then retry pet deletion."
}
```

**Response:**
```json
{
  "success": true,
  "deletionHash": "a1b2c3d4...",
  "deletedAt": "2026-04-15T00:00:00Z",
  "agentReceipts": { "scrubbedReceipts": 2 },
  "mediaCleanup": { "processed": 4, "deleted": 4, "retained": 0, "failed": 0 },
  "message": "Pet-scoped data and owned media were removed from active systems. Minimal terminal paid-run receipts were retained after private run content was scrubbed. Backup copies expire under the published retention schedule; public on-chain records cannot be erased."
}
```

`agentReceipts.scrubbedReceipts` is the number of terminal owner receipts whose
private run content was removed during this deletion.

### POST `/api/petclaw/verify`
Verify pet ownership by wallet address.

**Body:**
```json
{ "petId": 42, "walletAddress": "0x0000000000000000000000000000000000000000" }
```

**Response:**
```json
{ "verified": true, "petDID": "did:pet:abc123...", "soulNftId": 1 }
```

---

## Pet Network (A2A)

### GET `/api/petclaw/network/discover`
Discover pets on the network.

**Query params:**
- `personality` — Filter by personality type
- `element` — Filter by element (fire, water, grass, electric, normal)
- `skill` — Filter by installed skill ID
- `minLevel` — Minimum pet level
- `limit` — Max results (default 50)

**Response:**
```json
{
  "protocol": "petclaw-v1",
  "network": { "totalNodes": 2, "discoverableNodes": 2, "remoteInvocations": 0 },
  "nodes": [
    {
      "petId": 42,
      "name": "Sparky",
      "petDID": "did:pet:...",
      "personality": "brave",
      "element": "fire",
      "level": 15,
      "capabilities": ["companion-chat"],
      "progressionScore": 42,
      "status": "discoverable"
    }
  ]
}
```

`status: "discoverable"` means the owner enabled both public-profile and pet-interaction
consent; it does not assert that a pet is currently online. `progressionScore` is a display-only
level/bond progression value, not a trust, security, identity, or transaction-risk rating.
`remoteInvocations` remains `0` while cross-pet execution is disabled.

Discovery deliberately omits the owner's wallet, exact activity timestamps,
interaction counts and private/learned skill IDs. `petDID` is the public,
pseudonymous stable identifier for this surface.

`POST /api/petclaw/network/invoke` is disabled and returns 503. Public discovery
does not authorize remote execution with another pet's private memory or model
key.

---

## Persistent Chat

### POST `/api/pets/{petId}/chat`

```json
{
  "message": "Remember that I prefer short answers",
  "surface": "sdk",
  "sessionId": "release-planning"
}
```

`surface` is allowlisted (`web`, `cli`, `sdk`, `mcp`, `chrome-ext`) and
`sessionId` is a caller-owned boundary up to 128 characters. Responses include
`session`, `inference`, `memoryRetained` and `degraded`. Treat
`degraded:true` plus its `errorCode` as provider failure, even if fallback text
is present; do not label fallback text as successful model inference.

---

## Memory Sovereignty

```http
GET /api/petclaw/memory?petId={petId}
PATCH /api/petclaw/memory?petId={petId}&entryType=memory
DELETE /api/petclaw/memory?petId={petId}&entryType=memory&key=favorite_food
DELETE /api/petclaw/memory?petId={petId}&entryType=all&all=1
Authorization: Bearer pck_…
```

Inspection returns memories, owner profile, learned patterns, bond notes and
normalized sessions (`sessionId`, `platform`, `role`, `speakerId`). Owner
correction/deletion fences in-flight learning. Legacy derived entries do not
yet carry exact source-turn provenance, so a memory/profile/learned mutation
clears PetMemory rows of every type, connector history, persona,
bond/learned state and generated thought/diary/greeting caches. Derived
insights remain only as redacted privacy tombstones; active memory-daydream
claims are revoked. A session deletion preserves raw rows with a different
normalized `sessionId` while clearing unprovenanced projections. Owner config,
consent, marketplace/core skills and authoritative product records remain.
Export first: this fail-closed invalidation is intentionally destructive. The
response includes `recallStoresRedacted`; `sourceRowsRedacted` is its
PetMemory-only compatibility alias.

---

## Typed Paid-Task Runner

### POST `/api/pets/{petId}/agent`
Run one explicit owner-authenticated, credit-metered text task: `recall`,
`summarize`, `review`, or `draft`. The selected kind is bound server-side to one
approved read-only tool and canonical input. The tool does not write pet memory
or self-learning data, while the service stores owner-private run input,
result, trace, and billing history for reconciliation and audit. Five credits
are reserved, then charged only when that exact tool succeeds once, commits no
side effect, and produces the contract-valid deliverable. Empty recall,
wrong-tool, degraded, failed, incomplete, refusal, direct-answer-only, and
non-contract outputs are refunded. `maxSteps` is deprecated; SDK/CLI/MCP
compatibility input is ignored and normalized to `1` because the selected tool
executes exactly once.

| `taskKind` | Paid deliverable |
|---|---|
| `recall` | Retrieved owner-private facts plus an answer grounded in those facts |
| `summarize` | Structured decision brief: summary, key facts, risk/unknown, and next step |
| `review` | Primary issue, why it matters, and a revised version |
| `draft` | Reviewable text only; it is not sent, published, or executed |

**Body:**
```json
{ "runId": "11111111-1111-4111-8111-111111111111", "goal": "Recall my current priorities and suggest one thing for today", "taskKind": "recall", "maxSteps": 1, "confirmCostCredits": 5 }
```

`runId` must be a client-generated UUID. Reconcile an unknown outcome at
`GET /api/pets/:petId/agent/runs/:runId` before another paid run.
`taskKind` must be `recall`, `summarize`, `review`, or `draft`, and
`goal` is the task input and may contain at most 2,000 characters.
`confirmCostCredits` must be the exact number `5`; a missing or invalid value is
rejected before a credit reservation or provider call. The server permits only
one `reserved` or `running` paid run per pet. A different `runId` receives
`409 agent_run_in_progress` with the active `runId` and `statusUrl`; reconcile that
receipt instead of creating more work.

Generate and persist one ID before the request. Reuse that ID for status lookup
or a request replay after an unknown transport outcome:

A first 404 from the status lookup is inconclusive; recheck the same URL once
after a short delay. A second 404 means no durable run receipt was found, not
that deletion refunded a charge or erased the ledger. Keep the local pending
marker locked. Replay only the exact saved `runId`, `goal`, `taskKind`,
normalized `maxSteps: 1`, and `confirmCostCredits` against the server origin to
which that authorization was bound. Never mint a new run ID or clear the marker
merely because a receipt is absent.

```typescript
import { createPetClawAgentRunId } from "@myaipet/petclaw-sdk";

const runId = createPetClawAgentRunId();
// Persist runId in your job record here before sending the paid request.
const run = await client.agent.run(petId, {
  runId,
  goal: "Recall my current priorities and suggest one thing for today",
  taskKind: "recall",
  maxSteps: 1,
  confirmCostCredits: 5,
});
```

**Response:**
```json
{
  "ok": true,
  "completed": true,
  "taskKind": "recall",
  "executionContract": "office:recall:v1:recall_memory",
  "goal": "...",
  "answer": "...answer grounded in the retrieved facts...",
  "steps": [
    { "skill": "recall_memory", "input": { "query": "..." }, "output": {}, "ok": true, "sideEffectCommitted": false, "modelCalls": 0 }
  ],
  "stoppedReason": "completed",
  "billing": {
    "outcome": "charged",
    "creditsCharged": 5,
    "reason": "completed_with_successful_tool",
    "successfulToolCalls": 1,
    "failedToolCalls": 0,
    "committedSideEffects": 0,
    "modelCalls": 1,
    "orchestratorModelCalls": 1,
    "skillModelCalls": 0
  },
  "creditsRemaining": 95
}
```

The response is the exact server receipt for this attempt: `taskKind` and
`executionContract` identify the binding, `steps` records the required tool
result, and `billing` records charge/refund outcome, tool counts, model-call
counts, and credits. Owner-private receipt history remains available for
reconciliation; it is not pet-memory or self-learning state.
The `v1` segment inside `executionContract` is the server-side task-contract
revision; it is independent of the npm SDK's `2.0.0` package version.

The in-app **Agent Workbench** (`/?section=workbench`) drives this endpoint.
`completed` is true only when `stoppedReason` is `completed`; automation must
not treat `timeout` or `task_error` as success. The public union retains
`max_steps`, `planner_error`, and `unsupported_scope` for historical receipt
compatibility; typed SDK 2.0.0 tasks normally return `completed`, `timeout`, or
`task_error`. A retry is a new run; this release does not provide checkpoint
resume.

`billing.modelCalls` is the exact number of vendor network attempts made before
the receipt was finalized, including fallback attempts and calls made inside an
executed LLM skill. `orchestratorModelCalls + skillModelCalls` always equals
`modelCalls`; each step's `modelCalls` reports its skill-local subset. A
connector-only step reports `0`.

---

## Models (Bring Your Own Model)

Owners connect their own provider keys (xAI, OpenAI, Anthropic, Google,
OpenRouter, Nous/Hermes); keys are encrypted at rest and used by the LLM router.
Owner-authenticated.

### GET `/api/petclaw/models`
List connected models.

### POST `/api/petclaw/models`
Connect a provider key.

**Body:**
```json
{ "provider": "openai", "apiKey": "secret-from-a-vault", "taskScopes": ["chat", "reason"] }
```

**Response:**
```json
{ "connection": { "provider": "openai", "model": "gpt-...", "keyMask": "sk-…abcd" } }
```

### DELETE `/api/petclaw/models?id=<id>`
Remove a connected model.
