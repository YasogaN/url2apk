import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApk, ICON_PATHS } from "./build";
import { createIdentity, importIdentity, type Identity } from "./keys";
import { findAndroidTool } from "./test-tools";
import { readZip } from "./zip";

const TEMPLATE = new URL("../../../public/shell.apk", import.meta.url);
const PACKAGE = "com.example.testapp";
const TEMP_DIR = mkdtempSync(join(tmpdir(), "url-to-apk-"));
const APK_PATH = join(TEMP_DIR, "signed.apk");
const AAPT2 = findAndroidTool("AAPT2", "aapt2");
const APKSIGNER = findAndroidTool("APKSIGNER", "apksigner");
const ZIPALIGN = findAndroidTool("ZIPALIGN", "zipalign");
const JAVA_HOME = process.env.JAVA_HOME;
const toolEnv = JAVA_HOME
  ? {
      ...process.env,
      PATH: `${join(JAVA_HOME, "bin")}${delimiter}${process.env.PATH ?? ""}`,
    }
  : process.env;

let identity: Identity;
let signed: Uint8Array;

beforeAll(async () => {
  identity = await createIdentity(2048, "test-password");
  const archive = readZip(new Uint8Array(readFileSync(TEMPLATE)));
  const icons = new Map<string, Uint8Array>();
  for (const path of ICON_PATHS) {
    const entry = archive.entries.find((candidate) => candidate.name === path);
    expect(entry, path).toBeDefined();
    icons.set(path, entry!.data);
  }
  signed = await buildApk({
    template: new Uint8Array(readFileSync(TEMPLATE)),
    packageName: PACKAGE,
    label: "Test App",
    versionCode: 9,
    url: "https://example.com/",
    name: "Example",
    icons,
    identity,
  });
  writeFileSync(APK_PATH, signed);
}, 120_000);

afterAll(() => {
  rmSync(TEMP_DIR, { recursive: true, force: true });
});

describe("key backup", () => {
  it("round trips an encrypted backup", async () => {
    const restored = await importIdentity(identity.backup, "test-password");
    expect(restored.certDer).toEqual(identity.certDer);
    expect(restored.publicKeySpki).toEqual(identity.publicKeySpki);
    expect(restored.modulusLength).toBe(2048);
  });

  it("rejects a wrong password", async () => {
    await expect(
      importIdentity(identity.backup, "wrong-password"),
    ).rejects.toThrow("did not unlock");
  });

  it("rejects a corrupt or truncated backup", async () => {
    await expect(
      importIdentity(identity.backup.slice(0, 10), "test-password"),
    ).rejects.toThrow("incomplete");
    const corrupt = identity.backup.slice();
    corrupt[0] = 0;
    await expect(
      importIdentity(corrupt, "test-password"),
    ).rejects.toThrow("not a URL to App");
  });
});

describe("signed apk", () => {
  it("is a valid v2-signed APK", () => {
    if (APKSIGNER === undefined || ZIPALIGN === undefined) {
      if (process.env.CI) {
        throw new Error("APK signing tools are required in CI");
      }
      return;
    }
    const verify = execFileSync(APKSIGNER, ["verify", "--verbose", APK_PATH], {
      encoding: "utf8",
      env: toolEnv,
    });
    expect(verify).toContain(
      "Verified using v2 scheme (APK Signature Scheme v2): true",
    );
    const align = execFileSync(ZIPALIGN, ["-c", "-v", "4", APK_PATH], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(align).toContain("Verification successful");
  });

  it("carries the patched identity", () => {
    if (AAPT2 === undefined) {
      if (process.env.CI) {
        throw new Error("aapt2 is required in CI");
      }
      return;
    }
    const badging = execFileSync(AAPT2, ["dump", "badging", APK_PATH], {
      encoding: "utf8",
    });
    expect(badging).toContain(`package: name='${PACKAGE}'`);
    expect(badging).toContain("versionCode='9'");
    expect(badging).toContain("application-label:'Test App");
  });
});
