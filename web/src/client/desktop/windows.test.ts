import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { minimalPe, minimalPng } from "../../../test/helpers/binaries";
import { packageBase, type DesktopConfig } from "./config";
import { buildWindowsPortable, windowsReadmeText } from "./windows";

const config: DesktopConfig = {
  schema: 1,
  id: "napp-0123456789ab",
  url: "https://example.com/",
  name: "Example",
  width: 1200,
  height: 780,
};
const base = packageBase(config);
const shell = minimalPe();
const icon = minimalPng();

describe("buildWindowsPortable", () => {
  it("builds a zip with the shell, config, icon and readme", () => {
    const bundle = buildWindowsPortable(config, icon, shell, "x64");
    expect(bundle.base).toBe(base);
    expect(bundle.filename).toBe(`${base}-x64.zip`);

    const files = unzipSync(bundle.archive);
    expect(Object.keys(files)).toEqual([
      `${base}/`,
      `${base}/${base}.exe`,
      `${base}/config.json`,
      `${base}/icon.png`,
      `${base}/README.txt`,
    ]);
    expect(files[`${base}/${base}.exe`]).toEqual(shell);
    expect(
      JSON.parse(new TextDecoder().decode(files[`${base}/config.json`])),
    ).toEqual(config);
    expect(files[`${base}/icon.png`]).toEqual(icon);

    const readme = new TextDecoder().decode(files[`${base}/README.txt`]);
    expect(readme).toContain("Example");
    expect(readme).toContain("https://example.com/");
    expect(readme).toContain(`${base}.exe`);
    expect(readme).toContain("SmartScreen");
  });

  it("uses the requested architecture in the filename", () => {
    expect(buildWindowsPortable(config, icon, shell, "arm64").filename).toBe(
      `${base}-arm64.zip`,
    );
  });

  it("rejects an empty shell", () => {
    expect(() =>
      buildWindowsPortable(config, icon, new Uint8Array(0), "x64"),
    ).toThrow("shell is empty");
  });

  it("rejects non-PE shells", () => {
    expect(() =>
      buildWindowsPortable(config, icon, new Uint8Array([0x4d]), "x64"),
    ).toThrow("not a PE");
    expect(() =>
      buildWindowsPortable(config, icon, new Uint8Array(64).fill(1), "x64"),
    ).toThrow("not a PE");

    const wrongSecond = shell.slice();
    wrongSecond[1] = 0;
    expect(() =>
      buildWindowsPortable(config, icon, wrongSecond, "x64"),
    ).toThrow("not a PE");

    const outOfRange = shell.slice();
    new DataView(outOfRange.buffer).setUint32(0x3c, 0xffff, true);
    expect(() =>
      buildWindowsPortable(config, icon, outOfRange, "x64"),
    ).toThrow("not a PE");

    for (let index = 0; index < 4; index += 1) {
      const badSignature = shell.slice();
      badSignature[0x40 + index] = index === 2 || index === 3 ? 1 : 0;
      expect(() =>
        buildWindowsPortable(config, icon, badSignature, "x64"),
      ).toThrow("not a PE");
    }
  });

  it("rejects an empty icon", () => {
    expect(() =>
      buildWindowsPortable(config, new Uint8Array(0), shell, "x64"),
    ).toThrow("icon is empty");
  });

  it("rejects an icon that is not PNG", () => {
    expect(() =>
      buildWindowsPortable(config, new Uint8Array([0x89]), shell, "x64"),
    ).toThrow("not a PNG");
    expect(() =>
      buildWindowsPortable(config, new Uint8Array(8).fill(1), shell, "x64"),
    ).toThrow("not a PNG");
  });
});

describe("windowsReadmeText", () => {
  it("writes the run instructions and warning", () => {
    const readme = windowsReadmeText(config, base);
    expect(readme).toContain("Example");
    expect(readme).toContain(`${base}.exe`);
    expect(readme).toContain("SmartScreen");
    expect(readme).toContain("does not auto-update");
  });
});
