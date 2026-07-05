# Card payments + Email/Social login — setup & build plan

Status: **branch `feat/card-email-paddle-auth`, NOT deployed.** This is the P0
"a non-crypto human can create a pet AND pay" foundation. Nothing here runs until
the credentials below are provided — that's deliberate (no fake "coming soon"
buttons for things that don't work).

Decisions (founder, this session): **Paddle / Lemon Squeezy** (merchant-of-record,
handles tax/VAT/refunds) for cards; **email magic-link + Google/Apple** for login,
alongside the existing SIWE wallet auth.

---

## What YOU need to provide (credentials)

Drop these into the server env (`.env.production` on the box, never in chat/git):

### Payments — Paddle Billing (recommended MoR)
- `PADDLE_API_KEY` — server API key (Paddle dashboard → Developer tools → Authentication)
- `PADDLE_WEBHOOK_SECRET` — signing secret for the webhook (Developer tools → Notifications)
- `PADDLE_ENV` — `sandbox` or `production`
- `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` — client-side token for Paddle.js
- Price IDs (create in Paddle catalog, then map here):
  - `PADDLE_PRICE_CREDITS_STARTER` (100 cr / $5)
  - `PADDLE_PRICE_CREDITS_CREATOR` (500 cr / $20)
  - `PADDLE_PRICE_CREDITS_PRO` (2000 cr / $50)
  - `PADDLE_PRICE_STUDIO_PASS` (Studio Creator Pass, if/when sold)
- Webhook URL to register in Paddle → `https://app.myaipet.ai/api/webhooks/paddle`

> Lemon Squeezy is an equivalent MoR; the adapter is written against Paddle but the
> shape (checkout link + signed webhook → grant) is identical. Say the word and I
> swap `lib/payments/paddle.ts` for a `lemonsqueezy.ts` twin.

### Auth — email + social
- Email magic-link sender (pick one): `RESEND_API_KEY` **or** `POSTMARK_TOKEN` (+ `AUTH_EMAIL_FROM`)
- Google OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (Google Cloud → Credentials → OAuth client; redirect `https://app.myaipet.ai/api/auth/oauth/google/callback`)
- Apple OAuth: `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (Apple Developer → Sign in with Apple)
- `AUTH_URL=https://app.myaipet.ai`

---

## DB migration required (prod RDS — run once, reviewed)

The `User` model today has ONLY `wallet_address` as identity. Email/social users
won't have a wallet, so:

```prisma
model User {
  // wallet_address becomes optional (email/social users may have no wallet yet)
  wallet_address  String?  @unique @db.VarChar(42)
  email           String?  @unique
  email_verified  DateTime?
  auth_provider   String?  @db.VarChar(20)  // "wallet" | "email" | "google" | "apple"
  // ...existing fields unchanged
}
```
Plus an `OAuthAccount` table (provider, provider_account_id, user_id) for social links,
and a `MagicLinkToken` table (hashed token, email, expires_at) for email login.

⚠️ Making `wallet_address` nullable + adding a unique `email` is additive and safe,
but must be applied deliberately to prod (`prisma migrate deploy`), and every
`getUser`/wallet-assuming call site audited (several `where: { wallet_address }`
lookups assume it's always present).

---

## Architecture (extends existing auth, does NOT replace it)

The app uses a **custom JWT session** (`src/lib/auth.ts`, jose HS256, session-id
bound). We EXTEND it — not bolt on NextAuth (which would fight the existing cookie/
session). Email/social login issues the **same** JWT for a `User` row, so every
existing authenticated route (`getUser`) works unchanged.

New routes (all env-gated — 404/disabled until keys present):
- `POST /api/auth/email/request` → email a signed magic link
- `GET  /api/auth/email/verify`  → consume token, upsert User by email, issue JWT
- `GET  /api/auth/oauth/[provider]` + `/callback` → Google/Apple, upsert User, issue JWT
- `POST /api/checkout/paddle` → create a Paddle checkout for a plan (see lib/payments/paddle.ts)
- `POST /api/webhooks/paddle` → verify signature, map price→plan, grant credits/subscription

Grant path mirrors the existing USDT grant (`app/api/credits/purchase/route.ts`):
atomic, idempotent on the payment id (like the tx_hash ledger).

---

## Build status on this branch
- [x] `lib/payments/paddle.ts` — signature verify + plan mapping + grant helper (env-gated)
- [x] `app/api/checkout/paddle/route.ts` — create-checkout stub (returns disabled until keys)
- [x] `app/api/webhooks/paddle/route.ts` — signed webhook → idempotent grant
- [ ] Prisma migration (above) — NOT applied; needs review before prod
- [ ] Auth email/social routes — spec'd above; build once email/OAuth keys land so each is tested live
- [ ] Wire PremiumTeaser / credit-pack UI to `POST /api/checkout/paddle`

**Next:** provide the Paddle keys (sandbox is fine to start) → I finish + test the
card flow end-to-end in sandbox → then the email/social routes with their keys →
then deploy. No card/auth code ships to prod untested.
