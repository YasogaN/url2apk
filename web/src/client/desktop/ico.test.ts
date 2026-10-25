import { describe, expect, it } from "vitest";
import { fixturePng } from "../../../test/helpers/binaries";
import { pngToIco } from "./ico";

describe("pngToIco", () => {
  it("wraps a PNG in a one-entry ICO", () => {
    const png = fixturePng(256, 256);
    const ico = pngToIco(png);
    const view = new DataView(ico.buffer);
    expect(view.getUint16(0, true)).toBe(0);
    expect(view.getUint16(2, true)).toBe(1);
    expect(view.getUint16(4, true)).toBe(1);
    expect(ico[6]).toBe(0);
    expect(ico[7]).toBe(0);
    expect(view.getUint16(10, true)).toBe(1);
    expect(view.getUint16(12, true)).toBe(32);
    expect(view.getUint32(14, true)).toBe(png.length);
    expect(view.getUint32(18, true)).toBe(22);
    expect(ico.slice(22)).toEqual(png);
  });

  it("stores smaller dimensions directly", () => {
    const ico = pngToIco(fixturePng(64, 64));
    expect(ico[6]).toBe(64);
    expect(ico[7]).toBe(64);
  });

  it("rejects a non-PNG icon", () => {
    expect(() => pngToIco(new Uint8Array([0x89]))).toThrow("not a PNG");
    expect(() => pngToIco(new Uint8Array(33))).toThrow("not a PNG");
    expect(() => pngToIco(fixturePng().slice(0, 8))).toThrow("not a PNG");
  });

  it("rejects zero dimensions", () => {
    expect(() => pngToIco(fixturePng(0, 256))).toThrow("invalid dimensions");
    expect(() => pngToIco(fixturePng(256, 0))).toThrow("invalid dimensions");
  });
});
