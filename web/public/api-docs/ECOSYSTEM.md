# PetClaw Ecosystem

PetClaw is an open protocol for companion AI. SDK: **`@myaipet/petclaw-sdk`** (npm, public).

## Architecture

```
                    ┌─────────────────────┐
                    │   PetClaw Protocol   │
                    │   v1 · SDK 1.6.0     │
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

## Connectors (21 across 5 categories — examples)

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

## On-Chain (at go-live)

On-chain features are currently paused (holding period) and the deployment is migrating from BSC to **Base**; they activate at go-live. The economy is points-only loyalty — **no token**.

| Contract | Type | Purpose |
|----------|------|---------|
| PetSoul | ERC721 | Soulbound pet identity + memory anchors |
| PETContent | ERC721 | AI-generated content as NFTs |
| PETActivity | — | On-chain activity recording |
| PetaGenTracker | — | Batch activity tracking |

Contracts are non-upgradeable with minimized owner privileges (Ownable2Step, Pausable, ReentrancyGuard). An external audit is planned pre-launch.

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
POST /api/petclaw/network/invoke   → Pet-to-Pet skill invocation
```

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
