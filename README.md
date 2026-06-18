<div align="center">

# 🐾 MY AI PET

### The open infrastructure for AI companions you actually own.

*An AI pet that remembers you, grows with you, and lives across every surface you do —
fully exportable, deletable, yours. Built on **PetClaw**, an open protocol.*

[![Status](https://img.shields.io/badge/status-beta-7c3aed)](https://app.myaipet.ai)
[![Protocol](https://img.shields.io/badge/PetClaw-v1-f59e0b)](https://app.myaipet.ai/api-docs)
[![SDK](https://img.shields.io/npm/v/@myaipet/petclaw-sdk?color=4ade80&label=@myaipet%2Fpetclaw-sdk)](https://www.npmjs.com/package/@myaipet/petclaw-sdk)
[![MCP](https://img.shields.io/badge/MCP-native-2563eb)](https://app.myaipet.ai/api-docs)
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
| ✕ Forgets you when the tab closes | ✓ Remembers across every session — it's *yours* |
| ✕ Answers in text, can't take action | ✓ Plans + runs real skills, then observes |
| ✕ Works alone, no review | ✓ Reflects on itself and self-evolves (VIGIL) |
| ✕ Locked inside one app | ✓ Exportable JSON soul · MCP-callable · open SDK |

---

## 🧠 Agent orchestration — *one pet, a real agent loop, one memory*

Under the cute pet is a real, coordinated agent loop. Every piece is open and grounded in code:

| | Role | What it is |
|---|---|---|
| 🧭 | **Plan → Act** | A reasoning model plans each step; a real **skill** is invoked, the result observed, and it iterates until done — then a chat model synthesizes the answer. *(plan-execute)* |
| 🧠 | **Recall** | Full-memory retrieval — **vector + BM25 + reciprocal-rank fusion** feeds every step. *(GBrain-style)* |
| 🔁 | **Reflect** | The pet consolidates what it learned and reshapes future replies — self-evolution, not a frozen prompt. *(VIGIL)* |
| 🌐 | **Agent-to-Agent** | Pets discover and call each other's skills across the open network. *(PACK — pet-to-pet A2A)* |

`18 skills · 6 MCP tools · 21 connectors · open SDK`

---

## 🛡️ Data sovereignty — *your pet, your data, your rules*

- **📤 Export** your pet's full soul (memories, personality, skills) as portable JSON — take it anywhere.
- **🗑️ Delete** everything with a cryptographic (SHA-256) proof receipt.
- **🔍 See** exactly what we hold about your pet — nothing hidden.
- **🧬 Inherit** — name a successor wallet; your pet's soul outlives any single device.

---

## ⚡ Quickstart (CLI)

```bash
# 1. Install
npm i -g @myaipet/petclaw-sdk    # or: npx @myaipet/petclaw-sdk <cmd>

# 2. Set up a project
petclaw-sdk init

# 3. Install a skill onto your pet
petclaw-sdk install daily-mood

# 4. Bring your own model (BYOK — encrypted)
petclaw-sdk auth <your-jwt>
petclaw-sdk models connect openai sk-...

# 5. Run it as an MCP server (Claude Desktop, Cursor, …)
petclaw-sdk mcp
```

Or use it as a library:

```ts
import { PetClawClient } from "@myaipet/petclaw-sdk";

const client = new PetClawClient({ baseUrl: "https://app.myaipet.ai", authToken });

const { skills } = await client.skills.list();
await client.skills.install(petId, "daily-mood");
const res = await client.skills.execute(petId, "companion-chat", { message: "hi!" });
console.log(res.output.reply);
```

→ Full reference: **[/api-docs](https://app.myaipet.ai/api-docs)**

---

## 🏗️ Architecture

```
 ┌─────────────────────────────────────────────────────────────┐
 │  MY AI PET (consumer)   Home · My Pet · Studio · Community    │
 │                         · PetClaw · Season Rewards           │
 ├─────────────────────────────────────────────────────────────┤
 │  PetClaw Protocol v1    SDK · MCP server · 21 connectors      │
 │  ─ Agent loop           plan → act → observe → reflect       │
 │  ─ Memory               GBrain recall (vector + BM25 + RRF)  │
 │  ─ Sovereignty          export · delete-with-proof · inherit │
 │  ─ Network              pet-to-pet A2A (PACK)                 │
 ├─────────────────────────────────────────────────────────────┤
 │  Stack   Next.js 16 · React 19 · TS · Prisma · Postgres      │
 │          AWS EC2 + PM2 + nginx · Grok + fal.ai               │
 └─────────────────────────────────────────────────────────────┘
```

- **Frontend** — Next.js 16 (App Router), React 19, RainbowKit + wagmi (SIWE auth, no gas — identity only).
- **Backend** — Next.js API routes, PostgreSQL (self-hosted) + Prisma, JWT sessions.
- **AI** — xAI **Grok** + **fal.ai**; LLM router with BYOK (owners connect their own models, encrypted).
- **Protocol** — `@myaipet/petclaw-sdk` package: CLI + MCP server + skills registry + sovereignty exports.

---

## 🚦 Status — Beta

This is early, and we say so honestly.

| Area | State |
|---|---|
| Pet care loop · Studio (AI image/video) · PetClaw sovereignty · points/missions | ✅ Live |
| Season 1 | 📅 Starts **Jul 1, 2026** |
| On-chain anchoring + Memory-NFT minting | ⏸️ Paused (holding period · migrating **BSC → Base**, activates at go-live) |
| USDT credit purchases | ⏸️ Paused — earn credits free by raising & creating |
| Token | ❌ **None.** The economy is points-only, non-financial loyalty. No token, no TGE. |

---

## Links

- **App** — https://app.myaipet.ai
- **Docs / API** — https://app.myaipet.ai/api-docs
- **Skills registry** — https://app.myaipet.ai/skills
- **Contracts** — https://app.myaipet.ai/contracts
- **SDK** — `@myaipet/petclaw-sdk` ([github.com/myaipetdev/petclaw](https://github.com/myaipetdev/petclaw))
- **𝕏** — https://x.com/MYAIPETS

## License

MIT.

<div align="center"><sub>Made with care, not hype. 🐾</sub></div>
