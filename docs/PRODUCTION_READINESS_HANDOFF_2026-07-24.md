# MY AI PET production readiness handoff — 2026-07-24

> **ACTIVE HANDOFF — LIVE RELEASE COMPLETE; AUTH UAT + P1 HARDENING OPEN**
>
> Read this document before changing code, publishing npm, building a release
> artifact, or touching production. The immutable live release below is the
> source of truth. Do not confuse a successful deployment with final launch
> approval while the explicit open items in sections 5 and 10 remain.

## 1. Exact current state

| Item | Verified value |
|---|---|
| Live commit | `0970c34cf9ff2568a4e0440745ad19df7b12884a` |
| Live release header | `20260724T231337-0970c34cf9ff` |
| Public EIP | `15.165.207.119` |
| Live services | app, nginx, PostgreSQL, PM2, boot guard healthy at last read-only audit |
| API limit | nginx zone `abuse`, `2r/s`, burst `15`, status `429` |
| Cron | 13 jobs |
| Launch switches | payments, OAuth connections, agent channels, Pet LoRA, blockchain, referrals: all `false` |
| `origin/main` | `e690d336062f9c94c0df6a76ae143d7f72ab5195` |
| Audited seven-fix branch | `fix/live-existence-audit-20260724` at `e503c0928fd6cdc30330126c2de572da8338b819` |
| Released application point | `codex/e503-p0-release-20260724` tree at `0970c34cf9ff2568a4e0440745ad19df7b12884a`; later documentation-only commits are not live |

The released branch contains both the current `origin/main` history and the
live-line changes. It was built from a clean off-worktree export; the original
dirty workspace was not used or modified. Do not start over from `origin/main`,
deploy `e503c092` alone, or hand-copy files onto the host. Any follow-up fix
requires a new exact commit and signed artifact.

## 2. What this candidate changes

### Existing seven-fix audit

1. Chat Bond stays in the real 0–100 range.
2. Thumbnail Studio says “use example” when it inserts a fixed example.
3. Demo consent controls cannot look persisted.
4. Agent Office labels respect the 13px readability floor.
5. Agent Office charge/refund copy follows the server settlement rule.
6. API Docs table-of-contents labels respect the 13px floor.
7. Favorites Bracket is described as a personal pick, not a global vote.

### Landing, Season, Studio, and creator guidance

- Season event cards use a consistent grid and aligned action area.
- Thumbnail output and Shorts guidance are visually and textually clarified.
- Studio maintains one primary generation action and truthful engine/cost
  disclosure.
- Public SDK/MCP copy is aligned to the 2.0.0 typed-task contract.

### Agent Office: real bounded work, not a simulated office

The Office exposes exactly four owner-selected, read-only task types:

| Task | Required server tool | Contract-valid result |
|---|---|---|
| Recall | `recall_memory` | grounded answer from matching owner-private retained facts |
| Summarize | `office-summarize` | summary, key facts, risk/unknown, next step |
| Review | `office-review` | primary issue, why it matters, concrete revision |
| Draft | `office-draft` | bounded draft text from an owner brief |

Rules:

- New Office runs require `taskKind`; compatibility `maxSteps` values normalize
  to exactly one server-bound read-only tool.
- Input is limited to 2,000 characters with task-specific minimums. The
  composer deliberately accepts an oversized paste long enough to show an
  explicit validation error; no reservation or request can start until it is
  reduced to the limit.
- Concrete credential signatures are rejected before a provider request,
  reservation, browser recovery journal, or SDK/MCP network call.
- Pasted HTML, JSX, XML, and code remain data. The tool must not obey
  instructions embedded inside that source.
- A run reserves 5 credits. It is charged only if the exact selected tool
  succeeds and its typed deliverable validates. No result, refusal, invalid
  output, or incomplete execution is refunded.
- The authenticated reservation event updates the shared navigation balance at
  debit time; a validated terminal receipt reconciles it again for charge or
  refund. Successful charged work clears the composer; refunded or failed work
  preserves the original input for editing and retry.
- Office tools cannot send, publish, mutate memory, execute arbitrary skills, or
  commit an external side effect.
- The browser, CLI, SDK, and MCP preserve one owner-bound recovery marker until
  a terminal receipt is known. They must not silently create a second paid run.
- Owner-private run input, answer, sanitized trace, and billing receipt are
  stored separately from pet memory and SOUL. Owners retrieve them through a
  separate newest-first export capped at 100 records per checksummed page, using
  an opaque owner/pet-bound cursor until complete. Importing a SOUL bundle never
  recreates a run, reservation, credit, or charge.
- Immediate and saved results expose the complete reconciliation run ID with a
  copy action. Recall receipts disclose bounded owner-only match evidence
  (record key, category, source, time, and a credential-screened excerpt);
  credential-shaped excerpts remain hidden.
- Long task inputs render as task type plus an 80-character status excerpt.
  The complete original input is available only through an explicit disclosure,
  so the lobby, queue, and mobile result hierarchy remain usable.
- The hotel lobby and NPCs are decorative. They must never imply spatial
  telemetry, autonomous staff work, or 18 executable Office skills.

The current Office is therefore a paid, auditable text-deliverable desk. It is
not yet a repository-writing coding agent, scheduler, email sender, or arbitrary
Hermes-style action runner. A future action layer requires scoped connectors,
preview/diff, explicit approval, idempotency, audit receipt, compensation or
rollback, and per-action spend limits.

### PetClaw SDK 2.0.0

- `taskKind` is mandatory for paid runs.
- Recall, Summarize, Review, and Draft share the web input and secret boundary.
- Callers supply the run ID; transport retry reuses it.
- CLI/MCP recovery uses a versioned owner-bound journal.
- The MCP server exposes seven documented tools; this is not the same as 18
  catalog manifests or four Office task tools.
- Safe developer language such as “token pricing,” “API token rotation policy,”
  and “secret management guide” is recallable. Concrete credentials remain
  filtered.

Public “SDK 2.0.0 published” copy is now valid: npm publication and an
unauthenticated registry read both verified the exact public version.

## 3. Non-negotiable release safety

1. Preserve the user’s original dirty worktree. Work only in a clean candidate.
2. No `git pull`, host checkout, host hotfix, or hand-copied landing assets.
3. Build only an exact committed tree through
   `deploy/build-release-artifact.sh`.
4. Use a fresh encrypted, signed, restore-tested off-host production backup.
5. Upload only the four release proof files and the signed backup evidence set.
6. Run the installed root-owned verifier, then controller preflight, then live.
7. Keep all six launch switches at one literal `false` assignment each.
8. Marketing must serve from `current/landing-assets`.
9. On any smoke failure, let the controller restore the retained rollback and
   report the failing check verbatim. Fixes require a new signed artifact.
10. Never place tokens, OTPs, recovery codes, PEM contents, provider keys,
    database URLs, or replacement credential values in Git, chat, or this file.

## 4. Required gates before commit

From `web/`:

```text
npm run test:agent-credits
npm run test:agent-run-safety
npm run test:agent-run-export
npm run test:agent-workbench-privacy
npm run test:office-deliverable
npm run test:agent-loop-truth
npm run test:mission-control-ledger
npm run test:agent-office-ui
npm run test:privacy-boundary
npm run test:provider-context
npm run test:deletion-p0-contract
npm run test:soul-contract
npm run test:ui-contract
npm run test:release-readiness
npm run test:community-fallback
npm run test:persona-extension-boundaries
npx tsc --noEmit
JWT_SECRET=<local non-production test value> npm run build
```

From `packages/petclaw/`:

```text
npm test
npm pack --dry-run
```

From repository root:

```text
bash deploy/check-release-migrations.sh . deploy/destructive-migrations.allowlist
bash scripts/build-petclaw-extension.sh --check
bash deploy/tests/release-safety.test.sh
git diff --check
```

The signed-artifact build must also pass the release-tree secret scan. Security
fixtures must construct credential-shaped adversarial values at runtime rather
than embedding scanner-matching strings in source; never weaken or bypass the
scanner to accommodate a test.

The release controller repeats the non-integration P0 Agent Office, privacy,
UI, release-readiness, community, and production build gates before migration or
traffic switch. These runtime gate files intentionally do not contain `.test.`
in their names, because the production artifact excludes synthetic test files.

Disposable-PostgreSQL integration tests are valuable evidence but must never be
silently aimed at production. A real signed-in four-task UAT is still required.

### Latest pre-commit evidence — 2026-07-24 22:33 KST

- Every listed non-PostgreSQL Web/Office contract gate passed, including the
  adversarial credit, owner-bound recovery, credential masking, export-v3,
  deletion, privacy, SOUL, community, and UI contracts.
- TypeScript completed with zero errors. Targeted ESLint completed with zero
  errors and 58 existing warnings; the full repository lint completed with zero
  errors and 1,185 existing warnings. These warnings remain debt, not a claim
  that the repository is warning-free.
- The latest production build generated 123 routes. Standalone verification
  passed for 3,586 files, 43,200,990 bytes, and 193 traces with no secret input
  or Hangul/Jamo bundle text.
- Release safety passed 258 assertions; destructive-migration review passed 14
  approvals; the release-shaped secret scan and `git diff --check` passed.
- SDK tests passed 70/70 and the npm pack dry run passed. Extension v2.4.1
  verification passed.
- The PostgreSQL credit integration was explicitly skipped because no safe
  disposable test database was configured. It was not pointed at production.
- `@myaipet/petclaw-sdk@2.0.0` was published and anonymously verified at
  2026-07-24 23:08 KST. The public `latest` tag is `2.0.0`; registry shasum is
  `e674d17f14c01e94087b5a2491597d9d928b6053`.
- A fresh signed off-host backup (`20260724T141009Z`) passed restore and media
  verification. Signed release `20260724T231337-0970c34cf9ff` was verified,
  preflighted, switched live, and independently checked after one real reboot.
- The authenticated four-task/credit UAT and disposable-PostgreSQL integration
  remain incomplete. They were not pointed at a real user or production data.

## 5. Authenticated UAT matrix

Use an explicitly disposable owner account with enough test credits. Capture
redacted request ID, HTTP status, displayed receipt, balance delta, and result;
never capture wallet signatures or secrets.

| Test | Required evidence |
|---|---|
| Recall hit | one matching grounded answer; exactly 5 credits charged |
| Recall miss | no fabricated answer; 0 charged/refund receipt |
| Summarize | four required result sections; exactly 5 charged |
| Review | issue, reason, revision; exactly 5 charged |
| Draft | draft text only; exactly 5 charged |
| Provider refusal/unavailable | terminal refund; no charge |
| Dropped final response | same run ID reconciles; second POST/reservation blocked |
| Refresh/new tab | owner-bound pending marker locks composer until reconciliation |
| Cross-owner browser reuse | another owner cannot inspect or settle the marker |
| Prior DONE result | owner can reopen/copy without a new reservation |
| Run-history export | all pages owner/pet scoped; max 100 records; opaque composite cursor; internal IDs and credential-shaped nested keys absent; checksums verify |
| SOUL export | no paid-run query or embedded run ledger; normal portability cannot grow with run volume |
| SOUL import | reports run history skipped; no run/reservation/credit/charge created |

## 6. npm publication order

1. Complete all code, tests, review, and candidate commit first.
2. Verify the package contents and public current version.
3. Publish `@myaipet/petclaw-sdk@2.0.0` using the authenticated local npm
   configuration and either a fresh authenticator TOTP at the final publish
   step or a narrowly scoped, short-lived package token with 2FA bypass.
4. Verify `npm view @myaipet/petclaw-sdk version` returns `2.0.0`.
5. Rotate any npm token that was previously pasted into a conversation.
6. Only then build and deploy web copy that says 2.0.0 is published.

## 7. AWS release order

Follow `deploy/ENV-CHECKLIST.md` “P0 release order” exactly:

1. Fetch and verify the exact candidate commit.
2. Produce the fresh off-host backup and signed evidence.
3. Build/sign the artifact from the exact candidate commit outside the
   worktree.
4. Upload proof files and backup evidence with the pinned SSH host identity.
5. Run the installed verifier.
6. Run controller preflight.
7. Run the live controller with live LLM smoke enabled.
8. Run every post-release smoke and one reboot recovery verification.

Required post-release checks include:

- release header and immutable landing provenance;
- home “STARTING SOON” at most twice, no launch dates;
- Season events and TODAY claim;
- nav/More behavior and no 375px page overflow;
- `/account`, Studio three zones, TRY, one Generate action;
- Community sample truth, personal Favorites bracket truth;
- Agent Office four task choices, decorative-scene disclosure, previous result
  retrieval, charge/refund copy, mobile keyboard/focus behavior;
- `/api/health`, disabled config switches, zero Hangul on landing/app home;
- 2r/s burst-15 429 behavior, 13 cron jobs, nginx/PM2/PostgreSQL/boot guard after
  reboot.

## 8. Remaining launch decisions and risks

These are not permission to overstate the current product:

- Real external developer actions remain a future, approval-gated connector
  layer. The current Office is read-only text work.
- Agent Office price/value should be monitored against free recall/summary
  surfaces. Its paid value proposition is the typed audit-grade deliverable,
  durable receipt, and deterministic refund contract.
- The SOUL bundle has a 16 MiB portable-format ceiling. Paid-run growth no
  longer contributes to it; private run history uses a separate owner-scoped,
  100-record paginated export. Other portable SOUL categories remain subject to
  the documented ceiling.
- After pet deletion, the scrubbed minimal financial receipt is account/support
  data, not pet SOUL data.
- Backup residual copies follow the published maximum 90-day schedule.
- Production credential rotation remains an operator responsibility. Record
  only “rotation verified,” never the credential value.

## 9. New-session first ten minutes

1. Read this file and `deploy/ENV-CHECKLIST.md`.
2. Read `docs/DEPLOYMENT.md` and `deploy/TEAM-HANDOFF-20260722.md`.
3. Fetch remote refs; verify live release/header read-only.
4. Locate or recreate the clean candidate from the live lineage.
5. Confirm the original shared worktree remains untouched.
6. Inspect `git status`, pending agent messages, and uncommitted review fixes.
7. Run the focused P0 contracts before changing code.
8. Do not claim npm publication or AWS deployment without external evidence.
9. Do not ask for a TOTP until the package is otherwise publish-ready.
10. Continue from the first incomplete item in sections 4–7.

## 10. Live result, residual risk, and exact next actions

- GitHub was reauthenticated as the repository organization account with
  admin/push permission. `codex/e503-p0-release-20260724` is now on `origin`,
  and its remote head matched the clean released commit.
- npm was reauthenticated as the package maintainer. The SDK prepublish suite
  passed 70/70, `2.0.0` was published with a short-lived package-scoped bypass
  token, and an authentication-free registry read verified both `latest` and
  the published shasum.
- The current publishing token was invalidated with `npm logout`, local npm
  authentication was cleared, and the public package was re-read anonymously.
  Any older token ever pasted into a conversation must also be deleted by exact
  token name in npm settings. Never record a credential value here or in Git.
- The signed AWS release completed without a host hotfix. The controller passed
  its release smoke, installed 7 app jobs plus 6 canonical ops jobs, and kept
  the previous `f119462f` process as rollback. OpenAI `gpt-4o-mini` returned a
  429 during live LLM smoke; the configured xAI `grok-4.3` fallback answered.
- Independent post-reboot checks passed: exact release header and provenance,
  app and landing 200, health OK, fail-closed config, nginx/PostgreSQL/PM2/cron/
  boot guard active and enabled, zero failed units, 13 cron jobs, all six kill
  switches false, loopback-only app/database ports, and no rollback intent.
- The external 40-request limiter test returned 16 HTTP 200 and 24 HTTP 429,
  with zero other statuses or 5xx responses, then recovered to health 200.
- Browser-rendered checks passed for zero Hangul, no Metrics link, no Jul 1 or
  Aug 1 launch date, `STARTING SOON` twice, four equal-height desktop Season
  cards with aligned action rows, More/Bracket navigation, Studio three tools,
  TRY-chip fill and focus, one sign-in generation action, engine/cost display,
  the revised Thumbnail preview, the visual Shorts story map, honest Community
  empty state, Favorites gate, Account gate, and the four-task Office copy.
- The browser's advertised 375px viewport override remained at 1280px, so an
  independent real 375px runtime pass is still required on a phone or working
  device-emulation session. Do not call source/CSS inspection a substitute.
- Authenticated UAT remains blocked on a disposable SIWE owner with a pet,
  harmless recall memory, at least 30 approved test credits, an unclaimed TODAY
  state, and preferably a second owner for isolation. Run every item in section
  5; do not spend a real user's credits to close this evidence gap.
- P1 host hardening remains: `/home/ubuntu/db-backups` is mode 775, three dump
  files are mode 664, and the backup script lacks `umask 077`. Fix this through
  reviewed versioned ops code, not an ad-hoc host edit.
- P1 drift remains: the live `ratelimit-guard.sh` differs byte-for-byte from the
  hardened repository mirror. The effective live limiter is nevertheless
  correct (`abuse`, 2r/s, burst 15, 429). Reconcile the guard through a new
  signed/versioned ops release.
- During disk preparation, 13 stale incoming/verified deployment copies were
  removed. They were reconstructible artifacts; the live release, retained
  rollback, database, uploads, backups, and signed evidence were preserved.
