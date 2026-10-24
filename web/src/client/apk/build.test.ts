import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { buildApk, ICON_PATHS } from "./build";
import { createIdentity, importIdentity, type Identity } from "./keys";
import { readZip } from "./zip";

const TEMPLATE = new URL("../../../public/shell.apk", import.meta.url);
const PACKAGE = "com.example.testapp";
const AAPT2 =
  process.env.AAPT2 ?? "/home/blocky/android-sdk/build-tools/36.0.0/aapt2";
const APKSIGNER =
  process.env.APKSIGNER ?? "/home/blocky/android-sdk/build-tools/36.0.0/apksigner";
const ZIPALIGN =
  process.env.ZIPALIGN ?? "/home/blocky/android-sdk/build-tools/36.0.0/zipalign";
const JAVA_HOME = process.env.JAVA_HOME ?? "/home/blocky/toolchains/jdk17";
const toolEnv = {
  ...process.env,
  JAVA_HOME,
  PATH: `${JAVA_HOME}/bin:${process.env.PATH ?? ""}`,
};

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
  writeFileSync("/tmp/opencode/url-to-apk-test.apk", signed);
}, 120_000);

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
    ).rejects.toThrow("not a URL to APK");
  });
});

describe("signed apk", () => {
  it("is a valid v2-signed APK", () => {
    if (!existsSync(APKSIGNER)) {
      return;
    }
    const path = "/tmp/opencode/url-to-apk-test.apk";
    const verify = execFileSync(APKSIGNER, ["verify", "--verbose", path], {
      encoding: "utf8",
      env: toolEnv,
    });
    expect(verify).toContain(
      "Verified using v2 scheme (APK Signature Scheme v2): true",
    );
    const align = execFileSync(ZIPALIGN, ["-c", "-v", "4", path], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(align).toContain("Verification successful");
  });

  it("carries the patched identity", () => {
    if (!existsSync(AAPT2)) {
      return;
    }
    const path = "/tmp/opencode/url-to-apk-test.apk";
    const badging = execFileSync(AAPT2, ["dump", "badging", path], {
      encoding: "utf8",
    });
    expect(badging).toContain(`package: name='${PACKAGE}'`);
    expect(badging).toContain("versionCode='9'");
    expect(badging).toContain("application-label:'Test App");
  });
});
