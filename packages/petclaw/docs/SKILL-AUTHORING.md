# Writing PetClaw Skills

This guide documents the manifest format used by built-in PetClaw skills.
Community publishing is not enabled in this release, so a local `SKILL.md` is
documentation until a server operator registers and reviews its handler.

## What is a Skill?

A skill is a capability your pet can learn and execute. Skills are defined as `SKILL.md` files with YAML frontmatter (inspired by [ClawHub](https://github.com/openclaw/clawhub)).

## SKILL.md Format

```yaml
---
id: your-skill-id
name: Your Skill Name
version: 1.0.0
author: 0xYourWalletAddress
protocol: petclaw-v1
category: emotional    # social | creative | utility | knowledge | emotional
tags: [tag1, tag2]
price: 0               # 0 = free, >0 = credits per use
currency: credits
requires:
  env: [API_KEY_NAME]  # environment variables needed
  bins: [curl]         # system binaries needed (optional)
  minLevel: 5          # minimum pet level to install
---

# Your Skill Name

Description of what your skill does.

## Input Schema

```json
{
  "type": "object",
  "properties": {
    "message": { "type": "string" }
  },
  "required": ["message"]
}
```

## Output Schema

```json
{
  "type": "object",
  "properties": {
    "result": { "type": "string" }
  }
}
```
```

## Skill Categories

| Category | Use for |
|----------|---------|
| `emotional` | Mood, feelings, companionship, journaling |
| `social` | Social media, persona mirroring, communication |
| `creative` | Image generation, content creation, art |
| `knowledge` | Memory recall, research, information retrieval |
| `utility` | Data export, backup, system tools |

## Handler Types

### `llm-prompt`
Uses the server-managed model route (or an owner's scoped BYOK connection).
Provide a `systemPrompt`:

```yaml
handler: llm-prompt
systemPrompt: "You are {petName}, a {personality} pet. Answer the user's question helpfully."
```

Template variables:
- `{petName}` — Pet's name
- `{personality}` — Pet's personality type

### `api-call`
Resolves to an API endpoint:

```yaml
handler: api-call
apiUrl: /api/pets/{petId}/memories
```

The generic skill executor returns an `invoke_via_endpoint` descriptor for this
handler type; it does not claim the endpoint already ran. Integrators call the
typed endpoint with owner authentication and its own validation/cost contract.

## Example: Daily Horoscope Skill

```yaml
---
id: daily-horoscope
name: Daily Horoscope
version: 1.0.0
author: petclaw
protocol: petclaw-v1
category: creative
tags: [horoscope, fun, daily]
price: 2
currency: credits
requires:
  minLevel: 3
handler: llm-prompt
systemPrompt: "You are {petName}, a mystical {personality} pet fortune teller. Give a fun, personality-appropriate daily horoscope in 2 sentences."
---

# Daily Horoscope

Your pet reads the stars and tells your fortune for today.

## Input
{ "type": "object", "properties": {} }

## Output
{ "type": "object", "properties": { "horoscope": { "type": "string" }, "luckyNumber": { "type": "number" } } }
```

The manifest above is a local draft only. The commands below deliberately use
the registered, level-1-compatible `persona-mirror` built-in instead.

## Installing Skills (registered built-ins only)

```bash
# Via curl — choose an id returned by `petclaw-sdk pets` first.
PETCLAW_PET_ID="<owned pet id>"
curl -X POST https://server.com/api/petclaw/skills \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PETCLAW_TOKEN" \
  -d "{\"action\":\"install\",\"petId\":${PETCLAW_PET_ID},\"skillId\":\"persona-mirror\"}"

# Via SDK (server-side Node.js only; never expose the pck_ token in a browser)
import { PetClawClient } from "@myaipet/petclaw-sdk";
const authToken = process.env.PETCLAW_TOKEN;
if (!authToken) throw new Error("PETCLAW_TOKEN is required");
const client = new PetClawClient({
  baseUrl: "https://server.com",
  authToken,
});
const petId = Number(process.env.PETCLAW_PET_ID);
const { pets } = await client.pets.list();
if (!pets.some((pet) => pet.id === petId)) throw new Error("Select an owned pet");
await client.skills.install(petId, "persona-mirror");
```

`companion-chat` and `summarize-page` are core runtime skills, so they execute
without installation. Installing or uninstalling one changes only its saved
preferences/version record; it does not toggle the core capability.

## Executing Skills

```bash
# Via curl
curl -X POST https://server.com/api/petclaw/skills \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PETCLAW_TOKEN" \
  -d "{\"action\":\"execute\",\"petId\":${PETCLAW_PET_ID},\"skillId\":\"companion-chat\",\"input\":{\"message\":\"hello\"}}"

# Via SDK
const result = await client.skills.execute(petId, "companion-chat", { message: "hello" });
console.log(result.output);
```

## Publishing Skills

Currently, skills are built-in. No date is promised for community publishing.
