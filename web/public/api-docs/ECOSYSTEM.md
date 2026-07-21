# PetClaw Ecosystem

PetClaw is an open protocol for companion AI. SDK: **`@myaipet/petclaw-sdk`** (npm, public).

## Architecture

```
                    ┌─────────────────────┐
                    │   PetClaw Protocol   │
                    │   v1 · SDK 1.6.1     │
                    └──────────┬──────────┘
                               │
        ┌──────────────┬───────┼───────┬──────────────┐
        │              │       │       │              │
   ┌────┴────┐   ┌────┴───┐ ┌─┴──┐ ┌──┴───┐    ┌─────┴─────┐
   │ SKILLS  │   │ AGENT  │ │ MCP│ │NETWORK│    │SOVEREIGNTY│
   │  (18)   │   │ (VIGIL)│ │(6) │ │ (A2A) │    │  (SOUL)   │
   └─────────┘   └────────┘ └────┘ └───────┘    └───────────┘
```

## Skills (18 built-in — selected)

| Skill | Category | Description |
|-------|----------|-------------|
| 💬 `companion-chat` | Emotional | Personality-driven conversation with persistent memory |
| 🪞 `persona-mirror` | Social | Mirror owner's speech patterns across platforms |
| 🧠 `memory-recall` | Knowledge | Cross-platform memory search and reasoning |
| 🎯 `vibe-check` | Emotional | Read a message/post → emotional vibe + one-line take |
| 📦 `soul-export` | Utility | Export complete identity as portable data |
| 📓 `daily-mood` | Emotional | AI-generated daily mood journal |
| 📄 `summarize-page` | Knowledge | Summarize page text in the pet's voice (Chrome ext) |
| 📸 `image-gen` | Creative | AI pet selfie / artwork generation |
| 🎬 `video-gen` | Creative | AI pet video (async) |
| 📔 `pet-diary` | Emotional | First-person diary entry about the past week |

Full set is 18 (5 run in-loop via the LLM router; the rest route to REST endpoints). See `/skills` or `GET /api/petclaw`.

## Agent Orchestration (VIGIL)

Under the skills is a coordinated agent loop:

- **VIGIL** — an always-on self-improvement loop that runs on every chat turn (memory ledger, implicit feedback, self-learning; a bond/self-reflect pass periodically). CHORUS (best-of-N) is opt-in (`PETCLAW_BEST_OF_N`).
- **Plan → Act** — a reasoning model plans each step, a real skill runs, the result is observed, it iterates, then a chat model synthesizes. See `POST /api/pets/{id}/agent` (the Agent Workbench drives this).
- **Recall** — reciprocal-rank fusion over keyword (full-text) + recency + importance; semantic vector recall activates when you connect an embedding key (BYOK).

## Bring Your Own Model (BYOK)

Owners can connect their own provider keys (OpenAI, Anthropic, Google, OpenRouter); keys are encrypted at rest and used by the LLM router.

```bash
petclaw-sdk auth pck_your_token_here   # mint in the web app: Sovereignty → Connect PetClaw clients
petclaw-sdk models connect openai sk-...
petclaw-sdk models list
```

Endpoints: `GET/POST/DELETE /api/petclaw/models` (owner-auth).

## Connectors (19-connector registry · 3 live — examples)

| Platform | Type | Status · Capabilities |
|----------|------|-------------|
| **Telegram** | Messaging | Launch-paused — channel delivery returns 503 in this release |
| **Twitter/X** | Social | Launch-paused — channel delivery returns 503 in this release |
| **Discord** | Community | Launch-paused — channel delivery returns 503 in this release |
| **Slack** | Workspace | Launch-paused — channel delivery returns 503 in this release |
| **Web Search** | Knowledge | Live — DuckDuckGo instant-answer search; server-side page summarization is unavailable |
| **Wikipedia** | Knowledge | Live — article search + page summaries |
| **Enhanced Memory** | Internal | Live — semantic search, timeline, cross-platform recall |

3 of the 19 registered connectors are live today (`web-search`, `wikipedia`,
`memory`); the rest are registered but launch-paused or planned. Persistent
channel subscriptions (Telegram/Twitter/Discord bot delivery) are fail-closed
behind a launch kill-switch and return `503` — the same state shown on the
Agent screen ("Platform Connections · unavailable for launch"). Canonical
status lives in `web/src/lib/releaseStatus.ts` — keep this file in sync.

## MCP Compatibility

The SDK defines 6 MCP tools for stdio clients (Claude Desktop, Claude Code,
Cursor, Gemini CLI). **Known issue:** the MCP path in the published SDK 1.6.1 is
broken; the fix ships in SDK 1.6.2. Do not rely on MCP until then — invoke
skills via the REST API or CLI instead.

| Client | Status |
|--------|--------|
| Claude Desktop / Claude Code | ⏳ Shipping in SDK 1.6.2 |
| Cursor | ⏳ Shipping in SDK 1.6.2 |
| Gemini CLI | ⏳ Shipping in SDK 1.6.2 |
| Any MCP stdio client | ⏳ Standard protocol · shipping in SDK 1.6.2 |

```bash
petclaw-sdk mcp   # broken in 1.6.1 — fixed in SDK 1.6.2
```

## On-Chain (planned · not live)

Production on-chain integration is disabled. Two legacy BSC contracts returned `paused() = false` with zero activity/supply counters at the 2026-07-18 launch review; a future **Base** deployment and external audit are required before any integration, and no activation date is announced. The economy is points-only loyalty — **no token**.

| Contract | Type | Purpose |
|----------|------|---------|
| PetSoul | ERC721 | Soulbound pet identity + memory anchors |
| PETContent | ERC721 | AI-generated content as NFTs |
| PETActivity | — | On-chain activity recording |
| PetaGenTracker | — | Batch activity tracking |

The two deployed BSC contracts are non-upgradeable. Their production integration is disabled, and both returned `paused() = false` with zero activity/supply counters at the 2026-07-18 launch review. The other rows are roadmap designs, not deployed live contracts. An external audit and owner-permission review are required before any future integration.

## Data Sovereignty

| Right | Endpoint | Description |
|-------|----------|-------------|
| 📦 Export | `GET /api/petclaw/export` | Download complete SOUL data (JSON) |
| 📥 Import | `POST /api/petclaw/import` | Restore pet from SOUL export |
| 🗑️ Delete | `DELETE /api/petclaw/delete` | Active-systems removal + SHA-256 receipt of the request (backups expire ≤90 days; on-chain records can't be erased) |
| ✅ Consent | `PATCH /api/pets/{id}` | Toggle: public profile, data sharing, AI training, interactions |
| 🔍 Verify | `POST /api/petclaw/verify` | Prove pet ownership by wallet |

## Discovery

```
GET  /.well-known/pet-card.json    → Server capabilities
GET  /api/petclaw                  → Full manifest
GET  /api/petclaw/network/discover → Find other pets
```

Remote pet skill invocation is disabled in this release. Public Profile and
Pet Interactions consent do not authorize third-party access to private memory
or an owner-funded model key.

## CLI

```bash
petclaw-sdk init                  # Setup connection
petclaw-sdk status                # Health check
petclaw-sdk chat "hello"          # Single message
petclaw-sdk talk                  # Interactive chat
petclaw-sdk models connect ...    # Bring your own model (BYOK)
petclaw-sdk skills                # List skills
petclaw-sdk install <id>          # Install skill
petclaw-sdk execute <id>          # Run skill
petclaw-sdk export                # Download SOUL
petclaw-sdk discover              # Find pets
petclaw-sdk mcp                   # MCP server (broken in 1.6.1 — fixed in SDK 1.6.2)
```

## Integration

```typescript
import { PetClawClient } from "@myaipet/petclaw-sdk";

const pet = new PetClawClient({ baseUrl: "https://app.myaipet.ai" });

await pet.skills.execute(1, "companion-chat", { message: "hi" });
await pet.sovereignty.export(1);
await pet.network.discover();
```
