import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LABEL_SENTINEL, PACKAGE_SENTINEL, patchManifest } from "./axml";
import { patchPackageName } from "./arsc";
import { readZip, writeZip } from "./zip";

const TEMPLATE = new URL("../../../public/shell.apk", import.meta.url);
const PACKAGE = "com.example.testapp";
const APK_PATH = join(mkdtempSync(join(tmpdir(), "url-to-apk-")), "patched.apk");

function patchedApk(): Uint8Array {
  const archive = readZip(new Uint8Array(readFileSync(TEMPLATE)));
  const manifest = archive.entries.find(
    (entry) => entry.name === "AndroidManifest.xml",
  );
  const arsc = archive.entries.find((entry) => entry.name === "resources.arsc");
  expect(manifest).toBeDefined();
  expect(arsc).toBeDefined();

  const patchedManifest = manifest!.data.slice();
  patchManifest(patchedManifest, {
    packageName: PACKAGE,
    label: "Test App",
    versionCode: 9,
  });

  const patchedArsc = arsc!.data.slice();
  patchPackageName(patchedArsc, PACKAGE);

  return writeZip(
    archive.entries.map((entry) => ({
      name: entry.name,
      data:
        entry.name === "AndroidManifest.xml"
          ? patchedManifest
          : entry.name === "resources.arsc"
            ? patchedArsc
            : entry.data,
    })),
  ).bytes;
}

describe("android binary resources", () => {
  it("contains the placeholders it is meant to patch", () => {
    const archive = readZip(new Uint8Array(readFileSync(TEMPLATE)));
    const manifest = archive.entries.find(
      (entry) => entry.name === "AndroidManifest.xml",
    )!;
    const text = Buffer.from(manifest.data).toString("utf16le");
    expect(text).toContain(PACKAGE_SENTINEL);
    expect(text).toContain(LABEL_SENTINEL);
  });

  it("patches the manifest and resources.arsc", () => {
    const archive = readZip(patchedApk());
    const manifest = archive.entries.find(
      (entry) => entry.name === "AndroidManifest.xml",
    )!;
    const text = Buffer.from(manifest.data).toString("utf16le");
    expect(text).toContain(PACKAGE);
    expect(text).toContain("Test App");

    const arsc = archive.entries.find((entry) => entry.name === "resources.arsc")!;
    const arscText = Buffer.from(arsc.data).toString("utf16le");
    expect(arscText).toContain(PACKAGE);
  });

  it("is readable by aapt2", () => {
    const aapt2 =
      process.env.AAPT2 ?? "/home/blocky/android-sdk/build-tools/36.0.0/aapt2";
    if (!existsSync(aapt2)) {
      return;
    }
    const path = APK_PATH;
    writeFileSync(path, patchedApk());
    const badging = execFileSync(aapt2, ["dump", "badging", path], {
      encoding: "utf8",
    });
    expect(badging).toContain(`package: name='${PACKAGE}'`);
    expect(badging).toContain("versionCode='9'");
    expect(badging).toContain("application-label:'Test App");
  });
});
