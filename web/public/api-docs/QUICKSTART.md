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

> **What needs auth, what doesn't.** The read-only and demo commands below work
> with **no auth** — `status`, `skills` (list), `chat`/`talk` and `execute` against
> the **demo pet** (`petId 1`). Anything that mutates *your own* pet —
> `install`, `execute` on your pet, `export`, `models connect` — needs an owner
> token. Mint one in the web app (logged in): **Sovereignty → Connect PetClaw
> clients** issues a scoped access token starting with `pck_` (shown once,
> revocable any time), then run `petclaw-sdk auth pck_...` once. Do this
> **before** the install/execute steps below so you don't hit a `401`.

## 4. Authenticate (for your own pet)

```bash
petclaw-sdk auth pck_your_token_here
```

Saves the owner token to `~/.petclaw.json`. Skip this only if you're just
chatting with the demo pet. Mint the token in the web app while logged in:
**Sovereignty → Connect PetClaw clients** → create a CLI token (`pck_` prefix).
It is long-lived (1 year), scoped to your account, and you can revoke it from
the same screen. Never paste your browser session into the CLI.

## 5. Chat

```bash
petclaw-sdk chat "Hey, how are you?"   # single message
petclaw-sdk talk                        # interactive
```

```
  🐾 Hey! I'm doing great, thanks for asking! What's up?
     1234ms · grok-4
```

## 6. Bring Your Own Model (BYOK)

Connect your own model so calls run on your key (encrypted at rest):

```bash
# (requires auth — see step 4)
petclaw-sdk models connect openai sk-...
petclaw-sdk models list
```

Owner-authenticated; keys are encrypted server-side. See `POST /api/petclaw/models`.

## 7. Explore Skills

```bash
petclaw-sdk skills               # list all 18 — no auth needed
petclaw-sdk install daily-mood   # install one — needs auth (step 4)
petclaw-sdk execute daily-mood   # run it      — needs auth on your pet
```

## 8. Export Your Pet (Data Sovereignty)

```bash
petclaw-sdk export
```

Downloads your pet's complete SOUL data — personality, memories, skills — as portable JSON, with an integrity hash. Re-importable on any PetClaw server.

## 9. Discover Other Public Pets (PACK)

```bash
petclaw-sdk discover
```

Find public, interaction-enabled pets by element or advertised skill. Remote
skill invocation is disabled until a dedicated consent and caller-funded
execution protocol is available.

## 10. MCP Server

```bash
petclaw-sdk mcp
```

Defines a Model Context Protocol server (6 tools) for Claude Desktop, Cursor, or
any MCP stdio client. **Known issue:** the MCP path in SDK 1.6.1 is broken; the
fix ships in SDK 1.6.2. Until then, use the REST API or the CLI commands above.

## 11. Run the Agent Loop

The agent loop is **an HTTP endpoint, not a CLI command** — there is no
`petclaw-sdk agent`. Give your pet a goal (owner-authed) and it plans each step,
runs a real skill, observes, iterates, then reports:

```bash
curl -X POST https://app.myaipet.ai/api/pets/1/agent \
  -H "Authorization: Bearer pck_your_token_here" \
  -H "Content-Type: application/json" \
  -d '{"goal":"Check my mood from recent chats and suggest one thing for today","maxSteps":4}'
```

Returns `{ answer, steps: [{ thought, skill, output, ok }], stoppedReason }`. Try it in the app at **/?section=workbench**.

## 12. Use in Code

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
