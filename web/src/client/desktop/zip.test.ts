import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { createZip } from "./zip";

const decoder = new TextDecoder();

describe("createZip", () => {
  it("writes directories and files", () => {
    const archive = createZip([
      { name: "app/", directory: true },
      {
        name: "app/run.exe",
        data: new Uint8Array([1, 2, 3]),
        mode: 0o755,
      },
      {
        name: "app/README.txt",
        data: new TextEncoder().encode("hello"),
      },
    ]);
    const files = unzipSync(archive);
    expect(Object.keys(files)).toEqual([
      "app/",
      "app/run.exe",
      "app/README.txt",
    ]);
    expect(Array.from(files["app/run.exe"])).toEqual([1, 2, 3]);
    expect(decoder.decode(files["app/README.txt"])).toBe("hello");
  });

  it("defaults file data to empty and uses the file mode default", () => {
    const files = unzipSync(createZip([{ name: "app/config.json" }]));
    expect(files["app/config.json"]).toEqual(new Uint8Array(0));
  });

  it("rejects duplicate names", () => {
    expect(() =>
      createZip([
        { name: "app/README.txt", data: new Uint8Array([1]) },
        { name: "app/README.txt", data: new Uint8Array([2]) },
      ]),
    ).toThrow("duplicated");
  });

  it.each([
    ["empty", ""],
    ["absolute", "/app/run.exe"],
    ["NUL", "app/\u0000run"],
    ["backslash", "app\\run.exe"],
    ["dot", "app/./run.exe"],
    ["dot dot", "app/../run.exe"],
  ])("rejects a %s name", (_label, name) => {
    expect(() => createZip([{ name }])).toThrow();
  });
});
