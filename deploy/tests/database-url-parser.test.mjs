#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const parser = fileURLToPath(new URL("../parse-database-url.mjs", import.meta.url));

function parse(databaseUrl) {
  const result = spawnSync(process.execPath, [parser], {
    encoding: "utf8",
    env: { DATABASE_URL: databaseUrl },
  });
  if (result.status !== 0) return { status: result.status, fields: null };
  const fields = Object.fromEntries(result.stdout.trim().split("\n").map((line) => {
    const [name, encoded] = line.split("\t");
    return [name, Buffer.from(encoded, "base64").toString("utf8")];
  }));
  return { status: result.status, fields };
}

function expectRejected(name, databaseUrl) {
  const result = parse(databaseUrl);
  assert.notEqual(result.status, 0, `${name} was accepted`);
}

const defaults = parse("postgresql://pet:secret@127.0.0.1/petclaw");
assert.equal(defaults.status, 0);
assert.deepEqual(defaults.fields, {
  HOST: "127.0.0.1",
  PORT: "5432",
  USER: "pet",
  PASSWORD: "secret",
  DATABASE: "petclaw",
  SSLMODE: "prefer",
});

const publicSchema = parse("postgres://pet:@db.example:6543/petclaw?schema=public&sslmode=verify-full");
assert.equal(publicSchema.status, 0);
assert.equal(publicSchema.fields.PORT, "6543");
assert.equal(publicSchema.fields.PASSWORD, "");
assert.equal(publicSchema.fields.SSLMODE, "verify-full");

const prismaOptions = parse(
  "postgresql://pet:p%26ss%3Dword@db.example/petclaw?schema=public&connection_limit=20&pool_timeout=10&socket_timeout=5&pgbouncer=true&statement_cache_size=0",
);
assert.equal(prismaOptions.status, 0);
assert.equal(prismaOptions.fields.PASSWORD, "p&ss=word");
assert.equal(prismaOptions.fields.DATABASE, "petclaw");

const ipv6 = parse("postgresql://pet:secret@[2001:db8::7]:5433/petclaw?schema=public&sslmode=require");
assert.equal(ipv6.status, 0);
assert.equal(ipv6.fields.HOST, "2001:db8::7");
assert.equal(ipv6.fields.PORT, "5433");

for (const [name, databaseUrl] of [
  ["empty schema", "postgresql://pet:secret@localhost/petclaw?schema="],
  ["non-public schema", "postgresql://pet:secret@localhost/petclaw?schema=tenant"],
  ["duplicate schema", "postgresql://pet:secret@localhost/petclaw?schema=public&schema=public"],
  ["empty sslmode", "postgresql://pet:secret@localhost/petclaw?sslmode="],
  ["duplicate sslmode", "postgresql://pet:secret@localhost/petclaw?sslmode=require&sslmode=require"],
  ["conflicting sslmode", "postgresql://pet:secret@localhost/petclaw?sslmode=require&sslmode=disable"],
  ["unsupported sslmode", "postgresql://pet:secret@localhost/petclaw?sslmode=yes"],
  ["unknown parameter", "postgresql://pet:secret@localhost/petclaw?application_name=unsafe"],
  ["fragment", "postgresql://pet:secret@localhost/petclaw#ignored"],
]) {
  expectRejected(name, databaseUrl);
}

console.log("PASS production DATABASE_URL parser boundary contract");
