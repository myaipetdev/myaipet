<div align="center">

# 🐾 MY AI PET

### The owner-controlled identity, memory, and consent layer for AI companions.

*An AI pet that can retain selected context and join supported owner surfaces —
inspectable, portable within documented bounds, and owner-controlled. Built on **PetClaw**.*

[![Status](https://img.shields.io/badge/status-beta-7c3aed)](https://app.myaipet.ai)
[![Protocol](https://img.shields.io/badge/PetClaw-v1-f59e0b)](https://app.myaipet.ai/api-docs)
[![SDK](https://img.shields.io/npm/v/@myaipet/petclaw-sdk?color=4ade80&label=@myaipet%2Fpetclaw-sdk)](https://www.npmjs.com/package/@myaipet/petclaw-sdk)
[![MCP](https://img.shields.io/badge/MCP-preview-2563eb)](https://app.myaipet.ai/api-docs)
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
| ✕ Answers in text, can't take action | ✓ Plans + runs real skills, then observes |
| ✕ Works alone, no review | ✓ Bounded learning patterns and owner-controlled memory (VIGIL) |
| ✕ Locked inside one app | ✓ Checksummed supported-field JSON · REST/CLI now · seven-tool MCP candidate |

---

## 🧠 Agent orchestration — *one pet, a bounded goal loop, owner-controlled memory*

Under the pet is a bounded goal loop and a separate persistent-chat path:

| | Role | What it is |
|---|---|---|
| 🧭 | **Plan → Act** | A reasoning model plans each step; a real **skill** is invoked, the result observed, and it iterates until done — then a chat model synthesizes the answer. *(plan-execute)* |
| 🔧 | **Use tools** | Native tool-calling over eligible in-process skills plus private memory recall. Outbound connectors stay outside memory-bearing runs until approval and data-taint controls ship. |
| 🧠 | **Recall** | TF-IDF/recency/importance ranking plus conditional semantic vectors and RRF where embeddings exist. |
| 🔁 | **Reflect** | Best-effort consolidation, feedback and learned patterns; owners control retained data. |
| 🌐 | **Cross-surface** | Web, CLI, SDK and MCP share owner-scoped pet identity and normalized session metadata. |

`18 skill manifests · 7 MCP tools in the 1.6.2 candidate · 19 registered connectors · open SDK`

---

## 🛡️ Data sovereignty — *your pet, your data, your rules*

- **📤 Export** supported pet state/history as portable JSON with documented exclusions.
- **🗑️ Delete** active-system pet data after any paid run settles. Private run content is scrubbed; a minimal owner-only billing receipt remains. Backups expire under the published retention schedule.
- **🔍 Inspect** documented retained categories, counts, consent state and session history.
- **✏️ Correct or remove** retained facts, profile entries and session history.

---

## ⚡ Quickstart (CLI)

```bash
# 0. Candidate gate: continue only when npm reports 1.6.2 or newer.
npm view @myaipet/petclaw-sdk version

# 1. Install (the agent and seven-tool MCP flow below require >=1.6.2)
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

# 5. Run a bounded goal, or start the MCP server
petclaw-sdk agent "Suggest one next step" --confirm-cost 5 --json
petclaw-sdk mcp
```

Agent runs are paid. The CLI requires the exact `--confirm-cost 5` flag and the
MCP tool requires `confirmCostCredits: 5` on every call. Missing or different
acknowledgement is rejected before paid work starts; successful calls return the
server billing receipt.

The paid loop exposes only eligible read-only skills and connectors, with no
retention or self-learning. It charges only for a completed direct model answer
or a completed run with a successful read-only result; other terminal runs
refund the reservation.

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
  goal: "Suggest one next step",
  maxSteps: 4,
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
 │  PetClaw Protocol v1    SDK · MCP preview · connector registry │
 │  ─ Agent loop           plan → act → observe → reflect       │
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
