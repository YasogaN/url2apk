import { describe, expect, it } from "vitest";
import { bufferSource, concat, lp, seq, u16, u32, u64 } from "./bytes";

describe("fixed-width integers", () => {
  it("writes little-endian 16-bit values", () => {
    expect(Array.from(u16(0x1234))).toEqual([0x34, 0x12]);
  });

  it("writes little-endian 32-bit values", () => {
    expect(Array.from(u32(0x12345678))).toEqual([0x78, 0x56, 0x34, 0x12]);
  });

  it("writes little-endian 64-bit values", () => {
    expect(Array.from(u64(0x010203040506))).toEqual([
      6, 5, 4, 3, 2, 1, 0, 0,
    ]);
  });
});

describe("concat", () => {
  it("joins arrays", () => {
    expect(Array.from(concat(new Uint8Array([1]), new Uint8Array([2, 3])))).toEqual([
      1, 2, 3,
    ]);
  });
});

describe("bufferSource", () => {
  it("copies only the view bytes", () => {
    const parent = new Uint8Array([0, 1, 2, 3, 4]);
    const view = parent.subarray(1, 4);
    expect(Array.from(new Uint8Array(bufferSource(view)))).toEqual([1, 2, 3]);
  });
});

describe("length prefixes", () => {
  it("prefixes a value", () => {
    expect(Array.from(lp(new Uint8Array([9, 9])))).toEqual([
      2, 0, 0, 0, 9, 9,
    ]);
  });

  it("prefixes a sequence", () => {
    expect(
      Array.from(seq([new Uint8Array([1]), new Uint8Array([2, 3])])),
    ).toEqual([11, 0, 0, 0, 1, 0, 0, 0, 1, 2, 0, 0, 0, 2, 3]);
  });
});
