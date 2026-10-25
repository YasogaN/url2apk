import { describe, expect, it } from "vitest";
import { readZip, writeZip } from "./zip";

function sample() {
  return writeZip([
    { name: "assets/config.json", data: new TextEncoder().encode("{}") },
    { name: "resources.arsc", data: new Uint8Array(50) },
    { name: "classes.dex", data: new Uint8Array([1, 2, 3]) },
  ]);
}

describe("zip", () => {
  it("round trips entries and aligns resources.arsc", () => {
    const written = sample();
    const archive = readZip(written.bytes);

    expect(archive.entries.map((entry) => entry.name)).toEqual([
      "assets/config.json",
      "resources.arsc",
      "classes.dex",
    ]);
    expect(new TextDecoder().decode(archive.entries[0].data)).toBe("{}");
    expect(archive.entries[2].data).toEqual(new Uint8Array([1, 2, 3]));

    const arsc = archive.entries[1];
    expect(arsc.method).toBe(0);
    expect(arsc.dataOffset % 4).toBe(0);
    expect(archive.cdOffset).toBe(written.cdOffset);
    expect(archive.eocdOffset).toBe(written.eocdOffset);
  });

  it("writes and reads an empty archive", () => {
    const written = writeZip([]);
    expect(readZip(written.bytes).entries).toEqual([]);
  });

  it("rejects a bad crc", () => {
    const written = sample();
    const arsc = readZip(written.bytes).entries.find(
      (entry) => entry.name === "resources.arsc",
    );
    expect(arsc).toBeDefined();
    written.bytes[arsc!.dataOffset] ^= 0xff;
    expect(() => readZip(written.bytes)).toThrow("Bad CRC");
  });

  it("rejects an unsupported compression method", () => {
    const written = sample();
    const view = new DataView(
      written.bytes.buffer,
      written.bytes.byteOffset,
      written.bytes.byteLength,
    );
    view.setUint16(written.cdOffset + 10, 99, true);
    expect(() => readZip(written.bytes)).toThrow(
      "Unsupported compression method 99.",
    );
  });

  it("rejects a bad uncompressed size", () => {
    const written = sample();
    const view = new DataView(
      written.bytes.buffer,
      written.bytes.byteOffset,
      written.bytes.byteLength,
    );
    view.setUint32(written.cdOffset + 24, 999, true);
    expect(() => readZip(written.bytes)).toThrow("Bad uncompressed size");
  });

  it("rejects a corrupted local header", () => {
    const written = sample();
    written.bytes[0] = 0;
    expect(() => readZip(written.bytes)).toThrow("Invalid local header");
  });

  it("rejects a corrupted central directory", () => {
    const written = sample();
    const view = new DataView(
      written.bytes.buffer,
      written.bytes.byteOffset,
      written.bytes.byteLength,
    );
    view.setUint32(written.cdOffset, 0, true);
    expect(() => readZip(written.bytes)).toThrow(
      "Invalid central directory entry.",
    );
  });

  it("rejects a missing end of central directory", () => {
    expect(() => readZip(new Uint8Array(8))).toThrow(
      "End of central directory not found.",
    );
  });

  it("finds the end of central directory before trailing bytes", () => {
    const written = sample();
    const withTrailing = new Uint8Array(written.bytes.length + 4);
    withTrailing.set(written.bytes);
    const archive = readZip(withTrailing);
    expect(archive.entries).toHaveLength(3);
  });

  it("rejects zip64 markers", () => {
    const written = sample();
    const view = new DataView(
      written.bytes.buffer,
      written.bytes.byteOffset,
      written.bytes.byteLength,
    );
    view.setUint16(written.eocdOffset + 10, 0xffff, true);
    expect(() => readZip(written.bytes)).toThrow("ZIP64");
  });

  it("rejects an impossible central directory span", () => {
    const written = sample();
    const view = new DataView(
      written.bytes.buffer,
      written.bytes.byteOffset,
      written.bytes.byteLength,
    );
    view.setUint32(written.eocdOffset + 12, 0xffffff, true);
    expect(() => readZip(written.bytes)).toThrow("Invalid central directory.");
  });
});
