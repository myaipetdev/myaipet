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
    "soulNFT": true
  },
  "endpoints": { ... },
  "sovereignty": {
    "dataOwnership": "user",
    "exportFormat": "petclaw-soul-v1",
    "deletionProof": true,
    "portability": true,
    "inheritance": true
  }
}
```

> Note: `version` here is the **protocol** version (`petclaw-v1`, semver `1.0.0`) — it is distinct from, and not pinned to, the npm **SDK package** version (currently `1.6.0`).

### GET `/api/petclaw`
Full manifest with skills and stats.

**Response:**
```json
{
  "success": true,
  "manifest": {
    "protocol": "petclaw-v1",
    "skills": [...],
    "endpoints": { ... }
  },
  "stats": {
    "totalPets": 100,
    "activePets": 85,
    "totalSoulNfts": 42
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
Install, uninstall, or execute a skill.

**Body:**
```json
{
  "action": "install" | "uninstall" | "execute" | "list",
  "petId": 1,
  "skillId": "companion-chat",
  "input": { "message": "hello" },
  "config": { "API_KEY": "..." }
}
```

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
Permanently delete all pet data with cryptographic proof.

**Response:**
```json
{
  "success": true,
  "deletionHash": "a1b2c3d4...",
  "deletedAt": "2026-04-15T00:00:00Z",
  "message": "All pet data has been permanently deleted"
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

### POST `/api/petclaw/network/invoke`
Invoke a skill on another pet. Automatic billing (10% platform, 90% owner).

**Body:**
```json
{
  "callerPetId": 1,
  "providerPetId": 2,
  "skillId": "companion-chat",
  "input": { "message": "Hello from Pet 1!" }
}
```

**Response:**
```json
{
  "success": true,
  "output": { "reply": "Hi Pet 1! Nice to meet you~" },
  "billing": {
    "cost": 0,
    "callerCharged": 0,
    "providerEarned": 0,
    "platformFee": 0
  },
  "latencyMs": 3200,
  "messageId": "abc123"
}
```

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
