# Writing PetClaw Skills

This guide explains how to create custom skills for PetClaw companion AI pets.

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
Uses LLM (Grok/GPT) to generate response. Provide a `systemPrompt`:

```yaml
handler: llm-prompt
systemPrompt: "You are {petName}, a {personality} pet. Answer the user's question helpfully."
```

Template variables:
- `{petName}` — Pet's name
- `{personality}` — Pet's personality type

### `api-call`
Calls an API endpoint:

```yaml
handler: api-call
apiUrl: /api/pets/{petId}/memories
```

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
  env: [GROK_API_KEY]
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

## Installing Skills

```bash
# Via curl
curl -X POST https://server.com/api/petclaw/skills \
  -H "Content-Type: application/json" \
  -d '{"action":"install","petId":1,"skillId":"daily-horoscope"}'

# Via SDK
import { PetClawClient } from "@petclaw/sdk";
const client = new PetClawClient({ baseUrl: "https://server.com" });
await client.skills.install(1, "daily-horoscope");
```

## Executing Skills

```bash
# Via curl
curl -X POST https://server.com/api/petclaw/skills \
  -H "Content-Type: application/json" \
  -d '{"action":"execute","petId":1,"skillId":"daily-horoscope","input":{}}'

# Via SDK
const result = await client.skills.execute(1, "daily-horoscope", {});
console.log(result.output);
```

## Publishing Skills

Currently, skills are built-in. Community skill publishing will be available in PetClaw v2 via PetHub registry.
