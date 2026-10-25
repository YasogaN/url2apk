#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
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

const artifacts = {};
for (const [artifact, arches] of Object.entries(FILES)) {
  artifacts[artifact] = {};
  for (const [arch, name] of Object.entries(arches)) {
    const path = join(directory, name);
    const bytes = readFileSync(path);
    const size = statSync(path).size;
    if (size > 25 * 1024 * 1024) {
      console.warn(`warning: ${name} is ${size} bytes and exceeds the 25 MiB static-asset limit`);
    }
    artifacts[artifact][arch] = {
      url: `/shells/${version}/${name}`,
      size,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }
}
writeFileSync(output, `${JSON.stringify({ version, artifacts }, null, 2)}\n`);
console.log(`Wrote ${output}`);
