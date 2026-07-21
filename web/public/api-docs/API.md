# PetClaw API Reference

Base URL: `https://app.myaipet.ai`

## Discovery

### GET `/.well-known/pet-card.json`
Server capabilities and endpoints.

**Response:**
```json
{
  "protocol": "petclaw-v1",
  "version": "1.0.0",
  "name": "MY AI PET",
  "capabilities": {
    "companionAI": true,
    "dataSovereignty": true,
    "soulNFT": false
  },
  "endpoints": { ... },
  "sovereignty": {
    "dataOwnership": "user",
    "exportFormat": "petclaw-soul-v1",
    "deletionProof": false,
    "deletionReceipt": "sha256-metadata",
    "portability": true,
    "inheritance": false
  }
}
```

`soulNFT` is `false` while production on-chain mint integration is disabled. Exported SOUL data
can still preserve legacy off-chain or previously recorded NFT state.

`deletionProof` is `false`: deletion returns a SHA-256 receipt of the deletion-request
metadata (`deletionReceipt: "sha256-metadata"`) — it is not a signed proof and not a hash of
the deleted content. `inheritance` is `false`: successor designation exists in the API, but
automated transfer is not scheduled in this release.

> Note: `version` here is the **protocol** version (`petclaw-v1`, semver `1.0.0`) — it is distinct from, and not pinned to, the npm **SDK package** version (currently `1.6.1`).

### GET `/api/petclaw`
Full manifest with skills and stats.

**Response shape (numeric values below are illustrative, not launch metrics):**
```json
{
  "success": true,
  "manifest": {
    "protocol": "petclaw-v1",
    "skills": [...],
    "endpoints": { ... }
  },
  "stats": {
    "totalPets": 0,
    "activePets": 0,
    "totalSoulNfts": 0
  }
}
```

---

## Skills

### GET `/api/petclaw/skills`
List all available skills.

**Query params:**
- `q` — Search query
- `category` — Filter: `social`, `creative`, `utility`, `knowledge`, `emotional`
- `id` — Get single skill by ID
- `petId` — List installed skills for a pet
- `format=md` — Return SKILL.md format (with `id` param)

### POST `/api/petclaw/skills`
Install, uninstall, or execute a skill. `install` accepts the **18 built-in skill IDs only** — custom skill IDs are rejected with `Skill not found` (custom skill authoring is on the roadmap and not installable yet).

**Body:**
```json
{
  "action": "install" | "uninstall" | "execute" | "list",
  "petId": 1,
  "skillId": "companion-chat",
  "input": { "message": "hello" },
  "config": { "style": "casual" }
}
```

`config` is optional and holds **non-secret preferences only**. It is stored as
plaintext alongside the pet, so the API rejects (`400`) any config field whose
name or value looks like a credential — names matching
`key / secret / token / password / credential`, values with known key prefixes
(`sk-`, `xai-`, `ghp_`, `pk_`, …), or long high-entropy strings. To use your own
model key, connect it via the encrypted BYOK vault instead:
`POST /api/petclaw/models` (see **Models** below). Never put API keys in skill
config.

**Execute response:**
```json
{
  "skillId": "companion-chat",
  "success": true,
  "output": { "reply": "Hi there!", "model": "grok-4" },
  "latencyMs": 2500,
  "cost": 0
}
```

---

## Data Sovereignty

### GET `/api/petclaw/export?petId=1`
Export all pet data as portable JSON (SOUL format).

**Response:** Full `SoulExport` object including pet identity, persona, memories, skills, soul NFT state, checkpoints, consent, and integrity hash.

### POST `/api/petclaw/import`
Import a pet from SOUL export data.

**Body:** `SoulExport` JSON object

**Response:**
```json
{ "success": true, "petId": 42, "message": "Pet imported successfully" }
```

### DELETE `/api/petclaw/delete?petId=1`
Remove pet-scoped data and owned media from active systems. Returns a SHA-256
receipt (`deletionHash`) computed over the deletion-request metadata (pet id,
name, owner, timestamp, protocol) — it is not a signed proof and not a hash of
the deleted content. Backup copies expire under the published retention schedule
(no later than 90 days); public on-chain records cannot be erased.

**Response:**
```json
{
  "success": true,
  "deletionHash": "a1b2c3d4...",
  "deletedAt": "2026-04-15T00:00:00Z",
  "mediaCleanup": { "processed": 4, "deleted": 4, "retained": 0, "failed": 0 },
  "message": "Pet-scoped data and owned media were removed from active systems. Backup copies expire under the published retention schedule; public on-chain records cannot be erased."
}
```

### POST `/api/petclaw/verify`
Verify pet ownership by wallet address.

**Body:**
```json
{ "petId": 1, "walletAddress": "0x..." }
```

**Response:**
```json
{ "verified": true, "petDID": "did:pet:abc123...", "soulNftId": 1 }
```

---

## Pet Network (A2A)

### GET `/api/petclaw/network/discover`
Discover pets on the network.

**Query params:**
- `personality` — Filter by personality type
- `element` — Filter by element (fire, water, grass, electric, normal)
- `skill` — Filter by installed skill ID
- `minLevel` — Minimum pet level
- `limit` — Max results (default 50)

**Response:**
```json
{
  "protocol": "petclaw-v1",
  "network": { "totalNodes": 100, "onlineNodes": 85 },
  "nodes": [
    {
      "petId": 1,
      "name": "Sparky",
      "petDID": "did:pet:...",
      "personality": "brave",
      "element": "fire",
      "level": 15,
      "capabilities": ["companion-chat", "persona-mirror"],
      "trustScore": 92,
      "status": "online"
    }
  ]
}
```

`POST /api/petclaw/network/invoke` is disabled and returns 503. Public discovery
does not authorize remote execution with another pet's private memory or model
key.

---

## Agent Loop

### POST `/api/pets/{petId}/agent`
Run the plan-and-execute agent loop: a reasoning model plans each step, a real skill is invoked, the result is observed, and it iterates until done — then a chat model synthesizes the answer. Owner-authenticated and credit-metered (flat cost per run, refunded if no real work ran). `maxSteps` is clamped server-side (1–6).

**Body:**
```json
{ "goal": "Check my mood from recent chats and suggest one thing for today", "maxSteps": 4 }
```

**Response:**
```json
{
  "ok": true,
  "goal": "...",
  "answer": "...synthesized report...",
  "steps": [
    { "thought": "...", "skill": "daily-mood", "input": {}, "output": {}, "ok": true }
  ],
  "stoppedReason": "finished",
  "creditsRemaining": 95
}
```

The in-app **Agent Workbench** (`/?section=workbench`) drives this endpoint.

---

## Models (Bring Your Own Model)

Owners connect their own provider keys (OpenAI, Anthropic, Google, OpenRouter); keys are encrypted at rest and used by the LLM router. Owner-authenticated.

### GET `/api/petclaw/models`
List connected models.

### POST `/api/petclaw/models`
Connect a provider key.

**Body:**
```json
{ "action": "connect", "provider": "openai", "apiKey": "sk-...", "tasks": ["chat", "reason"] }
```

**Response:**
```json
{ "connection": { "provider": "openai", "model": "gpt-...", "keyMask": "sk-…abcd" } }
```

### DELETE `/api/petclaw/models?id=<id>`
Remove a connected model.
