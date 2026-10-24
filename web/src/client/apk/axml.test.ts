import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { LABEL_SENTINEL, PACKAGE_SENTINEL, patchManifest } from "./axml";
import { patchPackageName } from "./arsc";
import { findAndroidTool } from "./test-tools";
import { readZip, writeZip } from "./zip";

const TEMPLATE = new URL("../../../public/shell.apk", import.meta.url);
const PACKAGE = "com.example.testapp";
const TEMP_DIR = mkdtempSync(join(tmpdir(), "url-to-apk-"));
const APK_PATH = join(TEMP_DIR, "patched.apk");
const AAPT2 = findAndroidTool("AAPT2", "aapt2");

afterAll(() => {
  rmSync(TEMP_DIR, { recursive: true, force: true });
});

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
    if (AAPT2 === undefined) {
      if (process.env.CI) {
        throw new Error("aapt2 is required in CI");
      }
      return;
    }
    writeFileSync(APK_PATH, patchedApk());
    const badging = execFileSync(AAPT2, ["dump", "badging", APK_PATH], {
      encoding: "utf8",
    });
    expect(badging).toContain(`package: name='${PACKAGE}'`);
    expect(badging).toContain("versionCode='9'");
    expect(badging).toContain("application-label:'Test App");
  });
});
