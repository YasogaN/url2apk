import { describe, expect, it } from "vitest";
import { minimalPe, minimalPng } from "../../../test/helpers/binaries";
import { packageBase, type DesktopConfig } from "./config";
import { pngToIco } from "./ico";
import { buildWindowsInstaller } from "./installer";
import { readTrailer, TRAILER_SIZE } from "./trailer";

const config: DesktopConfig = {
  schema: 1,
  id: "napp-0123456789ab",
  url: "https://example.com/",
  name: "Example",
  width: 1200,
  height: 780,
};
const base = packageBase(config);
const installer = minimalPe();
const icon = minimalPng();

describe("buildWindowsInstaller", () => {
  it("appends the config payload and trailer to the installer", () => {
    const bundle = buildWindowsInstaller(config, icon, installer, "x64");
    expect(bundle.base).toBe(base);
    expect(bundle.filename).toBe(`${base}-x64-Setup.exe`);
    expect(bundle.bytes.slice(0, installer.length)).toEqual(installer);

    const result = readTrailer(bundle.bytes);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.trailer.payloadOffset).toBe(installer.length);
    expect(
      new TextDecoder().decode(
        bundle.bytes.slice(
          result.trailer.jsonOffset,
          result.trailer.jsonOffset + result.trailer.jsonLength,
        ),
      ),
    ).toBe(JSON.stringify(config));
    expect(
      bundle.bytes.slice(
        result.trailer.iconOffset,
        result.trailer.iconOffset + result.trailer.iconLength,
      ),
    ).toEqual(icon);
    const icoStart =
      result.trailer.iconOffset + result.trailer.iconLength;
    expect(
      bundle.bytes.slice(icoStart, bundle.bytes.length - TRAILER_SIZE),
    ).toEqual(pngToIco(icon));
  });

  it("uses the requested architecture in the filename", () => {
    expect(
      buildWindowsInstaller(config, icon, installer, "arm64").filename,
    ).toBe(`${base}-arm64-Setup.exe`);
  });

  it("rejects an empty installer", () => {
    expect(() =>
      buildWindowsInstaller(config, icon, new Uint8Array(0), "x64"),
    ).toThrow("installer is empty");
  });

  it("rejects non-PE installers", () => {
    expect(() =>
      buildWindowsInstaller(config, icon, new Uint8Array([0x4d]), "x64"),
    ).toThrow("not a PE");
    expect(() =>
      buildWindowsInstaller(config, icon, new Uint8Array(64).fill(1), "x64"),
    ).toThrow("not a PE");

    const wrongSecond = installer.slice();
    wrongSecond[1] = 0;
    expect(() =>
      buildWindowsInstaller(config, icon, wrongSecond, "x64"),
    ).toThrow("not a PE");

    const outOfRange = installer.slice();
    new DataView(outOfRange.buffer).setUint32(0x3c, 0xffff, true);
    expect(() =>
      buildWindowsInstaller(config, icon, outOfRange, "x64"),
    ).toThrow("not a PE");

    for (let index = 0; index < 4; index += 1) {
      const badSignature = installer.slice();
      badSignature[0x40 + index] = index === 2 || index === 3 ? 1 : 0;
      expect(() =>
        buildWindowsInstaller(config, icon, badSignature, "x64"),
      ).toThrow("not a PE");
    }
  });

  it("rejects an empty icon", () => {
    expect(() =>
      buildWindowsInstaller(config, new Uint8Array(0), installer, "x64"),
    ).toThrow("icon is empty");
  });

  it("rejects an icon that is not PNG", () => {
    expect(() =>
      buildWindowsInstaller(config, new Uint8Array([0x89]), installer, "x64"),
    ).toThrow("not a PNG");
    expect(() =>
      buildWindowsInstaller(
        config,
        new Uint8Array(8).fill(1),
        installer,
        "x64",
      ),
    ).toThrow("not a PNG");
  });
});
