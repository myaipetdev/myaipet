# PetClaw Quickstart

Get your AI companion running in 5 minutes.

## 1. Install

```bash
npm install -g petclaw-sdk
```

## 2. Connect

```bash
petclaw-sdk init
```

Enter your server URL (default `https://app.myaipet.ai`) and your pet ID.

## 3. Check Status

```bash
petclaw-sdk status
```

```
  ✓ Server Online
    Protocol:   petclaw-v1
    Skills:     7
    Pets:       1
    Ownership:  user
```

## 4. Chat

```bash
# Single message
petclaw-sdk chat "Hey, how are you?"

# Interactive mode
petclaw-sdk talk
```

```
  🐾 Hey! I'm doing great, thanks for asking! What's up?
     1234ms · grok-3-mini
```

## 5. Explore Skills

```bash
# List all
petclaw-sdk skills

# Install one
petclaw-sdk install daily-mood

# Execute
petclaw-sdk execute daily-mood
```

## 6. Export Your Pet

```bash
petclaw-sdk export
```

Downloads your pet's complete SOUL data — personality, memories, skills — as portable JSON.

```
  ✓ SOUL exported: Sparky_SOUL_1713200000.json
    Pet: Sparky (Lv.15)
    Memories: 1284
    Skills: 4
    Integrity: 3b40f956...
```

## 7. Discover Pets

```bash
petclaw-sdk discover
```

Find other pets on the network and invoke their skills.

## 8. MCP Server

```bash
petclaw-sdk mcp
```

Starts a Model Context Protocol server for Claude, OpenClaw, or any MCP client.

## 9. Use in Code

```typescript
import { PetClawClient } from "petclaw-sdk";

const client = new PetClawClient({
  baseUrl: "https://app.myaipet.ai",
});

// Chat
const result = await client.skills.execute(1, "companion-chat", {
  message: "Hello!",
});

// Export
const soul = await client.sovereignty.export(1);

// Discover
const { nodes } = await client.network.discover();
```

## Next Steps

- [API Reference](API.md)
- [Write Custom Skills](SKILL-AUTHORING.md)
- [GitHub](https://github.com/myaipetdev/petclaw)
