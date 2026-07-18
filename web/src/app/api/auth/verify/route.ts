import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import {
  createSessionNonce,
  getTrustedSiweConfig,
  hashSiweMessage,
  normalizeSiweSignature,
  parseAndValidateSiweMessage,
} from "@/lib/siweLogin";

const MAX_MESSAGE_BYTES = 8 * 1024;

class InvalidLoginChallengeError extends Error {}

function sameInstant(value: Date, isoValue: string | undefined): boolean {
  return Boolean(isoValue) && value.getTime() === Date.parse(isoValue!);
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { key: "auth-verify", limit: 10, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

  let message: string;
  let signature: string;
  try {
    const body = await req.json();
    message = body?.message;
    signature = body?.signature;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (
    typeof message !== "string" ||
    typeof signature !== "string" ||
    message.length === 0 ||
    Buffer.byteLength(message, "utf8") > MAX_MESSAGE_BYTES
  ) {
    return NextResponse.json(
      { error: "Message and signature are required" },
      { status: 400 },
    );
  }

  try {
    const now = new Date();
    const config = getTrustedSiweConfig(req.nextUrl, req.headers.get("host"));
    const parsed = parseAndValidateSiweMessage(message, config, now);
    const normalizedSignature = normalizeSiweSignature(signature);
    const walletAddress = parsed.address.toLowerCase();

    // Fetch only the server-issued challenge identified by the exact signed
    // nonce. Message hash + every relying-party field bind verification to the
    // canonical message returned by /nonce, not a client-constructed variant.
    const challenge = await prisma.loginChallenge.findUnique({
      where: { nonce: parsed.nonce },
    });
    if (
      !challenge ||
      challenge.consumed_at ||
      challenge.expires_at.getTime() <= now.getTime() ||
      challenge.wallet_address !== walletAddress ||
      challenge.message_hash !== hashSiweMessage(message) ||
      challenge.domain !== parsed.domain ||
      challenge.uri !== parsed.uri ||
      challenge.chain_id !== parsed.chainId ||
      !sameInstant(challenge.issued_at, parsed.issuedAt) ||
      !sameInstant(challenge.expires_at, parsed.expirationTime)
    ) {
      throw new InvalidLoginChallengeError("Challenge mismatch");
    }

    // siwe@3 performs strict EIP-4361 message/signature verification. Domain,
    // nonce and wall-clock time are passed explicitly in addition to the field
    // checks above so the library enforces its own relying-party invariants.
    const verification = await parsed.verify(
      {
        signature: normalizedSignature,
        domain: challenge.domain,
        nonce: challenge.nonce,
        time: now.toISOString(),
      },
      { suppressExceptions: true },
    );
    if (!verification.success) {
      throw new InvalidLoginChallengeError("Signature mismatch");
    }

    const configuredGrant = Number(process.env.SIGNUP_VERIFY_CREDITS);
    const signupCredits = Number.isSafeInteger(configuredGrant) && configuredGrant >= 0
      ? Math.min(configuredGrant, 1_000)
      : 50;

    // One transaction gives the challenge true consume-once semantics under
    // concurrent verification. User creation happens only after the signature
    // is valid. Existing User.nonce is deliberately left unchanged, preserving
    // every active session; only /auth/logout rotates that session binding.
    const user = await prisma.$transaction(async (tx) => {
      const consumed = await tx.loginChallenge.updateMany({
        where: {
          id: challenge.id,
          consumed_at: null,
          expires_at: { gt: new Date() },
        },
        data: { consumed_at: new Date() },
      });
      if (consumed.count !== 1) {
        throw new InvalidLoginChallengeError("Challenge already consumed");
      }

      const authenticatedUser = await tx.user.upsert({
        where: { wallet_address: walletAddress },
        create: {
          wallet_address: walletAddress,
          nonce: createSessionNonce(),
          credits: 0,
        },
        // A no-op value assignment keeps the session nonce intact. Do not use
        // User.nonce as a login challenge: it is the JWT revocation binding.
        update: { wallet_address: walletAddress },
      });

      if (signupCredits > 0) {
        const grant = await tx.dailyActionCount.createMany({
          data: [{
            user_id: authenticatedUser.id,
            action_key: "signup_grant",
            day: "once",
            count: 1,
          }],
          skipDuplicates: true,
        });
        if (grant.count === 1) {
          await tx.user.update({
            where: { id: authenticatedUser.id },
            data: { credits: { increment: signupCredits } },
          });
        }
      }

      return tx.user.findUniqueOrThrow({ where: { id: authenticatedUser.id } });
    });

    const token = await createToken(user.id, user.wallet_address);
    const response = NextResponse.json({
      token,
      wallet_address: user.wallet_address,
      credits: user.credits,
    });
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 8 * 60 * 60,
    });
    response.headers.set("Cache-Control", "no-store, max-age=0");
    return response;
  } catch (error: unknown) {
    if (error instanceof InvalidLoginChallengeError) {
      return NextResponse.json(
        { error: "Invalid or expired sign-in challenge" },
        { status: 401 },
      );
    }
    // Parser/configuration/database details are logged server-side only.
    console.error(
      "SIWE verify error:",
      error instanceof Error ? error.message : "unknown error",
    );
    return NextResponse.json(
      { error: "Signature verification failed" },
      { status: 401 },
    );
  }
}
