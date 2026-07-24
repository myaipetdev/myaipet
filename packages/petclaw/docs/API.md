# PetClaw API Reference

Base URL: `https://app.myaipet.ai`

Owner-scoped routes require `Authorization: Bearer pck_…`. Extension `pex_…`
tokens have a smaller allowlist and cannot export or import SOUL data. HTTP
errors use a JSON object with an `error` field; clients must also inspect the
status code.

Keep `pck_` credentials in a server-side secret store. Never place one in
browser JavaScript, a `NEXT_PUBLIC_` variable, a mobile bundle, a URL, or a
public log. Resolve identity with authenticated `GET /api/pets`, then use an id
from that response for `{petId}` below; never guess a default pet id.

Failure/retry guide: `400`/`413` means invalid or oversized input; `401`/`403`
means authentication or scope failure; `402` means insufficient credits; `409`
means a state conflict; `429` means rate limiting (honor `Retry-After` when it
is present); and `5xx` is transient. Never blindly retry a paid or
non-idempotent run: a rerun is new work and may create a new charge or side
effect.

## Public discovery

| Method | Route | Contract |
|---|---|---|
| GET | `/api/health` | Service health |
| GET | `/.well-known/pet-card.json` | Protocol discovery card |
| GET | `/api/petclaw` | Protocol manifest and public registry stats |
| GET | `/api/petclaw/skills` | Search/list skill manifests (`q`, `category`, `id`, `format=md`) |
| POST | `/api/petclaw/demo-chat` | Synthetic, stateless preview; never consults a pet, model or memory |
| GET | `/api/petclaw/network/discover` | Read-only public pet discovery preview |

The manifest's `capabilities.soulNFT` is `false` while production blockchain
integration is disabled. Protocol version `1.0.0` is independent of the npm SDK
package version.

The SDK's standalone `buildManifest(baseUrl, skills)` includes only the skill
snapshot explicitly passed by the caller. Its deprecated `DEFAULT_SKILLS` is
intentionally empty; discover a server's authoritative registry with
`client.skills.list()` instead of trusting a copy embedded in an SDK version.

## Persistent chat

```http
GET /api/pets/{petId}/chat
Authorization: Bearer pck_…
```

Returns the owner's recent normalized pet session messages.

```http
POST /api/pets/{petId}/chat
Authorization: Bearer pck_…
Content-Type: application/json

{
  "message": "Remember that I prefer short answers",
  "surface": "sdk",
  "sessionId": "release-planning"
}
```

`surface` is allowlisted (`web`, `cli`, `sdk`, `mcp`, `chrome-ext`) and
`sessionId` is a caller-owned boundary up to 128 characters. The response adds
`session`, `inference`, `memoryRetained` and `degraded`. When `degraded:true`,
`errorCode` reports the provider failure and clients must not present the
fallback text as a successful model inference. Memory retention and learned
patterns are bounded, best-effort capabilities.

## Typed paid-task runner

```http
POST /api/pets/{petId}/agent
Authorization: Bearer pck_…
Content-Type: application/json

{ "runId": "11111111-1111-4111-8111-111111111111", "goal": "What did I say about my launch priorities?", "taskKind": "recall", "maxSteps": 1, "confirmCostCredits": 5 }
```

`runId` must be a client-generated UUID. Reconcile an unknown outcome at
`GET /api/pets/:petId/agent/runs/:runId` before another paid run.
`taskKind` is required and must be `recall`, `summarize`, `review`, or `draft`.
Use `recall` for an owner-memory question; the other three treat `goal` as
caller-supplied text or a brief, not as permission to take external action.
`goal` has a 2,000-character maximum and these minimums: `recall` 8,
`summarize` 40, `review` 12, and `draft` 20. Bracket placeholders are rejected.
SDK, CLI, and MCP also reject concrete API keys/tokens, JWTs, authorization
values, private-key blocks, password/secret assignments, database URLs/session
cookies, recovery codes, and OTP/MFA codes before journal or network access.
Ordinary discussion about credential safety is allowed. A rejected
secret-bearing task is never persisted to `~/.petclaw.json`.
`confirmCostCredits` must be the exact number `5`; missing or different values
are rejected before a reservation or provider call. `maxSteps` is deprecated:
SDK, CLI, and MCP compatibility inputs are ignored and normalized to `1`.
Typed v2 executes its single required read-only tool exactly once. The tool
does not write pet memory or self-learning data and cannot commit a side effect,
while the service stores owner-private run input, result, trace, and billing
history.
A run reserves 5 credits. It charges only when the selected typed task's
server-bound required tool succeeds without a side effect and returns a
deliverable; empty recall, mismatched, degraded, failed, and incomplete runs
are refunded. The server permits only one `reserved` or `running` paid run per
pet.
A different `runId` receives `409 agent_run_in_progress` with the active
`runId` and `statusUrl`. This is a definitive pre-debit rejection of the
attempted new run; reconcile the active receipt instead of creating more work.

Generate and persist one ID before the request. Reuse that ID for status lookup
or a request replay after an unknown transport outcome:

A first 404 from the status lookup is inconclusive; recheck the same URL once
after a short delay. A second 404 means no durable run receipt was found, not
that deletion refunded a charge or erased the ledger. Keep the local pending
marker locked. Replay only the exact saved `runId`, `goal`, `taskKind`,
normalized `maxSteps: 1`, and `confirmCostCredits` against the
server origin to which that authorization was bound. Never mint a new run ID or
clear the marker merely because a receipt is absent.

```typescript
import { createPetClawAgentRunId } from "@myaipet/petclaw-sdk";

const runId = createPetClawAgentRunId();
// Persist runId in your job record here before sending the paid request.
const run = await client.agent.run(petId, {
  runId,
  goal: "Review this launch note for unclear claims: …",
  taskKind: "review",
  confirmCostCredits: 5,
});
```

JSON returns:

```json
{
  "ok": true,
  "completed": true,
  "taskKind": "recall",
  "goal": "…",
  "answer": "…",
  "steps": [{ "skill": "recall_memory", "input": {}, "output": {}, "ok": true, "sideEffectCommitted": false, "modelCalls": 0 }],
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

`completed` is true only when `stoppedReason` is `completed`; automation should
not treat another terminal stop as success. The public union retains
`max_steps`, `planner_error`, and `unsupported_scope` for historical receipt
compatibility; typed v2 normally returns `completed`, `timeout`, or
`task_error`. Request `Accept: text/event-stream` or `?stream=1` for SSE
tool/result/final events followed by `done`. This release does not provide
checkpoint resume; repeating a goal is a new run.

`billing.modelCalls` is the exact number of vendor network attempts made before
the receipt was finalized, including fallback attempts and calls made inside an
executed LLM skill. `orchestratorModelCalls + skillModelCalls` always equals
`modelCalls`; each step's `modelCalls` reports its skill-local subset. A
connector-only step reports `0`.

## Skills

`GET /api/petclaw/skills` is public. Owner authentication is required for every
install, uninstall and execute action:

```http
POST /api/petclaw/skills
Authorization: Bearer pck_…
Content-Type: application/json

{
  "action": "execute",
  "petId": 42,
  "skillId": "companion-chat",
  "input": { "message": "hello" }
}
```

`companion-chat` and `summarize-page` are core runtime skills. They execute
without an install record. Installing one stores optional preferences/version
data; uninstalling it removes only that saved data and returns
`runtimeStatus:"core"` because the capability remains active. The owner-scoped
`GET /api/petclaw/skills?petId=N` response distinguishes `core`, `installed`
and `available` runtime states.

The typed `PetClawSkillExecutionResponse` is
`{ skillId, success, executionStatus, output, sideEffectCommitted, tokensUsed?, latencyMs, cost, declaredCost, creditsCharged }`.
`executionStatus:"resolved"` and an endpoint descriptor mean the endpoint did
not run. `declaredCost` is the registry price; only `creditsCharged` is a billing
receipt. `cost` is a deprecated compatibility alias.

`llm-prompt` skills execute through this generic route. A REST-backed
`api-call` skill returns `{ status: "invoke_via_endpoint", endpoint, method,
params }`; that is a resolver result, not proof that the endpoint ran.
Secret-looking skill config is rejected—provider keys belong in the encrypted
model vault.

## Memory sovereignty

```http
GET /api/petclaw/memory?petId={petId}
PATCH /api/petclaw/memory?petId={petId}&entryType=memory
DELETE /api/petclaw/memory?petId={petId}&entryType=memory&key=favorite_food
DELETE /api/petclaw/memory?petId={petId}&entryType=all&all=1
Authorization: Bearer pck_…
```

Inspection returns memories, owner profile, learned patterns, bond notes,
normalized sessions (`sessionId`, `platform`, `role`, `speakerId`) and stats.
Patch supports owner correction; delete supports individual entries or a full
recall-bearing-memory clear. Legacy derived entries do not yet carry exact
source-turn provenance. To prevent a corrected or deleted value from being
learned or recalled again, a memory/profile/learned mutation clears the old
unprovenanced recall projections: PetMemory rows of every type, connector
history, persona, bond/learned state and generated thought/diary/greeting
caches. Derived insights are retained only as redacted privacy tombstones, and
active memory-daydream generation claims are revoked. A session deletion also
clears unprovenanced projections but preserves raw rows carrying a different
normalized `sessionId`. Owner configuration, consent, marketplace/core skills
and authoritative product records remain. This is intentionally destructive;
export first if that history is needed. The response includes
`recallStoresRedacted`; `sourceRowsRedacted` remains its PetMemory-only
compatibility alias.

## SOUL export/import/delete

| Method | Route | Contract |
|---|---|---|
| GET | `/api/petclaw/export?petId={petId}` | Portable supported pet state/history with SHA-256 `integrityHash`; fails explicitly if the serialized bundle exceeds 16 MiB |
| GET | `/api/account/agent-runs/export?limit=100&cursor={opaqueCursor}` | Bounded owner-private Agent Office run-history page; HTTP access copy, not an SDK 2.0.0 method |
| POST | `/api/petclaw/import` | Validate ≤16 MiB JSON and reconstruct supported categories with a restored/skipped report |
| DELETE | `/api/petclaw/delete?petId={petId}` | 409 while a paid run is active; otherwise delete pet data, scrub private terminal-run content, retain minimal billing receipts, and return a checksum receipt |

All three require an owner CLI token or first-party web session. The SHA-256
value is an integrity checksum, not a server signature: anyone who changes a
bundle can recompute a checksum. Provider credentials, token hashes, webhook
secrets, payment/chain ownership, external-account ownership and source-private
media are never recreated. The shared 16 MiB export/import limit prevents the
server from presenting a backup that supported clients cannot receive or
re-import; larger histories require a future paged archive format. Backups expire according to the published retention
policy rather than disappearing synchronously with the active-system delete.

### Paginated Agent Office run-history access copy

`GET /api/account/agent-runs/export` accepts optional `limit` (1–100),
`cursor`, and owned active `petId` query parameters. Omit `petId` for all
account runs, including scrubbed receipts for deleted pets. A first-party web
session or owner `pck_…` token may call it; the Chrome extension's narrower
`pex_…` token cannot. The npm SDK 2.0.0 does not wrap this endpoint, so direct
callers must use authenticated HTTPS and enforce their own response limit.

Each page is capped at 100 records, 65,536 serialized bytes per record and
1,048,576 serialized bytes total. When bytes fill first, `nextCursor` is bound
to the last record actually returned. Treat it as opaque, URL-encode it, and
continue until `hasMore:false`; restart at page one after
`code:"invalid_cursor"`.

The `myaipet-owner-agent-run-history/v3` response is ordered by creation time,
caller run ID, and an encrypted-cursor-only private tie-breaker so even reused
run IDs cannot disappear between pages. It includes the caller-generated
run ID as `reconciliationId`, a derived `receiptReference`, task/outcome/billing
data, timestamps, and per-record `exportTreatment`. It omits database primary
keys, user IDs, pet IDs and reservation IDs. Credential-like values, signed-URL
query values and private structured keys are redacted. String, breadth,
record-byte and page-byte limits are explicit through truncation/redaction
metadata rather than silent completeness claims.

For `integrity.sha256` (`canonicalization:lexicographic-json-v2`), remove the
top-level `integrity` object, recursively sort object keys lexicographically
while preserving array order, serialize as JSON UTF-8, and SHA-256 those exact
bytes. This detects later changes; it is not a server signature. These pages
are access copies only. SOUL import never
creates their runs or reservations, restores credits, or replays charges.

Full pet deletion never cancels or guesses the outcome of provider work. While
a paid run is `reserved` or `running`, it returns HTTP 409:

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

After every run is terminal, deletion scrubs pet name, goal, answer and step
trace. It retains the owner-scoped run ID, terminal/billing outcome, credit
result and timestamps, and reports the count as
`agentReceipts.scrubbedReceipts`.

## Consent and models

```http
GET  /api/petclaw/consent?petId={petId}
POST /api/petclaw/consent

GET    /api/petclaw/models
POST   /api/petclaw/models
DELETE /api/petclaw/models?id={connectionId}
Authorization: Bearer pck_…
```

Connect a provider with the exact `taskScopes` field:

```json
{
  "provider": "openai",
  "apiKey": "read from a secret prompt or vault",
  "taskScopes": ["chat", "reason"]
}
```

Supported providers are returned dynamically by `GET /api/petclaw/models`.
Never place provider keys in URL parameters, skill config, logs or command-line
arguments.

## Network launch scope

`GET /api/petclaw/network/discover` is a read-only preview.
`POST /api/petclaw/network/invoke` intentionally returns `503` in this launch;
cross-pet consent, caller funding and abuse controls are not yet released.
