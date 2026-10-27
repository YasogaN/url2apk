#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { readArtifact } from "./manifest-lib.mjs";

const [directory, version, output, webkitVersion, webkitPackage] =
  process.argv.slice(2);
if (!directory || !version || !output) {
  console.error(
    "usage: manifest.mjs <bases-dir> <version> <shells.json> [webkit-version] [webkit-package]",
  );
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

const urlPrefix = `/shells/${version}`;
const artifacts = {};
for (const [artifact, arches] of Object.entries(FILES)) {
  artifacts[artifact] = {};
  for (const [arch, name] of Object.entries(arches)) {
    artifacts[artifact][arch] = readArtifact(directory, name, urlPrefix);
  }
}
const manifest = {
  version,
  ...(webkitVersion === undefined
    ? {}
    : {
        webkit: {
          version: webkitVersion,
          ...(webkitPackage === undefined ? {} : { package: webkitPackage }),
        },
      }),
  artifacts,
};
writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${output}`);
