import { gunzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { createTar, gzipTar, type TarEntry } from "./tar";

type ParsedEntry = {
  name: string;
  mode: number;
  size: number;
  mtime: number;
  type: string;
  data: Uint8Array;
  checksumOk: boolean;
};

function readString(header: Uint8Array, offset: number, length: number): string {
  let end = offset;
  while (end < offset + length && header[end] !== 0) {
    end += 1;
  }
  return new TextDecoder().decode(header.slice(offset, end));
}

function parseTar(bytes: Uint8Array): ParsedEntry[] {
  const entries: ParsedEntry[] = [];
  let offset = 0;
  while (offset + 512 <= bytes.length) {
    const header = bytes.slice(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      break;
    }
    const prefix = readString(header, 345, 155);
    const name = readString(header, 0, 100);
    const size = Number.parseInt(readString(header, 124, 12), 8);
    const mode = Number.parseInt(readString(header, 100, 8), 8);
    const mtime = Number.parseInt(readString(header, 136, 12), 8);
    const checksumField = header.slice();
    checksumField.fill(0x20, 148, 156);
    const checksum = checksumField.reduce((sum, byte) => sum + byte, 0);
    entries.push({
      name: prefix === "" ? name : `${prefix}/${name}`,
      mode,
      size,
      mtime,
      type: String.fromCharCode(header[156]),
      data: bytes.slice(offset + 512, offset + 512 + size),
      checksumOk:
        readString(header, 148, 8) === checksum.toString(8).padStart(6, "0"),
    });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}

const file = (overrides: Partial<TarEntry> = {}): TarEntry => ({
  name: "app/run",
  data: new Uint8Array([1, 2, 3]),
  ...overrides,
});

describe("createTar", () => {
  it("writes a ustar file entry with padding and a valid checksum", () => {
    const data = new Uint8Array(1000).fill(7);
    const entries = parseTar(createTar([file({ data, mode: 0o600, mtime: 42 })]));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      name: "app/run",
      mode: 0o600,
      size: 1000,
      mtime: 42,
      type: "0",
      checksumOk: true,
    });
    expect(entries[0].data).toEqual(data);
  });

  it("handles data that is already block aligned", () => {
    const data = new Uint8Array(512).fill(3);
    const entries = parseTar(createTar([file({ data })]));
    expect(entries[0].size).toBe(512);
    expect(entries[0].data).toEqual(data);
  });

  it("writes a directory entry with the directory default mode", () => {
    const entries = parseTar(createTar([{ name: "app/", directory: true }]));
    expect(entries[0]).toMatchObject({
      name: "app/",
      mode: 0o755,
      size: 0,
      type: "5",
      checksumOk: true,
    });
  });

  it("uses file defaults", () => {
    const entries = parseTar(createTar([{ name: "app/config.json" }]));
    expect(entries[0]).toMatchObject({
      name: "app/config.json",
      mode: 0o644,
      size: 0,
      type: "0",
    });
  });

  it("splits long names into a ustar prefix", () => {
    const name = `${"p".repeat(60)}/${"f".repeat(60)}`;
    const entries = parseTar(createTar([file({ name })]));
    expect(entries[0].name).toBe(name);
    expect(entries[0].checksumOk).toBe(true);
  });

  it("writes two empty blocks for an empty archive", () => {
    const bytes = createTar([]);
    expect(bytes).toHaveLength(1024);
    expect(bytes.every((byte) => byte === 0)).toBe(true);
  });
});

describe("createTar validation", () => {
  it.each([
    ["empty", ""],
    ["absolute", "/etc/passwd"],
    ["NUL", "app/\u0000x"],
    ["backslash", "app\\run"],
    ["dot", "app/./run"],
    ["dot dot", "app/../run"],
    ["too long", "a".repeat(256)],
  ])("rejects a %s name", (_label, name) => {
    expect(() => createTar([file({ name })])).toThrow();
  });

  it("rejects a long name without a prefix separator", () => {
    expect(() => createTar([file({ name: "a".repeat(101) })])).toThrow(
      "cannot be split",
    );
  });

  it("rejects a long directory ending in a separator", () => {
    expect(() =>
      createTar([file({ name: `${"a".repeat(100)}/` })]),
    ).toThrow("cannot be split");
  });

  it("rejects a prefix that is too long", () => {
    expect(() =>
      createTar([file({ name: `${"p".repeat(156)}/file` })]),
    ).toThrow("cannot be split");
  });

  it("rejects a name part that is too long", () => {
    expect(() =>
      createTar([file({ name: `${"p".repeat(10)}/${"f".repeat(101)}` })]),
    ).toThrow("cannot be split");
  });
});

describe("gzipTar", () => {
  it("gzip compresses the tar", () => {
    const data = new TextEncoder().encode("hello");
    const gz = gzipTar([file({ name: "app/README.txt", data })]);
    const entries = parseTar(gunzipSync(gz));
    expect(entries[0].name).toBe("app/README.txt");
    expect(new TextDecoder().decode(entries[0].data)).toBe("hello");
  });
});
