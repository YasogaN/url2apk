import { describe, expect, it, vi } from "vitest";
import {
  fixturePe,
  fixturePng,
  minimalAppImage,
  minimalElf,
  minimalPe,
} from "../../../test/helpers/binaries";
import { flatpakBase } from "../../../test/helpers/flatpak";
import { buildDesktopArtifact } from "./build";
import type { DesktopConfig } from "./config";

const config: DesktopConfig = {
  schema: 1,
  id: "napp-0123456789ab",
  url: "https://example.com/",
  name: "Example",
  width: 1200,
  height: 780,
};
const icon = fixturePng(64, 64);

const flatpakWriter = vi.hoisted(() => ({
  default: vi.fn(async () => undefined),
  build_flatpak: vi.fn(() => new Uint8Array([9])),
}));

vi.mock("./flatpak-bundle", () => ({
  loadFlatpakBundleWriter: vi.fn(async () => flatpakWriter),
}));

describe("buildDesktopArtifact", () => {
  it("builds a portable Windows zip with patched PE metadata", async () => {
    const result = await buildDesktopArtifact({
      config,
      icon,
      artifact: "windows-portable",
      arch: "x64",
      base: fixturePe(),
    });
    expect(result.filename).toBe("example-6789ab-x64.zip");
    expect(Array.from(result.bytes.slice(0, 2))).toEqual([0x50, 0x4b]);
  });

  it("builds a Windows installer", async () => {
    const result = await buildDesktopArtifact({
      config,
      icon,
      artifact: "windows-setup-user",
      arch: "arm64",
      base: minimalPe(),
    });
    expect(result.filename).toBe("example-6789ab-arm64-Setup.exe");
    expect(Array.from(result.bytes.slice(0, 2))).toEqual([0x4d, 0x5a]);

    const system = await buildDesktopArtifact({
      config,
      icon,
      artifact: "windows-setup-system",
      arch: "x64",
      base: minimalPe(),
    });
    expect(system.filename).toBe("example-6789ab-x64-Setup.exe");
  });

  it("builds a Linux tarball", async () => {
    const result = await buildDesktopArtifact({
      config,
      icon,
      artifact: "linux-tar",
      arch: "x64",
      base: minimalElf(),
    });
    expect(result.filename).toBe("example-6789ab-x64.tar.gz");
    expect(Array.from(result.bytes.slice(0, 2))).toEqual([0x1f, 0x8b]);
  });

  it("builds a classic Flatpak bundle", async () => {
    const base = await flatpakBase();
    const result = await buildDesktopArtifact({
      config,
      icon: base.icon,
      artifact: "linux-flatpak",
      arch: "x64",
      base: base.bytes,
    });
    expect(result.filename).toBe("example-6789ab-x64.flatpak");
    expect(result.bytes).toEqual(new Uint8Array([9]));
  });

  it("builds a per-site Flatpak OCI archive", async () => {
    const base = await flatpakBase();
    const result = await buildDesktopArtifact({
      config,
      icon: base.icon,
      artifact: "linux-flatpak-oci",
      arch: "x64",
      base: base.bytes,
    });
    expect(result.filename).toBe("example-6789ab-x64-flatpak.tar");
    expect(result.bytes.length).toBeGreaterThan(0);
  });

  it("builds the system-WebKit AppImage", async () => {
    const result = await buildDesktopArtifact({
      config,
      icon,
      artifact: "linux-appimage",
      arch: "arm64",
      base: minimalAppImage(),
    });
    expect(result.filename).toBe("example-6789ab-arm64.AppImage");
    expect(Array.from(result.bytes.slice(0, 4))).toEqual([
      0x7f, 0x45, 0x4c, 0x46,
    ]);
  });
});
