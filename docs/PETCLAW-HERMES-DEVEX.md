# PetClaw × Hermes developer boundary

Status: published integration baseline, 2026-07-23
Comparison baseline: Hermes Agent `v0.18.2` (`v2026.7.7.2`); PetClaw SDK `1.6.3`

## Product decision

PetClaw is not a second shell agent. Hermes, Codex, Claude and Cursor remain the
execution runtimes. PetClaw is the owner-controlled companion identity, retained
memory and consent layer that those runtimes may call through a narrow MCP/SDK
contract.

This boundary is deliberate:

- execution runtimes own terminal, files, browser, delegation, scheduling and
  human approval;
- PetClaw owns which companion is selected, which context is retained, who may
  read it, session/surface lineage, export and deletion;
- PetClaw does not expose shell or filesystem tools and must not silently turn a
  private memory into an outbound connector query;
- provenance foundations exist (surface, session, speaker and model metadata),
  but a complete signed, per-run provenance control plane is not yet shipped.

Hermes references used for this decision:

- [Release v0.18.2](https://github.com/NousResearch/hermes-agent/releases/tag/v2026.7.7.2)
- [Tools](https://github.com/NousResearch/hermes-agent/blob/v2026.7.7.2/website/docs/user-guide/features/tools.md)
- [Memory](https://github.com/NousResearch/hermes-agent/blob/v2026.7.7.2/website/docs/user-guide/features/memory.md)
- [Sessions](https://github.com/NousResearch/hermes-agent/blob/v2026.7.7.2/website/docs/user-guide/sessions.md)
- [Delegation](https://github.com/NousResearch/hermes-agent/blob/v2026.7.7.2/website/docs/user-guide/features/delegation.md)
- [MCP](https://github.com/NousResearch/hermes-agent/blob/v2026.7.7.2/website/docs/user-guide/features/mcp.md)
- [Security](https://github.com/NousResearch/hermes-agent/blob/v2026.7.7.2/website/docs/user-guide/security.md)

## Journey comparison

| Journey | Hermes | PetClaw responsibility | Release gate |
|---|---|---|---|
| Install | Full agent runtime | One npm SDK/CLI/MCP package | npm must report `1.6.3+` |
| Authenticate | Provider/API credentials | Hidden owner-token prompt; origin-bound `0600` config | no secret in argv, YAML or SOUL |
| Select identity | Agent config | Explicit owned pet selection | never default to an unverified pet |
| Chat | Runtime conversation | Pet voice + selected retained context | expose provider degradation and lineage |
| Run goals | Broad tool execution | Bounded, paid pet-skill loop only | expose actual stop reason; no fake resume |
| Memory | Curated local files | Owner-scoped structured memory across opted-in surfaces | correction/delete wins over in-flight learning |
| Tools | Shell/files/browser/connectors | Seven narrow MCP tools | sensitive/paid tools opt in separately |
| Security | Safe roots, sandbox, approvals | Consent, owner auth, no outbound private-memory egress | fail closed on scope/origin mismatch |
| Debug | Session/dashboard traces | Typed errors, stop reason, inference metadata | run ID/status/cancel remains P1 |

## Provider-context contract

Owner storage and model-provider context are intentionally different views.
Inspect/export may return the owner-controlled record, while an inference turn
receives only a fail-closed subset:

- at most six retained facts with direct token/bigram overlap; importance and
  recency only break ties between matches;
- at most four non-identity profile entries with the same direct relevance and
  secret/language checks;
- at most six raw recent turns, and only when both the surface and session ID
  exactly match the current request;
- no raw recent turns when a caller omits its session ID, and no retained text
  that resembles a credential or violates the English-only provider boundary.

These are minimization rules, not claims of perfect recall. The owner can still
inspect, correct, export, or delete retained records through the sovereignty
surface.

## Recommended Hermes profile

Install and authenticate PetClaw first, then expose only the read/chat subset to
Hermes. The PetClaw MCP reads `~/.petclaw.json`; never duplicate its token in the
Hermes configuration.

```yaml
mcp_servers:
  petclaw:
    command: "petclaw-mcp"
    timeout: 90
    tools:
      include:
        - petclaw_chat
        - petclaw_memory_recall
```

`petclaw_agent_run` spends credits and starts a new bounded run. Add it only for
an intentional paid workflow; every MCP call must include
`confirmCostCredits: 5`, and any missing/different value fails before HTTP.
`petclaw_soul_export` returns portable private
data; add it only when the caller is allowed to receive that data.
`petclaw_persona_mirror` is not part of the automatic runtime core: install the
`persona-mirror` skill first, then add that tool deliberately if needed.

## Acceptance order

### P0 — required before publish or deployment

- clean-clone package build, typecheck, tests and `npm pack --dry-run`;
- successful hidden auth → owned pet selection → persistent chat → memory recall
  → correction/delete journey;
- session/surface provenance from web, SDK, CLI and MCP;
- owner deletion/correction fences all in-flight retain, consolidation, bond and
  self-learning writes;
- no external connector in a run that can read private memory until an explicit
  approval/data-taint policy exists;
- truthful UI/API copy: no invented online nodes, trust score, signed export,
  on-chain state, full portability, or always-on memory claim;
- expand-only database migration in the release path; measured data backfills
  and concurrent index work run separately;
- public documentation names SDK `1.6.3` only after npm serves that exact
  version as the latest release.

### P1 — developer-grade operations

- device/browser auth, scoped expiring tokens, revoke/rotate and OS keychain;
- durable `runId`, idempotency key, status, cancel, step artifacts and SSE replay;
- per-memory provenance including policy version and originating model/tool;
- `doctor --mcp` and opt-in live inference smoke;
- consent policy decision + audit receipt on every cross-agent read/share;
- automated exact recall, paraphrase, correction, deletion, speaker-isolation and
  surface-handoff evaluation against a real database fixture.

### P2 — ecosystem scale

- signed skill/package publisher identity, permission manifest and review state;
- per-run budgets and OpenTelemetry model/tool/latency/cost traces;
- owner-approved cross-pet calls with caller-funded metering and abuse controls;
- signed SOUL export format with key rotation and revocation, if authenticity is
  required beyond the current SHA-256 integrity checksum.

## Non-goals until their safety prerequisites exist

- duplicating Hermes shell, filesystem, browser, cron or subagent features;
- claiming a stopped result is a resumable checkpoint;
- enabling PACK/A2A, blockchain, referrals or agent channels behind disabled
  production kill-switches;
- calling level/bond activity a security trust score;
- treating a checksum as a signature.
