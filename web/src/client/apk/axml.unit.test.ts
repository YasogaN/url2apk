import { describe, expect, it } from "vitest";
import { buildAxml } from "../../../test/helpers/axml";
import { patchManifest } from "./axml";

const PACKAGE = "com.example.testapp";
const LABEL = "Test App";

function utf8String(
  bytes: Uint8Array,
  base: number,
  info: {
    prefixOffset: number;
    prefixSize: number;
    byteLengthPrefixOffset: number;
    byteLengthPrefixSize: number;
    dataOffset: number;
  },
): { codeUnits: number; byteLength: number; value: string } {
  const read = (offset: number, size: number): number => {
    if (size === 1) return bytes[base + offset];
    return ((bytes[base + offset] & 0x7f) << 8) | bytes[base + offset + 1];
  };
  const codeUnits = read(info.prefixOffset, info.prefixSize);
  const byteLength = read(info.byteLengthPrefixOffset, info.byteLengthPrefixSize);
  return {
    codeUnits,
    byteLength,
    value: new TextDecoder().decode(
      bytes.subarray(base + info.dataOffset, base + info.dataOffset + byteLength),
    ),
  };
}

function utf16String(
  bytes: Uint8Array,
  base: number,
  info: { dataOffset: number; codeUnits: number },
): string {
  let value = "";
  for (let index = 0; index < info.codeUnits; index += 1) {
    value += String.fromCharCode(
      new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(
        base + info.dataOffset + index * 2,
        true,
      ),
    );
  }
  return value;
}

describe("patchManifest errors", () => {
  it("rejects a non-XML document", () => {
    expect(() =>
      patchManifest(new Uint8Array(8), {
        packageName: PACKAGE,
        label: LABEL,
        versionCode: 1,
      }),
    ).toThrow("Not an Android binary XML document.");
  });

  it("rejects a missing string pool", () => {
    const bytes = new Uint8Array(16);
    const view = new DataView(bytes.buffer);
    view.setUint16(0, 0x0003, true);
    view.setUint32(4, bytes.length, true);
    expect(() =>
      patchManifest(bytes, {
        packageName: PACKAGE,
        label: LABEL,
        versionCode: 1,
      }),
    ).toThrow("String pool not found.");
  });

  it("rejects a missing placeholder", () => {
    const built = buildAxml({ includePackage: false });
    expect(() =>
      patchManifest(built.bytes, {
        packageName: PACKAGE,
        label: LABEL,
        versionCode: 1,
      }),
    ).toThrow("Expected placeholder string was not found.");
  });

  it("rejects a replacement that does not fit", () => {
    const built = buildAxml();
    expect(() =>
      patchManifest(built.bytes, {
        packageName: PACKAGE,
        label: "x".repeat(129),
        versionCode: 1,
      }),
    ).toThrow("does not fit");
  });

  it("rejects a missing versionCode", () => {
    const built = buildAxml({ includeVersionCode: false });
    expect(() =>
      patchManifest(built.bytes, {
        packageName: PACKAGE,
        label: LABEL,
        versionCode: 1,
      }),
    ).toThrow("versionCode attribute was not found.");
  });

  it("rejects a malformed chunk before the manifest", () => {
    const built = buildAxml({ includeManifest: false, badChunk: true });
    expect(() =>
      patchManifest(built.bytes, {
        packageName: PACKAGE,
        label: LABEL,
        versionCode: 1,
      }),
    ).toThrow("versionCode attribute was not found.");
  });
});

describe("patchManifest UTF-16", () => {
  it("replaces both sentinels and the version code", () => {
    const built = buildAxml({ sorted: true });
    patchManifest(built.bytes, {
      packageName: PACKAGE,
      label: LABEL,
      versionCode: 9,
    });
    expect(new DataView(built.bytes.buffer).getUint32(built.versionDataOffset!, true)).toBe(9);
    expect(
      new DataView(built.bytes.buffer).getUint32(built.sortedFlagsOffset, true) & 1,
    ).toBe(0);
    const packageInfo = built.strings.get(
      [...built.strings.keys()].find((key) => key.startsWith("com.urltoapk.slot."))!,
    )!;
    expect(
      utf16String(built.bytes, built.poolDataOffset, packageInfo).replace(
        /\0.*$/,
        "",
      ),
    ).toBe(PACKAGE);
    const labelInfo = built.strings.get(
      [...built.strings.keys()].find((key) => key.startsWith("__URLTOAPK_LABEL__"))!,
    )!;
    expect(
      utf16String(built.bytes, built.poolDataOffset, labelInfo).replace(
        /\0.*$/,
        "",
      ),
    ).toBe(LABEL);
  });

  it("replaces exactly-sized strings without padding", () => {
    const built = buildAxml();
    const packageName = "a".repeat(127);
    const label = "b".repeat(128);
    patchManifest(built.bytes, { packageName, label, versionCode: 2 });
    const packageInfo = built.strings.get(
      [...built.strings.keys()].find((key) => key.startsWith("com.urltoapk.slot."))!,
    )!;
    expect(utf16String(built.bytes, built.poolDataOffset, packageInfo)).toBe(packageName);
    const labelInfo = built.strings.get(
      [...built.strings.keys()].find((key) => key.startsWith("__URLTOAPK_LABEL__"))!,
    )!;
    expect(utf16String(built.bytes, built.poolDataOffset, labelInfo)).toBe(label);
  });

  it("reads a long UTF-16 string", () => {
    const built = buildAxml({ extraString: "x".repeat(0x8000) });
    expect(() =>
      patchManifest(built.bytes, {
        packageName: PACKAGE,
        label: LABEL,
        versionCode: 3,
      }),
    ).not.toThrow();
  });
});

describe("patchManifest UTF-8", () => {
  it("replaces both sentinels with corrected prefixes", () => {
    const built = buildAxml({ utf8: true });
    patchManifest(built.bytes, {
      packageName: PACKAGE,
      label: LABEL,
      versionCode: 4,
    });
    const packageInfo = built.strings.get(
      [...built.strings.keys()].find((key) => key.startsWith("com.urltoapk.slot."))!,
    )!;
    expect(utf8String(built.bytes, built.poolDataOffset, packageInfo)).toEqual({
      codeUnits: PACKAGE.length,
      byteLength: PACKAGE.length,
      value: PACKAGE,
    });
    const labelInfo = built.strings.get(
      [...built.strings.keys()].find((key) => key.startsWith("__URLTOAPK_LABEL__"))!,
    )!;
    expect(utf8String(built.bytes, built.poolDataOffset, labelInfo)).toEqual({
      codeUnits: LABEL.length,
      byteLength: LABEL.length,
      value: LABEL,
    });
  });

  it("rejects a UTF-8 replacement that is too large", () => {
    const built = buildAxml({ utf8: true });
    expect(() =>
      patchManifest(built.bytes, {
        packageName: "a".repeat(128),
        label: LABEL,
        versionCode: 1,
      }),
    ).toThrow("does not fit");
  });
});
