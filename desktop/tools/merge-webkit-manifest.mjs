#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { readArtifact } from "./manifest-lib.mjs";

const [
  manifestPath,
  directory,
  urlPrefix,
  webkitVersion,
  webkitPackage,
  output,
] = process.argv.slice(2);

if (
  !manifestPath ||
  !directory ||
  !urlPrefix ||
  !webkitVersion ||
  !webkitPackage ||
  !output
) {
  console.error(
    "usage: merge-webkit-manifest.mjs <existing.json> <appimage-dir> <url-prefix> <webkit-version> <webkit-package> <output.json>",
  );
  process.exit(2);
}

function invalid(message) {
  console.error(`Invalid manifest: ${message}`);
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (error) {
  console.error(
    `Could not read ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}

if (typeof manifest !== "object" || manifest === null) {
  invalid("the root is not an object");
}
if (typeof manifest.version !== "string" || manifest.version === "") {
  invalid("the version is missing");
}
if (typeof manifest.artifacts !== "object" || manifest.artifacts === null) {
  invalid("the artifacts table is missing");
}

const prefix = urlPrefix.replace(/\/+$/, "");
const full = {};
for (const arch of ["x64", "arm64"]) {
  full[arch] = readArtifact(directory, `linux-${arch}-full.AppImage`, prefix);
}
manifest.artifacts["linux-appimage-full"] = full;
manifest.webkit = {
  version: webkitVersion,
  package: webkitPackage,
};

writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `Wrote ${output} with WebKit ${webkitVersion} (${webkitPackage})`,
);
