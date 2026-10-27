import { describe, expect, it } from "vitest";
import { encodeVariant, offsetSize } from "./gvariant";

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

describe("offsetSize", () => {
  it.each([
    [0, 1],
    [0xff, 1],
    [0x100, 2],
    [0xffff, 2],
    [0x10000, 4],
    [0xffffffff, 4],
    [0x100000000, 8],
  ])("uses %i bytes for %i", (length, expected) => {
    expect(offsetSize(length)).toBe(expected);
  });
});

describe("encodeVariant", () => {
  it("encodes a string variant like GLib", () => {
    expect(hex(encodeVariant({ type: "s", value: "abc" }))).toBe(
      "616263000073",
    );
    expect(hex(encodeVariant({ type: "s", value: "" }))).toBe("000073");
  });

  it("encodes a string-array variant like GLib", () => {
    expect(hex(encodeVariant({ type: "as", value: ["abc"] }))).toBe(
      "6162630004006173",
    );
    expect(
      hex(encodeVariant({ type: "as", value: ["abc", "defgh"] })),
    ).toBe("61626300646566676800040a006173");
    expect(hex(encodeVariant({ type: "as", value: [] }))).toBe("006173");
  });

  it("widens the array offset table when the data is long", () => {
    expect(
      hex(
        encodeVariant({
          type: "as",
          value: ["a".repeat(300)],
        }),
      ),
    ).toBe(`${"61".repeat(300)}002d01006173`);
    expect(
      hex(
        encodeVariant({
          type: "as",
          value: ["a".repeat(65535)],
        }),
      ),
    ).toBe(`${"61".repeat(65535)}0000000100006173`);
  });

  it("encodes byte-array and uint64 variants like GLib", () => {
    expect(
      hex(encodeVariant({ type: "ay", value: new Uint8Array([1, 2, 3]) })),
    ).toBe("010203006179");
    expect(hex(encodeVariant({ type: "ay", value: new Uint8Array() }))).toBe(
      "006179",
    );
    expect(hex(encodeVariant({ type: "t", value: 1344n }))).toBe(
      "40050000000000000074",
    );
    expect(hex(encodeVariant({ type: "t", value: 0n }))).toBe(
      "00000000000000000074",
    );
  });
});
