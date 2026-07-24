# PetClaw Ecosystem

PetClaw is an owner-controlled companion identity, memory, and consent layer
with provenance foundations — not a general-purpose OS or coding-agent
replacement. Web, approved Chrome sites, REST and the published CLI share the
pet identity today. The SDK 2.0.0 release contract defines the reviewed
seven-tool MCP path for supported stdio clients.

## Current publication status

- During the 2.0.0 rollout, `npm view @myaipet/petclaw-sdk version` is the
  publication source of truth; do not assume the release candidate is already
  npm latest.
- The SDK **2.0.0 release contract** makes `taskKind` mandatory, normalizes
  deprecated `maxSteps` compatibility input to `1`, accepts task input up to
  2,000 characters, and defines **7 owner-authenticated MCP tools**.
- Messaging delivery remains launch-paused; publication of the SDK does not
  enable any deployment kill switch.

## Runtime inventory

| Surface | Launch contract |
|---|---|
| Skills | 18 built-in manifests; 5 LLM handlers run through the generic executor, REST handlers resolve to typed endpoints |
| Paid task | Recall, Summarize, Review, or Draft; one server-bound read-only tool plus exact charge/refund receipt |
| Memory | Capped owner-editable ledger, normalized sessions, conditional semantic + TF-IDF/recency/importance RRF |
| Connectors | 19 registered, 3 live (`web-search`, `wikipedia`, `memory`); messaging launch-paused |
| Network | Read-only public discovery; cross-pet invocation disabled |
| Blockchain | Production integration disabled; points-only, no token |

Registry count never implies live availability.

Production on-chain integration is disabled. At the documented launch-review
block, both deployed BSC contracts returned `paused() = false` with zero activity/supply counters. The contract pause bit is not the application feature
gate: `BLOCKCHAIN_ENABLED=false` keeps all product integration off, and the
platform has no token or redemption path.

## VIGIL memory contract

VIGIL is the product name for bounded memory/learning capabilities, not a
promise that five stages run synchronously on every turn. Retention stores
selected useful facts, feedback needs a later user reaction, periodic bond
reflection may no-op, and CHORUS is opt-in. Learned patterns are not executable
skills.

Successful canonical chat now waits for normalized session logging and the
best-effort retention boundary. Each session row records `sessionId`, `platform`,
`role` and `speakerId`; per-pet ledger merges are serialized to prevent
simultaneous web/extension/MCP turns from overwriting each other.

## Authentication and secrets

Persistent actions require an owner `pck_` token. The SDK 2.0.0 contract stores CLI config
with mode `0600`, repairs old broad permissions, enforces network timeouts/body
limits, and reads token/provider secrets from hidden prompts. Smaller `pex_`
extension tokens cannot export or import SOUL data.

```bash
petclaw-sdk auth
petclaw-sdk pets
petclaw-sdk use <petId>
petclaw-sdk doctor
petclaw-sdk models connect openai --scopes=chat,reason
```

## MCP in SDK 2.0.0

The 2.0.0 release contract exposes seven stdio tools:

1. `petclaw_chat` — canonical persistent owner chat
2. `petclaw_agent_run` — paid 5-credit typed text task; every MCP call must
   select `taskKind: recall|summarize|review|draft` and acknowledge
   `confirmCostCredits: 5` before HTTP
3. `petclaw_persona_mirror` — owner-context draft
4. `petclaw_memory_recall` — real owner memory inspection + lexical selection
5. `petclaw_summarize_page` — approved page text only
6. `petclaw_soul_export` — supported portable data + checksum
7. `petclaw_discover_pets` — read-only public discovery

Do not use an arbitrary server-side `web_read` tool: it is disabled until every
redirect hop can be DNS/IP revalidated against private and metadata ranges.

## Paid typed-task value and privacy

Each new paid task selects exactly one deliverable:

| Task | Result |
|---|---|
| Recall | Retrieved owner-private facts plus an answer grounded in those facts |
| Summarize | Structured decision brief with summary, key facts, risk/unknown, and next step |
| Review | Primary issue, why it matters, and a revised version |
| Draft | Reviewable text only; no send, publish, or external action |

The required tool does not write pet memory or self-learning data. The service
does store owner-private input, result, trace, and billing history for
reconciliation and audit. The response is the exact server receipt for the
bound task and records tool/model-call counts plus the credit outcome. Empty
recall, tool mismatch, degraded or failed execution, incomplete work, refusal,
direct-answer-only, and non-contract output are refunded.

## Data sovereignty

| Right | Route | Bound |
|---|---|---|
| Inspect/edit/delete memory | `/api/petclaw/memory` | Individual entries or full recall-bearing clear |
| Export | `/api/petclaw/export` | Supported portable state/history + SHA-256 checksum |
| Import | `/api/petclaw/import` | ≤16 MiB validated reconstruction + restored/skipped report |
| Delete pet | `/api/petclaw/delete` | 409 while a paid run is active; afterward private run content is scrubbed and only minimal owner billing receipts remain |
| Consent | `/api/petclaw/consent` | Owner-controlled sharing/training/interaction settings |

SHA-256 is a checksum, not a publisher signature or origin proof.

## Product position versus Hermes

Hermes is a broad local/remote execution agent with terminal, files, browser,
subagents, cron and sandbox/approval controls. PetClaw should integrate with
Hermes, Codex, Claude and Cursor rather than imitate unsafe shell execution:

- one companion identity across agents;
- inspectable/editable/deletable retained memory;
- consent and provenance alongside persona/skills;
- typed pet tasks with one-tool traces and exact cost receipts;
- signed release artifacts and production rollback discipline.

General shell/filesystem/git/browser execution remains out of PetClaw until an
explicit sandbox and approval model exists.
