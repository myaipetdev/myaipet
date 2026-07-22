---
id: companion-chat
name: Companion Chat
description: Personality-driven conversation where retained relevant memories can shape the reply.
version: 1.0.0
author: petclaw
protocol: petclaw-v1
category: emotional
tags: [chat, memory, personality]
price: 0
currency: credits
---

# Companion Chat

Your AI pet engages in personality-driven conversation with bounded, owner-controlled retained memory.

## How It Works

This skill uses the server-managed model route or the owner's scoped BYOK
connection. Selected relevant memories and recent sessions can shape a reply;
PetClaw does not promise perfect or unlimited recall.

### Personality Types

| Type | Behavior |
|------|----------|
| playful | Energetic, uses emojis, asks fun questions |
| brave | Confident, encouraging, uses action words |
| gentle | Calm, supportive, soft-spoken |
| shy | Hesitant, uses "um...", gradually opens up |
| lazy | Casual, short responses, sleepy references |
| curious | Asks questions back, explores topics |

## Usage

```bash
# Via PetClaw API
curl -X POST https://your-server.com/api/petclaw/skills \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PETCLAW_TOKEN" \
  -d '{
    "action": "execute",
    "petId": 1,
    "skillId": "companion-chat",
    "input": { "message": "How are you today?" }
  }'
```

```typescript
// Via SDK
import { PetClawClient } from "@myaipet/petclaw-sdk";
const client = new PetClawClient({
  baseUrl: "https://your-server.com",
  authToken: process.env.PETCLAW_TOKEN,
});
const result = await client.skills.execute(1, "companion-chat", {
  message: "How are you today?"
});
console.log(result.output.reply);
```

## Input

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "message": { "type": "string", "minLength": 1, "maxLength": 2000 },
    "surface": {
      "type": "string",
      "enum": ["web", "cli", "sdk", "mcp", "chrome-ext", "telegram", "discord"]
    },
    "sessionId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 120,
      "pattern": "^[A-Za-z0-9][A-Za-z0-9._:-]*$"
    }
  },
  "required": ["message"]
}
```

## Output

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "reply": { "type": "string" },
    "model": { "type": "string" },
    "tokensUsed": { "type": "integer", "minimum": 0 },
    "degraded": { "type": "boolean" },
    "degradationReason": { "type": "string" },
    "inference": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "provider": { "type": "string" },
        "model": { "type": "string" },
        "source": { "type": "string" }
      },
      "required": ["provider", "model", "source"]
    },
    "lineage": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "surface": { "type": "string" },
        "sessionId": { "type": "string" },
        "memoryRetained": { "type": "boolean" },
        "memoryFenced": { "type": "boolean" },
        "learningUpdated": { "type": "boolean" }
      },
      "required": ["surface", "sessionId", "memoryRetained", "memoryFenced", "learningUpdated"]
    }
  },
  "required": ["reply", "model", "degraded", "inference"]
}
```

## Data Sovereignty

Owners can inspect, correct, delete and export supported retained data. Import
is a documented reconstruction with exclusions, not a byte-for-byte clone.
