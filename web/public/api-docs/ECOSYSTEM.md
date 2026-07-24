# PetClaw Ecosystem

PetClaw is an owner-controlled companion identity, memory, and consent layer
with provenance foundations — not a general-purpose OS or coding-agent
replacement. Web, approved Chrome sites, REST and the published CLI share the
pet identity today. SDK 1.6.3 publishes the reviewed seven-tool MCP path for
supported stdio clients.

## Current publication status

- npm latest is SDK **1.6.3**.
- SDK 1.6.3 includes typed errors/timeouts, hidden CLI secret prompts,
  `agent`, normalized sessions and **7 owner-authenticated MCP tools**.
- Messaging delivery remains launch-paused; publication of the SDK does not
  enable any deployment kill switch.

## Runtime inventory

| Surface | Launch contract |
|---|---|
| Skills | 18 built-in manifests; 5 LLM handlers run through the generic executor, REST handlers resolve to typed endpoints |
| Agent | Bounded 1–6-step goal loop with SSE/JSON trace and real stop reason |
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

Persistent actions require an owner `pck_` token. SDK 1.6.3 stores CLI config
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

## MCP in SDK 1.6.3

The published package exposes seven stdio tools:

1. `petclaw_chat` — canonical persistent owner chat
2. `petclaw_agent_run` — paid 5-credit bounded goal loop; every MCP call must
   acknowledge `confirmCostCredits: 5` before HTTP
3. `petclaw_persona_mirror` — owner-context draft
4. `petclaw_memory_recall` — real owner memory inspection + lexical selection
5. `petclaw_summarize_page` — approved page text only
6. `petclaw_soul_export` — supported portable data + checksum
7. `petclaw_discover_pets` — read-only public discovery

Do not use an arbitrary server-side `web_read` tool: it is disabled until every
redirect hop can be DNS/IP revalidated against private and metadata ranges.

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
- bounded pet goals with trace and cost controls;
- signed release artifacts and production rollback discipline.

General shell/filesystem/git/browser execution remains out of PetClaw until an
explicit sandbox and approval model exists.
