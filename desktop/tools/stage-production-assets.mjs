#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";

const [manifestUrl, publicDirectory, skipValue] = process.argv.slice(2);

if (!manifestUrl || !publicDirectory) {
  console.error(
    "usage: stage-production-assets.mjs <manifest-url> <public-dir> [skip-artifacts]",
  );
  process.exit(2);
}

const skip = new Set(
  (skipValue ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== ""),
);
const manifest = new URL(manifestUrl);
const root = resolve(publicDirectory);
const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function recordParts(record) {
  return Array.isArray(record.parts) ? record.parts : [record];
}

function destination(url) {
  const parsed = new URL(url, manifest);
  if (parsed.origin !== manifest.origin) {
    fail(`Refusing to download ${parsed.href}: it is on another origin.`);
  }
  if (!parsed.pathname.startsWith("/shells/")) {
    fail(`Refusing to stage ${parsed.pathname}: it is outside /shells/.`);
  }
  const path = resolve(root, `.${decodeURIComponent(parsed.pathname)}`);
  if (!path.startsWith(rootPrefix)) {
    fail(`Refusing to stage ${parsed.pathname}: it escapes ${root}.`);
  }
  return { url: parsed.href, path };
}

async function download(url, path, size, sha256) {
  const response = await fetch(url);
  if (!response.ok) {
    fail(`Could not download ${url}: HTTP ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length !== size) {
    fail(`${url}: got ${bytes.length} bytes, expected ${size}`);
  }
  if (hash(bytes) !== sha256) {
    fail(`${url}: the SHA-256 does not match the manifest`);
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

const response = await fetch(manifest);
if (!response.ok) {
  fail(`Could not fetch ${manifest.href}: HTTP ${response.status}`);
}
const current = await response.json();
if (
  typeof current !== "object" ||
  current === null ||
  typeof current.artifacts !== "object" ||
  current.artifacts === null
) {
  fail("The manifest does not contain an artifacts table.");
}

mkdirSync(root, { recursive: true });
writeFileSync(
  resolve(root, "shells.json"),
  `${JSON.stringify(current, null, 2)}\n`,
);

const seen = new Set();
let files = 0;
let bytesWritten = 0;
for (const [artifact, arches] of Object.entries(current.artifacts)) {
  if (skip.has(artifact)) {
    console.log(`skip ${artifact}`);
    continue;
  }
  if (typeof arches !== "object" || arches === null) {
    fail(`The ${artifact} entry is not an object.`);
  }
  for (const [arch, record] of Object.entries(arches)) {
    for (const part of recordParts(record)) {
      const { url: absolute, path } = destination(part.url);
      if (seen.has(absolute)) {
        continue;
      }
      seen.add(absolute);
      await download(absolute, path, part.size, part.sha256);
      files += 1;
      bytesWritten += part.size;
      console.log(`stage ${artifact} ${arch} ${part.url}`);
    }
  }
}

console.log(`Staged ${files} file(s), ${bytesWritten} bytes, into ${root}`);
