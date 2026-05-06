# PetClaw API Reference

Base URL: `https://your-server.com`

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
  "output": { "reply": "Hi there!", "model": "grok-3-mini" },
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
