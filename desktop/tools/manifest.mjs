#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [directory, version, output] = process.argv.slice(2);
if (!directory || !version || !output) {
  console.error("usage: manifest.mjs <bases-dir> <version> <shells.json>");
  process.exit(2);
}

const FILES = {
  "windows-portable": { x64: "windows-x64-shell.exe", arm64: "windows-arm64-shell.exe" },
  "windows-setup-user": { x64: "windows-x64-setup-user.exe", arm64: "windows-arm64-setup-user.exe" },
  "windows-setup-system": { x64: "windows-x64-setup-system.exe", arm64: "windows-arm64-setup-system.exe" },
  "linux-tar": { x64: "linux-x64-shell", arm64: "linux-arm64-shell" },
  "linux-appimage": { x64: "linux-x64-lite.AppImage", arm64: "linux-arm64-lite.AppImage" },
  "linux-appimage-full": { x64: "linux-x64-full.AppImage", arm64: "linux-arm64-full.AppImage" },
};

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function warnIfLarge(name, size) {
  if (size > 25 * 1024 * 1024) {
    console.warn(`warning: ${name} is ${size} bytes and exceeds the 25 MiB static-asset limit`);
  }
}

function isSquashfsAt(bytes, offset) {
  if (offset < 1 || offset + 96 > bytes.length) {
    return false;
  }
  const inodes = bytes.readUInt32LE(offset + 4);
  const blockSize = bytes.readUInt32LE(offset + 12);
  const major = bytes.readUInt16LE(offset + 28);
  const minor = bytes.readUInt16LE(offset + 30);
  return (
    inodes > 0 &&
    blockSize >= 4096 &&
    blockSize <= 1024 * 1024 &&
    (blockSize & (blockSize - 1)) === 0 &&
    major === 4 &&
    minor === 0
  );
}

function appImageOffset(name, bytes) {
  if (!name.endsWith(".AppImage")) {
    return undefined;
  }
  const magic = Buffer.from("hsqs");
  let offset = bytes.lastIndexOf(magic);
  while (offset >= 0) {
    if (isSquashfsAt(bytes, offset)) {
      return offset;
    }
    offset = bytes.lastIndexOf(magic, offset - 1);
  }
  throw new Error(`Could not find the squashfs in ${name}`);
}

function readArtifact(name) {
  const partNames = readdirSync(directory)
    .filter((file) => file.startsWith(`${name}.part-`))
    .sort();
  if (partNames.length > 0) {
    const parts = partNames.map((partName) => {
      const bytes = readFileSync(join(directory, partName));
      warnIfLarge(partName, bytes.length);
      return {
        url: `/shells/${version}/${partName}`,
        size: bytes.length,
        sha256: hash(bytes),
        bytes,
      };
    });
    const whole = Buffer.concat(parts.map((part) => part.bytes));
    return {
      url: parts[0].url,
      size: whole.length,
      sha256: hash(whole),
      parts: parts.map(({ bytes: _bytes, ...part }) => part),
      ...(appImageOffset(name, whole) === undefined
        ? {}
        : { squashfsOffset: appImageOffset(name, whole) }),
    };
  }
  const bytes = readFileSync(join(directory, name));
  warnIfLarge(name, bytes.length);
  const squashfsOffset = appImageOffset(name, bytes);
  return {
    url: `/shells/${version}/${name}`,
    size: bytes.length,
    sha256: hash(bytes),
    ...(squashfsOffset === undefined ? {} : { squashfsOffset }),
  };
}

const artifacts = {};
for (const [artifact, arches] of Object.entries(FILES)) {
  artifacts[artifact] = {};
  for (const [arch, name] of Object.entries(arches)) {
    artifacts[artifact][arch] = readArtifact(name);
  }
}
writeFileSync(output, `${JSON.stringify({ version, artifacts }, null, 2)}\n`);
console.log(`Wrote ${output}`);
