import { describe, expect, it } from "vitest";
import { createTar, parseTar, type FlatpakTarEntry } from "./flatpak-tar";

const file = (overrides: Partial<FlatpakTarEntry> = {}): FlatpakTarEntry => ({
  name: "files/bin/app",
  type: "file",
  data: new Uint8Array([1, 2, 3]),
  mode: 0o755,
  ...overrides,
});

describe("createTar and parseTar", () => {
  it("round-trips files, directories and symlinks", () => {
    const entries = parseTar(
      createTar([
        { name: "export", type: "dir", mode: 0o755 },
        file(),
        {
          name: "files/bin/link",
          type: "symlink",
          mode: 0o777,
          linkname: "app",
        },
      ]),
    );
    expect(entries).toMatchObject([
      { name: "export", type: "dir", mode: 0o755 },
      { name: "files/bin/app", type: "file", mode: 0o755 },
      {
        name: "files/bin/link",
        type: "symlink",
        mode: 0o777,
        linkname: "app",
      },
    ]);
    expect(entries[1]?.data).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("strips leading dots and expands hardlinks", () => {
    const tar = createTar([
      file({ name: "./a.txt", data: new Uint8Array([7]) }),
      { name: "b.txt", type: "file", mode: 0o644, data: new Uint8Array(0) },
    ]);
    // Replace the second entry with a hardlink by writing the type and link.
    const link = tar.slice();
    const second = 512 + 512;
    link[second + 156] = 0x31;
    link.fill(0, second + 157, second + 257);
    link.set(new TextEncoder().encode("a.txt"), second + 157);
    // The header checksum is not validated by the parser.
    const entries = parseTar(link);
    expect(entries.map((entry) => entry.name)).toEqual(["a.txt", "b.txt"]);
    expect(entries[1]?.data).toEqual(new Uint8Array([7]));
  });

  it("skips pax records", () => {
    const tar = createTar([file()]);
    const pax = new Uint8Array(512);
    pax[156] = 0x78;
    const combined = new Uint8Array(pax.length + tar.length);
    combined.set(pax);
    combined.set(tar, pax.length);
    expect(parseTar(combined)).toHaveLength(1);
  });

  it("rejects malformed archives", () => {
    expect(() => parseTar(new Uint8Array(10))).not.toThrow();
    const tar = createTar([file({ data: new Uint8Array(1024) })]);
    expect(() => parseTar(tar.slice(0, 600))).toThrow("truncated");
    const missingLink = createTar([
      file({ name: "b.txt", data: new Uint8Array(0) }),
    ]);
    missingLink[156] = 0x31;
    expect(() => parseTar(missingLink)).toThrow("hardlink target");
  });

  it("round-trips a long name and skips the root entry", () => {
    const long = `${"p".repeat(60)}/${"f".repeat(60)}`;
    const entries = parseTar(
      createTar([
        { name: ".", type: "file", mode: 0o755, data: new Uint8Array(0) },
        { name: long, type: "file", mode: 0o644, data: new Uint8Array([9]) },
      ]),
    );
    expect(entries.map((entry) => entry.name)).toEqual([long]);
    expect(entries[0]?.data).toEqual(new Uint8Array([9]));
  });

  it("reads empty octal fields as zero", () => {
    const tar = createTar([file()]);
    tar.fill(0, 100, 108);
    tar.fill(0, 124, 136);
    const entries = parseTar(tar);
    expect(entries[0]?.mode).toBe(0);
    expect(entries[0]?.data?.length).toBe(0);
  });

  it("writes missing data and link targets as empty", () => {
    const tar = createTar([
      { name: "empty", type: "file", mode: 0o644 },
      { name: "link", type: "symlink", mode: 0o777 },
    ]);
    const entries = parseTar(tar);
    expect(entries[0]?.data).toEqual(new Uint8Array(0));
    expect(entries[1]?.linkname).toBe("");
  });

  it("rejects invalid names and long fields", () => {
    expect(() => createTar([file({ name: "" })])).toThrow();
    expect(() => createTar([file({ name: "/etc/passwd" })])).toThrow();
    expect(() => createTar([file({ name: "../x" })])).toThrow();
    expect(() =>
      createTar([file({ name: `${"a".repeat(156)}/${"b".repeat(101)}` })]),
    ).toThrow();
    expect(() => createTar([file({ name: "a".repeat(101) })])).toThrow();
    expect(() =>
      createTar([
        { name: "x", type: "symlink", mode: 0o777, linkname: "a".repeat(101) },
      ]),
    ).toThrow();
  });
});
