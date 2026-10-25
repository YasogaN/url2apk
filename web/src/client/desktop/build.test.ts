import { describe, expect, it } from "vitest";
import {
  fixturePe,
  fixturePng,
  minimalAppImage,
  minimalElf,
  minimalPe,
} from "../../../test/helpers/binaries";
import { buildDesktopArtifact } from "./build";
import type { DesktopArtifact, DesktopConfig } from "./config";

const config: DesktopConfig = {
  schema: 1,
  id: "napp-0123456789ab",
  url: "https://example.com/",
  name: "Example",
  width: 1200,
  height: 780,
};
const icon = fixturePng(64, 64);

describe("buildDesktopArtifact", () => {
  it("builds a portable Windows zip with patched PE metadata", () => {
    const result = buildDesktopArtifact({
      config,
      icon,
      artifact: "windows-portable",
      arch: "x64",
      base: fixturePe(),
    });
    expect(result.filename).toBe("example-6789ab-x64.zip");
    expect(Array.from(result.bytes.slice(0, 2))).toEqual([0x50, 0x4b]);
  });

  it("builds a Windows installer", () => {
    const result = buildDesktopArtifact({
      config,
      icon,
      artifact: "windows-setup",
      arch: "arm64",
      base: minimalPe(),
    });
    expect(result.filename).toBe("example-6789ab-arm64-Setup.exe");
    expect(Array.from(result.bytes.slice(0, 2))).toEqual([0x4d, 0x5a]);
  });

  it("builds a Linux tarball", () => {
    const result = buildDesktopArtifact({
      config,
      icon,
      artifact: "linux-tar",
      arch: "x64",
      base: minimalElf(),
    });
    expect(result.filename).toBe("example-6789ab-x64.tar.gz");
    expect(Array.from(result.bytes.slice(0, 2))).toEqual([0x1f, 0x8b]);
  });

  it("builds both AppImage variants", () => {
    for (const [artifact, suffix] of [
      ["linux-appimage", ""],
      ["linux-appimage-full", "-portable"],
    ] as const) {
      const result = buildDesktopArtifact({
        config,
        icon,
        artifact: artifact as DesktopArtifact,
        arch: "arm64",
        base: minimalAppImage(),
      });
      expect(result.filename).toBe(
        `example-6789ab-arm64${suffix}.AppImage`,
      );
      expect(Array.from(result.bytes.slice(0, 4))).toEqual([
        0x7f, 0x45, 0x4c, 0x46,
      ]);
    }
  });
});
