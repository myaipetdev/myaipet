# PetClaw Quickstart

Get your AI companion running in 5 minutes. The SDK is published on npm as **`@myaipet/petclaw-sdk`**.

## 1. Install

```bash
npm install -g @myaipet/petclaw-sdk
# or run ad-hoc:  npx @myaipet/petclaw-sdk <command>
```

The global install gives you the `petclaw-sdk` command.

## 2. Connect

```bash
petclaw-sdk init
```

Enter your server URL (default `https://app.myaipet.ai`) and your pet ID — saved to `~/.petclaw.json`.

## 3. Check Status

```bash
petclaw-sdk status
```

```
  ✓ Server Online
    Protocol:   petclaw-v1
    Skills:     18
    Pets:       1
    Ownership:  user
```

## 4. Chat

```bash
petclaw-sdk chat "Hey, how are you?"   # single message
petclaw-sdk talk                        # interactive
```

```
  🐾 Hey! I'm doing great, thanks for asking! What's up?
     1234ms · grok-3-mini
```

## 5. Bring Your Own Model (BYOK)

Connect your own model so calls run on your key (encrypted at rest):

```bash
petclaw-sdk auth <your-jwt>
petclaw-sdk models connect openai sk-...
petclaw-sdk models list
```

Owner-authenticated; keys are encrypted server-side. See `POST /api/petclaw/models`.

## 6. Explore Skills

```bash
petclaw-sdk skills               # list all 18
petclaw-sdk install daily-mood   # install one
petclaw-sdk execute daily-mood   # run it
```

## 7. Export Your Pet (Data Sovereignty)

```bash
petclaw-sdk export
```

Downloads your pet's complete SOUL data — personality, memories, skills — as portable JSON, with an integrity hash. Re-importable on any PetClaw server.

## 8. Discover & Invoke Other Pets (A2A / PACK)

```bash
petclaw-sdk discover
```

Find other pets on the network by element/skill and invoke their skills.

## 9. MCP Server

```bash
petclaw-sdk mcp
```

Starts a Model Context Protocol server (6 tools) for Claude Desktop, Cursor, or any MCP stdio client.

## 10. Run the Agent Loop

Give your pet a goal — it plans each step, runs a real skill, observes, iterates, then reports:

```bash
curl -X POST https://app.myaipet.ai/api/pets/1/agent \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"goal":"Check my mood from recent chats and suggest one thing for today","maxSteps":4}'
```

Returns `{ answer, steps: [{ thought, skill, output, ok }], stoppedReason }`. Try it in the app at **/?section=workbench**.

## 11. Use in Code

```typescript
import { PetClawClient } from "@myaipet/petclaw-sdk";

const client = new PetClawClient({ baseUrl: "https://app.myaipet.ai" });

const result = await client.skills.execute(1, "companion-chat", { message: "Hello!" });
const soul   = await client.sovereignty.export(1);
const { nodes } = await client.network.discover();
```

## Next Steps

- [API Reference](API.md)
- [Ecosystem](ECOSYSTEM.md)
- [Write Custom Skills](SKILL-AUTHORING.md)
- [GitHub](https://github.com/myaipetdev/petclaw)
