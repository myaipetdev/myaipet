#!/usr/bin/env node

const SUPPORTED_SSL_MODES = new Set([
  "disable",
  "allow",
  "prefer",
  "require",
  "verify-ca",
  "verify-full",
]);

function fail() {
  process.exit(2);
}

try {
  const url = new URL(process.env.DATABASE_URL || "");
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") fail();
  if (url.hash) fail();

  const schemaValues = url.searchParams.getAll("schema");
  if (schemaValues.length > 1 || (schemaValues.length === 1 && schemaValues[0] !== "public")) fail();
  url.searchParams.delete("schema");

  const sslmodeValues = url.searchParams.getAll("sslmode");
  if (sslmodeValues.length > 1) fail();
  const sslmode = sslmodeValues.length === 0 ? "prefer" : sslmodeValues[0];
  if (!SUPPORTED_SSL_MODES.has(sslmode)) fail();
  url.searchParams.delete("sslmode");

  for (const key of [
    "connection_limit",
    "pool_timeout",
    "socket_timeout",
    "pgbouncer",
    "statement_cache_size",
  ]) {
    url.searchParams.delete(key);
  }
  if ([...url.searchParams].length !== 0) fail();

  // WHATWG URL keeps brackets in hostname for IPv6 literals, while libpq's
  // PGHOST expects the address itself (for example ::1 rather than [::1]).
  const hostname = url.hostname;
  const host = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  const fields = [
    ["HOST", host],
    ["PORT", url.port || "5432"],
    ["USER", decodeURIComponent(url.username)],
    ["PASSWORD", decodeURIComponent(url.password)],
    ["DATABASE", decodeURIComponent(url.pathname.slice(1))],
    ["SSLMODE", sslmode],
  ];
  for (const [name, value] of fields) {
    if ((name !== "PASSWORD" && !value) || /[\0\r\n]/.test(value)) fail();
    process.stdout.write(`${name}\t${Buffer.from(value, "utf8").toString("base64")}\n`);
  }
} catch {
  fail();
}
