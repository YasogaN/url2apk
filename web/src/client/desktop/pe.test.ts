import { NtExecutable, NtExecutableResource, Resource } from "resedit";
import { describe, expect, it } from "vitest";
import { fixturePe, fixturePng } from "../../../test/helpers/binaries";
import type { DesktopConfig } from "./config";
import { patchWindowsExe } from "./pe";

const config: DesktopConfig = {
  schema: 1,
  id: "napp-0123456789ab",
  url: "https://example.com/",
  name: "Example App",
  width: 1200,
  height: 780,
};
const icon = fixturePng(64, 64);

function patched(shell = fixturePe()): Uint8Array {
  return patchWindowsExe(shell, config, icon);
}

describe("patchWindowsExe", () => {
  it("replaces the icon and version strings", () => {
    const output = patched();
    expect(Array.from(output.slice(0, 2))).toEqual([0x4d, 0x5a]);

    const exe = NtExecutable.from(output);
    const resources = NtExecutableResource.from(exe);
    const groups = Resource.IconGroupEntry.fromEntries(resources.entries);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ id: 101, lang: 1033 });
    expect(groups[0].icons).toHaveLength(1);
    expect(groups[0].icons[0]).toMatchObject({
      width: 64,
      height: 64,
      dataSize: icon.length,
    });

    const versions = Resource.VersionInfo.fromEntries(resources.entries);
    expect(versions).toHaveLength(1);
    expect(
      versions[0].getStringValues({ lang: 1033, codepage: 1200 }),
    ).toMatchObject({
      FileDescription: "Example App",
      ProductName: "Example App",
    });
  });

  it("uses a default language when the version resource has no strings", () => {
    const output = patched(fixturePe({ versionStrings: false }));
    const exe = NtExecutable.from(output);
    const resources = NtExecutableResource.from(exe);
    const versions = Resource.VersionInfo.fromEntries(resources.entries);
    expect(
      versions[0].getStringValues({ lang: 1033, codepage: 1200 }),
    ).toMatchObject({
      FileDescription: "Example App",
      ProductName: "Example App",
    });
  });

  it("rejects an empty shell", () => {
    expect(() =>
      patchWindowsExe(new Uint8Array(0), config, icon),
    ).toThrow("shell is empty");
  });

  it("rejects an invalid PE", () => {
    expect(() =>
      patchWindowsExe(new Uint8Array(64).fill(1), config, icon),
    ).toThrow();
  });

  it("rejects a shell without an icon resource", () => {
    expect(() => patched(fixturePe({ icon: false }))).toThrow(
      "no icon resource",
    );
  });

  it("rejects a shell without a version resource", () => {
    expect(() => patched(fixturePe({ version: false }))).toThrow(
      "no version resource",
    );
  });

  it("rejects a non-PNG icon", () => {
    expect(() =>
      patchWindowsExe(fixturePe(), config, new Uint8Array([0x89])),
    ).toThrow("not a PNG");
    expect(() =>
      patchWindowsExe(fixturePe(), config, new Uint8Array(33)),
    ).toThrow("not a PNG");
    expect(() =>
      patchWindowsExe(fixturePe(), config, fixturePng().slice(0, 8)),
    ).toThrow("not a PNG");
  });

  it("rejects zero icon dimensions", () => {
    for (const bad of [fixturePng(0, 256), fixturePng(256, 0)]) {
      expect(() => patchWindowsExe(fixturePe(), config, bad)).toThrow(
        "invalid dimensions",
      );
    }
  });
});
