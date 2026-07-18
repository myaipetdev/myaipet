import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Signature, Wallet } from "ethers";
import {
  buildSiweMessage,
  createSiweNonce,
  getTrustedSiweConfig,
  hashSiweMessage,
  normalizeSiweSignature,
  parseAndValidateSiweMessage,
} from "../src/lib/siweLogin";

const mutableEnv = process.env as Record<string, string | undefined>;
const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  SIWE_DOMAIN: process.env.SIWE_DOMAIN,
  SIWE_URI: process.env.SIWE_URI,
  SIWE_ALLOWED_DOMAINS: process.env.SIWE_ALLOWED_DOMAINS,
  SIWE_CHAIN_ID: process.env.SIWE_CHAIN_ID,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete mutableEnv[key];
    else mutableEnv[key] = value;
  }
}

async function main() {
  try {
    mutableEnv.NODE_ENV = "production";
    delete mutableEnv.SIWE_DOMAIN;
    delete mutableEnv.SIWE_URI;
    delete mutableEnv.SIWE_ALLOWED_DOMAINS;
    delete mutableEnv.SIWE_CHAIN_ID;

    // A forged request URL/Host is rejected; it can neither become nor borrow
    // the production SIWE authority.
    assert.throws(() => getTrustedSiweConfig(
      new URL("https://attacker.example/api/auth/nonce"),
    ));
    assert.throws(() => getTrustedSiweConfig(
      new URL("https://app.myaipet.ai/api/auth/nonce"),
      "attacker.example",
    ));
    const config = getTrustedSiweConfig(
      new URL("https://app.myaipet.ai/api/auth/nonce"),
      "app.myaipet.ai",
    );
    assert.equal(config.domain, "app.myaipet.ai");
    assert.equal(config.uri, "https://app.myaipet.ai");
    assert.equal(config.chainId, 56);

    const nonceRouteSource = readFileSync(
      new URL("../src/app/api/auth/nonce/route.ts", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(nonceRouteSource, /prisma\.user(?:\.|\b)/);

    const wallet = Wallet.createRandom();
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + config.challengeTtlMs);
    const nonce = createSiweNonce();
    const message = buildSiweMessage({
      address: wallet.address.toLowerCase(),
      nonce,
      issuedAt,
      expiresAt,
      config,
    });
    const parsed = parseAndValidateSiweMessage(message, config, issuedAt);
    const walletSignature = await wallet.signMessage(message);
    const signature = normalizeSiweSignature(walletSignature);
    const verified = await parsed.verify({
      signature,
      domain: config.domain,
      nonce,
      time: issuedAt.toISOString(),
    }, { suppressExceptions: true });
    assert.equal(verified.success, true);
    assert.equal(hashSiweMessage(message).length, 64);

    const recoveryByte = Number.parseInt(walletSignature.slice(-2), 16);
    const zeroOneSignature = `${walletSignature.slice(0, -2)}${(recoveryByte - 27).toString(16).padStart(2, "0")}`;
    assert.equal(normalizeSiweSignature(zeroOneSignature), walletSignature);
    assert.equal(
      normalizeSiweSignature(Signature.from(walletSignature).compactSerialized),
      walletSignature,
    );
    assert.throws(() => normalizeSiweSignature(`${walletSignature.slice(0, -2)}25`));

    // Concurrent requests receive independent challenge keys.
    assert.notEqual(createSiweNonce(), createSiweNonce());

    const wrongDomain = message.replace(
      "app.myaipet.ai wants you",
      "attacker.example wants you",
    );
    assert.throws(() => parseAndValidateSiweMessage(wrongDomain, config, issuedAt));

    const wrongUri = message.replace(
      "URI: https://app.myaipet.ai",
      "URI: https://attacker.example",
    );
    assert.throws(() => parseAndValidateSiweMessage(wrongUri, config, issuedAt));

    const wrongChain = message.replace("Chain ID: 56", "Chain ID: 1");
    assert.throws(() => parseAndValidateSiweMessage(wrongChain, config, issuedAt));

    const missingIssuedAt = message
      .split("\n")
      .filter((line) => !line.startsWith("Issued At: "))
      .join("\n");
    assert.throws(() => parseAndValidateSiweMessage(missingIssuedAt, config, issuedAt));

    const missingExpiration = message
      .split("\n")
      .filter((line) => !line.startsWith("Expiration Time: "))
      .join("\n");
    assert.throws(() => parseAndValidateSiweMessage(missingExpiration, config, issuedAt));

    assert.throws(() => parseAndValidateSiweMessage(
      message,
      config,
      new Date(expiresAt.getTime() + 1),
    ));

    process.stdout.write("SIWE login contract: PASS\n");
  } finally {
    restoreEnv();
  }
}

main().catch((error) => {
  restoreEnv();
  console.error(error);
  process.exitCode = 1;
});
