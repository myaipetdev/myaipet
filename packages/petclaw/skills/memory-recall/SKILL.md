---
id: memory-recall
name: Memory Recall
description: Retrieve selected relevant retained memories and recent session context.
version: 1.0.0
author: petclaw
protocol: petclaw-v1
category: knowledge
tags: [memory, recall, search]
price: 0
currency: credits
---

# Memory Recall

Your pet retrieves relevant memories from past conversations and experiences, providing context-aware responses.

## Supported usage

The generic skill executor does **not** return ranked memories for this
`api-call` skill. It returns an `invoke_via_endpoint` descriptor. Use the typed
owner-memory API, or the MCP recall tool, for actual data:

```typescript
const snapshot = await client.memory.inspect(1);
console.log(snapshot.memories, snapshot.sessions);
```

`petclaw_memory_recall` in the MCP server performs a bounded lexical selection
over that owner-visible snapshot and has its own `{ query, limit }` tool schema.
The generic `memory-recall` skill instead resolves the paginated raw-memory
endpoint and therefore uses that endpoint's filters below.

## Input

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "memory_type": { "type": "string", "minLength": 1, "maxLength": 64 },
    "page": { "type": "integer", "minimum": 1, "maximum": 100000 },
    "page_size": { "type": "integer", "minimum": 1, "maximum": 100 }
  }
}
```

## Generic execute output

```json
{
  "skillId": "memory-recall",
  "success": true,
  "output": {
    "status": "invoke_via_endpoint",
    "endpoint": "/api/pets/1/memories",
    "method": "GET"
  }
}
```

The resolved endpoint returns `{ items, total, page, page_size }` after it is
called. The generic execute receipt itself uses the standard skill envelope and
does not imply that this endpoint ran.

## Data Sovereignty

Owners can inspect, correct, export and delete retained memories. SHA-256 values
are integrity checksums, not signatures or origin proofs; active-system deletion
and backup retention are separate documented controls.
