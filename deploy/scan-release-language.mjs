#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { lstat, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";

const HANGUL_OR_JAMO = /[\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\uac00-\ud7af\ud7b0-\ud7ff]/u;
const SOURCE_SCOPES = ["landing-assets", "web/src", "web/public"];
const BUILT_SCOPES = [
  ...SOURCE_SCOPES,
  "web/.next/static",
  "web/.next/server",
  "web/.next/standalone",
];
const STANDALONE_RUNTIME_CACHE = "web/.next/standalone/.next/cache";
const STANDALONE_SCOPE = "web/.next/standalone";
const REQUIRED_TEXT_EXTENSIONS = new Set([
  ".cjs", ".css", ".csv", ".gql", ".graphql", ".htm", ".html", ".ini",
  ".js", ".json", ".jsx", ".less", ".map", ".md", ".mdx", ".mjs",
  ".prisma", ".rsc", ".sass", ".scss", ".sql", ".svg", ".toml", ".ts",
  ".tsv", ".tsx", ".txt", ".webmanifest", ".xml", ".yaml", ".yml",
]);
const BINARY_EXTENSIONS = new Set([
  ".7z", ".avif", ".bin", ".br", ".eot", ".flac", ".gif", ".gz", ".ico",
  ".jpeg", ".jpg", ".m4a", ".m4v", ".mov", ".mp3", ".mp4", ".node", ".ogg",
  ".otf", ".pdf", ".png", ".tar", ".tgz", ".ttf", ".wasm", ".wav", ".webm",
  ".webp", ".woff", ".woff2",
]);

function usage() {
  console.error("Usage: node deploy/scan-release-language.mjs <source|built> <release-root>");
}

function findHangulOrJamo(text) {
  const match = HANGUL_OR_JAMO.exec(text);
  if (!match) return null;
  return `U+${match[0].codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`;
}

async function scanChunks(chunks) {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let found = null;
  let validUtf8 = true;
  for await (const chunk of chunks) {
    if (!validUtf8) continue;
    try {
      found ??= findHangulOrJamo(decoder.decode(chunk, { stream: true }));
    } catch {
      validUtf8 = false;
      found = null;
    }
  }
  if (validUtf8) {
    try {
      found ??= findHangulOrJamo(decoder.decode());
    } catch {
      validUtf8 = false;
      found = null;
    }
  }
  return { found, validUtf8 };
}

async function scanCommand(command, args, label, requireUtf8 = true) {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    if (stderr.length < 4096) stderr += chunk;
  });
  const completion = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  const result = await scanChunks(child.stdout);
  const { code, signal } = await completion;
  if (code !== 0) {
    const detail = stderr.trim().split(/\r?\n/, 1)[0] || `signal ${signal || "unknown"}`;
    throw new Error(`${label}: archive inspection failed (${detail})`);
  }
  if (requireUtf8 && !result.validUtf8) throw new Error(`${label}: text is not valid UTF-8`);
  return result;
}

async function scanFile(absolute, relative) {
  const extension = path.extname(relative).toLowerCase();
  if (extension === ".zip") {
    const listing = await scanCommand("unzip", ["-Z1", absolute], `${relative} names`);
    if (listing.found) {
      throw new Error(`${relative}: ZIP filename contains Hangul/Jamo (${listing.found})`);
    }
    const entries = [];
    const child = spawn("unzip", ["-Z1", absolute], { stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.setEncoding("utf8");
    let output = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { if (stderr.length < 4096) stderr += chunk; });
    const code = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    if (code !== 0) throw new Error(`${relative}: ZIP listing failed (${stderr.trim() || `code ${code}`})`);
    entries.push(...output.split(/\r?\n/).filter((entry) => entry && !entry.endsWith("/")));
    for (const entry of entries) {
      const entryExtension = path.extname(entry).toLowerCase();
      if (BINARY_EXTENSIONS.has(entryExtension) || entryExtension === ".zip") continue;
      const content = await scanCommand(
        "unzip",
        ["-p", absolute, entry],
        `${relative}:${entry}`,
        REQUIRED_TEXT_EXTENSIONS.has(entryExtension),
      );
      if (content.validUtf8 && content.found) {
        throw new Error(`${relative}:${entry}: contains Hangul/Jamo (${content.found})`);
      }
    }
    return;
  }
  if (BINARY_EXTENSIONS.has(extension)) return;
  const content = await scanChunks(createReadStream(absolute));
  if (!content.validUtf8 && REQUIRED_TEXT_EXTENSIONS.has(extension)) {
    throw new Error(`${relative}: text is not valid UTF-8`);
  }
  if (content.validUtf8 && content.found) {
    throw new Error(`${relative}: contains Hangul/Jamo (${content.found})`);
  }
}

async function scanTree(root, relative, counters, allowInternalSymlinks = false) {
  if (relative === STANDALONE_RUNTIME_CACHE) return;
  const absolute = path.join(root, ...relative.split("/"));
  const stat = await lstat(absolute);
  if (stat.isSymbolicLink()) {
    if (!allowInternalSymlinks) {
      throw new Error(`${relative}: symbolic links are not scannable`);
    }
    const standaloneRoot = path.join(root, ...STANDALONE_SCOPE.split("/"));
    const resolved = await realpath(absolute);
    const standalonePrefix = `${standaloneRoot}${path.sep}`;
    if (resolved !== standaloneRoot && !resolved.startsWith(standalonePrefix)) {
      throw new Error(`${relative}: symbolic link escapes the standalone artifact`);
    }
    const resolvedRelative = path.relative(standaloneRoot, resolved);
    const targetMatch = findHangulOrJamo(resolvedRelative);
    if (targetMatch) {
      throw new Error(`${relative}: symbolic-link target contains Hangul/Jamo (${targetMatch})`);
    }
    // Next.js creates a small number of deduplication links whose targets also
    // exist as ordinary entries under standalone/node_modules. The normal tree
    // walk scans those targets; accepting only in-tree links avoids both cycles
    // and any chance of reading outside the immutable release.
    counters.symlinks += 1;
    return;
  }
  if (stat.isDirectory()) {
    const entries = await readdir(absolute, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name, "en"));
    for (const entry of entries) {
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      const nameMatch = findHangulOrJamo(child);
      if (nameMatch) throw new Error(`${child}: path contains Hangul/Jamo (${nameMatch})`);
      await scanTree(root, child, counters, allowInternalSymlinks);
    }
    return;
  }
  if (!stat.isFile()) throw new Error(`${relative}: unsupported filesystem entry`);
  await scanFile(absolute, relative);
  counters.files += 1;
  counters.bytes += stat.size;
}

const [mode, rootArgument] = process.argv.slice(2);
if (!rootArgument || !["source", "built"].includes(mode)) {
  usage();
  process.exit(2);
}

try {
  const root = await realpath(rootArgument);
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error("release root must resolve to a real directory");
  }
  const scopes = mode === "source" ? SOURCE_SCOPES : BUILT_SCOPES;
  const counters = { files: 0, bytes: 0, symlinks: 0 };
  for (const scope of scopes) {
    await scanTree(root, scope, counters, mode === "built" && scope === STANDALONE_SCOPE);
  }
  console.log(`Release language scan passed (${mode}; ${counters.files} files; ${counters.bytes} bytes; ${counters.symlinks} safe links).`);
} catch (error) {
  console.error(`ERROR: release language scan failed: ${error.message}`);
  process.exit(1);
}
