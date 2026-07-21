# Writing PetClaw Skills

> **Current status:** the registry currently installs the **18 built-in skills**; custom skill authoring is on the roadmap and **not installable yet**. `install` with any non-built-in skill ID returns `Skill not found`. This guide documents the SKILL.md manifest format the built-ins use today — the same format community skills will use when publishing opens.

## What is a Skill?

A skill is a capability your pet can learn and execute. Skills are defined as `SKILL.md` files with YAML frontmatter (inspired by [ClawHub](https://github.com/openclaw/clawhub)). Browse the built-in set with `petclaw-sdk skills` or `GET /api/petclaw/skills`; fetch any built-in's manifest as SKILL.md via `GET /api/petclaw/skills?id=<skillId>&format=md`.

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
  env: [API_KEY_NAME]  # SERVER-side env vars the skill needs (never user-supplied)
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

## Secrets never go in skill config

Skill install `config` is stored as plaintext with the pet and is for non-secret
preferences only. The API rejects (`400`) any config field whose name or value
looks like a credential. Provider API keys belong in the encrypted BYOK vault:
`POST /api/petclaw/models` (or `petclaw-sdk models connect ...`).

## Format example: Daily Horoscope Skill

This is an **illustrative manifest only** — `daily-horoscope` is not a built-in
skill and cannot be installed today.

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

## Installing Skills (built-ins only today)

Install works for the 18 built-in skill IDs and needs an owner token (`pck_...`,
minted in the web app under **Sovereignty → Connect PetClaw clients**):

```bash
# Via curl — a real built-in skill
curl -X POST https://app.myaipet.ai/api/petclaw/skills \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer pck_your_token_here" \
  -d '{"action":"install","petId":1,"skillId":"daily-mood"}'

# Via SDK
import { PetClawClient } from "@myaipet/petclaw-sdk";
const client = new PetClawClient({ baseUrl: "https://app.myaipet.ai" });
await client.skills.install(1, "daily-mood");
```

## Executing Skills

```bash
# Via curl
curl -X POST https://app.myaipet.ai/api/petclaw/skills \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer pck_your_token_here" \
  -d '{"action":"execute","petId":1,"skillId":"daily-mood","input":{}}'

# Via SDK
const result = await client.skills.execute(1, "daily-mood", {});
console.log(result.output);
```

## Publishing Skills

Not available yet. The registry currently installs the 18 built-in skills;
community skill publishing (custom SKILL.md upload via the PetHub registry) is
on the roadmap and there is no working install path for custom skills today.
