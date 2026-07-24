# PetClaw Ecosystem

PetClaw is not a replacement for a general OS/coding agent. It is an
owner-controlled companion identity, retained-memory and consent layer with
provenance foundations across web, SDK, CLI, extension and MCP surfaces.

## Shipped surfaces

| Surface | Current contract |
|---|---|
| TypeScript SDK | Typed errors, timeout/cancel support, chat, typed paid tasks, memory, consent, models, skills and SOUL |
| CLI | Hidden secret prompts, owner-only config, `doctor`, chat/talk, typed paid `agent`, memory-aware MCP server |
| MCP | 7 stdio tools: chat, typed paid task (task kind and 5-credit acknowledgement required before HTTP), persona, memory recall, approved text summary, SOUL export, discovery |
| Skill registry | 18 manifests; LLM handlers run generically, REST handlers resolve to their typed endpoints |
| Connector registry | 19 registered entries; live availability is deployment-controlled and must not be inferred from registry count |
| Network | Read-only public discovery; cross-pet invocation launch-disabled |

## Memory and sessions

The retained ledger is capped and owner-editable. Recall combines lexical
TF-IDF/recency/importance ranking with conditional semantic vectors and RRF when
stored embeddings exist. Session rows carry canonical `sessionId`, `platform`,
`role` and `speakerId` metadata so web, extension and MCP do not have to guess
lineage from display text.

VIGIL is a product name for these memory/feedback capabilities, not a promise
that five stages synchronously run on every turn. CHORUS remains opt-in and
learned patterns are not executable skills.

## Authentication and secret handling

Persistent actions require an owner `pck_` token. The CLI stores config with
mode `0600`, repairs older broad permissions, and reads tokens/provider keys from
hidden prompts. `pex_` extension tokens have a smaller route allowlist and
cannot export or import SOUL data.

```bash
npm install -g @myaipet/petclaw-sdk
petclaw-sdk auth
petclaw-sdk pets
petclaw-sdk use <petId>
petclaw-sdk doctor
petclaw-sdk agent "Draft a concise launch update from this brief: …" --task draft --confirm-cost 5 --json
petclaw-sdk mcp
```

Every MCP `petclaw_agent_run` call must include `taskKind` as one of `recall`,
`summarize`, `review`, or `draft`, plus `confirmCostCredits: 5`. Missing or
invalid values fail locally without a network request. The deprecated
`maxSteps` field is ignored and normalized to `1`. The required read-only tool
does not write pet memory or self-learning data, but owner-private run input,
result, trace, and billing history are stored. Kind-specific minimums, bracket
placeholders, and concrete secret signatures are checked before journal or
network access; secret-bearing task input is never stored locally.

## Data sovereignty

| Right | Route | Honest bound |
|---|---|---|
| Inspect/edit memory | `/api/petclaw/memory` | Owner can inspect, correct, delete entries or clear recall-bearing data |
| Export | `/api/petclaw/export` | Supported portable state/history plus SHA-256 checksum |
| Import | `/api/petclaw/import` | Validated reconstruction with restored/skipped report, not a byte clone |
| Delete | `/api/petclaw/delete` | 409 while a paid run is active; afterward private run content is scrubbed and only minimal owner billing receipts remain |
| Consent | `/api/petclaw/consent` | Owner-controlled sharing/training/interaction settings |

A SHA-256 checksum detects accidental mismatch when the expected hash is trusted;
it is not a publisher signature or proof of origin.

## Blockchain and network status

Production on-chain integration is disabled. At the documented launch-review
block, both deployed BSC contracts returned `paused() = false` with zero activity/supply counters. That contract flag is separate from the application
gate: `BLOCKCHAIN_ENABLED=false` keeps all product integration off. There is no
platform token or redemption path. Public pet discovery remains a preview;
PACK invocation returns `503` until cross-owner consent, funding and abuse
controls are implemented and reviewed.

## Integration

```typescript
import {
  PetClawClient,
  createPetClawAgentRunId,
} from "@myaipet/petclaw-sdk";

// Server-side Node.js only; never expose pck_ tokens in browser bundles.
const authToken = process.env.PETCLAW_TOKEN;
if (!authToken) throw new Error("PETCLAW_TOKEN is required");
const pet = new PetClawClient({
  baseUrl: "https://app.myaipet.ai",
  authToken,
});

const selectedPetId = Number(process.env.PETCLAW_PET_ID);
const { pets } = await pet.pets.list();
if (!pets.some((candidate) => candidate.id === selectedPetId)) {
  throw new Error("Select a pet owned by this token");
}

await pet.chat.send(selectedPetId, "hi");
const runId = createPetClawAgentRunId();
// Persist runId in your job record here before sending the paid request.
await pet.agent.run(selectedPetId, {
  runId,
  goal: "What did I say about the launch checklist?",
  taskKind: "recall",
  confirmCostCredits: 5,
});
await pet.memory.inspect(selectedPetId);
await pet.sovereignty.export(selectedPetId);
```

See [QUICKSTART.md](./QUICKSTART.md) and [API.md](./API.md) for exact contracts.
