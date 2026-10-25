import { describe, expect, it } from "vitest";
import { patchPackageName } from "./arsc";

function resourceTable(chunks: Array<{ type: number; size: number }>): Uint8Array {
  const total = 12 + chunks.reduce((sum, chunk) => sum + Math.max(chunk.size, 8), 0);
  const bytes = new Uint8Array(Math.max(total, 12 + chunks.reduce((sum, chunk) => sum + chunk.size, 0)));
  const view = new DataView(bytes.buffer);
  view.setUint32(4, total, true);
  let cursor = 12;
  for (const chunk of chunks) {
    view.setUint16(cursor, chunk.type, true);
    view.setUint32(cursor + 4, chunk.size, true);
    cursor += Math.max(chunk.size, 8);
  }
  return bytes;
}

describe("patchPackageName", () => {
  it("writes the package into the 128-code-unit slot", () => {
    const bytes = resourceTable([{ type: 0x0200, size: 12 + 128 * 2 }]);
    patchPackageName(bytes, "com.example");
    const view = new DataView(bytes.buffer);
    expect(view.getUint16(12 + 12, true)).toBe("c".charCodeAt(0));
    expect(view.getUint16(12 + 12 + 2, true)).toBe("o".charCodeAt(0));
    expect(view.getUint16(12 + 12 + 22, true)).toBe(0);
  });

  it("skips chunks until the package chunk", () => {
    const bytes = resourceTable([
      { type: 0x0001, size: 8 },
      { type: 0x0200, size: 12 + 128 * 2 },
    ]);
    patchPackageName(bytes, "com.example");
    expect(new DataView(bytes.buffer).getUint16(20 + 12, true)).toBe(
      "c".charCodeAt(0),
    );
  });

  it("rejects a name longer than the slot", () => {
    expect(() =>
      patchPackageName(new Uint8Array(0), "a".repeat(129)),
    ).toThrow("Package name is too long.");
  });

  it("rejects an invalid chunk size", () => {
    const bytes = resourceTable([{ type: 0x0001, size: 4 }]);
    expect(() => patchPackageName(bytes, "com.example")).toThrow(
      "Invalid resource table chunk.",
    );
  });

  it("rejects a table without a package chunk", () => {
    const bytes = resourceTable([{ type: 0x0001, size: 8 }]);
    expect(() => patchPackageName(bytes, "com.example")).toThrow(
      "Package chunk not found.",
    );
  });
});
