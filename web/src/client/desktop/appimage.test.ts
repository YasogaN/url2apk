import { describe, expect, it } from "vitest";
import {
  minimalAppImage,
  minimalPng,
} from "../../../test/helpers/binaries";
import { buildAppImage } from "./appimage";
import { packageBase, type DesktopConfig } from "./config";
import { readTrailer } from "./trailer";

const config: DesktopConfig = {
  schema: 1,
  id: "napp-0123456789ab",
  url: "https://example.com/",
  name: "Example",
  width: 1200,
  height: 780,
};
const base = packageBase(config);
const image = minimalAppImage();
const icon = minimalPng();

describe("buildAppImage", () => {
  it("appends the config payload and trailer", () => {
    const bundle = buildAppImage(config, icon, image, "x64");
    expect(bundle.base).toBe(base);
    expect(bundle.filename).toBe(`${base}-x64.AppImage`);
    expect(bundle.bytes.slice(0, image.length)).toEqual(image);

    const result = readTrailer(bundle.bytes);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.trailer.payloadOffset).toBe(image.length);
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
  });

  it("rejects an empty base", () => {
    expect(() =>
      buildAppImage(config, icon, new Uint8Array(0), "x64"),
    ).toThrow("base is empty");
  });

  it("rejects a base that is not an AppImage", () => {
    expect(() =>
      buildAppImage(config, icon, new Uint8Array([0x7f]), "x64"),
    ).toThrow("not a type-2");
    expect(() =>
      buildAppImage(config, icon, new Uint8Array(64).fill(1), "x64"),
    ).toThrow("not a type-2");

    for (let index = 8; index <= 10; index += 1) {
      const badMagic = image.slice();
      badMagic[index] = 0;
      expect(() =>
        buildAppImage(config, icon, badMagic, "x64"),
      ).toThrow("not a type-2");
    }
  });

  it("rejects an empty icon", () => {
    expect(() =>
      buildAppImage(config, new Uint8Array(0), image, "x64"),
    ).toThrow("icon is empty");
  });

  it("rejects an icon that is not PNG", () => {
    expect(() =>
      buildAppImage(config, new Uint8Array([0x89]), image, "x64"),
    ).toThrow("not a PNG");
    expect(() =>
      buildAppImage(config, new Uint8Array(8).fill(1), image, "x64"),
    ).toThrow("not a PNG");
  });
});
