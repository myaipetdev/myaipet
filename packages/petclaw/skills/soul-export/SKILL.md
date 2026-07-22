---
id: soul-export
name: Soul Export
description: Export portable pet identity, personality, memories, skills, and safe history as SOUL data.
version: 1.0.0
author: petclaw
protocol: petclaw-v1
category: utility
tags: [export, sovereignty, portability]
price: 0
currency: credits
---

# Soul Export

Export supported pet identity and owner-controlled history as a JSON file. A
compatible server can reconstruct the documented categories and must report
everything it skips; this is not a byte-for-byte clone of all platform state.

## What Gets Exported

- Pet identity (name, species, personality, level, stats)
- Persona (speech patterns, interests, tone, analyzed patterns)
- Supported recent memories, conversations, milestones and experiences
- Supported learned skill metadata and levels
- Source identity/checkpoint provenance where present (not a live NFT claim)
- Consent settings
- SHA-256 integrity checksum

Provider credentials, token hashes, webhook secrets, payment/on-chain ownership
claims, external ownership links, and source-private media are not portable
restore rights. An import verifies the source hash, safely restores supported
categories under the authenticated owner, and reports restored/skipped counts.

## Usage

```bash
# Via API
curl https://your-server.com/api/petclaw/export?petId=1 \
  -H "Authorization: Bearer $PETCLAW_TOKEN" -o my_pet_SOUL.json

# Via SDK
const soul = await client.sovereignty.export(1);
```

## Importing on Another Platform

```bash
curl -X POST https://another-server.com/api/petclaw/import \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PETCLAW_TOKEN" \
  -d @my_pet_SOUL.json
```

The checksum detects a mismatch only when the expected checksum is trusted. It
is not a publisher signature and can be recomputed after changing a bundle.

## Data Sovereignty Rights

1. **Export** — Download supported portable categories within the documented 16 MiB limit
2. **Import** — A compatible server can reconstruct supported categories and report exclusions
3. **Delete** — Active-system removal; backups expire under the published retention schedule
4. **Consent** — You control who accesses your pet's data
