<div align="center">

# 🐾 MY AI PET

### The owner-controlled identity, memory, and consent layer for AI companions.

*An AI pet that can retain selected context and join supported owner surfaces —
inspectable, portable within documented bounds, and owner-controlled. Built on **PetClaw**.*

[![Status](https://img.shields.io/badge/status-beta-7c3aed)](https://app.myaipet.ai)
[![Protocol](https://img.shields.io/badge/PetClaw-v1-f59e0b)](https://app.myaipet.ai/api-docs)
[![SDK](https://img.shields.io/npm/v/@myaipet/petclaw-sdk?color=4ade80&label=@myaipet%2Fpetclaw-sdk)](https://www.npmjs.com/package/@myaipet/petclaw-sdk)
[![MCP](https://img.shields.io/badge/MCP-7_tools-2563eb)](https://app.myaipet.ai/api-docs)
[![License](https://img.shields.io/badge/license-MIT-94a3b8)](#license)

**[Live app →](https://app.myaipet.ai)** · **[Docs →](https://app.myaipet.ai/api-docs)** · **[𝕏 @MYAIPETS](https://x.com/MYAIPETS)**

</div>

---

## Not an app. A layer.

Most AI forgets you the moment the tab closes — and owns whatever it learns.
**MY AI PET** is the consumer experience; **PetClaw** is the open protocol underneath —
the memory, identity, and portability layer for AI companions.

| A single prompt | PetClaw |
|---|---|
| ✕ Forgets you when the tab closes | ✓ Retains selected context across owner surfaces — inspect/edit/delete it |
| ✕ Answers without grounded context | ✓ Runs one explicit approved read-only tool, then returns its grounded deliverable |
| ✕ Works alone, no review | ✓ Bounded learning patterns and owner-controlled memory (VIGIL) |
| ✕ Locked inside one app | ✓ Checksummed supported-field JSON · REST/CLI · seven-tool MCP · SDK 2.0.0 contract |

---

## 🧠 Agent orchestration — *one pet, typed work, owner-controlled memory*

Under the pet is a paid typed-task runner and a separate persistent-chat path:

| | Role | What it is |
|---|---|---|
| 🧭 | **Select → Execute** | The owner chooses Recall, Summarize, Review, or Draft; the server maps it to one approved read-only tool and canonical input. |
| 🔧 | **Use tools** | Typed runs execute exactly one matching in-process skill or private-memory connector. The tool writes no pet memory or self-learning data; owner-private run history is stored for reconciliation. |
| 🧠 | **Recall** | TF-IDF/recency/importance ranking plus conditional semantic vectors and RRF where embeddings exist. |
| 🔁 | **Reflect** | Best-effort consolidation, feedback and learned patterns; owners control retained data. |
| 🌐 | **Cross-surface** | Web, CLI, SDK and MCP share owner-scoped pet identity and normalized session metadata. |

`18 skill manifests · 7 MCP tools · SDK 2.0.0 release contract · 19 registered connectors · open SDK`

---

## 🛡️ Data sovereignty — *your pet, your data, your rules*

- **📤 Export** supported pet state/history as portable JSON with documented exclusions.
- **🗑️ Delete** active-system pet data after any paid run settles. Private run content is scrubbed; a minimal owner-only billing receipt remains. Backups expire under the published retention schedule.
- **🔍 Inspect** documented retained categories, counts, consent state and session history.
- **✏️ Correct or remove** retained facts, profile entries and session history.

---

## ⚡ Quickstart (CLI)

SDK 2.0.0 is a major migration target: paid SDK, CLI, and MCP tasks must include
`taskKind`. The deprecated `maxSteps` compatibility field is ignored and
normalized to `1`. During rollout, verify the npm version before relying on the
2.0.0 contract. See [Migrating from 1.x](packages/petclaw/README.md#migrating-from-1x).

```bash
# 0. Verify the supported release before installing.
npm view @myaipet/petclaw-sdk version

# 1. Install after npm reports 2.0.0 or later.
npm i -g @myaipet/petclaw-sdk    # or: npx @myaipet/petclaw-sdk <cmd>

# 2. Connect the CLI through a hidden prompt (never place tokens in argv)
petclaw-sdk auth

# 3. Select a pet returned by your owner-scoped account, then verify setup
petclaw-sdk pets
petclaw-sdk use <petId>
petclaw-sdk doctor

# `petclaw-sdk init` is an interactive alternative that performs auth,
# owned-pet selection, and model choice in one flow.

# 4. Use the level-1-safe core companion skill (no install required), then
#    optionally connect your own model through its hidden key prompt.
petclaw-sdk execute companion-chat --json-input '{"message":"Suggest one next step"}'
petclaw-sdk models connect openai --scopes=chat,reason

# 5. Run an explicit typed task, or start the MCP server
petclaw-sdk agent "What are my launch priorities?" --task recall --confirm-cost 5 --json
petclaw-sdk mcp
```

Agent runs are paid. Every new run must select `recall`, `summarize`, `review`,
or `draft`. The CLI requires both `--task <kind>` and the exact
`--confirm-cost 5` flag; the MCP tool requires `taskKind` and
`confirmCostCredits: 5`. Missing or invalid values are rejected before paid
work starts. Task input is capped at 2,000 characters.

Each task is bound server-side to one approved read-only tool:

| Task | Paid deliverable |
|---|---|
| `recall` | Retrieved owner-private facts plus an answer grounded in those facts |
| `summarize` | A structured decision brief: summary, key facts, risk/unknown, and next step |
| `review` | The primary issue, why it matters, and a revised version |
| `draft` | Reviewable text only; it is not sent, published, or executed |

The tool does not write pet memory or self-learning data. The service stores
owner-private run input, result, trace, and billing history for reconciliation
and audit. A completed response includes the exact server receipt: bound task,
tool outcome, model-call counts, credit outcome, and remaining balance. Five
credits are charged only when the required tool succeeds without a side effect
and produces the contract-valid deliverable. Empty recall, wrong-tool,
degraded, failed, incomplete, refusal, direct-answer-only, and non-contract
outputs refund the reservation.

If a receipt is absent after an unknown outcome, keep the local pending marker
locked. Replay only the exact saved `runId`, `goal`, `taskKind`, normalized
`maxSteps: 1`, and `confirmCostCredits` against the server origin to which that
authorization was bound. Never mint a new run ID or clear the marker merely
because a receipt is absent.

Or use it as a library:

```ts
import {
  PetClawClient,
  createPetClawAgentRunId,
} from "@myaipet/petclaw-sdk";

// Server-side Node.js only: never expose a pck_ token in browser JavaScript.
const authToken = process.env.PETCLAW_TOKEN;
if (!authToken) throw new Error("PETCLAW_TOKEN is required");
const client = new PetClawClient({ baseUrl: "https://app.myaipet.ai", authToken });

const { pets } = await client.pets.list();
const selectedPetId = Number(process.env.PETCLAW_PET_ID);
const pet = pets.find((candidate) => candidate.id === selectedPetId);
if (!pet) throw new Error("Select a pet owned by this token");
const petId = pet.id;

const { skills } = await client.skills.list(); // discover level-gated optional skills
const res = await client.chat.send(petId, "hi!");
// Persist before sending; reuse this ID to reconcile an unknown outcome.
const runId = createPetClawAgentRunId();
const run = await client.agent.run(petId, {
  runId,
  goal: "What are my current launch priorities?",
  taskKind: "recall",
  maxSteps: 1, // deprecated compatibility field; SDK 2.0.0 normalizes it to 1
  confirmCostCredits: 5,
});
console.log(res.reply, run.stoppedReason);
```

→ Full reference: **[/api-docs](https://app.myaipet.ai/api-docs)**

---

## 🏗️ Architecture

```
 ┌─────────────────────────────────────────────────────────────┐
 │  MY AI PET (consumer)   Home · My Pet · Studio · Community    │
 │                         · PetClaw · Season Rewards           │
 ├─────────────────────────────────────────────────────────────┤
 │  PetClaw Protocol v1    SDK · 7-tool MCP · connector registry  │
 │  ─ Typed paid tasks     one selected read-only tool + receipt │
 │  ─ Memory               conditional vector + TF-IDF + RRF    │
 │  ─ Sovereignty          inspect · edit · export · delete      │
 │  ─ Network              read-only public discovery preview   │
 ├─────────────────────────────────────────────────────────────┤
 │  Stack   Next.js 16 · React 19 · TS · Prisma · Postgres      │
 │          AWS EC2 + PM2 + nginx · routed LLMs + fal.ai        │
 └─────────────────────────────────────────────────────────────┘
```

- **Frontend** — Next.js 16 (App Router), React 19, RainbowKit + wagmi (SIWE auth, no gas — identity only).
- **Backend** — Next.js API routes, host-local PostgreSQL 16 + Prisma, JWT sessions.
- **AI** — server-managed OpenAI/xAI routing + **fal.ai**; encrypted owner BYOK and native tool-calling.
- **Protocol** — `@myaipet/petclaw-sdk` package: CLI (auth via `pck_…` tokens) + MCP server + skills registry + sovereignty exports.

---

## 📁 Repo layout

| Path | What lives there |
|---|---|
| `web/` | The Next.js app — consumer product + every `/api/*` route (PetClaw protocol endpoints included) |
| `packages/petclaw` | `@myaipet/petclaw-sdk` — CLI, MCP server, client library, skill docs |
| `desktop-pet/` | Chrome extension — your pet walks the page you're on; daily care actions feed capped season points via `/api/petclaw/engagement` |
| `contracts/` | Hardhat contract sources; production integration is disabled, while the two deployed BSC contracts returned `paused() = false` at launch review |
| `tools/demo-video/` | Repeatable product-video production kit |
| `deploy/` | Signed-artifact EC2 deployment, backup, rollback, and environment checks; RDS helpers are historical only |
| `landing-assets/` | Static marketing site (myaipet.ai) — served separately from the app |
| `docs/` | Architecture, economy, security-audit and DD docs |

---

## 🚦 Status — Beta

This is early, and we say so honestly.

| Area | State |
|---|---|
| Pet care loop · Studio (22 video templates, Prompt Director, in-browser editor) · World Cup · Community · PetClaw sovereignty · points/missions | ✅ Live |
| Guest tour — append `?tour=1` for a read-only DEMO preview (community / world cup / my pet), no wallet needed | ✅ Live |
| Season 1 | ⏳ **Starting soon** — no date/countdown until an operator sets the launch timestamp |
| On-chain anchoring + Memory-NFT minting | ⏸️ Production integration disabled; no activation date announced |
| USDT credit purchases | ⏸️ Paused — earn credits free by raising & creating |
| Token | ❌ **None.** The economy is points-only, non-financial loyalty. No token, no TGE. |

---

## 🤝 Backed by

Amber · WAGMI Ventures · Animoca Brands · KuCoin Ventures · ViaBTC · Web3 Labs · Arkstream Capital · ICC Ventures · WaterDrip · CryptoSen

---

## Links

- **App** — https://app.myaipet.ai
- **Docs / API** — https://app.myaipet.ai/api-docs
- **Skills registry** — https://app.myaipet.ai/skills
- **Contracts** — https://app.myaipet.ai/contracts
- **SDK** — [`@myaipet/petclaw-sdk`](https://www.npmjs.com/package/@myaipet/petclaw-sdk)
- **𝕏** — https://x.com/MYAIPETS

## License

MIT.

<div align="center"><sub>Made with care, not hype. 🐾</sub></div>
