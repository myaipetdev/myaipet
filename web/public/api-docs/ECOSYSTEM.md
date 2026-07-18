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
petclaw-sdk auth <jwt>
petclaw-sdk models connect openai sk-...
petclaw-sdk models list
```

Endpoints: `GET/POST/DELETE /api/petclaw/models` (owner-auth).

## Connectors (19 across 5 categories — examples)

| Platform | Type | Capabilities |
|----------|------|-------------|
| **Telegram** | Messaging | Send/receive messages, photos, webhooks, bot management |
| **Twitter/X** | Social | Post tweets, timeline, search, likes, DMs |
| **Discord** | Community | Server messages, reactions, channel management |
| **Slack** | Workspace | Channel messages, threads, reactions, history |
| **Web Search** | Knowledge | Search + page summarization (no API key needed) |
| **Enhanced Memory** | Internal | Semantic search, timeline, cross-platform recall |

## MCP Compatibility

Any MCP-compatible client can invoke PetClaw skills (6 tools exposed):

| Client | Status |
|--------|--------|
| Claude Desktop / Claude Code | ✅ Tested |
| Cursor | ✅ Compatible |
| Gemini CLI | ✅ Compatible |
| Any MCP stdio client | ✅ Standard protocol |

```bash
petclaw-sdk mcp
# or via npx
npx @myaipet/petclaw-sdk mcp --url https://app.myaipet.ai --pet-id 1
```

## On-Chain (planned · not live)

On-chain features are disabled. Two legacy contracts remain paused on BSC; a future **Base** deployment and external audit are planned, but no activation date is announced. The economy is points-only loyalty — **no token**.

| Contract | Type | Purpose |
|----------|------|---------|
| PetSoul | ERC721 | Soulbound pet identity + memory anchors |
| PETContent | ERC721 | AI-generated content as NFTs |
| PETActivity | — | On-chain activity recording |
| PetaGenTracker | — | Batch activity tracking |

The two deployed BSC contracts are non-upgradeable and paused. The other rows are roadmap designs, not deployed live contracts. An external audit is planned before any future activation.

## Data Sovereignty

| Right | Endpoint | Description |
|-------|----------|-------------|
| 📦 Export | `GET /api/petclaw/export` | Download complete SOUL data (JSON) |
| 📥 Import | `POST /api/petclaw/import` | Restore pet from SOUL export |
| 🗑️ Delete | `DELETE /api/petclaw/delete` | Permanent erasure + SHA-256 proof |
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
petclaw-sdk mcp                   # Start MCP server
```

## Integration

```typescript
import { PetClawClient } from "@myaipet/petclaw-sdk";

const pet = new PetClawClient({ baseUrl: "https://app.myaipet.ai" });

await pet.skills.execute(1, "companion-chat", { message: "hi" });
await pet.sovereignty.export(1);
await pet.network.discover();
```
