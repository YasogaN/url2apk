import { describe, expect, it } from "vitest";
import {
  TRAILER_ICON_OFFSET,
  TRAILER_JSON_OFFSET,
  TRAILER_PAYLOAD_OFFSET,
  TRAILER_SIZE,
  appendPayload,
  buildTrailer,
  readTrailer,
} from "./trailer";

const encoder = new TextEncoder();
const base = new Uint8Array([1, 2, 3, 4, 5]);
const json = encoder.encode('{"url":"https://example.com/"}');
const icon = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const file = appendPayload(base, json, icon);

function trailerView(bytes: Uint8Array): DataView {
  return new DataView(
    bytes.buffer,
    bytes.byteOffset + bytes.length - TRAILER_SIZE,
    TRAILER_SIZE,
  );
}

function patch(
  bytes: Uint8Array,
  field: number,
  value: number | bigint,
): Uint8Array {
  const copy = bytes.slice();
  trailerView(copy).setBigUint64(field, BigInt(value), true);
  return copy;
}

function patchVersion(bytes: Uint8Array, version: number): Uint8Array {
  const copy = bytes.slice();
  trailerView(copy).setUint16(4, version, true);
  return copy;
}

describe("appendPayload", () => {
  it("writes a readable trailer", () => {
    const result = readTrailer(file);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.trailer).toEqual({
      jsonOffset: base.length,
      jsonLength: json.length,
      iconOffset: base.length + json.length,
      iconLength: icon.length,
      payloadOffset: base.length,
    });
    expect(
      file.slice(
        result.trailer.jsonOffset,
        result.trailer.jsonOffset + result.trailer.jsonLength,
      ),
    ).toEqual(json);
    expect(
      file.slice(
        result.trailer.iconOffset,
        result.trailer.iconOffset + result.trailer.iconLength,
      ),
    ).toEqual(icon);
    expect(file.length).toBe(
      base.length + json.length + icon.length + TRAILER_SIZE,
    );
  });

  it("supports an empty icon", () => {
    const result = readTrailer(appendPayload(base, json, new Uint8Array(0)));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.trailer.iconLength).toBe(0);
    }
  });

  it("reads a trailer from a subarray", () => {
    const padded = new Uint8Array(file.length + 7);
    padded.set(file, 7);
    expect(readTrailer(padded.subarray(7)).ok).toBe(true);
  });

  it("builds a 64-byte trailer", () => {
    const bytes = buildTrailer({
      jsonOffset: 1,
      jsonLength: 2,
      iconOffset: 3,
      iconLength: 4,
      payloadOffset: 1,
    });
    expect(bytes.length).toBe(TRAILER_SIZE);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("NAPP");
  });
});

describe("readTrailer errors", () => {
  it("rejects files that are too small", () => {
    expect(readTrailer(new Uint8Array(63))).toEqual({
      ok: false,
      message: "The file is too small to contain a config trailer.",
    });
  });

  it("rejects a missing magic", () => {
    const copy = file.slice();
    copy[copy.length - TRAILER_SIZE] = 0;
    expect(readTrailer(copy)).toEqual({
      ok: false,
      message: "The config trailer is missing.",
    });
  });

  it("rejects an unsupported version", () => {
    expect(readTrailer(patchVersion(file, 2))).toEqual({
      ok: false,
      message: "The config trailer version is not supported.",
    });
  });

  it("rejects out-of-range offsets", () => {
    for (const field of [
      TRAILER_JSON_OFFSET,
      TRAILER_JSON_OFFSET + 8,
      TRAILER_ICON_OFFSET,
      TRAILER_ICON_OFFSET + 8,
      TRAILER_PAYLOAD_OFFSET,
    ]) {
      expect(readTrailer(patch(file, field, 1n << 63n))).toEqual({
        ok: false,
        message: "The config trailer has out-of-range offsets.",
      });
    }
  });

  it("rejects a zero or forward payload offset", () => {
    for (const value of [0, base.length + 1]) {
      expect(
        readTrailer(patch(file, TRAILER_PAYLOAD_OFFSET, value)),
      ).toEqual({
        ok: false,
        message: "The config payload offset is invalid.",
      });
    }
  });

  it("rejects an empty or overlapping JSON range", () => {
    expect(readTrailer(patch(file, TRAILER_JSON_OFFSET + 8, 0))).toEqual({
      ok: false,
      message: "The config JSON range is invalid.",
    });
    expect(
      readTrailer(patch(file, TRAILER_JSON_OFFSET + 8, json.length + 1)),
    ).toEqual({
      ok: false,
      message: "The config JSON range is invalid.",
    });
  });

  it("rejects an icon range past the trailer", () => {
    expect(
      readTrailer(patch(file, TRAILER_ICON_OFFSET + 8, icon.length + 1)),
    ).toEqual({
      ok: false,
      message: "The config icon range is invalid.",
    });
  });
});
