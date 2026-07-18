/**
 * Read-only credential-format audit. It deliberately reports aggregate counts
 * only: never values, record ids, pet ids, platforms, URLs, or key material.
 *
 * Usage:
 *   OAUTH_CREDENTIAL_AUDIT_DATABASE_URL=... npm run audit:oauth-credentials
 *   OAUTH_CREDENTIAL_AUDIT_DATABASE_URL=... npm run audit:oauth-credentials -- --assert-safe
 */
import { Pool } from "pg";
import { decrypt } from "../src/lib/crypto";

type Bucket =
  | "empty"
  | "plaintext_oauth"
  | "plaintext_other"
  | "encrypted_oauth_v1"
  | "encrypted_agent"
  | "encrypted_legacy_oauth"
  | "encrypted_unknown"
  | "encrypted_unreadable"
  | "malformed";

const CIPHER_PATTERN = /^[A-Za-z0-9+/]{22}==:[A-Za-z0-9+/]{22}==:[A-Za-z0-9+/]+={0,2}$/;

function parsedKind(parsed: unknown, encrypted: boolean): Bucket {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return encrypted ? "encrypted_unknown" : "plaintext_other";
  }
  const value = parsed as Record<string, unknown>;
  if (value.format === "petclaw-agent-v1" && value.credentials && typeof value.credentials === "object") {
    return encrypted ? "encrypted_agent" : "plaintext_other";
  }
  if (value.format === "petclaw-oauth-v1" && value.credentials && typeof value.credentials === "object") {
    return "encrypted_oauth_v1";
  }
  if (typeof value.bot_token === "string" || typeof value.api_key === "string") {
    return encrypted ? "encrypted_agent" : "plaintext_other";
  }
  if (typeof value.access_token === "string" || typeof value.refresh_token === "string") {
    return encrypted ? "encrypted_legacy_oauth" : "plaintext_oauth";
  }
  return encrypted ? "encrypted_unknown" : "plaintext_other";
}

function classify(value: string | null): Bucket {
  if (!value) return "empty";
  if (!CIPHER_PATTERN.test(value)) {
    try {
      return parsedKind(JSON.parse(value), false);
    } catch {
      return "malformed";
    }
  }
  try {
    return parsedKind(JSON.parse(decrypt(value)), true);
  } catch {
    return "encrypted_unreadable";
  }
}

async function main() {
  const connectionString = process.env.OAUTH_CREDENTIAL_AUDIT_DATABASE_URL;
  if (!connectionString) {
    throw new Error("OAUTH_CREDENTIAL_AUDIT_DATABASE_URL is required");
  }

  const pool = new Pool({ connectionString, max: 1 });
  const counts: Record<Bucket, number> = {
    empty: 0,
    plaintext_oauth: 0,
    plaintext_other: 0,
    encrypted_oauth_v1: 0,
    encrypted_agent: 0,
    encrypted_legacy_oauth: 0,
    encrypted_unknown: 0,
    encrypted_unreadable: 0,
    malformed: 0,
  };

  try {
    const result = await pool.query<{ credentials: string | null }>(
      'SELECT "credentials" FROM "pet_platform_connections"',
    );
    for (const row of result.rows) counts[classify(row.credentials)] += 1;
  } finally {
    await pool.end();
  }

  process.stdout.write(`${JSON.stringify({ total: Object.values(counts).reduce((a, b) => a + b, 0), counts })}\n`);

  if (process.argv.includes("--assert-safe")) {
    const unsafe = counts.plaintext_oauth
      + counts.plaintext_other
      + counts.encrypted_legacy_oauth
      + counts.encrypted_unknown
      + counts.encrypted_unreadable
      + counts.malformed;
    if (unsafe > 0) process.exitCode = 2;
  }
}

main().catch(() => {
  // Database/client errors can include connection details. Keep stderr generic.
  process.stderr.write("OAuth credential audit failed.\n");
  process.exitCode = 1;
});
