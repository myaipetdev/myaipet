# MY AI PET — Production Deployment

> Updated: 2026-07-18

## Live topology

Production is one AWS EC2 host reached with the production PEM. It is not
deployed from GitHub and it does not currently use RDS, EFS, or S3.

| Surface | Current production path |
|---|---|
| `myaipet.ai` | nginx serves `landing-assets/` from the immutable current release |
| `app.myaipet.ai` | nginx proxies to a loopback-only Next.js standalone process managed by PM2 |
| PostgreSQL 16 | local `petclaw` database, bound to `127.0.0.1:5432` |
| Uploaded media | local `/opt/petclaw/uploads`, exposed only through the authenticated media boundary |
| Release source | signed artifact verified below root-owned `/opt/petclaw/verified` |
| Active release | root-owned immutable directory below `/opt/petclaw/releases`, selected by `/opt/petclaw/current` |

The legacy checkout at `/opt/petclaw/aipet-project` supplies the production
environment file during the first immutable release. It is not a Git deployment
target and must not be reset or pulled during a release.

## Authoritative release procedure

The exact commands, ownership requirements, environment gates, backup evidence,
and verification sequence are in [`deploy/ENV-CHECKLIST.md`](../deploy/ENV-CHECKLIST.md).
The required order is:

1. Finish tests locally and create one local release commit. Do not push it as a
   deployment mechanism.
2. Run `deploy/build-release-artifact.sh` against that exact commit. The builder
   creates a deterministic archive, scans it for secrets, checks migrations, and
   signs its canonical manifest with the pinned release-signing subkey.
3. Produce a recent encrypted off-host production backup. The database restore,
   media references, snapshot quiescence, hashes, and signed release receipt must
   all verify before deployment.
4. Upload the archive, manifest, detached signature, checksum, and signed backup
   evidence to `/opt/petclaw/incoming` over SSH/SCP with the production PEM.
   `incoming` is an untrusted upload spool only.
5. Run the root-installed `petclaw-verify-release-artifact.sh`. It verifies the
   pinned signature and archive hash, rejects unsafe members, scans secrets and
   migrations, then seals the source under root-owned `/opt/petclaw/verified`.
6. Run the root-installed `petclaw-ec2-release.sh` as `ubuntu`, pointing it at the
   verified source and signed backup evidence. The controller builds on an unused
   loopback port, seals and compares migration inputs, applies migrations, starts
   the candidate, runs smoke tests, and atomically switches nginx and `current`.
7. Reboot the EC2 host and verify the boot guard, PM2 state, nginx, PostgreSQL,
   loopback bindings, cron jobs, release header, and public HTTPS routes.

The controller keeps the current release serving until the candidate passes. A
root-owned boot guard and independent rollback watchdog restore the previous
nginx/current generation if the deploy shell dies or the host reboots inside the
switch window.

## Prohibited production shortcuts

Do not use any of these as the live release path:

- `git pull`, `git reset --hard`, or a GitHub push on the EC2 host;
- `deploy/ec2-pull.sh` (legacy only);
- copying `landing-assets/` directly into a mutable nginx directory;
- executing an uploaded controller or verifier from `/tmp` or `incoming`;
- running Prisma migrations from an unverified or ubuntu-writable source tree;
- deploying without the recent signed backup receipt.

ECS/Fargate, RDS, S3, and the old Neon migration helpers remain historical or
future infrastructure options. They do not describe the live host.

## Launch gates

The release controller requires these launch-time features to be explicitly and
exactly disabled:

```text
PAYMENTS_ENABLED=false
OAUTH_CONNECTIONS_ENABLED=false
AGENT_CHANNELS_ENABLED=false
PET_LORA_ENABLED=false
BLOCKCHAIN_ENABLED=false
REFERRALS_ENABLED=false
```

It also requires the production upload, storage-reserve, vision, and payment
confirmation caps documented in `deploy/ENV-CHECKLIST.md`. A treasury address,
relayer key, provider credential, or contract address must never enable a feature
by itself. Only an exact `true` gate can do that, after its separate enablement
checklist has passed.

## Backup and storage

The current launch uses local PostgreSQL and local uploads, so the database dump
and `/opt/petclaw/uploads` archive are one consistency unit. The off-host backup
workflow pauses PetClaw PM2 processes briefly, captures both, resumes service,
restores the dump into an isolated temporary database, verifies every first-party
media reference, encrypts both payloads, and signs the release receipt on the
operator workstation.

`/opt/petclaw`, `/opt/petclaw/verified`, and `/opt/petclaw/releases` are root-owned.
Uploads and the dedicated backup staging child remain writable only where the
runtime workflow requires it. Release and backup coordination uses root-created
non-truncating locks below `/run/petclaw-release`.

## Smart contracts and payments

There is no project token. Season points are non-financial engagement points.
External payments and all chain writes are paused at launch. Existing utility
contracts and off-chain milestone records must not be presented as active minting
or verified on-chain assets unless a confirmed transaction exists.

Before enabling payments or blockchain writes, complete the separate RPC,
treasury, confirmation-depth, relayer-gas, idempotency, reconciliation, support,
and rollback checks in `deploy/ENV-CHECKLIST.md`. Never commit environment files,
wallet keys, API keys, or backup private keys.

## Post-deploy checks

At minimum verify:

- `https://myaipet.ai`, `https://app.myaipet.ai`, and `/api/health` return 200;
- the response release header matches the signed release ID;
- Next.js and PostgreSQL listen only on loopback, while only nginx exposes 80/443;
- PM2 and PostgreSQL are enabled and healthy after an actual reboot;
- the full cron set is installed, including media deletion and stale credit refund;
- landing/app static HTML contains no Hangul product copy;
- protected routes reject unauthenticated requests and all disabled launch gates
  fail closed;
- the next scheduled off-host backup completes under the new release layout.

If a smoke check fails, preserve the signed artifact and logs, confirm the rollback
guard restored the prior generation, and diagnose before attempting another
release. Do not modify the immutable current release in place.
