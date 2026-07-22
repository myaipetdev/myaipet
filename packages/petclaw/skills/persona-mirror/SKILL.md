---
id: persona-mirror
name: Persona Mirror
description: Generate a draft informed by retained communication preferences and provided context.
version: 1.0.0
author: petclaw
protocol: petclaw-v1
category: social
tags: [persona, tone, draft]
price: 0
currency: credits
---

# Persona Mirror

Your pet can use owner-approved retained preferences to draft in a familiar
style. Output is a suggestion to review, not an identity or authorship claim.

## How It Works

1. **Optional setup**: Save owner-approved style, interest, and tone preferences
2. **Explicit analysis**: Submit selected messages through the owner-only persona analysis flow
3. **Draft and review**: Generate a suggestion from the supplied context and retained preferences; PetClaw does not claim to write as the owner

## Usage

```bash
curl -X POST https://your-server.com/api/petclaw/skills \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PETCLAW_TOKEN" \
  -d '{
    "action": "execute",
    "petId": 1,
    "skillId": "persona-mirror",
    "input": { "context": "Reply to a friend asking about weekend plans", "surface": "telegram", "sessionId": "weekend-draft" }
  }'
```

## Input

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "context": { "type": "string", "minLength": 1, "maxLength": 2000 },
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
  "required": ["context"]
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
