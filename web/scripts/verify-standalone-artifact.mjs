#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const nextRoot = path.join(projectRoot, ".next");
const standaloneRoot = path.join(nextRoot, "standalone");
const maxStandaloneBytes = Number(process.env.MAX_STANDALONE_BYTES || 750 * 1024 * 1024);

const secretName = /^(?:\.env(?:\..*)?|id_(?:rsa|dsa|ecdsa|ed25519)|.*\.(?:pem|key|p12|pfx))$/i;
const forbiddenProjectTopLevel = new Set(["src", "scripts"]);

async function walk(root) {
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return out;
    throw error;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

// Next may copy dotenv files into standalone independently of route traces.
// Strip them first, then verify both the copied tree and every NFT manifest.
for (const file of await walk(standaloneRoot)) {
  if (secretName.test(path.basename(file))) await fs.unlink(file);
}

const standaloneFiles = await walk(standaloneRoot);
let standaloneBytes = 0;
const copiedSecrets = [];
for (const file of standaloneFiles) {
  const stat = await fs.stat(file);
  standaloneBytes += stat.size;
  if (secretName.test(path.basename(file))) copiedSecrets.push(path.relative(standaloneRoot, file));
}

const tracedProjectInputs = [];
const rootEntries = await fs.readdir(nextRoot, { withFileTypes: true }).catch(() => []);
const rootNftFiles = rootEntries
  .filter((entry) => entry.isFile() && entry.name.endsWith(".nft.json"))
  .map((entry) => path.join(nextRoot, entry.name));
const nftFiles = [
  ...rootNftFiles,
  ...(await walk(path.join(nextRoot, "server"))).filter((file) => file.endsWith(".nft.json")),
];
for (const manifest of nftFiles) {
  let parsed;
  try {
    parsed = JSON.parse(await fs.readFile(manifest, "utf8"));
  } catch (error) {
    throw new Error(`Invalid NFT manifest ${path.relative(projectRoot, manifest)}: ${error.message}`);
  }
  for (const traced of parsed.files || []) {
    const resolved = path.resolve(path.dirname(manifest), traced);
    const relative = path.relative(projectRoot, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) continue;
    const [top] = relative.split(path.sep);
    if (
      secretName.test(path.basename(resolved))
      || forbiddenProjectTopLevel.has(top)
      || /^Dockerfile/i.test(top)
    ) {
      tracedProjectInputs.push(`${path.relative(projectRoot, manifest)} -> ${relative}`);
    }
  }
}

const problems = [];
if (copiedSecrets.length) problems.push(`secret-like files copied to standalone:\n${copiedSecrets.join("\n")}`);
if (tracedProjectInputs.length) problems.push(`forbidden project inputs present in NFT traces:\n${tracedProjectInputs.slice(0, 50).join("\n")}`);
if (standaloneBytes > maxStandaloneBytes) {
  problems.push(`standalone artifact is ${standaloneBytes} bytes; limit is ${maxStandaloneBytes}`);
}

if (problems.length) {
  console.error(`Release artifact verification failed:\n\n${problems.join("\n\n")}`);
  process.exit(1);
}

console.log(`Release artifact verified: ${standaloneFiles.length} files, ${standaloneBytes} bytes, ${nftFiles.length} traces, no secret inputs.`);
