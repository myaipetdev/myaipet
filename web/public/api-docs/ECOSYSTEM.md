# PetClaw Ecosystem

## Architecture

```
                    ┌─────────────────────┐
                    │   PetClaw Protocol   │
                    │        v1.2          │
                    └──────────┬──────────┘
                               │
            ┌──────────────────┼──────────────────┐
            │                  │                  │
      ┌─────┴─────┐     ┌─────┴─────┐     ┌─────┴─────┐
      │   SKILLS   │     │  NETWORK  │     │SOVEREIGNTY│
      │   (MCP)    │     │   (A2A)   │     │  (SOUL)   │
      └─────┬─────┘     └─────┬─────┘     └─────┬─────┘
            │                  │                  │
```

## Skills (7 Built-in)

| Skill | Category | Description |
|-------|----------|-------------|
| 💬 `companion-chat` | Emotional | Personality-driven conversation with persistent memory |
| 🪞 `persona-mirror` | Social | Mirror owner's speech patterns across platforms |
| 🧠 `memory-recall` | Knowledge | Cross-platform memory search and reasoning |
| 📝 `autonomous-post` | Creative | Generate social content in pet's voice |
| 📦 `soul-export` | Utility | Export complete identity as portable data |
| 📓 `daily-mood` | Emotional | AI-generated daily mood journal |
| 📸 `image-gen` | Creative | AI pet selfie / artwork generation |

## Platform Connectors (6)

| Platform | Type | Capabilities |
|----------|------|-------------|
| **Telegram** | Messaging | Send/receive messages, photos, webhooks, bot management |
| **Twitter/X** | Social | Post tweets, timeline, search, likes, DMs |
| **Discord** | Community | Server messages, reactions, channel management |
| **Slack** | Workspace | Channel messages, threads, reactions, history |
| **Web Search** | Knowledge | DuckDuckGo search, page summarization (no API key needed) |
| **Enhanced Memory** | Internal | Semantic search, timeline, cross-platform recall |

## MCP Compatibility

Any MCP-compatible client can invoke PetClaw skills:

| Client | Status |
|--------|--------|
| Claude Code | ✅ Tested |
| OpenClaw | ✅ Compatible |
| Cursor | ✅ Compatible |
| Gemini CLI | ✅ Compatible |
| Any MCP stdio client | ✅ Standard protocol |

```bash
# Start MCP server
petclaw-sdk mcp

# Or via npx
npx petclaw-sdk mcp --url https://app.myaipet.ai --pet-id 1
```

## On-Chain (BSC Mainnet)

| Contract | Type | Purpose |
|----------|------|---------|
| PETToken | ERC20 | Governance + utility token |
| PetSoul | ERC721 | Soulbound pet identity + memory NFTs |
| PETContent | ERC721 | AI-generated content as NFTs |
| PETActivity | — | On-chain activity recording |
| PetaGenTracker | — | Batch activity tracking |
| PETShop | — | Token purchase (USDT tiers) |

All contracts audited (2 audits + code review), with Ownable2Step, Pausable, ReentrancyGuard.

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
GET /.well-known/pet-card.json    → Server capabilities
GET /api/petclaw                  → Full manifest
GET /api/petclaw/network/discover → Find other pets
POST /api/petclaw/network/invoke  → Pet-to-Pet skill invocation
```

## CLI

```bash
petclaw-sdk init              # Setup connection
petclaw-sdk status            # Health check
petclaw-sdk chat "hello"      # Single message
petclaw-sdk talk              # Interactive chat
petclaw-sdk skills            # List skills
petclaw-sdk install <id>      # Install skill
petclaw-sdk execute <id>      # Run skill
petclaw-sdk export            # Download SOUL
petclaw-sdk discover          # Find pets
petclaw-sdk mcp               # Start MCP server
```

## Integration

```typescript
import { PetClawClient } from "petclaw-sdk";

const pet = new PetClawClient({ baseUrl: "https://app.myaipet.ai" });

await pet.skills.execute(1, "companion-chat", { message: "hi" });
await pet.sovereignty.export(1);
await pet.network.discover();
```
