"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const lockfile = require("proper-lockfile");

const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const lockSleeper = new Int32Array(new SharedArrayBuffer(4));

function plainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeServerOrigin(raw) {
  if (typeof raw !== "string") {
    throw new Error("server origin must be a string");
  }
  const parsed = new URL(raw);
  const loopback = parsed.hostname === "localhost"
    || parsed.hostname === "127.0.0.1"
    || parsed.hostname === "::1"
    || parsed.hostname === "[::1]";
  if (parsed.username || parsed.password) {
    throw new Error("server origin must not contain credentials");
  }
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) {
    throw new Error("server origin must use HTTPS (HTTP is allowed only for loopback development)");
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("server origin must not contain a path, query, or fragment");
  }
  return parsed.origin;
}

function canonicalServerOrigin(value) {
  try {
    return normalizeServerOrigin(value) === value;
  } catch {
    return false;
  }
}

/**
 * A persisted authorization may be replayed only against the exact origin that
 * created it. Pet ids and run ids are scoped by a server/database, so sending a
 * marker to a newly configured origin could create an unrelated paid run.
 */
function assertPaidRunServerOrigin(run, currentOrigin) {
  const runId = plainObject(run) && typeof run.runId === "string"
    ? run.runId
    : "(unknown)";
  let normalizedCurrent;
  try {
    normalizedCurrent = normalizeServerOrigin(currentOrigin);
  } catch (error) {
    throw new Error(
      `Cannot reconcile paid run ${runId}: the current server origin is invalid (${error.message}); no network request was sent`,
    );
  }
  if (!plainObject(run) || typeof run.serverOrigin !== "string") {
    throw new Error(
      `Paid-run marker ${runId} has no trusted server-origin binding; no network request was sent. `
      + "Reconcile it on the server where it was created before starting another run",
    );
  }
  let boundOrigin;
  try {
    boundOrigin = normalizeServerOrigin(run.serverOrigin);
  } catch (error) {
    throw new Error(
      `Paid-run marker ${runId} has an invalid server-origin binding (${error.message}); no network request was sent`,
    );
  }
  if (boundOrigin !== run.serverOrigin) {
    throw new Error(
      `Paid-run marker ${runId} has a non-canonical server-origin binding; no network request was sent`,
    );
  }
  if (boundOrigin !== normalizedCurrent) {
    throw new Error(
      `Paid-run marker ${runId} is bound to ${boundOrigin}, not the current server ${normalizedCurrent}; `
      + "no network request was sent",
    );
  }
  return boundOrigin;
}

function readConfigStrict(configFile) {
  if (!fs.existsSync(configFile)) return {};
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(configFile, "utf8"));
  } catch (error) {
    throw new Error(`Cannot safely read ${configFile}: ${error.message}`);
  }
  if (!plainObject(parsed)) {
    throw new Error(`Cannot safely read ${configFile}: expected one JSON object`);
  }
  return parsed;
}

function pendingMapStrict(config, configFile) {
  const value = config.pendingAgentRuns;
  if (value == null) return {};
  if (!plainObject(value)) {
    throw new Error(`Cannot safely read paid-run journal in ${configFile}`);
  }
  const pending = { ...value };
  for (const [runId, run] of Object.entries(pending)) {
    if (
      !RUN_ID.test(runId)
      || !plainObject(run)
      || run.runId !== runId
      || !Number.isSafeInteger(run.petId)
      || run.petId <= 0
      || typeof run.goal !== "string"
      || (
        run.journalVersion != null
        && (!Number.isSafeInteger(run.journalVersion) || run.journalVersion < 1)
      )
      || (run.serverOrigin != null && !canonicalServerOrigin(run.serverOrigin))
      || (run.journalVersion >= 2 && !canonicalServerOrigin(run.serverOrigin))
    ) {
      throw new Error(`Cannot safely read paid-run marker ${runId || "(empty)"} in ${configFile}`);
    }
  }
  return pending;
}

function atomicWriteConfig(configFile, value) {
  const parent = path.dirname(configFile);
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  const temp = `${configFile}.${process.pid}.${randomUUID()}.tmp`;
  let fd;
  try {
    fd = fs.openSync(temp, "wx", 0o600);
    fs.writeFileSync(fd, JSON.stringify(value, null, 2));
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temp, configFile);
    if (process.platform !== "win32") fs.chmodSync(configFile, 0o600);
    try {
      const parentFd = fs.openSync(parent, "r");
      try { fs.fsyncSync(parentFd); } finally { fs.closeSync(parentFd); }
    } catch {
      // Directory fsync is unavailable on some supported filesystems. The
      // file itself was fsynced and atomically renamed before this point.
    }
  } catch (error) {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch {}
    }
    try { fs.unlinkSync(temp); } catch {}
    throw error;
  }
}

function withConfigLock(configFile, callback) {
  const guardFile = `${configFile}.guard`;
  fs.mkdirSync(path.dirname(guardFile), { recursive: true, mode: 0o700 });
  if (!fs.existsSync(guardFile)) {
    try {
      const fd = fs.openSync(guardFile, "wx", 0o600);
      fs.closeSync(fd);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
  }
  if (fs.lstatSync(guardFile).isSymbolicLink()) {
    throw new Error(`Unsafe paid-run guard path: ${guardFile}`);
  }
  const deadline = Date.now() + 5_000;
  let release;
  while (!release) {
    try {
      release = lockfile.lockSync(guardFile, {
        realpath: false,
        stale: 10_000,
        update: 2_000,
      });
    } catch (error) {
      if (error?.code !== "ELOCKED" || Date.now() >= deadline) {
        throw new Error(
          error?.code === "ELOCKED"
            ? `Timed out waiting for the paid-run safety lock at ${guardFile}; no paid request was sent`
            : error.message,
        );
      }
      Atomics.wait(lockSleeper, 0, 0, 20);
    }
  }
  try {
    return callback();
  } finally {
    release();
  }
}

function exactMarkerMatches(current, expected) {
  if (!plainObject(current) || !plainObject(expected)) return false;
  if (typeof expected.journalNonce === "string") {
    return current.runId === expected.runId
      && current.journalNonce === expected.journalNonce
      && isDeepStrictEqual(current, expected);
  }
  return isDeepStrictEqual(current, expected);
}

function createPaidRunJournal(configFile) {
  return {
    listAll() {
      return withConfigLock(configFile, () => {
        const current = readConfigStrict(configFile);
        return Object.values(pendingMapStrict(current, configFile));
      });
    },

    claim(run) {
      return withConfigLock(configFile, () => {
        const current = readConfigStrict(configFile);
        const pending = pendingMapStrict(current, configFile);
        const blocked = Object.values(pending)[0];
        if (blocked) return { kind: "blocked", pending: blocked };
        if (
          !RUN_ID.test(run.runId)
          || !Number.isSafeInteger(run.petId)
          || run.petId <= 0
          || typeof run.goal !== "string"
          || !canonicalServerOrigin(run.serverOrigin)
        ) {
          throw new Error("Refusing to write an invalid paid-run safety marker");
        }
        const marker = {
          ...run,
          journalVersion: 2,
          journalNonce: randomUUID(),
        };
        pending[marker.runId] = marker;
        atomicWriteConfig(configFile, { ...current, pendingAgentRuns: pending });
        const confirmed = pendingMapStrict(readConfigStrict(configFile), configFile);
        if (!exactMarkerMatches(confirmed[marker.runId], marker)) {
          throw new Error("Could not verify the paid-run safety marker; no paid request was sent");
        }
        return { kind: "started", marker };
      });
    },

    remove(expectedMarker) {
      return withConfigLock(configFile, () => {
        const current = readConfigStrict(configFile);
        const pending = pendingMapStrict(current, configFile);
        const stored = pending[expectedMarker.runId];
        if (!stored) {
          return { removed: false, remaining: Object.values(pending) };
        }
        if (!exactMarkerMatches(stored, expectedMarker)) {
          throw new Error(
            `Paid-run marker ${expectedMarker.runId} changed; refusing stale removal`,
          );
        }
        const otherBefore = Object.fromEntries(
          Object.entries(pending).filter(([runId]) => runId !== expectedMarker.runId),
        );
        delete pending[expectedMarker.runId];
        atomicWriteConfig(configFile, { ...current, pendingAgentRuns: pending });
        const confirmed = pendingMapStrict(readConfigStrict(configFile), configFile);
        if (
          confirmed[expectedMarker.runId]
          || JSON.stringify(confirmed) !== JSON.stringify(otherBefore)
        ) {
          throw new Error(`Could not verify exact removal of paid-run marker ${expectedMarker.runId}`);
        }
        return { removed: true, remaining: Object.values(confirmed) };
      });
    },

    replaceConfigPreservingJournal(nextConfig) {
      return withConfigLock(configFile, () => {
        const current = readConfigStrict(configFile);
        const pending = pendingMapStrict(current, configFile);
        for (const run of Object.values(pending)) {
          if (typeof run.serverOrigin === "string") {
            try {
              assertPaidRunServerOrigin(run, nextConfig.serverUrl);
            } catch (error) {
              throw new Error(
                `Cannot change PetClaw server while paid run ${run.runId} is pending: ${error.message}`,
              );
            }
            continue;
          }
          let currentOrigin;
          let nextOrigin;
          try {
            currentOrigin = normalizeServerOrigin(current.serverUrl);
            nextOrigin = normalizeServerOrigin(nextConfig.serverUrl);
          } catch (error) {
            throw new Error(
              `Cannot change PetClaw server while legacy paid run ${run.runId} is pending: ${error.message}`,
            );
          }
          if (currentOrigin !== nextOrigin) {
            throw new Error(
              `Cannot change PetClaw server while legacy paid run ${run.runId} has no trusted origin binding`,
            );
          }
        }
        const next = { ...nextConfig, pendingAgentRuns: pending };
        atomicWriteConfig(configFile, next);
        pendingMapStrict(readConfigStrict(configFile), configFile);
        return next;
      });
    },
  };
}

module.exports = {
  assertPaidRunServerOrigin,
  createPaidRunJournal,
};
